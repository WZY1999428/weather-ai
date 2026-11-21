import type { QWeatherCredentials, TemperatureUnit } from '@shared/types'
import {
  isNightIcon,
  type CityResult,
  type CurrentWeatherResult,
  type DailyForecast,
  type ForecastResult
} from '@shared/weather'

/** 未配置专属 API Host 时使用的公共域名 */
const PUBLIC_GEO_BASE = 'https://geoapi.qweather.com/v2'
const PUBLIC_WEATHER_BASE = 'https://devapi.qweather.com/v7'
const DEFAULT_TIMEOUT = 6000
const MAX_ATTEMPTS = 3
export const MAX_FORECAST_DAYS = 15

export class QWeatherError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly status?: number
  ) {
    super(message)
    this.name = 'QWeatherError'
  }
}

function endpoints(creds: QWeatherCredentials): { geo: string; weather: string } {
  const host = creds.apiHost.trim()
  if (!host) return { geo: PUBLIC_GEO_BASE, weather: PUBLIC_WEATHER_BASE }
  return { geo: `https://${host}/geo/v2`, weather: `https://${host}/v7` }
}

function buildURL(base: string, path: string, params: Record<string, string>): URL {
  const url = new URL(`${base}${path}`)
  url.search = new URLSearchParams(params).toString()
  return url
}

/** 超时、网络错误和 5xx 最多重试两次；取消和 4xx 不重试。 */
async function getJSON<T>(url: URL, creds: QWeatherCredentials, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  const apiKey = creds.apiKey.trim()
  if (!apiKey) throw new QWeatherError('未配置和风天气 API Key，请在「设置 → 天气」中填写')
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchJSON<T>(url, apiKey, signal, timeoutMs)
    } catch (err) {
      if (!(err instanceof QWeatherError) || !err.retryable || attempt >= MAX_ATTEMPTS || signal?.aborted) throw err
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

interface QWeatherBody {
  code?: string
  error?: { status?: number; title?: string; detail?: string }
}

async function fetchJSON<T>(url: URL, apiKey: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(url, { signal: combined, headers: { Accept: 'application/json', 'X-QW-Api-Key': apiKey } })
  } catch (err) {
    if (signal?.aborted) throw new QWeatherError('请求已取消')
    if (timeout.aborted) throw new QWeatherError(`天气服务请求超时（${timeoutMs / 1000}s）`, true)
    throw new QWeatherError(`无法连接天气服务：${(err as Error).message}`, true)
  }
  let body: (T & QWeatherBody) | null = null
  try {
    body = await res.json()
  } catch {
    if (signal?.aborted) throw new QWeatherError('请求已取消')
    if (timeout.aborted) throw new QWeatherError(`天气服务请求超时（${timeoutMs / 1000}s）`, true)
  }
  if (res.ok && body && !body.error && body.code === '200') return body
  const status = body?.error?.status ?? (body?.code ? Number(body.code) : res.status)
  const reason = body?.error ? [body.error.title, body.error.detail].filter(Boolean).join('：') : body?.code ? `code ${body.code}` : ''
  throw new QWeatherError(`天气服务返回错误（HTTP ${status}）${reason ? `：${reason}` : ''}`, status >= 500, status)
}

const num = (v: string | undefined): number => (v === undefined || v === '' ? NaN : Number(v))
const round1 = (v: number): number => Math.round(v * 10) / 10
const toUnit = (celsius: number, unit: TemperatureUnit): number => (unit === 'fahrenheit' ? round1((celsius * 9) / 5 + 32) : celsius)
/** "2026-11-21T08:37+08:00" -> "2026-11-21T08:37"（当地时间） */
const localTime = (iso: string): string => iso.slice(0, 16)
const lonLat = (latitude: number, longitude: number): string => `${longitude.toFixed(2)},${latitude.toFixed(2)}`

interface GeoResponse extends QWeatherBody {
  location?: Array<{ id: string; name: string; lat: string; lon: string; adm1?: string; adm2?: string; country?: string; tz?: string }>
}

