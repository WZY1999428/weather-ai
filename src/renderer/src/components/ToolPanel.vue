<script setup lang="ts">
import { useChatStore } from '../stores/chat'
import ToolCallCard from './ToolCallCard.vue'

defineEmits<{ close: [] }>()
const chat = useChatStore()
</script>

<template>
  <aside class="tool-panel">
    <div class="head">
      <span>工具执行详情</span>
      <el-button link @click="$emit('close')">关闭</el-button>
    </div>
    <div class="list">
      <div v-if="!chat.currentToolExecutions.length" class="empty">当前会话暂无工具调用</div>
      <ToolCallCard
        v-for="e in [...chat.currentToolExecutions].reverse()"
        :key="e.toolCallId"
        :execution="e"
        default-open
      />
    </div>
  </aside>
</template>

<style scoped>
.tool-panel { width: 340px; flex-shrink: 0; border-left: 1px solid var(--wa-border); background: #fff; display: flex; flex-direction: column; }
.head { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--wa-border); font-weight: 600; }
.list { flex: 1; overflow-y: auto; padding: 10px; }
.empty { color: var(--wa-muted); text-align: center; margin-top: 40px; font-size: 13px; }
</style>
