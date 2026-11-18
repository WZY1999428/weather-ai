import { describe, expect, it } from 'vitest'
import { ToolRegistry } from '../src/main/tools/registry'
import { createToolRegistry } from '../src/main/tools'

const cfg = () => ({ defaultCity: '杭州', unit: 'celsius' as const, forecastDays: 3 })

describe('ToolRegistry', () => {
  it('registers weather tools and converts to function-calling format', () => {
    const r = createToolRegistry({ getWeatherConfig: cfg })
    const tools = r.toFunctionTools()
    expect(tools.map((t) => t.function.name).sort()).toEqual(['get_current_weather', 'get_weather_forecast', 'search_city'])
    expect(tools.every((t) => t.type === 'function' && typeof t.function.parameters === 'object')).toBe(true)
  })

  it('rejects duplicate and invalid names, supports unregister', () => {
    const r = new ToolRegistry()
    const def = { name: 'echo', description: 'echo', parameters: { type: 'object' }, execute: async (a: unknown) => a }
    r.register(def)
    expect(() => r.register(def)).toThrow(/已注册/)
    expect(() => r.register({ ...def, name: 'bad name!' })).toThrow(/非法/)
    expect(r.unregister('echo')).toBe(true)
    expect(r.get('echo')).toBeUndefined()
  })

  it('validates args against JSON schema', () => {
    const r = createToolRegistry({ getWeatherConfig: cfg })
    expect(r.validateArgs('nope', '{}')).toMatchObject({ ok: false, error: expect.stringMatching(/未注册/) })
    expect(r.validateArgs('search_city', 'not json')).toMatchObject({ ok: false })
    expect(r.validateArgs('search_city', '{}')).toMatchObject({ ok: false })
    expect(r.validateArgs('get_current_weather', '{"latitude":200,"longitude":1}')).toMatchObject({ ok: false })
    expect(r.validateArgs('get_weather_forecast', '{"latitude":30,"longitude":120,"days":3,"x":1}')).toMatchObject({ ok: false })
    expect(r.validateArgs('search_city', '{"city":"杭州"}')).toEqual({ ok: true, args: { city: '杭州' } })
  })
})
