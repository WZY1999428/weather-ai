import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'init',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT,
          toolCalls TEXT,
          toolCallId TEXT,
          createdAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId, createdAt);
        CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updatedAt DESC);
      `)
    }
  },
  {
    version: 2,
    name: 'message-meta',
    up: (db) => {
      // 工具执行元信息（状态、耗时、参数），用于重启后恢复工具调用展示
      db.exec(`ALTER TABLE messages ADD COLUMN meta TEXT;`)
    }
  },
  {
    version: 3,
    name: 'message-seq',
    up: (db) => {
      // 同一毫秒内写入多条消息时保证顺序稳定
      db.exec(`ALTER TABLE messages ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;`)
    }
  }
]

export function runMigrations(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
  for (const m of pending) {
    db.transaction(() => {
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    })()
  }
}
