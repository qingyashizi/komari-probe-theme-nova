import type { MetricPoint, MetricSeries, PingMetricTaskStats, PingTaskInfo } from '@/utils/rpc'

export const PING_LATENCY_METRIC = 'ping.latency_ms'
export const PING_LOSS_METRIC = 'ping.loss'

export interface NormalizedMetricSeries extends Omit<MetricSeries, 'points'> {
  tags: Record<string, unknown>
  points: MetricPoint[]
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringifyTagValue(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

export function metricTags(value: { tag?: Record<string, unknown>, tags?: Record<string, unknown>, labels?: Record<string, unknown> } | null | undefined): Record<string, unknown> {
  return {
    ...(isPlainRecord(value?.labels) ? value.labels : {}),
    ...(isPlainRecord(value?.tag) ? value.tag : {}),
    ...(isPlainRecord(value?.tags) ? value.tags : {}),
  }
}

function metricTagsKey(tags: Record<string, unknown> | null | undefined): string {
  if (!tags)
    return ''

  return JSON.stringify(Object.keys(tags)
    .sort()
    .map(key => [key, stringifyTagValue(tags[key])]))
}

function normalizeMetricSeries(series: MetricSeries): NormalizedMetricSeries[] {
  const groups = new Map<string, { tags: Record<string, unknown>, points: MetricPoint[] }>()
  const baseTags = metricTags(series)

  for (const point of series.points ?? []) {
    if (!point?.time)
      continue

    const tags = {
      ...baseTags,
      ...metricTags(point),
    }
    const key = metricTagsKey(tags)
    const group = groups.get(key) ?? { tags, points: [] }
    group.points.push({
      ...point,
      tags,
      tag: undefined,
      labels: undefined,
    })
    groups.set(key, group)
  }

  if (!groups.size) {
    return [{
      ...series,
      tags: baseTags,
      tag: undefined,
      points: [],
    }]
  }

  return Array.from(groups.values(), group => ({
    ...series,
    tags: group.tags,
    tag: undefined,
    points: group.points.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()),
  }))
}

export function normalizeMetricSeriesList(seriesList: MetricSeries[] | undefined): NormalizedMetricSeries[] {
  return (seriesList ?? []).flatMap(normalizeMetricSeries)
}

export function isPingMetric(series: Pick<MetricSeries, 'metric_key'> | null | undefined): boolean {
  return series?.metric_key === PING_LATENCY_METRIC
}

export function pingTaskId(value: { tag?: Record<string, unknown>, tags?: Record<string, unknown>, labels?: Record<string, unknown> } | PingMetricTaskStats | null | undefined): string {
  const tags = 'tags' in (value ?? {}) || 'tag' in (value ?? {}) || 'labels' in (value ?? {})
    ? metricTags(value as { tag?: Record<string, unknown>, tags?: Record<string, unknown>, labels?: Record<string, unknown> })
    : {}
  const directTaskId = (value as PingMetricTaskStats | null | undefined)?.task_id
  return stringifyTagValue(directTaskId || tags.task_id || tags.task || tags.id)
}

export function pingTaskName(value: { tag?: Record<string, unknown>, tags?: Record<string, unknown>, labels?: Record<string, unknown>, name?: string } | PingMetricTaskStats | null | undefined): string {
  const tags = metricTags(value as { tag?: Record<string, unknown>, tags?: Record<string, unknown>, labels?: Record<string, unknown> } | null | undefined)
  const directName = (value as { name?: string } | null | undefined)?.name
  return directName?.trim() || stringifyTagValue(tags.task_name || tags.name || tags.task) || pingTaskId(value)
}

export function createPingTaskOrderMap(tasks: readonly Pick<PingTaskInfo, 'id'>[]): Map<string, number> {
  return new Map(tasks.map((task, index) => [String(task.id), index]))
}

function comparePingTaskIds(leftId: string, rightId: string, taskOrder: ReadonlyMap<string, number>): number {
  const leftIndex = taskOrder.get(leftId)
  const rightIndex = taskOrder.get(rightId)

  if (leftIndex !== undefined && rightIndex !== undefined)
    return leftIndex - rightIndex
  if (leftIndex !== undefined)
    return -1
  if (rightIndex !== undefined)
    return 1
  if (leftId === rightId)
    return 0
  if (!leftId)
    return 1
  if (!rightId)
    return -1
  return leftId.localeCompare(rightId, undefined, { numeric: true })
}

/** Keep metric lines aligned with the ordered task list returned by Komari. */
export function comparePingTaskOrder(
  leftTags: Record<string, unknown> | undefined,
  rightTags: Record<string, unknown> | undefined,
  taskOrder: ReadonlyMap<string, number>,
): number {
  const leftId = pingTaskId({ tags: leftTags })
  const rightId = pingTaskId({ tags: rightTags })
  return comparePingTaskIds(leftId, rightId, taskOrder)
}

export function orderPingTasksByBackend<T extends Pick<PingTaskInfo, 'id'>>(
  tasks: readonly T[],
  backendTasks: readonly Pick<PingTaskInfo, 'id'>[],
): T[] {
  const taskOrder = createPingTaskOrderMap(backendTasks)
  return [...tasks].sort((left, right) => comparePingTaskIds(String(left.id), String(right.id), taskOrder))
}
