import { searchCity } from '../../services/open-meteo'
import { ToolError, type ToolDefinition } from '../types'
import type { SearchCityResult } from '@shared/weather'
import { rememberCities } from './location-cache'

export const searchCityTool: ToolDefinition<{ city: string }, SearchCityResult> = {
  name: 'search_city',
  description:
    '根据城市名称（支持中文，如“杭州”）搜索城市，返回城市名称、国家、行政区域、纬度、经度和时区。查询天气前必须先调用此工具获取经纬度。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', minLength: 1, maxLength: 100, description: '城市名称，例如：杭州、北京、Tokyo' }
    },
    required: ['city'],
    additionalProperties: false
  },
  timeoutMs: 15000,
  async execute({ city }, { signal }) {
    const results = await searchCity(city, 5, signal)
    if (!results.length) throw new ToolError(`未找到城市“${city}”，请确认城市名称是否正确`)
    rememberCities(results)
    return { query: city, results }
  }
}
