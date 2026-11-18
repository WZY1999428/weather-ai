<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatDotRound, Delete, EditPen, Plus, Setting } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chat'
import { errorMessage } from '../services/api'
import type { View } from '../types'

defineProps<{ view: View }>()
const emit = defineEmits<{ 'update:view': [View] }>()
const chat = useChatStore()

async function onCreate(): Promise<void> {
  try {
    await chat.create()
    emit('update:view', 'chat')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function onSelect(id: string): Promise<void> {
  emit('update:view', 'chat')
  try {
    await chat.select(id)
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function onRename(id: string, title: string): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的会话标题', '修改标题', {
      inputValue: title,
      inputValidator: (v) => (!!v && v.trim().length > 0) || '标题不能为空',
      confirmButtonText: '保存',
      cancelButtonText: '取消'
    })
    await chat.rename(id, value)
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error(errorMessage(err))
  }
}

async function onRemove(id: string, title: string): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除会话“${title}”吗？此操作不可恢复。`, '删除会话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await chat.remove(id)
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error(errorMessage(err))
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="logo">🌤️</span>
      <span class="name">WeatherAI</span>
    </div>
    <el-button class="new-btn" type="primary" :icon="Plus" @click="onCreate">新建会话</el-button>
    <div class="list">
      <div v-if="!chat.conversations.length" class="empty">暂无会话</div>
      <div
        v-for="c in chat.conversations"
        :key="c.id"
        class="item"
        :class="{ active: view === 'chat' && c.id === chat.currentId }"
        @click="onSelect(c.id)"
      >
        <el-icon class="item-icon"><ChatDotRound /></el-icon>
        <div class="item-body">
          <div class="item-title" :title="c.title">{{ c.title }}</div>
          <div class="item-time">{{ formatTime(c.updatedAt) }}</div>
        </div>
        <div class="item-actions" @click.stop>
          <el-button link size="small" :icon="EditPen" title="修改标题" @click="onRename(c.id, c.title)" />
          <el-button link size="small" :icon="Delete" title="删除" @click="onRemove(c.id, c.title)" />
        </div>
      </div>
    </div>
    <div class="footer">
      <el-button text :icon="Setting" :type="view === 'settings' ? 'primary' : ''" @click="emit('update:view', 'settings')">
        设置
      </el-button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar { width: 260px; flex-shrink: 0; background: var(--wa-sidebar); border-right: 1px solid var(--wa-border); display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 8px; padding: 18px 18px 12px; font-weight: 600; font-size: 17px; }
.logo { font-size: 22px; }
.new-btn { margin: 0 14px 10px; }
.list { flex: 1; overflow-y: auto; padding: 0 8px; }
.empty { color: var(--wa-muted); text-align: center; margin-top: 40px; font-size: 13px; }
.item { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 2px; }
.item:hover { background: #f3f4f8; }
.item.active { background: #eef1fe; }
.item-icon { color: var(--wa-muted); }
.item-body { flex: 1; min-width: 0; }
.item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.item-time { font-size: 11px; color: var(--wa-muted); margin-top: 2px; }
.item-actions { display: none; }
.item:hover .item-actions { display: flex; }
.item-actions .el-button + .el-button { margin-left: 2px; }
.footer { border-top: 1px solid var(--wa-border); padding: 8px 10px; }
</style>
