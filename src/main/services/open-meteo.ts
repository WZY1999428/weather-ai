import type { TemperatureUnit } from '@shared/types'
import {
  weatherCodeText,
  windDirectionText,
  type CityResult,
  type CurrentWeatherResult,
  type DailyForecast,
  type ForecastResult
} from '@shared/weather'

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const DEFAULT_TIMEOUT = 6000
const MAX_ATTEMPTS = 3

export class OpenMeteoError extends Error {
  constructor(
    message: string,
    readonly retryable = false
  ) {
    super(message)
    this.name = 'OpenMeteoError'
  }
}

/** 超时、网络错误和 5xx 最多重试两次；取消和 4xx 不重试。 */
async function getJSON<T>(url: URL, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchJSON<T>(url, signal, timeoutMs)
    } catch (err) {
      if (!(err instanceof OpenMeteoError) || !err.retryable || attempt >= MAX_ATTEMPTS || signal?.aborted) throw err
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

async function fetchJSON<T>(url: URL, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(url, { signal: combined, headers: { Accept: 'application/json' } })
  } catch (err) {
    if (signal?.aborted) throw new OpenMeteoError('请求已取消')
    if (timeout.aborted) throw new OpenMeteoError(`天气服务请求超时（${timeoutMs / 1000}s）`, true)
    throw new OpenMeteoError(`无法连接天气服务：${(err as Error).message}`, true)
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: boolean; reason?: string }) | null
  if (!res.ok || !body || body.error) {
    throw new OpenMeteoError(
      `天气服务返回错误（HTTP ${res.status}）${body?.reason ? `：${body.reason}` : ''}`,
      res.status >= 500
    )
  }
  return body
}

interface GeoResponse {
  results?: Array<{
    id: number
    name: string
    latitude: number
    longitude: number
    timezone?: string
    country?: string
    country_code?: string
    admin1?: string
    admin2?: string
  }>
}

export async function searchCity(name: string, count = 5, signal?: AbortSignal): Promise<CityResult[]> {
  const query = async (q: string): Promise<CityResult[]> => {
    const url = new URL(GEOCODING_URL)
    url.search = new URLSearchParams({ name: q, count: String(count), language: 'zh', format: 'json' }).toString()
    const data = await getJSON<GeoResponse>(url, signal)
    return (data.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      country: r.country ?? '',
      countryCode: r.country_code ?? '',
      admin1: r.admin1 ?? '',
      admin2: r.admin2 ?? '',
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? 'auto'
    }))
  }
  const trimmed = name.trim()
  let results = await query(trimmed)
  // 中文地名常带行政后缀（杭州市、浙江省），未命中时去掉后缀重试
  const stripped = trimmed.replace(/(特别行政区|自治区|自治州|地区|省|市|区|县)$/u, '')
  if (!results.length && stripped && stripped !== trimmed) results = await query(stripped)
  return results
}

interface CurrentResponse {
  latitude: number
  longitude: number
  timezone: string
  current_units: Record<string, string>
  current: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    weather_code: number
    is_day: number
    wind_speed_10m: number
    wind_direction_10m: number
    precipitation: number
  }
}

export async function getCurrentWeather(
  latitude: number,
  longitude: number,
  unit: TemperatureUnit,
  signal?: AbortSignal
): Promise<Omit<CurrentWeatherResult, 'location'>> {
  const url = new URL(FORECAST_URL)
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,precipitation',
    timezone: 'auto',
    temperature_unit: unit,
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  }).toString()
  const d = await getJSON<CurrentResponse>(url, signal)
  const c = d.current
  return {
    latitude: d.latitude,
    longitude: d.longitude,
    timezone: d.timezone,
    unit,
    temperature: c.temperature_2m,
    apparentTemperature: c.apparent_temperature,
    weatherCode: c.weather_code,
    weather: weatherCodeText(c.weather_code),
    isDay: c.is_day === 1,
    relativeHumidity: c.relative_humidity_2m,
    windSpeed: c.wind_speed_10m,
    windSpeedUnit: 'km/h',
    windDirection: c.wind_direction_10m,
    windDirectionText: windDirectionText(c.wind_direction_10m),
    precipitation: c.precipitation,
    updateTime: c.time,
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo'
  }
}

interface DailyResponse {
  latitude: number
  longitude: number
  timezone: string
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: Array<number | null>
    precipitation_sum: number[]
    sunrise: string[]
    sunset: string[]
    wind_speed_10m_max: number[]
  }
}

export async function getForecast(
  latitude: number,
  longitude: number,
  days: number,
  unit: TemperatureUnit,
  signal?: AbortSignal
): Promise<Omit<ForecastResult, 'location'>> {
  const url = new URL(FORECAST_URL)
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,wind_speed_10m_max',
    forecast_days: String(days),
    timezone: 'auto',
    temperature_unit: unit,
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  }).toString()
  const d = await getJSON<DailyResponse>(url, signal)
  const daily = d.daily
  const list: DailyForecast[] = daily.time.map((date, i) => ({
    date,
    weatherCode: daily.weather_code[i],
    weather: weatherCodeText(daily.weather_code[i]),
    temperatureMax: daily.temperature_2m_max[i],
    temperatureMin: daily.temperature_2m_min[i],
    precipitationProbabilityMax: daily.precipitation_probability_max[i] ?? null,
    precipitationSum: daily.precipitation_sum[i],
    sunrise: daily.sunrise[i],
    sunset: daily.sunset[i],
    windSpeedMax: daily.wind_speed_10m_max[i]
  }))
  return {
    latitude: d.latitude,
    longitude: d.longitude,
    timezone: d.timezone,
    unit,
    windSpeedUnit: 'km/h',
    days: list,
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo'
  }
}
