import type { ChatMessage } from '@shared/types'

export type View = 'chat' | 'settings'

export type Turn =
  | { kind: 'user'; id: string; message: ChatMessage }
  | { kind: 'assistant'; id: string; messages: ChatMessage[]; tools: Map<string, ChatMessage> }
