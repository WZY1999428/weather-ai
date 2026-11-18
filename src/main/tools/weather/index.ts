import type { WeatherConfig } from '@shared/types'
import type { ToolRegistry } from '../registry'
import { searchCityTool } from './city'
import { createCurrentWeatherTool, createForecastTool } from './forecast'

export function registerWeatherTools(registry: ToolRegistry, getConfig: () => WeatherConfig): void {
  registry.register(searchCityTool)
  registry.register(createCurrentWeatherTool(getConfig))
  registry.register(createForecastTool(getConfig))
}
