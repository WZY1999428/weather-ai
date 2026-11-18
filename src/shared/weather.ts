import type { TemperatureUnit } from './types'

export interface CityResult {
  id: number
  name: string
  country: string
  countryCode: string
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
  source: 'Open-Meteo'
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
  source: 'Open-Meteo'
}

const CODES: Record<number, [string, string]> = {
  0: ['晴', '☀️'],
  1: ['大部晴朗', '🌤️'],
  2: ['多云', '⛅'],
  3: ['阴', '☁️'],
  45: ['雾', '🌫️'],
  48: ['冻雾', '🌫️'],
  51: ['小毛毛雨', '🌦️'],
  53: ['毛毛雨', '🌦️'],
  55: ['大毛毛雨', '🌧️'],
  56: ['轻度冻毛毛雨', '🌧️'],
  57: ['强冻毛毛雨', '🌧️'],
  61: ['小雨', '🌦️'],
  63: ['中雨', '🌧️'],
  65: ['大雨', '🌧️'],
  66: ['轻度冻雨', '🌧️'],
  67: ['强冻雨', '🌧️'],
  71: ['小雪', '🌨️'],
  73: ['中雪', '🌨️'],
  75: ['大雪', '❄️'],
  77: ['雪粒', '🌨️'],
  80: ['小阵雨', '🌦️'],
  81: ['中阵雨', '🌧️'],
  82: ['强阵雨', '⛈️'],
  85: ['小阵雪', '🌨️'],
  86: ['大阵雪', '❄️'],
  95: ['雷暴', '⛈️'],
  96: ['雷暴伴小冰雹', '⛈️'],
  99: ['雷暴伴大冰雹', '⛈️']
}

export function weatherCodeText(code: number): string {
  return CODES[code]?.[0] ?? `未知天气(${code})`
}

export function weatherCodeIcon(code: number, isDay = true): string {
  if (!isDay && (code === 0 || code === 1)) return '🌙'
  return CODES[code]?.[1] ?? '🌡️'
}

export function windDirectionText(deg: number): string {
  const dirs = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风']
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

export const unitSymbol = (unit: TemperatureUnit): string => (unit === 'fahrenheit' ? '°F' : '°C')
