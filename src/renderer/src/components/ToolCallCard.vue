<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolExecution } from '@shared/types'
import { Loading } from '@element-plus/icons-vue'
import { useSettingsStore } from '../stores/settings'

const props = defineProps<{ execution: ToolExecution; defaultOpen?: boolean }>()
const open = ref(!!props.defaultOpen)
const settings = useSettingsStore()

const statusMap = {
  waiting: { label: 'Waiting', type: 'info' },
  running: { label: 'Running', type: 'warning' },
  success: { label: 'Success', type: 'success' },
  failed: { label: 'Failed', type: 'danger' }
} as const

const status = computed(() => statusMap[props.execution.status])
const description = computed(
  () => props.execution.description || settings.tools.find((t) => t.name === props.execution.name)?.description || ''
)
const pretty = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))
</script>

<template>
  <div class="tool-card" :class="execution.status">
    <div class="head" @click="open = !open">
      <span class="dot">
        <el-icon v-if="execution.status === 'running'" class="is-loading"><Loading /></el-icon>
      </span>
      <span class="label">🔧 调用工具</span>
      <code class="name">{{ execution.name }}</code>
      <el-tag size="small" :type="status.type" effect="light" round>{{ status.label }}</el-tag>
      <span v-if="execution.durationMs !== undefined" class="dur">{{ execution.durationMs }} ms</span>
      <span class="toggle">{{ open ? '收起' : '详情' }}</span>
    </div>
    <div v-if="open" class="body">
      <div v-if="description" class="desc">{{ description }}</div>
      <div class="section">调用参数</div>
      <pre class="json-view">{{ pretty(execution.args) }}</pre>
      <template v-if="execution.status === 'failed'">
        <div class="section">错误</div>
        <div class="error">{{ execution.error }}</div>
      </template>
      <template v-else-if="execution.status === 'success'">
        <div class="section">返回结果</div>
        <pre class="json-view">{{ pretty(execution.result) }}</pre>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tool-card { border: 1px solid var(--wa-border); border-left: 3px solid #c0c4cc; border-radius: 8px; background: #fafbfd; margin: 6px 0; font-size: 13px; }
.tool-card.running { border-left-color: #e6a23c; }
.tool-card.success { border-left-color: #67c23a; }
.tool-card.failed { border-left-color: #f56c6c; }
.head { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; user-select: none; }
.dot { display: inline-flex; width: 14px; color: #e6a23c; }
.label { color: var(--wa-muted); }
.name { font-family: Consolas, monospace; font-weight: 600; color: var(--wa-text); }
.dur { color: var(--wa-muted); font-size: 12px; }
.toggle { margin-left: auto; color: var(--wa-primary); font-size: 12px; }
.body { padding: 0 10px 10px; }
.desc { color: #606266; margin-bottom: 6px; }
.section { font-size: 12px; color: var(--wa-muted); margin: 8px 0 4px; }
.error { color: #f56c6c; background: #fef0f0; border-radius: 6px; padding: 6px 10px; }
</style>