export async function searchCity(creds: QWeatherCredentials, name: string, count = 5, signal?: AbortSignal): Promise<CityResult[]> {
  const url = buildURL(endpoints(creds).geo, '/city/lookup', { location: name.trim(), number: String(count), lang: 'zh' })
  let data: GeoResponse
  try {
    data = await getJSON<GeoResponse>(url, creds, signal)
  } catch (err) {
    // 400 No Such Location / 404 无数据：视为未找到
    if (err instanceof QWeatherError && (err.status === 400 || err.status === 404)) return []
    throw err
  }
  return (data.location ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country ?? '',
    admin1: r.adm1 ?? '',
    admin2: r.adm2 ?? '',
    latitude: num(r.lat),
    longitude: num(r.lon),
    timezone: r.tz ?? ''
  }))
}

export interface WeatherQuery {
  latitude: number
  longitude: number
  timezone: string
  unit: TemperatureUnit
}

interface NowResponse extends QWeatherBody {
  now: {
    obsTime: string
    temp: string
    feelsLike: string
    icon: string
    text: string
    wind360: string
    windDir: string
    windSpeed: string
    humidity: string
    precip: string
  }
}

export async function getCurrentWeather(
  creds: QWeatherCredentials,
  q: WeatherQuery,
  signal?: AbortSignal
): Promise<Omit<CurrentWeatherResult, 'location'>> {
  const url = buildURL(endpoints(creds).weather, '/weather/now', { location: lonLat(q.latitude, q.longitude), lang: 'zh', unit: 'm' })
  const { now: n } = await getJSON<NowResponse>(url, creds, signal)
  const icon = num(n.icon)
  return {
    latitude: q.latitude,
    longitude: q.longitude,
    timezone: q.timezone,
    unit: q.unit,
    temperature: toUnit(num(n.temp), q.unit),
    apparentTemperature: toUnit(num(n.feelsLike), q.unit),
    weatherCode: icon,
    weather: n.text,
    isDay: !isNightIcon(icon),
    relativeHumidity: num(n.humidity),
    windSpeed: num(n.windSpeed),
    windSpeedUnit: 'km/h',
    windDirection: num(n.wind360),
    windDirectionText: n.windDir,
    precipitation: num(n.precip),
    updateTime: localTime(n.obsTime),
    fetchedAt: new Date().toISOString(),
    source: 'QWeather'
  }
}

interface DailyResponse extends QWeatherBody {
  daily: Array<{
    fxDate: string
    sunrise?: string
    sunset?: string
    tempMax: string
    tempMin: string
    iconDay: string
    textDay: string
    textNight: string
    windSpeedDay: string
    windSpeedNight: string
    precip: string
  }>
}

/** 和风天气只提供 3/7/10/15 天预报接口，取不小于所需天数的最小档位 */
function forecastPath(days: number): string {
  const span = [3, 7, 10, 15].find((d) => d >= days) ?? MAX_FORECAST_DAYS
  return `/weather/${span}d`
}

export async function getForecast(
  creds: QWeatherCredentials,
  q: WeatherQuery,
  days: number,
  signal?: AbortSignal
): Promise<Omit<ForecastResult, 'location'>> {
  const count = Math.min(Math.max(1, Math.round(days)), MAX_FORECAST_DAYS)
  const url = buildURL(endpoints(creds).weather, forecastPath(count), { location: lonLat(q.latitude, q.longitude), lang: 'zh', unit: 'm' })
  const d = await getJSON<DailyResponse>(url, creds, signal)
  const list: DailyForecast[] = d.daily.slice(0, count).map((x) => ({
    date: x.fxDate,
    weatherCode: num(x.iconDay),
    weather: x.textDay === x.textNight ? x.textDay : `${x.textDay}转${x.textNight}`,
    temperatureMax: toUnit(num(x.tempMax), q.unit),
    temperatureMin: toUnit(num(x.tempMin), q.unit),
    precipitationProbabilityMax: null,
    precipitationSum: num(x.precip),
    sunrise: x.sunrise ?? '',
    sunset: x.sunset ?? '',
    windSpeedMax: Math.max(num(x.windSpeedDay), num(x.windSpeedNight))
  }))
  return {
    latitude: q.latitude,
    longitude: q.longitude,
    timezone: q.timezone,
    unit: q.unit,
    windSpeedUnit: 'km/h',
    days: list,
    fetchedAt: new Date().toISOString(),
    source: 'QWeather'
  }
}
