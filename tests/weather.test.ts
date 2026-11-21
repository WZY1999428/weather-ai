import { beforeEach, describe, expect, it } from 'vitest'
import { createToolRegistry } from '../src/main/tools'
import { clearCityCache } from '../src/main/tools/weather/location-cache'
import type { SearchCityResult, CurrentWeatherResult, ForecastResult } from '@shared/weather'

const apiKey = process.env.QWEATHER_API_KEY ?? ''
const registry = createToolRegistry({
  getWeatherConfig: () => ({ defaultCity: '杭州', unit: 'celsius', forecastDays: 3 }),
  getQWeather: () => ({ apiKey, apiHost: process.env.QWEATHER_API_HOST ?? '' })
})
const ctx = () => ({ signal: new AbortController().signal })

describe.skipIf(!apiKey)('weather tools (real QWeather API, needs QWEATHER_API_KEY)', () => {
  beforeEach(() => clearCityCache())

  it('search_city resolves Chinese city names', async () => {
    const res = (await registry.get('search_city')!.execute({ city: '杭州市' }, ctx())) as SearchCityResult
    const hz = res.results[0]
    expect(hz.name).toBe('杭州')
    expect(hz.country).toBe('中国')
    expect(hz.admin1).toContain('浙江')
    expect(hz.timezone).toBe('Asia/Shanghai')
    expect(Math.abs(hz.latitude - 30.27)).toBeLessThan(0.2)
  })

  it('rejects coordinates that did not come from search_city', async () => {
    await expect(registry.get('get_current_weather')!.execute({ latitude: 1.23, longitude: 4.56 }, ctx())).rejects.toThrow(
      /search_city/
    )
  })

  it('returns current weather and forecast for searched city', async () => {
    const { results } = (await registry.get('search_city')!.execute({ city: '北京' }, ctx())) as SearchCityResult
    const { latitude, longitude } = results[0]
    const cur = (await registry.get('get_current_weather')!.execute({ latitude, longitude }, ctx())) as CurrentWeatherResult
    expect(cur.location?.name).toBe('北京')
    expect(typeof cur.temperature).toBe('number')
    expect(cur.weather).not.toMatch(/未知/)
    expect(cur.updateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const fc = (await registry.get('get_weather_forecast')!.execute({ latitude, longitude, days: 5 }, ctx())) as ForecastResult
    expect(fc.days).toHaveLength(5)
    expect(fc.days[0]).toHaveProperty('sunrise')
    expect(fc.days[0].temperatureMax).toBeGreaterThanOrEqual(fc.days[0].temperatureMin)
    expect(fc.days[0].weather).toBeTruthy()
  })

  it('errors on unknown city', async () => {
    await expect(registry.get('search_city')!.execute({ city: 'qqqqxxxxzzzz' }, ctx())).rejects.toThrow(/未找到/)
  })
})
