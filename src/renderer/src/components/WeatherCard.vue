<script setup lang="ts">
import { computed } from 'vue'
import type { CurrentWeatherResult } from '@shared/weather'
import { unitSymbol, weatherCodeIcon } from '@shared/weather'

const props = defineProps<{ data: CurrentWeatherResult }>()
const u = computed(() => unitSymbol(props.data.unit))
const place = computed(() => {
  const l = props.data.location
  if (!l) return `${props.data.latitude.toFixed(2)}, ${props.data.longitude.toFixed(2)}`
  return l.name
})
const region = computed(() => [props.data.location?.admin1, props.data.location?.country].filter(Boolean).join(' · '))
</script>

<template>
  <div class="weather-card" :class="{ night: !data.isDay }">
    <div class="top">
      <div>
        <div class="city">{{ place }}</div>
        <div class="region">{{ region }}</div>
      </div>
      <div class="icon">{{ weatherCodeIcon(data.weatherCode) }}</div>
    </div>
    <div class="main">
      <span class="temp">{{ Math.round(data.temperature) }}</span><span class="unit">{{ u }}</span>
      <span class="desc">{{ data.weather }}</span>
    </div>
    <div class="grid">
      <div><span class="k">体感</span><span class="v">{{ data.apparentTemperature }}{{ u }}</span></div>
      <div><span class="k">湿度</span><span class="v">{{ data.relativeHumidity }}%</span></div>
      <div><span class="k">风速</span><span class="v">{{ data.windSpeed }} {{ data.windSpeedUnit }}</span></div>
      <div><span class="k">风向</span><span class="v">{{ data.windDirectionText }}</span></div>
      <div><span class="k">降水</span><span class="v">{{ data.precipitation }} mm</span></div>
    </div>
    <div class="foot">更新时间 {{ data.updateTime.replace('T', ' ') }}（{{ data.timezone }}）· 数据来源 和风天气</div>
  </div>
</template>

<style scoped>
.weather-card { width: 360px; max-width: 100%; border-radius: 14px; padding: 16px 18px; color: #fff; background: linear-gradient(135deg, #5b8def 0%, #4fc3f7 100%); box-shadow: 0 6px 18px rgba(79, 110, 247, 0.25); margin: 8px 0; }
.weather-card.night { background: linear-gradient(135deg, #2c3e75 0%, #4a5a9a 100%); }
.top { display: flex; justify-content: space-between; align-items: flex-start; }
.city { font-size: 18px; font-weight: 600; }
.region { font-size: 12px; opacity: 0.85; margin-top: 2px; }
.icon { font-size: 42px; line-height: 1; }
.main { display: flex; align-items: baseline; gap: 4px; margin: 8px 0 12px; }
.temp { font-size: 46px; font-weight: 300; line-height: 1; }
.unit { font-size: 18px; }
.desc { margin-left: 12px; font-size: 16px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 10px; }
.grid div { display: flex; flex-direction: column; }
.k { font-size: 11px; opacity: 0.8; }
.v { font-size: 14px; font-weight: 500; }
.foot { font-size: 11px; opacity: 0.8; margin-top: 10px; }
</style>
