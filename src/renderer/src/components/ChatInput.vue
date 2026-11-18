<script setup lang="ts">
import { ref } from 'vue'
import { Promotion, VideoPause } from '@element-plus/icons-vue'

const props = defineProps<{ running: boolean; disabled?: boolean }>()
const emit = defineEmits<{ send: [string]; stop: [] }>()
const text = ref('')

function submit(): void {
  if (props.running || props.disabled || !text.value.trim()) return
  emit('send', text.value)
  text.value = ''
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <div class="chat-input">
    <el-input
      v-model="text"
      type="textarea"
      :autosize="{ minRows: 2, maxRows: 8 }"
      resize="none"
      placeholder="输入消息，例如：杭州今天天气怎么样？未来三天会下雨吗？（Enter 发送，Shift+Enter 换行）"
      :disabled="disabled"
      @keydown="onKeydown"
    />
    <div class="actions">
      <el-button v-if="running" type="danger" plain :icon="VideoPause" @click="emit('stop')">停止生成</el-button>
      <el-button v-else type="primary" :icon="Promotion" :disabled="disabled || !text.trim()" @click="submit">发送</el-button>
    </div>
  </div>
</template>

<style scoped>
.chat-input { display: flex; gap: 10px; align-items: flex-end; padding: 12px 20px 16px; border-top: 1px solid var(--wa-border); background: #fff; }
.chat-input :deep(.el-textarea__inner) { border-radius: 10px; padding: 10px 12px; box-shadow: 0 0 0 1px var(--wa-border) inset; }
.actions { flex-shrink: 0; }
</style>
