import type { WeatherAIApi } from '../shared/types'

declare global {
  interface Window {
    weatherAI: WeatherAIApi
  }
}

export {}
