import type { WeatherAIApi } from '@shared/types'

/** Renderer 唯一的后端访问入口（经 preload 暴露的受限 IPC 接口） */
export const api: WeatherAIApi = window.weatherAI

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // 去掉 Electron IPC 包装的前缀
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
