<script setup lang="ts">
import { computed } from 'vue'
import type { ForecastResult } from '@shared/weather'
import { unitSymbol, weatherCodeIcon } from '@shared/weather'

const props = defineProps<{ data: ForecastResult }>()
const u = computed(() => unitSymbol(props.data.unit))
const place = computed(() =>
  props.data.location
    ? [props.data.location.name, props.data.location.admin1].filter(Boolean).join(' · ')
    : `${props.data.latitude.toFixed(2)}, ${props.data.longitude.toFixed(2)}`
)
const localDate = (offsetDays: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const weekday = (date: string): string => {
  if (date === localDate(0)) return '今天'
  if (date === localDate(1)) return '明天'
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${date}T00:00:00`).getDay()]
}
const time = (iso: string): string => iso.split('T')[1] ?? iso
</script>

<template>
  <div class="forecast-card">
    <div class="header">
      <span class="title">{{ place }} · 未来 {{ data.days.length }} 天预报</span>
      <span class="sub">获取于 {{ new Date(data.fetchedAt).toLocaleString('zh-CN', { hour12: false }) }} · 和风天气</span>
    </div>
    <div class="days">
      <div v-for="d in data.days" :key="d.date" class="day">
        <div class="wd">{{ weekday(d.date) }}</div>
        <div class="date">{{ d.date.slice(5) }}</div>
        <div class="icon">{{ weatherCodeIcon(d.weatherCode) }}</div>
        <div class="desc">{{ d.weather }}</div>
        <div class="temps">
          <span class="max">{{ Math.round(d.temperatureMax) }}{{ u }}</span>
          <span class="min">{{ Math.round(d.temperatureMin) }}{{ u }}</span>
        </div>
        <div class="meta">💧 <template v-if="d.precipitationProbabilityMax !== null">{{ d.precipitationProbabilityMax }}% · </template>{{ d.precipitationSum }}mm</div>
        <div class="meta">💨 {{ d.windSpeedMax }} {{ data.windSpeedUnit }}</div>
        <div class="meta">🌅 {{ time(d.sunrise) }} 🌇 {{ time(d.sunset) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.forecast-card { border: 1px solid var(--wa-border); background: #fff; border-radius: 14px; padding: 12px 14px; margin: 8px 0; max-width: 100%; }
.header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.title { font-weight: 600; }
.sub { font-size: 11px; color: var(--wa-muted); }
.days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.day { flex: 0 0 128px; background: linear-gradient(180deg, #f2f6ff 0%, #ffffff 100%); border: 1px solid #e6ecfb; border-radius: 10px; padding: 10px; text-align: center; }
.wd { font-weight: 600; }
.date { font-size: 11px; color: var(--wa-muted); }
.icon { font-size: 30px; margin: 6px 0 2px; }
.desc { font-size: 13px; }
.temps { margin: 6px 0; }
.max { color: #f56c6c; font-weight: 600; margin-right: 6px; }
.min { color: #409eff; font-weight: 600; }
.meta { font-size: 11px; color: #606266; margin-top: 2px; white-space: nowrap; }
</style>
