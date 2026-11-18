import { app, ipcMain, shell, type WebContents } from 'electron'
import { randomUUID } from 'crypto'
import { IPC, type AgentEvent, type AppInfo, type ConfigUpdate, type SendMessageRequest, type StartResult } from '@shared/types'
import type { AgentManager } from '../ai/agent-manager'
import type { ConversationManager } from '../ai/conversation-manager'
import { ConfigManager } from '../config/config-manager'
import type { DeepSeekClient } from '../ai/deepseek'
import type { ToolRegistry } from '../tools/registry'

export interface IpcDeps {
  config: ConfigManager
  conversations: ConversationManager
  agent: AgentManager
  ai: DeepSeekClient
  registry: ToolRegistry
}

function assertString(v: unknown, name: string, max = 20000): string {
  if (typeof v !== 'string') throw new Error(`参数 ${name} 必须是字符串`)
  if (v.length > max) throw new Error(`参数 ${name} 过长`)
  return v
}

function assertObject<T>(v: unknown, name: string): T {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`参数 ${name} 必须是对象`)
  return v as T
}

export function registerIpc({ config, conversations, agent, ai, registry }: IpcDeps): void {
  /** requestId -> 控制器；同一会话同时只允许一个进行中的请求 */
  const running = new Map<string, { controller: AbortController; conversationId: string }>()

  const startRun = (sender: WebContents, conversationId: string): string => {
    for (const r of running.values()) {
      if (r.conversationId === conversationId) throw new Error('该会话正在生成回答，请稍候或先停止生成')
    }
    const requestId = randomUUID()
    const controller = new AbortController()
    running.set(requestId, { controller, conversationId })
    const emit = (event: AgentEvent): void => {
      if (!sender.isDestroyed()) sender.send(IPC.chatEvent, event)
    }
    void agent
      .run({ requestId, conversationId, signal: controller.signal, emit })
      .catch((err) => emit({ type: 'error', requestId, conversationId, error: String(err?.message ?? err) }))
      .finally(() => running.delete(requestId))
    return requestId
  }

  ipcMain.handle(IPC.conversationsList, () => conversations.list())
  ipcMain.handle(IPC.conversationsCreate, (_e, title?: unknown) =>
    conversations.create(title === undefined ? undefined : assertString(title, 'title', 100))
  )
  ipcMain.handle(IPC.conversationsRename, (_e, id: unknown, title: unknown) =>
    conversations.rename(assertString(id, 'id', 64), assertString(title, 'title', 200))
  )
  ipcMain.handle(IPC.conversationsRemove, (_e, id: unknown) => {
    const cid = assertString(id, 'id', 64)
    for (const r of running.values()) if (r.conversationId === cid) r.controller.abort()
    conversations.remove(cid)
  })
  ipcMain.handle(IPC.conversationsMessages, (_e, id: unknown) => conversations.messages(assertString(id, 'id', 64)))
  ipcMain.handle(IPC.conversationsClearAll, () => {
    for (const r of running.values()) r.controller.abort()
    conversations.clearAll()
  })

  ipcMain.handle(IPC.chatSend, (e, req: unknown): StartResult => {
    const { conversationId, content } = assertObject<SendMessageRequest>(req, 'request')
    const cid = assertString(conversationId, 'conversationId', 64)
    const text = assertString(content, 'content').trim()
    if (!text) throw new Error('消息不能为空')
    for (const r of running.values()) {
      if (r.conversationId === cid) throw new Error('该会话正在生成回答，请稍候或先停止生成')
    }
    const userMessage = agent.addUserMessage(cid, text, (ev) => e.sender.send(IPC.chatEvent, ev))
    return { requestId: startRun(e.sender, cid), userMessage }
  })

  ipcMain.handle(IPC.chatRegenerate, (e, conversationId: unknown): StartResult => {
    const cid = assertString(conversationId, 'conversationId', 64)
    for (const r of running.values()) {
      if (r.conversationId === cid) throw new Error('该会话正在生成回答，请稍候或先停止生成')
    }
    if (!conversations.truncateAfterLastUser(cid)) throw new Error('没有可重新生成的消息')
    return { requestId: startRun(e.sender, cid) }
  })

  ipcMain.handle(IPC.chatCancel, (_e, requestId: unknown) => {
    running.get(assertString(requestId, 'requestId', 64))?.controller.abort()
  })

  ipcMain.handle(IPC.configGet, () => config.getPublic())
  ipcMain.handle(IPC.configUpdate, (_e, update: unknown) => {
    const u = assertObject<ConfigUpdate>(update, 'update')
    const before = config.getApp().autoLaunch
    const result = config.update(u)
    if (result.app.autoLaunch !== before && (process.platform === 'win32' || process.platform === 'darwin')) {
      app.setLoginItemSettings({ openAtLogin: result.app.autoLaunch })
    }
    return result
  })
  ipcMain.handle(IPC.configTest, (_e, update?: unknown) => {
    const u = update === undefined || update === null ? {} : assertObject<ConfigUpdate['ai'] & object>(update, 'ai')
    const cfg = ConfigManager.mergeAI(config.getAI(), u)
    const key = typeof u.apiKey === 'string' && u.apiKey.trim() ? u.apiKey.trim() : config.getApiKey()
    return ai.testConnection(cfg, key)
  })

  ipcMain.handle(IPC.toolsList, () =>
    registry.getAll().map(({ name, description, parameters }) => ({ name, description, parameters }))
  )

  ipcMain.handle(
    IPC.appInfo,
    (): AppInfo => ({
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      userDataPath: app.getPath('userData')
    })
  )
  ipcMain.handle(IPC.appOpenExternal, (_e, url: unknown) => {
    const u = new URL(assertString(url, 'url', 2000))
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('仅允许打开 http(s) 链接')
    return shell.openExternal(u.toString())
  })
}
