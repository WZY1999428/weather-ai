<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import type { ConnectionTestResult, TemperatureUnit } from '@shared/types'
import { useSettingsStore } from '../stores/settings'
import { useChatStore } from '../stores/chat'
import { api, errorMessage } from '../services/api'

const emit = defineEmits<{ back: [] }>()
const settings = useSettingsStore()
const chat = useChatStore()
const tab = ref('ai')

const ai = reactive({ apiKey: '', baseURL: '', model: '', temperature: 0.7, maxTokens: 2048, timeoutSec: 60 })
const weather = reactive({ defaultCity: '', unit: 'celsius' as TemperatureUnit, forecastDays: 3 })
const qweather = reactive({ apiKey: '', apiHost: '' })
const appSettings = reactive({ autoLaunch: false, autoSave: true })
const testing = ref(false)
const testResult = ref<ConnectionTestResult | null>(null)
const saving = ref(false)

watch(
  () => settings.config,
  (c) => {
    if (!c) return
    Object.assign(ai, {
      baseURL: c.ai.baseURL,
      model: c.ai.model,
      temperature: c.ai.temperature,
      maxTokens: c.ai.maxTokens,
      timeoutSec: Math.round(c.ai.timeoutMs / 1000)
    })
    Object.assign(weather, c.weather)
    qweather.apiHost = c.qweather.apiHost
    Object.assign(appSettings, c.app)
  },
  { immediate: true }
)

function aiPayload(): Record<string, unknown> {
  return {
    ...(ai.apiKey.trim() ? { apiKey: ai.apiKey.trim() } : {}),
    baseURL: ai.baseURL,
    model: ai.model,
    temperature: ai.temperature,
    maxTokens: ai.maxTokens,
    timeoutMs: ai.timeoutSec * 1000
  }
}

async function saveAI(): Promise<void> {
  saving.value = true
  try {
    await settings.update({ ai: aiPayload() })
    ai.apiKey = ''
    ElMessage.success('AI 模型设置已保存')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  } finally {
    saving.value = false
  }
}

async function clearKey(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定清除已保存的 API Key 吗？', '清除 API Key', { type: 'warning' })
    await settings.update({ ai: { apiKey: '' } })
    ElMessage.success('API Key 已清除')
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error(errorMessage(err))
  }
}

async function testConnection(): Promise<void> {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await api.config.testConnection(aiPayload())
  } catch (err) {
    testResult.value = { ok: false, message: errorMessage(err) }
  } finally {
    testing.value = false
  }
}

