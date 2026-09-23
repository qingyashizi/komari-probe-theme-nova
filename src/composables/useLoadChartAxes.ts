import type { MaybeRefOrGetter } from 'vue'
import type { RecordFormat } from '@/utils/recordHelper'
import dayjs from 'dayjs'
import { computed, toValue } from 'vue'

interface AxisColors { textSecondary: string, borderColor: string, splitLineColor: string }

export function formatLoadChartTooltipTime(time: string, hours: number): string {
  return dayjs(time).format(hours < 24 ? 'HH:mm:ss' : 'MM/DD HH:mm')
}

export function useLoadChartAxes(records: MaybeRefOrGetter<RecordFormat[]>, hours: MaybeRefOrGetter<number>, colors: MaybeRefOrGetter<AxisColors>) {
  const baseXAxisConfig = computed(() => {
    const palette = toValue(colors)
    const showDate = toValue(hours) >= 24
    return {
      type: 'category' as const,
      data: toValue(records).map(record => dayjs(record.time).format(showDate ? 'M/D HH:mm' : 'HH:mm')),
      axisLabel: { fontSize: 11, color: palette.textSecondary, margin: 12 },
      axisLine: { show: true, lineStyle: { color: palette.borderColor, width: 1 } },
      axisTick: { show: false },
      boundaryGap: false,
    }
  })
  const baseYAxisConfig = computed(() => {
    const palette = toValue(colors)
    return {
      type: 'value' as const,
      axisLabel: { fontSize: 11, color: palette.textSecondary },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: palette.splitLineColor, type: 'dashed' as const } },
    }
  })
  return { baseXAxisConfig, baseYAxisConfig }
}
