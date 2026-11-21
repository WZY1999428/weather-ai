import type { QWeatherCredentials, WeatherConfig } from '@shared/types'
import type { ToolRegistry } from '../registry'
import { createSearchCityTool } from './city'
import { createCurrentWeatherTool, createForecastTool } from './forecast'

export function registerWeatherTools(
  registry: ToolRegistry,
  getConfig: () => WeatherConfig,
  getCredentials: () => QWeatherCredentials
): void {
  registry.register(createSearchCityTool(getCredentials))
  registry.register(createCurrentWeatherTool(getConfig, getCredentials))
  registry.register(createForecastTool(getConfig, getCredentials))
}
