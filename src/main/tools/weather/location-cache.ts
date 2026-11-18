import type { CityResult, LocationLabel } from '@shared/weather'

/**
 * 记录 search_city 返回过的坐标。天气工具只接受来自城市搜索结果的经纬度，
 * 防止模型凭空编造坐标。
 */
const TOLERANCE = 0.05
const cache: CityResult[] = []
const MAX = 200

export function rememberCities(cities: CityResult[]): void {
  for (const c of cities) {
    const i = cache.findIndex((x) => x.id === c.id)
    if (i >= 0) cache.splice(i, 1)
    cache.push(c)
  }
  if (cache.length > MAX) cache.splice(0, cache.length - MAX)
}

export function findCity(latitude: number, longitude: number): CityResult | undefined {
  for (let i = cache.length - 1; i >= 0; i--) {
    const c = cache[i]
    if (Math.abs(c.latitude - latitude) <= TOLERANCE && Math.abs(c.longitude - longitude) <= TOLERANCE) return c
  }
  return undefined
}

export function toLabel(c: CityResult): LocationLabel {
  return { name: c.name, admin1: c.admin1, country: c.country }
}

export function clearCityCache(): void {
  cache.length = 0
}
