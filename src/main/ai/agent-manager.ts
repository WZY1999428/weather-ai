import { randomUUID } from 'crypto'
import type { AgentEvent, ChatMessage, ToolCall, ToolExecution, WeatherConfig } from '@shared/types'
import type { ToolRegistry } from '../tools/registry'
import { ToolError } from '../tools/types'
import { DEFAULT_TITLE, type ConversationManager, type ModelMessage } from './conversation-manager'
import { AIRequestError, describeAIError, type DeepSeekClient } from './deepseek'

export interface AgentOptions {
  maxToolRounds?: number
  defaultToolTimeoutMs?: number
  getWeatherConfig: () => WeatherConfig
}

interface RunInput {
  requestId: string
  conversationId: string
  signal: AbortSignal
  emit: (event: AgentEvent) => void
}

function buildSystemPrompt(weather: WeatherConfig): string {
  const now = new Date()
  return [
    '你是 WeatherAI，一个运行在用户桌面上的中文 AI 助手，可以调用工具完成任务。',
    `当前本地时间：${now.toLocaleString('zh-CN', { hour12: false })}。`,
    weather.defaultCity ? `用户的默认城市是“${weather.defaultCity}”，当用户询问天气但未指明地点时使用默认城市。` : '',
    `温度单位：${weather.unit === 'fahrenheit' ? '华氏度(°F)' : '摄氏度(°C)'}；默认预报天数：${weather.forecastDays} 天。`,
    '规则：',
    '1. 查询天气时，必须先调用 search_city 获取经纬度，再调用 get_current_weather 或 get_weather_forecast；绝不能自行编造经纬度或天气数据。',
    '2. 如果 search_city 返回多个同名结果，优先选择中国境内或与用户语境最相关的城市，并在回答中说明所选城市。',
    '3. 回答天气时注明数据更新时间与数据来源 Open-Meteo，回答简洁友好，可使用 Markdown。',
    '4. 工具返回错误时，向用户解释原因并给出建议，不要虚构结果。'
  ]
    .filter(Boolean)
    .join('\n')
}

/** 通用 Agent：负责模型请求与工具调用循环，与具体工具实现解耦 */
export class AgentManager {
  private readonly maxToolRounds: number
  private readonly defaultToolTimeoutMs: number

  constructor(
    private readonly ai: DeepSeekClient,
    private readonly registry: ToolRegistry,
    private readonly conversations: ConversationManager,
    private readonly options: AgentOptions
  ) {
    this.maxToolRounds = options.maxToolRounds ?? 8
    this.defaultToolTimeoutMs = options.defaultToolTimeoutMs ?? 30000
  }

  /** 保存用户消息并自动设置会话标题 */
  addUserMessage(conversationId: string, content: string, emit: (e: AgentEvent) => void): ChatMessage {
    const conv = this.conversations.get(conversationId)
    if (!conv) throw new Error('会话不存在')
    const msg = this.conversations.addMessage({ conversationId, role: 'user', content })
    if (conv.title === DEFAULT_TITLE) {
      const title = content.replace(/\s+/g, ' ').trim().slice(0, 24) || DEFAULT_TITLE
      emit({ type: 'conversation-updated', conversation: this.conversations.rename(conversationId, title) })
    }
    return msg
  }

  async run({ requestId, conversationId, signal, emit }: RunInput): Promise<void> {
    const messages: ModelMessage[] = [
      { role: 'system', content: buildSystemPrompt(this.options.getWeatherConfig()) },
      ...this.conversations.toModelMessages(conversationId)
    ]
    const base = { requestId, conversationId }
    try {
      for (let round = 0; ; round++) {
        const allowTools = round < this.maxToolRounds
        const { toolCalls } = await this.requestAssistant(messages, allowTools, signal, emit, base)
        if (!toolCalls.length) break
        await this.executeToolCalls(toolCalls, messages, signal, emit, base)
      }
      emit({ type: 'done', ...base, cancelled: false })
    } catch (err) {
      const e = describeAIError(err)
      if (e.cancelled || signal.aborted) {
        emit({ type: 'done', ...base, cancelled: true })
      } else {
        emit({ type: 'error', ...base, error: e.message })
      }
    } finally {
      const conv = this.conversations.get(conversationId)
      if (conv) emit({ type: 'conversation-updated', conversation: conv })
    }
  }

