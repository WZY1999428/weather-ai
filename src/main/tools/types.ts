export interface ToolContext {
  /** 用户取消或超时时触发 */
  signal: AbortSignal
}

/** JSON Schema（Function Calling parameters） */
export type JSONSchema = Record<string, unknown>

export interface ToolDefinition<TArgs = any, TResult = any> {
  /** 唯一名称，仅允许字母、数字、下划线、短横线 */
  name: string
  description: string
  parameters: JSONSchema
  /** 单次执行超时时间（毫秒） */
  timeoutMs?: number
  execute: (args: TArgs, ctx: ToolContext) => Promise<TResult>
}

/** OpenAI / DeepSeek Function Calling 工具格式 */
export interface FunctionTool {
  type: 'function'
  function: { name: string; description: string; parameters: JSONSchema }
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}
