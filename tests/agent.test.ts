import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import Database from 'better-sqlite3'
import { runMigrations } from '../src/main/database/migrations'
import { ConversationManager } from '../src/main/ai/conversation-manager'
import { DeepSeekClient } from '../src/main/ai/deepseek'
import { AgentManager } from '../src/main/ai/agent-manager'
import { createToolRegistry } from '../src/main/tools'
import type { AgentEvent } from '@shared/types'

/**
 * 本地 OpenAI 兼容的假模型服务，用于验证 Agent 工具调用循环；
 * 天气数据仍然来自真实 Open-Meteo API。
 */
type Script = (body: any) => { content?: string; toolCalls?: Array<{ name: string; args: object }>; delayMs?: number }
let script: Script
let server: Server
let baseURL = ''
const requests: any[] = []

function sse(res: any, chunks: object[]): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', async () => {
      const body = JSON.parse(raw)
      requests.push(body)
      const step = script(body)
      if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs))
      const base = { id: 'x', object: 'chat.completion.chunk', created: 0, model: body.model }
      const chunks: object[] = []
      if (step.content) {
        for (const part of step.content.match(/.{1,4}/gsu) ?? []) {
          chunks.push({ ...base, choices: [{ index: 0, delta: { content: part }, finish_reason: null }] })
        }
      }
      ;(step.toolCalls ?? []).forEach((tc, i) => {
        const args = JSON.stringify(tc.args)
        chunks.push({
          ...base,
          choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `call_${requests.length}_${i}`, type: 'function', function: { name: tc.name, arguments: '' } }] }, finish_reason: null }]
        })
        // 参数分片下发，验证增量拼接
        for (const part of [args.slice(0, 5), args.slice(5)]) {
          chunks.push({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: part } }] }, finish_reason: null }] })
        }
      })
      chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: step.toolCalls?.length ? 'tool_calls' : 'stop' }] })
      if (!res.destroyed) sse(res, chunks)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => server.close())

function setup() {
  const db = new Database(':memory:')
  runMigrations(db)
  const conversations = new ConversationManager(db)
  const weatherCfg = () => ({ defaultCity: '杭州', unit: 'celsius' as const, forecastDays: 3 })
  const registry = createToolRegistry({ getWeatherConfig: weatherCfg })
  const ai = new DeepSeekClient(
    () => ({ baseURL, model: 'deepseek-chat', temperature: 0.7, maxTokens: 1024, timeoutMs: 20000 }),
    () => 'test-key'
  )
  const agent = new AgentManager(ai, registry, conversations, { maxToolRounds: 4, getWeatherConfig: weatherCfg })
  return { db, conversations, agent }
}

