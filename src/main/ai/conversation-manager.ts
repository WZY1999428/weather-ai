import { randomUUID } from 'crypto'
import type { DB } from '../database'
import type { ChatMessage, Conversation, Role, ToolCall, ToolExecutionMeta } from '@shared/types'

interface MessageRow {
  id: string
  conversationId: string
  role: string
  content: string | null
  toolCalls: string | null
  toolCallId: string | null
  meta: string | null
  createdAt: number
}

/** OpenAI 兼容格式的消息 */
export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

export const DEFAULT_TITLE = '新对话'

function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as Role,
    content: row.content,
    toolCalls: parseJSON<ToolCall[]>(row.toolCalls),
    toolCallId: row.toolCallId,
    meta: parseJSON<ToolExecutionMeta>(row.meta),
    createdAt: row.createdAt
  }
}

/** 会话与消息的持久化与恢复 */
export class ConversationManager {
  private seq = 0

  constructor(private readonly db: DB) {
    const row = db.prepare('SELECT MAX(seq) AS s FROM messages').get() as { s: number | null }
    this.seq = row.s ?? 0
  }

  list(): Conversation[] {
    return this.db.prepare('SELECT * FROM conversations ORDER BY updatedAt DESC').all() as Conversation[]
  }

  get(id: string): Conversation | undefined {
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | undefined
  }

  create(title = DEFAULT_TITLE): Conversation {
    const now = Date.now()
    const conv: Conversation = { id: randomUUID(), title: title.trim() || DEFAULT_TITLE, createdAt: now, updatedAt: now }
    this.db
      .prepare('INSERT INTO conversations (id, title, createdAt, updatedAt) VALUES (@id, @title, @createdAt, @updatedAt)')
      .run(conv)
    return conv
  }

  rename(id: string, title: string): Conversation {
    const t = title.trim().slice(0, 100)
    if (!t) throw new Error('标题不能为空')
    const res = this.db.prepare('UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?').run(t, Date.now(), id)
    if (res.changes === 0) throw new Error('会话不存在')
    return this.get(id)!
  }

  touch(id: string): Conversation | undefined {
    this.db.prepare('UPDATE conversations SET updatedAt = ? WHERE id = ?').run(Date.now(), id)
    return this.get(id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  clearAll(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM messages').run()
      this.db.prepare('DELETE FROM conversations').run()
    })()
  }

  messages(conversationId: string): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC, seq ASC')
      .all(conversationId) as MessageRow[]
    return rows.map(toMessage)
  }

  addMessage(input: {
    id?: string
    conversationId: string
    role: Role
    content: string | null
    toolCalls?: ToolCall[] | null
    toolCallId?: string | null
    meta?: ToolExecutionMeta | null
    createdAt?: number
  }): ChatMessage {
    const msg: ChatMessage = {
      id: input.id ?? randomUUID(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      toolCalls: input.toolCalls?.length ? input.toolCalls : null,
      toolCallId: input.toolCallId ?? null,
      meta: input.meta ?? null,
      createdAt: input.createdAt ?? Date.now()
    }
    this.db
      .prepare(
        `INSERT INTO messages (id, conversationId, role, content, toolCalls, toolCallId, meta, createdAt, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        msg.id,
        msg.conversationId,
        msg.role,
        msg.content,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.toolCallId,
        msg.meta ? JSON.stringify(msg.meta) : null,
        msg.createdAt,
        ++this.seq
      )
    this.touch(msg.conversationId)
    return msg
  }

  /** 删除最后一条用户消息之后的所有消息（用于重新生成），返回最后一条用户消息 */
  truncateAfterLastUser(conversationId: string): ChatMessage | undefined {
    const msgs = this.messages(conversationId)
    let idx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        idx = i
        break
      }
    }
    if (idx < 0) return undefined
    const toDelete = msgs.slice(idx + 1).map((m) => m.id)
    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?')
    this.db.transaction(() => toDelete.forEach((id) => stmt.run(id)))()
    return msgs[idx]
  }

  /**
   * 将持久化消息恢复为模型可用的上下文。
   * 保证每个 assistant.tool_calls 都有对应的 tool 结果（缺失时补充取消结果），避免请求被 API 拒绝。
   */
  toModelMessages(conversationId: string): ModelMessage[] {
    const msgs = this.messages(conversationId)
    const out: ModelMessage[] = []
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      if (m.role === 'user') {
        out.push({ role: 'user', content: m.content ?? '' })
      } else if (m.role === 'assistant') {
        if (m.toolCalls?.length) {
          out.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls })
          const results = new Map<string, ChatMessage>()
          let j = i + 1
          while (j < msgs.length && msgs[j].role === 'tool') {
            if (msgs[j].toolCallId) results.set(msgs[j].toolCallId!, msgs[j])
            j++
          }
          for (const tc of m.toolCalls) {
            const r = results.get(tc.id)
            out.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: r?.content ?? JSON.stringify({ error: '工具调用已取消或未完成' })
            })
          }
          i = j - 1
        } else if (m.content) {
          out.push({ role: 'assistant', content: m.content })
        }
      }
      // 孤立的 tool 消息直接忽略
    }
    return out
  }
}
