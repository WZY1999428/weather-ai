<script setup lang="ts">
import { computed } from 'vue'
import type { ToolExecution } from '@shared/types'
import type { CurrentWeatherResult, ForecastResult } from '@shared/weather'
import ToolCallCard from './ToolCallCard.vue'
import WeatherCard from './WeatherCard.vue'
import ForecastCard from './ForecastCard.vue'

const props = defineProps<{ execution: ToolExecution }>()

const current = computed(() => {
  const r = props.execution.result as CurrentWeatherResult | undefined
  return props.execution.status === 'success' && props.execution.name === 'get_current_weather' && r && typeof r.temperature === 'number'
    ? r
    : null
})
const forecast = computed(() => {
  const r = props.execution.result as ForecastResult | undefined
  return props.execution.status === 'success' && props.execution.name === 'get_weather_forecast' && r && Array.isArray(r.days)
    ? r
    : null
})
</script>

<template>
  <ToolCallCard :execution="execution" />
  <WeatherCard v-if="current" :data="current" />
  <ForecastCard v-if="forecast" :data="forecast" />
</template>
