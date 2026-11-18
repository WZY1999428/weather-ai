import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import type { AIConfig, AppSettings, ConfigUpdate, PublicConfig, WeatherConfig } from '@shared/types'

interface StoredConfig {
  ai: AIConfig & { apiKeyEnc?: string; apiKeyPlain?: string }
  weather: WeatherConfig
  app: AppSettings
}

export const DEFAULT_CONFIG: StoredConfig = {
  ai: {
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
    timeoutMs: 60000
  },
  weather: { defaultCity: '杭州', unit: 'celsius', forecastDays: 3 },
  app: { autoLaunch: false, autoSave: true }
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** 本地配置管理。API Key 仅在主进程内可读，优先使用系统 safeStorage 加密存储。 */
export class ConfigManager {
  private config: StoredConfig
  private readonly file: string

  constructor(file = join(app.getPath('userData'), 'config.json')) {
    this.file = file
    this.config = this.load()
  }

  private load(): StoredConfig {
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf-8')) as Partial<StoredConfig>
        return {
          ai: { ...DEFAULT_CONFIG.ai, ...raw.ai },
          weather: { ...DEFAULT_CONFIG.weather, ...raw.weather },
          app: { ...DEFAULT_CONFIG.app, ...raw.app }
        }
      }
    } catch (err) {
      console.error('[config] failed to load config, using defaults', err)
    }
    return structuredClone(DEFAULT_CONFIG)
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf-8')
    renameSync(tmp, this.file)
  }

  getApiKey(): string {
    const { apiKeyEnc, apiKeyPlain } = this.config.ai
    if (apiKeyEnc) {
      try {
        return safeStorage.decryptString(Buffer.from(apiKeyEnc, 'base64'))
      } catch (err) {
        console.error('[config] failed to decrypt api key', err)
        return ''
      }
    }
    return apiKeyPlain ?? ''
  }

  private setApiKey(key: string): void {
    delete this.config.ai.apiKeyEnc
    delete this.config.ai.apiKeyPlain
    const trimmed = key.trim()
    if (!trimmed) return
    if (safeStorage.isEncryptionAvailable()) {
      this.config.ai.apiKeyEnc = safeStorage.encryptString(trimmed).toString('base64')
    } else {
      this.config.ai.apiKeyPlain = trimmed
    }
  }

  getAI(): AIConfig {
    const { baseURL, model, temperature, maxTokens, timeoutMs } = this.config.ai
    return { baseURL, model, temperature, maxTokens, timeoutMs }
  }

  getWeather(): WeatherConfig {
    return { ...this.config.weather }
  }

  getApp(): AppSettings {
    return { ...this.config.app }
  }

  getPublic(): PublicConfig {
    const key = this.getApiKey()
    return {
      ai: {
        ...this.getAI(),
        hasApiKey: key.length > 0,
        apiKeyMasked: maskKey(key)
      },
      weather: this.getWeather(),
      app: this.getApp()
    }
  }

  /** 合并更新（不保存），用于连接测试等临时场景 */
  static mergeAI(base: AIConfig, update?: Partial<AIConfig>): AIConfig {
    const merged = { ...base }
    if (!update) return merged
    if (typeof update.baseURL === 'string' && update.baseURL.trim()) merged.baseURL = update.baseURL.trim().replace(/\/+$/, '')
    if (typeof update.model === 'string' && update.model.trim()) merged.model = update.model.trim()
    if (typeof update.temperature === 'number' && Number.isFinite(update.temperature)) merged.temperature = clamp(update.temperature, 0, 2)
    if (typeof update.maxTokens === 'number' && Number.isFinite(update.maxTokens)) merged.maxTokens = Math.round(clamp(update.maxTokens, 1, 8192))
    if (typeof update.timeoutMs === 'number' && Number.isFinite(update.timeoutMs)) merged.timeoutMs = Math.round(clamp(update.timeoutMs, 5000, 600000))
    return merged
  }

  update(update: ConfigUpdate): PublicConfig {
    if (update.ai) {
      const { apiKey, ...rest } = update.ai
      Object.assign(this.config.ai, ConfigManager.mergeAI(this.getAI(), rest))
      if (typeof apiKey === 'string') this.setApiKey(apiKey)
    }
    if (update.weather) {
      const w = update.weather
      if (typeof w.defaultCity === 'string') this.config.weather.defaultCity = w.defaultCity.trim()
      if (w.unit === 'celsius' || w.unit === 'fahrenheit') this.config.weather.unit = w.unit
      if (typeof w.forecastDays === 'number') this.config.weather.forecastDays = Math.round(clamp(w.forecastDays, 1, 16))
    }
    if (update.app) {
      if (typeof update.app.autoLaunch === 'boolean') this.config.app.autoLaunch = update.app.autoLaunch
      if (typeof update.app.autoSave === 'boolean') this.config.app.autoSave = update.app.autoSave
    }
    this.save()
    return this.getPublic()
  }
}

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length < 12) return '*'.repeat(8)
  return `${key.slice(0, 3)}${'*'.repeat(8)}${key.slice(-4)}`
}
