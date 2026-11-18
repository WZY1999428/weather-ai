import type { WeatherConfig } from '@shared/types'
import { ToolRegistry } from './registry'
import { registerWeatherTools } from './weather'

export function createToolRegistry(deps: { getWeatherConfig: () => WeatherConfig }): ToolRegistry {
  const registry = new ToolRegistry()
  registerWeatherTools(registry, deps.getWeatherConfig)
  // 后续工具（文件、系统信息、搜索等）在此注册
  return registry
}