  private async requestAssistant(
    messages: ModelMessage[],
    allowTools: boolean,
    signal: AbortSignal,
    emit: (e: AgentEvent) => void,
    base: { requestId: string; conversationId: string }
  ): Promise<{ toolCalls: ToolCall[] }> {
    const id = randomUUID()
    const createdAt = Date.now()
    const placeholder: ChatMessage = {
      id,
      conversationId: base.conversationId,
      role: 'assistant',
      content: '',
      toolCalls: null,
      toolCallId: null,
      meta: null,
      createdAt
    }
    emit({ type: 'assistant-start', ...base, message: placeholder })
    let partial = ''
    try {
      const res = await this.ai.chat({
        messages: allowTools
          ? messages
          : [...messages, { role: 'system', content: '已达到工具调用次数上限，请直接根据已有信息给出最终回答。' }],
        tools: allowTools ? this.registry.toFunctionTools() : undefined,
        signal,
        onDelta: (delta) => {
          partial += delta
          emit({ type: 'assistant-delta', ...base, messageId: id, delta })
        }
      })
      const toolCalls = allowTools ? res.toolCalls : []
      const content = res.content || (toolCalls.length ? '' : res.finishReason === 'length' ? '（回答因长度限制被截断）' : '')
      const saved = this.conversations.addMessage({
        id,
        conversationId: base.conversationId,
        role: 'assistant',
        content,
        toolCalls,
        createdAt
      })
      emit({ type: 'assistant-end', ...base, message: saved })
      messages.push(
        toolCalls.length ? { role: 'assistant', content: content || null, tool_calls: toolCalls } : { role: 'assistant', content }
      )
      return { toolCalls }
    } catch (err) {
      // 取消/失败时保留已生成的部分内容
      const saved = partial
        ? this.conversations.addMessage({ id, conversationId: base.conversationId, role: 'assistant', content: partial, createdAt })
        : { ...placeholder, content: '' }
      emit({ type: 'assistant-end', ...base, message: saved })
      throw err
    }
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    messages: ModelMessage[],
    signal: AbortSignal,
    emit: (e: AgentEvent) => void,
    base: { requestId: string; conversationId: string }
  ): Promise<void> {
    const executions: ToolExecution[] = toolCalls.map((tc) => {
      let args: unknown = tc.function.arguments
      try {
        args = JSON.parse(tc.function.arguments || '{}')
      } catch {
        /* 保留原始字符串用于展示 */
      }
      return {
        toolCallId: tc.id,
        conversationId: base.conversationId,
        name: tc.function.name,
        description: this.registry.get(tc.function.name)?.description ?? '未注册的工具',
        status: 'waiting',
        args
      }
    })
    executions.forEach((execution) => emit({ type: 'tool-update', ...base, execution }))

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]
      const exec = executions[i]
      if (signal.aborted) {
        this.saveToolResult(exec, { ...exec, status: 'failed', error: '用户已取消' }, null, messages, emit, base)
        continue
      }
      const startedAt = Date.now()
      emit({ type: 'tool-update', ...base, execution: { ...exec, status: 'running', startedAt } })
      let result: unknown = null
      let error: string | undefined
      try {
        result = await this.executeOne(tc, signal)
      } catch (err) {
        error = signal.aborted ? '用户已取消' : err instanceof Error ? err.message : String(err)
        if (!(err instanceof ToolError)) console.error(`[agent] tool ${tc.function.name} failed`, err)
      }
      const durationMs = Date.now() - startedAt
      const finished: ToolExecution = {
        ...exec,
        status: error ? 'failed' : 'success',
        startedAt,
        durationMs,
        error,
        result: error ? undefined : result
      }
      this.saveToolResult(exec, finished, result, messages, emit, base)
    }
    if (signal.aborted) throw new AIRequestError('请求已取消', true)
  }

  private async executeOne(tc: ToolCall, signal: AbortSignal): Promise<unknown> {
    const def = this.registry.get(tc.function.name)
    if (!def) throw new ToolError(`未注册的工具：${tc.function.name}，禁止执行`)
    const validation = this.registry.validateArgs(def.name, tc.function.arguments)
    if (!validation.ok) throw new ToolError(validation.error)
    const timeoutMs = def.timeoutMs ?? this.defaultToolTimeoutMs
    const timeout = AbortSignal.timeout(timeoutMs)
    const toolSignal = AbortSignal.any([signal, timeout])
    return await new Promise((resolve, reject) => {
      const onAbort = (): void =>
        reject(new ToolError(signal.aborted ? '用户已取消' : `工具执行超时（${timeoutMs / 1000}s）`))
      if (toolSignal.aborted) return onAbort()
      toolSignal.addEventListener('abort', onAbort, { once: true })
      def
        .execute(validation.args, { signal: toolSignal })
        .then(resolve, reject)
        .finally(() => toolSignal.removeEventListener('abort', onAbort))
    })
  }

  private saveToolResult(
    exec: ToolExecution,
    finished: ToolExecution,
    result: unknown,
    messages: ModelMessage[],
    emit: (e: AgentEvent) => void,
    base: { requestId: string; conversationId: string }
  ): void {
    const content = JSON.stringify(finished.status === 'success' ? result : { error: finished.error })
    const saved = this.conversations.addMessage({
      conversationId: base.conversationId,
      role: 'tool',
      content,
      toolCallId: exec.toolCallId,
      meta: {
        name: finished.name,
        description: finished.description,
        status: finished.status,
        args: finished.args,
        startedAt: finished.startedAt,
        durationMs: finished.durationMs,
        error: finished.error
      }
    })
    messages.push({ role: 'tool', tool_call_id: exec.toolCallId, content })
    emit({ type: 'tool-update', ...base, execution: finished })
    emit({ type: 'tool-message', ...base, message: saved })
  }
}
