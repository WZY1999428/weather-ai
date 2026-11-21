import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import type { AIConfig, AppSettings, ConfigUpdate, PublicConfig, QWeatherCredentials, WeatherConfig } from '@shared/types'

interface StoredSecret {
  apiKeyEnc?: string
  apiKeyPlain?: string
}

interface StoredConfig {
  ai: AIConfig & StoredSecret
  weather: WeatherConfig
  qweather: { apiHost: string } & StoredSecret
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
  qweather: { apiHost: '' },
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
          qweather: { ...DEFAULT_CONFIG.qweather, ...raw.qweather },
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
    return readSecret(this.config.ai)
  }

  getQWeather(): QWeatherCredentials {
    return { apiKey: readSecret(this.config.qweather), apiHost: this.config.qweather.apiHost }
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
    const qweatherKey = readSecret(this.config.qweather)
    return {
      ai: {
        ...this.getAI(),
        hasApiKey: key.length > 0,
        apiKeyMasked: maskKey(key)
      },
      weather: this.getWeather(),
      qweather: {
        apiHost: this.config.qweather.apiHost,
        hasApiKey: qweatherKey.length > 0,
        apiKeyMasked: maskKey(qweatherKey)
      },
      app: this.getApp()
    }
  }

  /** 合并更新（不保存），用于连接测试等临时场景 */
  static mergeAI(base: AIConfig, update?: Partial<AIConfig>): AIConfig {
    const merged = { ...base }
    if (!update) return merged
    if (typeof update.baseURL === 'string' && update.baseURL.trim()) merged.baseURL = validateBaseURL(update.baseURL)
    if (typeof update.model === 'string' && update.model.trim()) merged.model = update.model.trim()
    if (typeof update.temperature === 'number' && Number.isFinite(update.temperature)) merged.temperature = clamp(update.temperature, 0, 2)
    if (typeof update.maxTokens === 'number' && Number.isFinite(update.maxTokens)) merged.maxTokens = Math.round(clamp(update.maxTokens, 1, 8192))
    if (typeof update.timeoutMs === 'number' && Number.isFinite(update.timeoutMs)) merged.timeoutMs = Math.round(clamp(update.timeoutMs, 5000, 600000))
    return merged
  }

  update(update: ConfigUpdate): PublicConfig {
    const apiHost = typeof update.qweather?.apiHost === 'string' ? validateApiHost(update.qweather.apiHost) : undefined
    if (update.ai) {
      const { apiKey, ...rest } = update.ai
      Object.assign(this.config.ai, ConfigManager.mergeAI(this.getAI(), rest))
      if (typeof apiKey === 'string') writeSecret(this.config.ai, apiKey)
    }
    if (update.weather) {
      const w = update.weather
      if (typeof w.defaultCity === 'string') this.config.weather.defaultCity = w.defaultCity.trim()
      if (w.unit === 'celsius' || w.unit === 'fahrenheit') this.config.weather.unit = w.unit
      if (typeof w.forecastDays === 'number') this.config.weather.forecastDays = Math.round(clamp(w.forecastDays, 1, 15))
    }
    if (update.qweather) {
      const { apiKey } = update.qweather
      if (apiHost !== undefined) this.config.qweather.apiHost = apiHost
      if (typeof apiKey === 'string') writeSecret(this.config.qweather, apiKey)
    }
    if (update.app) {
      if (typeof update.app.autoLaunch === 'boolean') this.config.app.autoLaunch = update.app.autoLaunch
      if (typeof update.app.autoSave === 'boolean') this.config.app.autoSave = update.app.autoSave
    }
    this.save()
    return this.getPublic()
  }
}

function readSecret(s: StoredSecret): string {
  if (s.apiKeyEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64'))
    } catch (err) {
      console.error('[config] failed to decrypt api key', err)
      return ''
    }
  }
  return s.apiKeyPlain ?? ''
}

function writeSecret(s: StoredSecret, key: string): void {
  delete s.apiKeyEnc
  delete s.apiKeyPlain
  const trimmed = key.trim()
  if (!trimmed) return
  if (safeStorage.isEncryptionAvailable()) {
    s.apiKeyEnc = safeStorage.encryptString(trimmed).toString('base64')
  } else {
    s.apiKeyPlain = trimmed
  }
}

/** 接受 "abc.qweatherapi.com" 或 "https://abc.qweatherapi.com/"，统一保存为主机名 */
function validateApiHost(input: string): string {
  const value = input.trim().replace(/^https:\/\//i, '').replace(/\/+$/, '')
  if (!value) return ''
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(value)) {
    throw new Error('API Host 格式无效，应形如 abc1234xyz.def.qweatherapi.com')
  }
  return value.toLowerCase()
}

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length < 12) return '*'.repeat(8)
  return `${key.slice(0, 3)}${'*'.repeat(8)}${key.slice(-4)}`
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** 只允许 HTTPS；HTTP 仅限本机地址（本地兼容服务），避免 API Key 明文传输。 */
function validateBaseURL(input: string): string {
  const value = input.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Base URL 格式无效')
  }
  if (url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))) return value
  throw new Error('Base URL 必须使用 HTTPS（HTTP 仅允许 localhost）')
}
