import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppInfo, ConfigUpdate, PublicConfig, ToolInfo } from '@shared/types'
import { api } from '../services/api'

export const useSettingsStore = defineStore('settings', () => {
  const config = ref<PublicConfig | null>(null)
  const tools = ref<ToolInfo[]>([])
  const appInfo = ref<AppInfo | null>(null)

  async function load(): Promise<void> {
    const [c, t, i] = await Promise.all([api.config.get(), api.tools.list(), api.app.info()])
    config.value = c
    tools.value = t
    appInfo.value = i
  }

  async function update(update: ConfigUpdate): Promise<PublicConfig> {
    config.value = await api.config.update(update)
    return config.value
  }

  return { config, tools, appInfo, load, update }
})