describe('AgentManager', () => {
  it('runs multi-round, multi-tool calling with real weather data and restores history', async () => {
    requests.length = 0
    script = (body) => {
      const toolMsgs = body.messages.filter((m: any) => m.role === 'tool')
      if (toolMsgs.length === 0) return { toolCalls: [{ name: 'search_city', args: { city: '杭州' } }] }
      if (toolMsgs.length === 1) {
        const city = JSON.parse(toolMsgs[0].content).results[0]
        return {
          content: '正在查询',
          toolCalls: [
            { name: 'get_current_weather', args: { latitude: city.latitude, longitude: city.longitude } },
            { name: 'get_weather_forecast', args: { latitude: city.latitude, longitude: city.longitude, days: 3 } },
            { name: 'not_registered', args: {} }
          ]
        }
      }
      return { content: '杭州当前天气如上。' }
    }
    const { conversations, agent } = setup()
    const conv = conversations.create()
    const events: AgentEvent[] = []
    agent.addUserMessage(conv.id, '杭州天气怎么样', (e) => events.push(e))
    await agent.run({ requestId: 'r1', conversationId: conv.id, signal: new AbortController().signal, emit: (e) => events.push(e) })

    expect(events.at(-2)).toMatchObject({ type: 'done', cancelled: false })
    expect(events.find((e) => e.type === 'conversation-updated')).toBeTruthy()
    expect(requests).toHaveLength(3)
    expect(requests[0].tools).toHaveLength(3)

    const finals = events.filter((e) => e.type === 'tool-update' && ['success', 'failed'].includes(e.execution.status)) as Extract<AgentEvent, { type: 'tool-update' }>[]
    const byName = Object.fromEntries(finals.map((e) => [e.execution.name, e.execution]))
    expect(byName.search_city.status).toBe('success')
    expect(byName.get_current_weather.status).toBe('success')
    expect(byName.get_weather_forecast.status).toBe('success')
    expect(byName.not_registered.status).toBe('failed')
    expect(byName.not_registered.error).toMatch(/未注册/)
    expect(byName.get_current_weather.durationMs).toBeGreaterThanOrEqual(0)

    // 工具结果正确关联 tool_call_id，并可从数据库恢复
    const restored = conversations.toModelMessages(conv.id)
    expect(restored.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'tool', 'tool', 'assistant'])
    const assistant2 = restored[3] as any
    expect(assistant2.tool_calls.map((t: any) => t.id)).toEqual(restored.slice(4, 7).map((m: any) => m.tool_call_id))
    const stored = conversations.messages(conv.id)
    expect(stored.filter((m) => m.role === 'tool').every((m) => m.meta?.status)).toBe(true)
    expect(JSON.parse(stored[4].content!).location.name).toBe('杭州')
    expect(conversations.get(conv.id)!.title).toBe('杭州天气怎么样')
  })

  it('stops after max tool rounds', async () => {
    requests.length = 0
    script = (body) => (body.tools ? { toolCalls: [{ name: 'search_city', args: { city: '上海' } }] } : { content: '最终回答' })
    const { conversations, agent } = setup()
    const conv = conversations.create()
    agent.addUserMessage(conv.id, '循环', () => {})
    await agent.run({ requestId: 'r2', conversationId: conv.id, signal: new AbortController().signal, emit: () => {} })
    expect(requests).toHaveLength(5)
    expect(requests[4].tools).toBeUndefined()
    expect(conversations.messages(conv.id).at(-1)!.content).toBe('最终回答')
  })

  it('supports cancellation and keeps history consistent', async () => {
    script = () => ({ content: '很长的回答', delayMs: 3000 })
    const { conversations, agent } = setup()
    const conv = conversations.create()
    agent.addUserMessage(conv.id, '你好', () => {})
    const ctrl = new AbortController()
    const events: AgentEvent[] = []
    setTimeout(() => ctrl.abort(), 200)
    await agent.run({ requestId: 'r3', conversationId: conv.id, signal: ctrl.signal, emit: (e) => events.push(e) })
    expect(events.find((e) => e.type === 'done')).toMatchObject({ cancelled: true })
    expect(conversations.toModelMessages(conv.id).map((m) => m.role)).toEqual(['user'])
  })

  it('reports API errors without throwing', async () => {
    const { conversations } = setup()
    const conv = conversations.create()
    const registry = createToolRegistry({ getWeatherConfig: () => ({ defaultCity: '', unit: 'celsius', forecastDays: 3 }) })
    const ai = new DeepSeekClient(
      () => ({ baseURL, model: 'm', temperature: 1, maxTokens: 10, timeoutMs: 5000 }),
      () => ''
    )
    const agent = new AgentManager(ai, registry, conversations, { getWeatherConfig: () => ({ defaultCity: '', unit: 'celsius', forecastDays: 3 }) })
    agent.addUserMessage(conv.id, 'hi', () => {})
    const events: AgentEvent[] = []
    await agent.run({ requestId: 'r4', conversationId: conv.id, signal: new AbortController().signal, emit: (e) => events.push(e) })
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: expect.stringMatching(/API Key/) })
  })
})
