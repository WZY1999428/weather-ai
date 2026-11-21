export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ToolStatus = 'waiting' | 'running' | 'success' | 'failed'

/** 工具执行元信息，持久化在 tool 消息的 meta 字段中 */
export interface ToolExecutionMeta {
  name: string
  description: string
  status: ToolStatus
  args: unknown
  startedAt?: number
  durationMs?: number
  error?: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: Role
  content: string | null
  toolCalls: ToolCall[] | null
  toolCallId: string | null
  meta: ToolExecutionMeta | null
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface ToolExecution extends ToolExecutionMeta {
  toolCallId: string
  conversationId: string
  result?: unknown
}

export interface AIConfig {
  baseURL: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
}

export type TemperatureUnit = 'celsius' | 'fahrenheit'

export interface WeatherConfig {
  defaultCity: string
  unit: TemperatureUnit
  forecastDays: number
}

/** 和风天气凭据：apiHost 为控制台中的专属 API Host，留空使用公共域名 */
export interface QWeatherCredentials {
  apiKey: string
  apiHost: string
}

export interface AppSettings {
  autoLaunch: boolean
  autoSave: boolean
}

/** 暴露给 Renderer 的配置（不含 API Key 明文） */
export interface PublicConfig {
  ai: AIConfig & { hasApiKey: boolean; apiKeyMasked: string }
  weather: WeatherConfig
  qweather: { apiHost: string; hasApiKey: boolean; apiKeyMasked: string }
  app: AppSettings
}

export interface ConfigUpdate {
  ai?: Partial<AIConfig> & { apiKey?: string }
  weather?: Partial<WeatherConfig>
  qweather?: Partial<QWeatherCredentials>
  app?: Partial<AppSettings>
}

export interface ConnectionTestResult {
  ok: boolean
  model?: string
  latencyMs?: number
  message: string
}

export interface ToolInfo {
  name: string
  description: string
  parameters: object
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  userDataPath: string
}

export type AgentEvent =
  | { type: 'user-message'; conversationId: string; message: ChatMessage }
  | { type: 'assistant-start'; requestId: string; conversationId: string; message: ChatMessage }
  | { type: 'assistant-delta'; requestId: string; conversationId: string; messageId: string; delta: string }
  | { type: 'assistant-end'; requestId: string; conversationId: string; message: ChatMessage }
  | { type: 'tool-update'; requestId: string; conversationId: string; execution: ToolExecution }
  | { type: 'tool-message'; requestId: string; conversationId: string; message: ChatMessage }
  | { type: 'conversation-updated'; conversation: Conversation }
  | { type: 'done'; requestId: string; conversationId: string; cancelled: boolean }
  | { type: 'error'; requestId: string; conversationId: string; error: string }

export interface SendMessageRequest {
  conversationId: string
  content: string
}

export interface StartResult {
  requestId: string
  userMessage?: ChatMessage
}

/** Preload 暴露给 Renderer 的 API 契约 */
export interface WeatherAIApi {
  conversations: {
    list(): Promise<Conversation[]>
    create(title?: string): Promise<Conversation>
    rename(id: string, title: string): Promise<Conversation>
    remove(id: string): Promise<void>
    messages(id: string): Promise<ChatMessage[]>
    clearAll(): Promise<void>
  }
  chat: {
    send(req: SendMessageRequest): Promise<StartResult>
    regenerate(conversationId: string): Promise<StartResult>
    cancel(requestId: string): Promise<void>
    onEvent(listener: (event: AgentEvent) => void): () => void
  }
  config: {
    get(): Promise<PublicConfig>
    update(update: ConfigUpdate): Promise<PublicConfig>
    testConnection(update?: ConfigUpdate['ai']): Promise<ConnectionTestResult>
  }
  tools: {
    list(): Promise<ToolInfo[]>
  }
  app: {
    info(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
  }
}

export const IPC = {
  conversationsList: 'conversations:list',
  conversationsCreate: 'conversations:create',
  conversationsRename: 'conversations:rename',
  conversationsRemove: 'conversations:remove',
  conversationsMessages: 'conversations:messages',
  conversationsClearAll: 'conversations:clear-all',
  chatSend: 'chat:send',
  chatRegenerate: 'chat:regenerate',
  chatCancel: 'chat:cancel',
  chatEvent: 'chat:event',
  configGet: 'config:get',
  configUpdate: 'config:update',
  configTest: 'config:test',
  toolsList: 'tools:list',
  appInfo: 'app:info',
  appOpenExternal: 'app:open-external'
} as const
