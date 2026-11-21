import { getCurrentWeather, getForecast, MAX_FORECAST_DAYS } from '../../services/qweather'
import { ToolError, type ToolDefinition } from '../types'
import type { CurrentWeatherResult, ForecastResult } from '@shared/weather'
import type { QWeatherCredentials, WeatherConfig } from '@shared/types'
import { findCity, toLabel } from './location-cache'

const coordinateProps = {
  latitude: { type: 'number', minimum: -90, maximum: 90, description: '纬度，必须来自 search_city 的返回结果' },
  longitude: { type: 'number', minimum: -180, maximum: 180, description: '经度，必须来自 search_city 的返回结果' }
}

function resolveLocation(latitude: number, longitude: number) {
  const city = findCity(latitude, longitude)
  if (!city) {
    throw new ToolError('该经纬度不是来自 search_city 的结果。请先调用 search_city 获取城市经纬度，不要自行推测坐标。')
  }
  return city
}

export function createCurrentWeatherTool(
  getConfig: () => WeatherConfig,
  getCredentials: () => QWeatherCredentials
): ToolDefinition<{ latitude: number; longitude: number }, CurrentWeatherResult> {
  return {
    name: 'get_current_weather',
    description:
      '查询指定经纬度的实时天气：温度、体感温度、天气状况、相对湿度、风速、风向、降水量、更新时间、时区。经纬度必须先通过 search_city 获取。',
    parameters: {
      type: 'object',
      properties: coordinateProps,
      required: ['latitude', 'longitude'],
      additionalProperties: false
    },
    timeoutMs: 25000,
    async execute({ latitude, longitude }, { signal }) {
      const city = resolveLocation(latitude, longitude)
      const query = { latitude, longitude, timezone: city.timezone, unit: getConfig().unit }
      const data = await getCurrentWeather(getCredentials(), query, signal)
      return { location: toLabel(city), ...data }
    }
  }
}

export function createForecastTool(
  getConfig: () => WeatherConfig,
  getCredentials: () => QWeatherCredentials
): ToolDefinition<{ latitude: number; longitude: number; days?: number }, ForecastResult> {
  return {
    name: 'get_weather_forecast',
    description:
      '查询指定经纬度未来若干天（1-15 天）的每日天气预报：最高/最低温度、天气状况、降水概率、降水量、日出日落时间、最大风速。经纬度必须先通过 search_city 获取。',
    parameters: {
      type: 'object',
      properties: {
        ...coordinateProps,
        days: { type: 'integer', minimum: 1, maximum: MAX_FORECAST_DAYS, description: '预报天数，未指定时使用用户设置的默认天数' }
      },
      required: ['latitude', 'longitude'],
      additionalProperties: false
    },
    timeoutMs: 25000,
    async execute({ latitude, longitude, days }, { signal }) {
      const city = resolveLocation(latitude, longitude)
      const cfg = getConfig()
      const query = { latitude, longitude, timezone: city.timezone, unit: cfg.unit }
      const data = await getForecast(getCredentials(), query, days ?? cfg.forecastDays, signal)
      return { location: toLabel(city), ...data }
    }
  }
}
