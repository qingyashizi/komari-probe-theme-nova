import type { PingRecord, PingTaskInfo } from '@/utils/rpc'
import dayjs from 'dayjs'

export interface PingChartMergeWindow {
  /** Applied custom range, if the chart is currently in custom-range mode. */
  customRange: { start: dayjs.Dayjs, end: dayjs.Dayjs } | null
  /** Hours to keep from the end of the data when not in custom-range mode. */
  hours: number
}

/**
 * Groups raw per-task ping records into per-timestamp rows (keyed by task id),
 * merging samples that land within a tolerance window of each other so tasks
 * with slightly offset intervals still line up on the same chart row, then
 * trims the result to the requested time window.
 */
export function buildMergedPingData(
  records: PingRecord[],
  tasks: PingTaskInfo[],
  window: PingChartMergeWindow,
): Array<Record<string, unknown>> {
  if (!records.length)
    return []

  const taskIntervals = tasks
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  const toleranceMs = Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )

  const grouped: Map<number, Record<string, unknown>> = new Map()
  const anchors: number[] = []

  for (const rec of records) {
    const ts = dayjs(rec.time).valueOf()
    let anchor: number | null = null

    for (let index = anchors.length - 1; index >= 0; index--) {
      const a = anchors[index]
      if (a === undefined || ts - a > toleranceMs)
        break
      if (Math.abs(a - ts) <= toleranceMs) {
        anchor = a
        break
      }
    }

    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      if (anchor === null) {
        anchors.push(useTs)
      }
    }

    const group = grouped.get(useTs)!
    group[rec.task_id] = rec.value < 0 ? null : rec.value
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const { customRange, hours } = window
  if (customRange) {
    const fromTs = customRange.start.valueOf()
    const toTs = customRange.end.valueOf()
    return merged.filter((item) => {
      const timestamp = dayjs(item.time as string).valueOf()
      return timestamp >= fromTs && timestamp <= toTs
    })
  }

  const lastItem = merged.at(-1)
  const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
}
