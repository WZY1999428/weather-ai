<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Operation } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { errorMessage } from '../services/api'
import MessageTurn from '../components/MessageTurn.vue'
import ChatInput from '../components/ChatInput.vue'
import ToolPanel from '../components/ToolPanel.vue'

const emit = defineEmits<{ 'open-settings': [] }>()
const chat = useChatStore()
const settings = useSettingsStore()
const showPanel = ref(false)
const scroller = ref<HTMLElement | null>(null)

const hasKey = computed(() => !!settings.config?.ai.hasApiKey)
const examples = ['杭州现在天气怎么样？', '北京未来 5 天天气预报', '对比一下上海和广州今天的天气', '明天去成都需要带伞吗？']

async function send(text: string): Promise<void> {
  try {
    await chat.send(text)
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function regenerate(): Promise<void> {
  try {
    await chat.regenerate()
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

function scrollToBottom(force = false): void {
  const el = scroller.value
  if (!el) return
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
  if (force || nearBottom) void nextTick(() => (el.scrollTop = el.scrollHeight))
}

watch(() => chat.currentId, () => nextTick(() => scrollToBottom(true)))
watch(() => chat.currentMessages.map((m) => (m.content?.length ?? 0) + (m.toolCalls?.length ?? 0)).join(','), () => scrollToBottom())
watch(() => chat.currentMessages.length, () => scrollToBottom(true))
</script>

<template>
  <div class="chat-page">
    <header class="header">
      <div class="title">{{ chat.current?.title ?? '新对话' }}</div>
      <div class="status">
        <el-tag size="small" effect="plain">{{ settings.config?.ai.model ?? '-' }}</el-tag>
        <el-tag v-if="!hasKey" size="small" type="danger" class="clickable" @click="emit('open-settings')">未配置 API Key</el-tag>
        <el-tag v-else-if="chat.isRunning" size="small" type="warning">生成中…</el-tag>
        <el-tag v-else size="small" type="success">就绪</el-tag>
        <el-button :icon="Operation" size="small" :type="showPanel ? 'primary' : ''" @click="showPanel = !showPanel">
          工具详情
        </el-button>
      </div>
    </header>
    <div class="body">
      <div class="chat-column">
        <div ref="scroller" class="messages">
          <div v-if="!chat.turns.length" class="welcome">
            <div class="welcome-icon">🌤️</div>
            <h2>你好，我是 WeatherAI</h2>
            <p>我可以通过工具实时查询全球城市的天气和预报。</p>
            <el-alert v-if="!hasKey" type="warning" :closable="false" show-icon class="key-alert">
              <template #title>
                尚未配置 DeepSeek API Key，<el-button link type="primary" @click="emit('open-settings')">前往设置</el-button>
              </template>
            </el-alert>
            <div class="examples">
              <el-button v-for="e in examples" :key="e" round :disabled="!hasKey" @click="send(e)">{{ e }}</el-button>
            </div>
          </div>
          <MessageTurn
            v-for="(t, i) in chat.turns"
            :key="t.id"
            :turn="t"
            :is-last="i === chat.turns.length - 1"
            :running="chat.isRunning"
            @regenerate="regenerate"
          />
          <el-alert v-if="chat.currentError" type="error" show-icon :closable="true" class="error-alert" @close="chat.dismissError()">
            <template #title>
              {{ chat.currentError }}
              <el-button link type="primary" @click="regenerate">重试</el-button>
            </template>
          </el-alert>
        </div>
        <ChatInput :running="chat.isRunning" :disabled="!hasKey" @send="send" @stop="chat.stop()" />
      </div>
      <ToolPanel v-if="showPanel" @close="showPanel = false" />
    </div>
  </div>
</template>

<style scoped>
.chat-page { display: flex; flex-direction: column; height: 100%; }
.header { height: 56px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid var(--wa-border); background: #fff; }
.title { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.clickable { cursor: pointer; }
.body { flex: 1; display: flex; min-height: 0; }
.chat-column { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.messages { flex: 1; overflow-y: auto; padding: 20px 24px; }
.welcome { text-align: center; margin-top: 8vh; color: #606266; }
.welcome-icon { font-size: 54px; }
.welcome h2 { margin: 10px 0 6px; color: var(--wa-text); }
.key-alert { max-width: 420px; margin: 16px auto; }
.examples { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 20px; }
.examples .el-button + .el-button { margin-left: 0; }
.error-alert { max-width: 760px; margin: 0 auto 12px 44px; }
</style>
