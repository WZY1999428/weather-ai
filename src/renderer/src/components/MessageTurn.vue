<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, RefreshRight } from '@element-plus/icons-vue'
import type { Turn } from '../types'
import { useChatStore } from '../stores/chat'
import MarkdownView from './MarkdownView.vue'
import ToolResultView from './ToolResultView.vue'

const props = defineProps<{ turn: Turn; isLast: boolean; running: boolean }>()
const emit = defineEmits<{ regenerate: [] }>()
const chat = useChatStore()

const time = computed(() => {
  const ts = props.turn.kind === 'user' ? props.turn.message.createdAt : props.turn.messages.at(-1)?.createdAt
  return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : ''
})

const text = computed(() =>
  props.turn.kind === 'user'
    ? (props.turn.message.content ?? '')
    : props.turn.messages
        .map((m) => m.content ?? '')
        .filter(Boolean)
        .join('\n\n')
)

const streaming = computed(() => props.turn.kind === 'assistant' && props.isLast && props.running)

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(text.value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <div class="turn" :class="turn.kind">
    <div class="avatar">{{ turn.kind === 'user' ? '我' : '🌤️' }}</div>
    <div class="content">
      <div v-if="turn.kind === 'user'" class="bubble user-bubble">{{ turn.message.content }}</div>
      <div v-else class="bubble assistant-bubble">
        <template v-for="m in turn.messages" :key="m.id">
          <MarkdownView v-if="m.content" :content="m.content" />
          <ToolResultView
            v-for="tc in m.toolCalls ?? []"
            :key="tc.id"
            :execution="chat.resolveExecution(tc.id, tc.function.name, tc.function.arguments, turn.tools.get(tc.id))"
          />
        </template>
        <div v-if="streaming" class="typing"><span></span><span></span><span></span></div>
      </div>
      <div class="meta">
        <span>{{ time }}</span>
        <template v-if="!streaming">
          <el-button v-if="text" link size="small" :icon="CopyDocument" @click="copy">复制</el-button>
          <el-button
            v-if="turn.kind === 'assistant' && isLast"
            link
            size="small"
            :icon="RefreshRight"
            @click="emit('regenerate')"
          >
            重新生成
          </el-button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.turn { display: flex; gap: 10px; margin-bottom: 18px; }
.turn.user { flex-direction: row-reverse; }
.avatar { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; background: #eef1fe; color: var(--wa-primary); font-weight: 600; }
.turn.user .avatar { background: var(--wa-primary); color: #fff; font-size: 13px; }
.content { max-width: min(760px, 80%); min-width: 0; display: flex; flex-direction: column; }
.turn.user .content { align-items: flex-end; }
.bubble { padding: 10px 14px; border-radius: 12px; }
.user-bubble { background: var(--wa-user-bubble); color: #fff; white-space: pre-wrap; word-break: break-word; border-top-right-radius: 4px; }
.assistant-bubble { background: var(--wa-assistant-bubble); border: 1px solid var(--wa-border); border-top-left-radius: 4px; min-width: 60px; }
.meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--wa-muted); margin-top: 4px; min-height: 22px; }
.meta .el-button + .el-button { margin-left: 0; }
.typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.typing span { width: 6px; height: 6px; border-radius: 50%; background: #b5bcc9; animation: blink 1.2s infinite ease-in-out; }
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
</style>
