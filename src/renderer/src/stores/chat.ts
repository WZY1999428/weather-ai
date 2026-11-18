import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { AgentEvent, ChatMessage, Conversation, ToolExecution } from '@shared/types'
import { api, errorMessage } from '../services/api'
import type { Turn } from '../types'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentId = ref<string | null>(null)
  const messages = reactive<Record<string, ChatMessage[]>>({})
  /** toolCallId -> 实时执行状态 */
  const executions = reactive<Record<string, ToolExecution>>({})
  /** conversationId -> requestId */
  const running = reactive<Record<string, string>>({})
  const errors = reactive<Record<string, string>>({})
  let unsubscribe: (() => void) | null = null

  const current = computed(() => conversations.value.find((c) => c.id === currentId.value) ?? null)
  const currentMessages = computed(() => (currentId.value ? (messages[currentId.value] ?? []) : []))
  const isRunning = computed(() => !!(currentId.value && running[currentId.value]))
  const currentError = computed(() => (currentId.value ? errors[currentId.value] : undefined))

  const turns = computed<Turn[]>(() => {
    const out: Turn[] = []
    for (const m of currentMessages.value) {
      if (m.role === 'user') {
        out.push({ kind: 'user', id: m.id, message: m })
        continue
      }
      let last = out[out.length - 1]
      if (!last || last.kind !== 'assistant') {
        last = { kind: 'assistant', id: m.id, messages: [], tools: new Map() }
        out.push(last)
      }
      if (m.role === 'assistant') last.messages.push(m)
      else if (m.role === 'tool' && m.toolCallId) last.tools.set(m.toolCallId, m)
    }
    return out
  })

  /** 当前会话中所有工具调用（用于右侧详情面板） */
  const currentToolExecutions = computed<ToolExecution[]>(() => {
    const list: ToolExecution[] = []
    const msgs = currentMessages.value
    const toolMsgs = new Map(msgs.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => [m.toolCallId!, m]))
    for (const m of msgs) {
      for (const tc of m.toolCalls ?? []) list.push(resolveExecution(tc.id, tc.function.name, tc.function.arguments, toolMsgs.get(tc.id)))
    }
    return list
  })

  function resolveExecution(toolCallId: string, name: string, rawArgs: string, toolMsg?: ChatMessage): ToolExecution {
    const live = executions[toolCallId]
    if (live) return live
    let args: unknown = rawArgs
    try {
      args = JSON.parse(rawArgs || '{}')
    } catch {
      /* keep raw */
    }
    if (toolMsg) {
      let result: unknown
      try {
        result = toolMsg.content ? JSON.parse(toolMsg.content) : undefined
      } catch {
        result = toolMsg.content
      }
      const meta = toolMsg.meta
      const failed = meta?.status === 'failed' || (!meta && typeof result === 'object' && result !== null && 'error' in result)
      return {
        toolCallId,
        conversationId: toolMsg.conversationId,
        name,
        description: meta?.description ?? '',
        status: failed ? 'failed' : 'success',
        args: meta?.args ?? args,
        startedAt: meta?.startedAt,
        durationMs: meta?.durationMs,
        error: meta?.error ?? (failed ? String((result as { error?: string })?.error ?? '') : undefined),
        result: failed ? undefined : result
      }
    }
    return { toolCallId, conversationId: currentId.value ?? '', name, description: '', status: 'waiting', args }
  }

  function upsertConversation(c: Conversation): void {
    const i = conversations.value.findIndex((x) => x.id === c.id)
    if (i >= 0) conversations.value.splice(i, 1, c)
    else conversations.value.unshift(c)
    conversations.value.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  function upsertMessage(m: ChatMessage): void {
    const list = (messages[m.conversationId] ??= [])
    const i = list.findIndex((x) => x.id === m.id)
    if (i >= 0) list.splice(i, 1, m)
    else list.push(m)
  }

  function handleEvent(e: AgentEvent): void {
    switch (e.type) {
      case 'user-message':
      case 'assistant-start':
        upsertMessage(e.message)
        break
      case 'assistant-delta': {
        const m = messages[e.conversationId]?.find((x) => x.id === e.messageId)
        if (m) m.content = (m.content ?? '') + e.delta
        break
      }
      case 'assistant-end': {
        const list = messages[e.conversationId]
        if (!e.message.content && !e.message.toolCalls?.length && list) {
          // 取消且无内容：移除占位消息
          const i = list.findIndex((x) => x.id === e.message.id)
          if (i >= 0) list.splice(i, 1)
        } else upsertMessage(e.message)
        break
      }
      case 'tool-update':
        executions[e.execution.toolCallId] = e.execution
        break
      case 'tool-message':
        upsertMessage(e.message)
        break
      case 'conversation-updated':
        upsertConversation(e.conversation)
        break
      case 'done':
        if (running[e.conversationId] === e.requestId) delete running[e.conversationId]
        break
      case 'error':
        if (running[e.conversationId] === e.requestId) delete running[e.conversationId]
        errors[e.conversationId] = e.error
        break
    }
  }

  async function init(): Promise<void> {
    unsubscribe?.()
    unsubscribe = api.chat.onEvent(handleEvent)
    conversations.value = await api.conversations.list()
    if (conversations.value.length) await select(conversations.value[0].id)
  }

  async function select(id: string): Promise<void> {
    currentId.value = id
    if (!running[id]) messages[id] = await api.conversations.messages(id)
  }

  async function create(): Promise<Conversation> {
    const c = await api.conversations.create()
    upsertConversation(c)
    messages[c.id] = []
    currentId.value = c.id
    return c
  }

  async function rename(id: string, title: string): Promise<void> {
    upsertConversation(await api.conversations.rename(id, title))
  }

  async function remove(id: string): Promise<void> {
    await api.conversations.remove(id)
    conversations.value = conversations.value.filter((c) => c.id !== id)
    delete messages[id]
    delete running[id]
    if (currentId.value === id) {
      currentId.value = null
      if (conversations.value.length) await select(conversations.value[0].id)
    }
  }

  async function clearAll(): Promise<void> {
    await api.conversations.clearAll()
    conversations.value = []
    for (const k of Object.keys(messages)) delete messages[k]
    for (const k of Object.keys(running)) delete running[k]
    currentId.value = null
  }

  async function send(content: string): Promise<void> {
    const text = content.trim()
    if (!text) return
    const conv = current.value ?? (await create())
    delete errors[conv.id]
    const res = await api.chat.send({ conversationId: conv.id, content: text })
    if (res.userMessage) upsertMessage(res.userMessage)
    running[conv.id] = res.requestId
  }

  async function regenerate(): Promise<void> {
    const id = currentId.value
    if (!id || running[id]) return
    delete errors[id]
    const list = messages[id] ?? []
    let lastUser = -1
    for (let i = list.length - 1; i >= 0; i--) if (list[i].role === 'user') { lastUser = i; break }
    if (lastUser >= 0) list.splice(lastUser + 1)
    const res = await api.chat.regenerate(id)
    running[id] = res.requestId
  }

  async function stop(): Promise<void> {
    const id = currentId.value
    if (id && running[id]) await api.chat.cancel(running[id])
  }

  function setError(id: string, err: unknown): void {
    errors[id] = errorMessage(err)
  }

  function dismissError(): void {
    if (currentId.value) delete errors[currentId.value]
  }

  return {
    conversations,
    currentId,
    current,
    currentMessages,
    turns,
    currentToolExecutions,
    isRunning,
    currentError,
    resolveExecution,
    init,
    select,
    create,
    rename,
    remove,
    clearAll,
    send,
    regenerate,
    stop,
    setError,
    dismissError
  }
})
