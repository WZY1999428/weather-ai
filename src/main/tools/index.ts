import type { QWeatherCredentials, WeatherConfig } from '@shared/types'
import { ToolRegistry } from './registry'
import { registerWeatherTools } from './weather'

export function createToolRegistry(deps: {
  getWeatherConfig: () => WeatherConfig
  getQWeather: () => QWeatherCredentials
}): ToolRegistry {
  const registry = new ToolRegistry()
  registerWeatherTools(registry, deps.getWeatherConfig, deps.getQWeather)
  // 后续工具（文件、系统信息、搜索等）在此注册
  return registry
}
