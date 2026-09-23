import type { MaybeRefOrGetter } from 'vue'
import dayjs from 'dayjs'
import { computed, ref, toValue } from 'vue'

export const CUSTOM_LOAD_CHART_VIEW = '自定义'

interface LoadChartView {
  label: string
  hours?: number
}

export interface LoadChartCustomRange {
  start: dayjs.Dayjs
  end: dayjs.Dayjs
  hours: number
}

const presetViews: LoadChartView[] = [
  { label: '4 小时', hours: 4 },
  { label: '1 天', hours: 24 },
  { label: '7 天', hours: 168 },
  { label: '30 天', hours: 720 },
]

export function useLoadChartRange(maxRecordPreserveTime: MaybeRefOrGetter<number>) {
  const selectedView = ref('实时')
  const customStartInput = ref('')
  const customEndInput = ref('')
  const availableViews = computed<LoadChartView[]>(() => {
    const views: LoadChartView[] = [{ label: '实时' }]
    const maxHours = toValue(maxRecordPreserveTime)
    for (const view of presetViews) {
      if (maxHours >= (view.hours ?? 0))
        views.push(view)
    }
    const maxPreset = presetViews.at(-1)
    if (maxPreset && maxHours > (maxPreset.hours ?? 0))
      views.push({ label: maxHours % 24 === 0 ? `${Math.floor(maxHours / 24)} 天` : `${maxHours} 小时`, hours: maxHours })
    else if (maxHours > 4 && !presetViews.some(view => view.hours === maxHours))
      views.push({ label: maxHours % 24 === 0 ? `${Math.floor(maxHours / 24)} 天` : `${maxHours} 小时`, hours: maxHours })
    views.push({ label: CUSTOM_LOAD_CHART_VIEW })
    return views
  })
  const selectedHours = computed(() => availableViews.value.find(view => view.label === selectedView.value)?.hours)
  const isRealtime = computed(() => selectedView.value === '实时')
  const isCustomRange = computed(() => selectedView.value === CUSTOM_LOAD_CHART_VIEW)
  const customRange = computed<LoadChartCustomRange | null>(() => {
    if (!customStartInput.value || !customEndInput.value)
      return null
    const start = dayjs(customStartInput.value)
    const end = dayjs(customEndInput.value)
    if (!start.isValid() || !end.isValid() || !end.isAfter(start))
      return null
    return { start, end, hours: Math.max(1, Math.ceil(end.diff(start, 'hour', true))) }
  })
  const customRangeError = computed(() => {
    if (!isCustomRange.value || (!customStartInput.value && !customEndInput.value))
      return ''
    if (!customStartInput.value || !customEndInput.value)
      return '请选择开始和结束时间'
    return customRange.value ? '' : '结束时间必须晚于开始时间'
  })
  const effectiveHistoryHours = computed(() => isCustomRange.value ? customRange.value?.hours ?? 4 : selectedHours.value ?? 4)
  return { availableViews, selectedView, customStartInput, customEndInput, isRealtime, isCustomRange, customRange, customRangeError, effectiveHistoryHours }
}