async function saveWeather(): Promise<void> {
  try {
    await settings.update({
      weather: { ...weather },
      qweather: { apiHost: qweather.apiHost, ...(qweather.apiKey.trim() ? { apiKey: qweather.apiKey.trim() } : {}) }
    })
    qweather.apiKey = ''
    ElMessage.success('天气设置已保存')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function clearQWeatherKey(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定清除已保存的和风天气 API Key 吗？', '清除 API Key', { type: 'warning' })
    await settings.update({ qweather: { apiKey: '' } })
    ElMessage.success('和风天气 API Key 已清除')
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error(errorMessage(err))
  }
}

async function saveApp(key: 'autoLaunch' | 'autoSave', value: boolean): Promise<void> {
  try {
    await settings.update({ app: { [key]: value } })
    ElMessage.success('已保存')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function clearHistory(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定清空全部历史对话吗？此操作不可恢复。', '清空历史对话', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
    await chat.clearAll()
    ElMessage.success('历史对话已清空')
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error(errorMessage(err))
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="header">
      <el-button :icon="ArrowLeft" text @click="emit('back')">返回聊天</el-button>
      <span class="title">设置</span>
    </header>
    <div class="content">
      <el-tabs v-model="tab" tab-position="left" class="tabs">
        <el-tab-pane label="AI 模型" name="ai">
          <h3>AI 模型设置</h3>
          <el-form label-width="120px" class="form">
            <el-form-item label="API Key">
              <el-input
                v-model="ai.apiKey"
                type="password"
                show-password
                autocomplete="off"
                :placeholder="settings.config?.ai.hasApiKey ? `已保存：${settings.config.ai.apiKeyMasked}（留空则不修改）` : '请输入 DeepSeek API Key'"
              />
              <div class="hint">
                API Key 仅保存在本机主进程配置中（系统可用时加密存储），不会发送给界面层。
                <el-button v-if="settings.config?.ai.hasApiKey" link type="danger" size="small" @click="clearKey">清除</el-button>
              </div>
            </el-form-item>
            <el-form-item label="Base URL">
              <el-input v-model="ai.baseURL" placeholder="https://api.deepseek.com" />
            </el-form-item>
            <el-form-item label="模型名称">
              <el-input v-model="ai.model" placeholder="deepseek-chat" />
              <div class="hint">需使用支持 Function Calling 的模型，默认 deepseek-chat。</div>
            </el-form-item>
            <el-form-item label="Temperature">
              <el-slider v-model="ai.temperature" :min="0" :max="2" :step="0.1" show-input class="slider" />
            </el-form-item>
            <el-form-item label="Max Tokens">
              <el-input-number v-model="ai.maxTokens" :min="1" :max="8192" :step="256" />
            </el-form-item>
            <el-form-item label="超时时间(秒)">
              <el-input-number v-model="ai.timeoutSec" :min="5" :max="600" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="saveAI">保存</el-button>
              <el-button :loading="testing" @click="testConnection">测试连接</el-button>
            </el-form-item>
            <el-form-item v-if="testResult">
              <el-alert :type="testResult.ok ? 'success' : 'error'" :title="testResult.message" show-icon :closable="false" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="天气" name="weather">
          <h3>天气设置</h3>
          <el-form label-width="120px" class="form">
            <el-form-item label="和风 API Key">
              <el-input
                v-model="qweather.apiKey"
                type="password"
                show-password
                autocomplete="off"
                :placeholder="settings.config?.qweather.hasApiKey ? `已保存：${settings.config.qweather.apiKeyMasked}（留空则不修改）` : '请输入和风天气 API Key'"
              />
              <div class="hint">
                在
                <el-button link type="primary" size="small" @click="api.app.openExternal('https://console.qweather.com/')">和风天气控制台</el-button>
                创建 API KEY 类型的凭据。仅保存在本机（系统可用时加密存储）。
                <el-button v-if="settings.config?.qweather.hasApiKey" link type="danger" size="small" @click="clearQWeatherKey">清除</el-button>
              </div>
            </el-form-item>
            <el-form-item label="API Host">
              <el-input v-model="qweather.apiHost" placeholder="例如：abc1234xyz.def.qweatherapi.com（可留空）" />
              <div class="hint">控制台「设置」中的专属 API Host。留空则使用公共域名 devapi / geoapi.qweather.com。</div>
            </el-form-item>
            <el-form-item label="默认城市">
              <el-input v-model="weather.defaultCity" placeholder="例如：杭州" />
              <div class="hint">询问天气但未指定城市时使用。</div>
            </el-form-item>
            <el-form-item label="温度单位">
              <el-radio-group v-model="weather.unit">
                <el-radio value="celsius">摄氏度 °C</el-radio>
                <el-radio value="fahrenheit">华氏度 °F</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="默认预报天数">
              <el-input-number v-model="weather.forecastDays" :min="1" :max="15" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveWeather">保存</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="应用" name="app">
          <h3>应用设置</h3>
          <el-form label-width="120px" class="form">
            <el-form-item label="开机启动">
              <el-switch v-model="appSettings.autoLaunch" @change="(v: string | number | boolean) => saveApp('autoLaunch', !!v)" />
              <div class="hint">仅 Windows / macOS 生效。</div>
            </el-form-item>
            <el-form-item label="自动保存对话">
              <el-switch v-model="appSettings.autoSave" @change="(v: string | number | boolean) => saveApp('autoSave', !!v)" />
              <div class="hint">关闭后，退出应用时将清除所有对话记录。</div>
            </el-form-item>
            <el-form-item label="历史对话">
              <el-button type="danger" plain @click="clearHistory">清空历史对话</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="工具" name="tools">
          <h3>已注册工具（{{ settings.tools.length }}）</h3>
          <el-collapse>
            <el-collapse-item v-for="t in settings.tools" :key="t.name" :name="t.name">
              <template #title><code class="tool-name">{{ t.name }}</code></template>
              <p class="tool-desc">{{ t.description }}</p>
              <pre class="json-view">{{ JSON.stringify(t.parameters, null, 2) }}</pre>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>

        <el-tab-pane label="关于" name="about">
          <div class="about">
            <div class="about-logo">🌤️</div>
            <h2>WeatherAI</h2>
            <p>基于 DeepSeek Function Calling 的桌面 AI 天气助手</p>
            <el-descriptions v-if="settings.appInfo" :column="1" border class="desc">
              <el-descriptions-item label="应用版本">v{{ settings.appInfo.version }}</el-descriptions-item>
              <el-descriptions-item label="Electron">{{ settings.appInfo.electron }}</el-descriptions-item>
              <el-descriptions-item label="Chromium">{{ settings.appInfo.chrome }}</el-descriptions-item>
              <el-descriptions-item label="Node.js">{{ settings.appInfo.node }}</el-descriptions-item>
              <el-descriptions-item label="数据目录">{{ settings.appInfo.userDataPath }}</el-descriptions-item>
            </el-descriptions>
            <p class="credit">
              天气数据来源
              <el-button link type="primary" @click="api.app.openExternal('https://www.qweather.com/')">和风天气</el-button>
              · AI 模型
              <el-button link type="primary" @click="api.app.openExternal('https://platform.deepseek.com/')">DeepSeek</el-button>
            </p>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.settings-page { display: flex; flex-direction: column; height: 100%; background: #fff; }
.header { height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 16px; border-bottom: 1px solid var(--wa-border); }
.title { font-weight: 600; font-size: 15px; }
.content { flex: 1; overflow-y: auto; padding: 20px; }
.tabs { min-height: 100%; }
h3 { margin: 0 0 18px; }
.form { max-width: 620px; }
.hint { width: 100%; font-size: 12px; color: var(--wa-muted); line-height: 1.6; margin-top: 4px; }
.slider { width: 100%; }
.tool-name { font-weight: 600; }
.tool-desc { color: #606266; margin: 0 0 8px; }
.about { text-align: center; max-width: 560px; margin: 0 auto; }
.about-logo { font-size: 56px; }
.about h2 { margin: 6px 0; }
.desc { margin: 20px 0; text-align: left; }
.credit { color: var(--wa-muted); }
</style>
