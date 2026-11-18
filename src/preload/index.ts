import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AgentEvent, type WeatherAIApi } from '@shared/types'

const api: WeatherAIApi = {
  conversations: {
    list: () => ipcRenderer.invoke(IPC.conversationsList),
    create: (title) => ipcRenderer.invoke(IPC.conversationsCreate, title),
    rename: (id, title) => ipcRenderer.invoke(IPC.conversationsRename, id, title),
    remove: (id) => ipcRenderer.invoke(IPC.conversationsRemove, id),
    messages: (id) => ipcRenderer.invoke(IPC.conversationsMessages, id),
    clearAll: () => ipcRenderer.invoke(IPC.conversationsClearAll)
  },
  chat: {
    send: (req) => ipcRenderer.invoke(IPC.chatSend, req),
    regenerate: (conversationId) => ipcRenderer.invoke(IPC.chatRegenerate, conversationId),
    cancel: (requestId) => ipcRenderer.invoke(IPC.chatCancel, requestId),
    onEvent: (listener) => {
      const handler = (_e: IpcRendererEvent, event: AgentEvent): void => listener(event)
      ipcRenderer.on(IPC.chatEvent, handler)
      return () => ipcRenderer.removeListener(IPC.chatEvent, handler)
    }
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.configGet),
    update: (update) => ipcRenderer.invoke(IPC.configUpdate, update),
    testConnection: (update) => ipcRenderer.invoke(IPC.configTest, update)
  },
  tools: {
    list: () => ipcRenderer.invoke(IPC.toolsList)
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('weatherAI', api)
