import OpenAI from 'openai'
import type { AIConfig, ConnectionTestResult, ToolCall } from '@shared/types'
import type { FunctionTool } from '../tools/types'
import type { ModelMessage } from './conversation-manager'

export interface ChatRequest {
  messages: Array<ModelMessage>
  tools?: FunctionTool[]
  signal?: AbortSignal
  onDelta?: (delta: string) => void
}

export interface ChatResult {
  content: string
  toolCalls: ToolCall[]
  finishReason: string | null
}

export class AIRequestError extends Error {
  constructor(
    message: string,
    readonly cancelled = false
  ) {
    super(message)
    this.name = 'AIRequestError'
  }
}

export function describeAIError(err: unknown): AIRequestError {
  if (err instanceof AIRequestError) return err
  if (err instanceof OpenAI.APIUserAbortError) return new AIRequestError('请求已取消', true)
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AIRequestError('AI 请求超时，请检查网络或在设置中调大超时时间')
  if (err instanceof OpenAI.APIConnectionError) return new AIRequestError(`无法连接 AI 服务：${err.message}`)
  if (err instanceof OpenAI.APIError) {
    const detail = err.message.replace(/^\d+\s*/, '')
    switch (err.status) {
      case 400:
        return new AIRequestError(`请求参数错误：${detail}`)
      case 401:
        return new AIRequestError('API Key 无效或已过期，请在设置中检查')
      case 402:
        return new AIRequestError('账户余额不足')
      case 404:
        return new AIRequestError(`接口或模型不存在：${detail}`)
      case 422:
        return new AIRequestError(`请求参数无效：${detail}`)
      case 429:
        return new AIRequestError('请求过于频繁或额度受限，请稍后重试')
      default:
        return new AIRequestError(`AI 服务错误（${err.status ?? '未知'}）：${detail}`)
    }
  }
  if (err instanceof Error && err.name === 'AbortError') return new AIRequestError('请求已取消', true)
  return new AIRequestError(err instanceof Error ? err.message : String(err))
}

/** DeepSeek（OpenAI 兼容）客户端 */
export class DeepSeekClient {
  constructor(
    private readonly getConfig: () => AIConfig,
    private readonly getApiKey: () => string
  ) {}

  private client(cfg: AIConfig, apiKey: string): OpenAI {
    if (!apiKey) throw new AIRequestError('尚未配置 API Key，请先在设置页面中填写')
    return new OpenAI({ apiKey, baseURL: cfg.baseURL, timeout: cfg.timeoutMs, maxRetries: 1 })
  }

  /** 流式对话，支持工具调用（按 index 聚合 tool_calls 增量） */
  async chat(req: ChatRequest): Promise<ChatResult> {
    const cfg = this.getConfig()
    const client = this.client(cfg, this.getApiKey())
    try {
      const stream = await client.chat.completions.create(
        {
          model: cfg.model,
          messages: req.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: req.tools?.length ? req.tools : undefined,
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
          stream: true
        },
        { signal: req.signal }
      )
      let content = ''
      let finishReason: string | null = null
      const calls: Array<{ id: string; name: string; arguments: string }> = []
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0]
        if (!choice) continue
        const delta = choice.delta
        if (delta?.content) {
          content += delta.content
          req.onDelta?.(delta.content)
        }
        for (const tc of delta?.tool_calls ?? []) {
          const slot = (calls[tc.index] ??= { id: '', name: '', arguments: '' })
          if (tc.id) slot.id = tc.id
          if (tc.function?.name) slot.name += tc.function.name
          if (tc.function?.arguments) slot.arguments += tc.function.arguments
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
      const toolCalls: ToolCall[] = calls
        .filter((c) => c && c.name)
        .map((c, i) => ({
          id: c.id || `call_${Date.now()}_${i}`,
          type: 'function',
          function: { name: c.name, arguments: c.arguments }
        }))
      return { content, toolCalls, finishReason }
    } catch (err) {
      if (req.signal?.aborted) throw new AIRequestError('请求已取消', true)
      throw describeAIError(err)
    }
  }

  async testConnection(cfg: AIConfig, apiKey: string): Promise<ConnectionTestResult> {
    const started = Date.now()
    try {
      const client = this.client(cfg, apiKey)
      const res = await client.chat.completions.create({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        stream: false
      })
      return {
        ok: true,
        model: res.model,
        latencyMs: Date.now() - started,
        message: `连接成功（模型：${res.model}，耗时 ${Date.now() - started}ms）`
      }
    } catch (err) {
      return { ok: false, message: describeAIError(err).message }
    }
  }
}
