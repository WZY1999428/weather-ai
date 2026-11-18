import Ajv, { type ValidateFunction } from 'ajv'
import type { FunctionTool, ToolDefinition } from './types'

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/

interface RegisteredTool {
  def: ToolDefinition
  validate: ValidateFunction
}

export type ValidationResult = { ok: true; args: unknown } | { ok: false; error: string }

/** 工具注册表：唯一名称、Schema 校验、转换为 Function Calling 格式 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>()
  private readonly ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false })

  register(def: ToolDefinition): void {
    if (!NAME_RE.test(def.name)) throw new Error(`非法工具名称: ${def.name}`)
    if (this.tools.has(def.name)) throw new Error(`工具已注册: ${def.name}`)
    if (typeof def.execute !== 'function') throw new Error(`工具缺少 execute: ${def.name}`)
    const validate = this.ajv.compile(def.parameters)
    this.tools.set(def.name, { def, validate })
  }

  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.def
  }

  getAll(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.def)
  }

  toFunctionTools(): FunctionTool[] {
    return this.getAll().map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }))
  }

  /** 解析并校验模型给出的 JSON 参数字符串 */
  validateArgs(name: string, rawArgs: string): ValidationResult {
    const tool = this.tools.get(name)
    if (!tool) return { ok: false, error: `未注册的工具: ${name}` }
    let args: unknown
    try {
      args = rawArgs?.trim() ? JSON.parse(rawArgs) : {}
    } catch {
      return { ok: false, error: '工具参数不是合法的 JSON' }
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return { ok: false, error: '工具参数必须是 JSON 对象' }
    }
    if (!tool.validate(args)) {
      const msg = this.ajv.errorsText(tool.validate.errors, { dataVar: 'args' })
      return { ok: false, error: `参数校验失败: ${msg}` }
    }
    return { ok: true, args }
  }
}
