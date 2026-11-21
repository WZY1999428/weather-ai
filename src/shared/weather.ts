import type { TemperatureUnit } from './types'

export interface CityResult {
  /** 和风天气 LocationID */
  id: string
  name: string
  country: string
  admin1: string
  admin2: string
  latitude: number
  longitude: number
  timezone: string
}

export interface SearchCityResult {
  query: string
  results: CityResult[]
}

export interface LocationLabel {
  name: string
  admin1: string
  country: string
}

export interface CurrentWeatherResult {
  location: LocationLabel | null
  latitude: number
  longitude: number
  timezone: string
  unit: TemperatureUnit
  temperature: number
  apparentTemperature: number
  weatherCode: number
  weather: string
  isDay: boolean
  relativeHumidity: number
  windSpeed: number
  windSpeedUnit: string
  windDirection: number
  windDirectionText: string
  precipitation: number
  /** 观测时间（当地时间，ISO） */
  updateTime: string
  fetchedAt: string
  source: 'QWeather'
}

export interface DailyForecast {
  date: string
  weatherCode: number
  weather: string
  temperatureMax: number
  temperatureMin: number
  precipitationProbabilityMax: number | null
  precipitationSum: number
  sunrise: string
  sunset: string
  windSpeedMax: number
}

export interface ForecastResult {
  location: LocationLabel | null
  latitude: number
  longitude: number
  timezone: string
  unit: TemperatureUnit
  windSpeedUnit: string
  days: DailyForecast[]
  fetchedAt: string
  source: 'QWeather'
}

/** 和风天气图标代码：https://dev.qweather.com/docs/resource/icons/ */
const NIGHT_ICONS = new Set([150, 151, 152, 153, 350, 351, 456, 457])
const DAY_ICONS = new Set([100, 101, 102, 103, 300, 301, 406, 407])

/** 阴、雨、雾等图标昼夜通用，此时按观测时间（当地 6:00-18:00）判断 */
export function isDaytime(code: number, localTime: string): boolean {
  if (NIGHT_ICONS.has(code)) return false
  if (DAY_ICONS.has(code)) return true
  const hour = Number(localTime.slice(11, 13))
  return hour >= 6 && hour < 18
}

export function weatherCodeIcon(code: number): string {
  if (code === 100) return '☀️'
  if (code === 101) return '⛅'
  if (code === 102 || code === 103) return '🌤️'
  if (code === 104) return '☁️'
  if (code === 150 || code === 152 || code === 153) return '🌙'
  if (code === 151) return '☁️'
  if (code === 300 || code === 350) return '🌦️'
  if (code >= 302 && code <= 304) return '⛈️'
  if (code >= 300 && code < 400) return '🌧️'
  if (code === 402 || code === 403 || code === 410) return '❄️'
  if (code >= 400 && code < 500) return '🌨️'
  if (code >= 503 && code <= 508) return '🌪️'
  if (code >= 500 && code < 600) return '🌫️'
  if (code === 900) return '🔥'
  if (code === 901) return '🥶'
  return '🌡️'
}

export const unitSymbol = (unit: TemperatureUnit): string => (unit === 'fahrenheit' ? '°F' : '°C')
