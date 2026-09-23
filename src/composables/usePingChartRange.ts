import type { MaybeRefOrGetter } from 'vue'
import dayjs from 'dayjs'
import { computed, ref, toValue } from 'vue'

export const PING_CHART_CUSTOM_VIEW_LABEL = '自定义'
export const PING_CHART_DEFAULT_CUSTOM_RANGE_HOURS = 24

interface PingChartView {
  label: string
  hours?: number
}

export interface PingChartCustomRange {
  start: dayjs.Dayjs
  end: dayjs.Dayjs
  hours: number
}

const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '1 天', hours: 24 },
]

export function usePingChartRange(maxPingRecordPreserveTime: MaybeRefOrGetter<number>) {
  const selectedView = ref<string>('')
  const customStartInput = ref('')
  const customEndInput = ref('')

  const availableViews = computed<PingChartView[]>(() => {
    const views: PingChartView[] = []
    const maxHours = toValue(maxPingRecordPreserveTime)

    for (const v of presetViews) {
      if (maxHours >= v.hours) {
        views.push(v)
      }
    }

    const maxPreset = presetViews.at(-1)
    if (maxPreset && maxHours > maxPreset.hours) {
      const label = maxHours % 24 === 0
        ? `${Math.floor(maxHours / 24)} 天`
        : `${maxHours} 小时`
      views.push({ label, hours: maxHours })
    }
    else if (maxHours > 1 && !presetViews.some(v => v.hours === maxHours)) {
      const label = maxHours % 24 === 0
        ? `${Math.floor(maxHours / 24)} 天`
        : `${maxHours} 小时`
      views.push({ label, hours: maxHours })
    }

    views.push({ label: PING_CHART_CUSTOM_VIEW_LABEL })
    return views
  })

  const isCustomRange = computed(() => selectedView.value === PING_CHART_CUSTOM_VIEW_LABEL)
  const customRange = computed<PingChartCustomRange | null>(() => {
    if (!customStartInput.value || !customEndInput.value)
      return null

    const start = dayjs(customStartInput.value)
    const end = dayjs(customEndInput.value)
    if (!start.isValid() || !end.isValid() || !end.isAfter(start))
      return null

    return {
      start,
      end,
      hours: Math.max(1, Math.ceil(end.diff(start, 'hour', true))),
    }
  })
  const customRangeError = computed(() => {
    if (!isCustomRange.value || (!customStartInput.value && !customEndInput.value))
      return ''
    if (!customStartInput.value || !customEndInput.value)
      return '请选择开始和结束时间'
    return customRange.value ? '' : '结束时间必须晚于开始时间'
  })

  function ensureDefaultCustomRange() {
    if (customStartInput.value && customEndInput.value)
      return

    const end = dayjs()
    const hours = Math.max(1, Math.min(PING_CHART_DEFAULT_CUSTOM_RANGE_HOURS, toValue(maxPingRecordPreserveTime)))
    customStartInput.value = end.subtract(hours, 'hour').format('YYYY-MM-DDTHH:mm')
    customEndInput.value = end.format('YYYY-MM-DDTHH:mm')
  }

  return {
    availableViews,
    selectedView,
    customStartInput,
    customEndInput,
    isCustomRange,
    customRange,
    customRangeError,
    ensureDefaultCustomRange,
  }
}
