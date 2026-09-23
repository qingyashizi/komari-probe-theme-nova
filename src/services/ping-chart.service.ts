import type { MetricQueryParams, MetricSeries, PingMetricTaskStats, PingRecord, PingTaskInfo } from '@/utils/rpc'
import dayjs from 'dayjs'
import { PING_RECORD_MAX_COUNT } from '@/constants/load'
import { loadPingMetricStats, loadPublicPingTasks, queryMetrics } from '@/services/metrics.service'
import { isPingMetric, normalizeMetricSeriesList, orderPingTasksByBackend, PING_LATENCY_METRIC, pingTaskId, pingTaskName } from '@/utils/metricSeries'

export interface PingChartMetricPayload {
  records: PingRecord[]
  tasks: PingTaskInfo[]
}

function normalizeMetricTaskId(taskId: string): number {
  if (!taskId.trim())
    return Number.NaN

  const numericTaskId = Number(taskId)
  if (Number.isFinite(numericTaskId))
    return numericTaskId

  let hash = 0
  for (let index = 0; index < taskId.length; index++)
    hash = (hash * 31 + taskId.charCodeAt(index)) | 0
  return Math.abs(hash)
}

function normalizeMetricTask(stat: PingMetricTaskStats): PingTaskInfo {
  return {
    id: normalizeMetricTaskId(stat.task_id),
    name: stat.name?.trim() || pingTaskName(stat) || `Task ${stat.task_id}`,
    interval: stat.interval ?? 0,
    loss: stat.loss,
    min: stat.min,
    max: stat.max,
    avg: stat.avg,
    latest: stat.latest,
    p50: stat.p50,
    p99: stat.p99,
    p99_p50_ratio: stat.p99_p50_ratio,
    stddev: stat.stddev,
    total: stat.total,
    valid: stat.valid,
    loss_approximate: stat.loss_approximate,
    type: stat.type,
  }
}

function buildMetricRecords(seriesList: MetricSeries[]): PingRecord[] {
  const records: PingRecord[] = []
  const normalizedSeriesList = normalizeMetricSeriesList(seriesList).filter(isPingMetric)

  for (const series of normalizedSeriesList) {
    const taskId = normalizeMetricTaskId(pingTaskId(series))
    if (!Number.isFinite(taskId))
      continue

    for (const point of series.points) {
      if (point.value === null)
        continue

      records.push({
        client: series.entity_id,
        task_id: taskId,
        time: point.time,
        value: point.value,
      })
    }
  }

  return records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
}

export async function loadPingChartMetricPayload(
  nodeUuid: string,
  metricRangeParams: Pick<MetricQueryParams, 'hours' | 'start' | 'end'>,
): Promise<PingChartMetricPayload | null> {
  const [statsResult, metricsResult, backendTasksResult] = await Promise.allSettled([
    loadPingMetricStats({ entity_id: nodeUuid, ...metricRangeParams, max_points: PING_RECORD_MAX_COUNT }),
    queryMetrics({
      metric_keys: [PING_LATENCY_METRIC],
      entity_id: nodeUuid,
      ...metricRangeParams,
      downsample: true,
      fill_empty: true,
      max_points: PING_RECORD_MAX_COUNT,
      aggregation: 'avg',
    }),
    loadPublicPingTasks(),
  ])

  const metricStats = statsResult.status === 'fulfilled'
    ? (statsResult.value.stats ?? []).filter(stat => stat.entity_id === nodeUuid)
    : []
  const metricRecords = metricsResult.status === 'fulfilled'
    ? buildMetricRecords(metricsResult.value.series)
    : []

  const metricTaskIds = new Set(metricRecords.map(record => record.task_id))
  const exactStatTaskIds = new Set(
    metricStats
      .filter(stat => stat.total > 0 && !stat.loss_approximate && Number.isFinite(stat.loss))
      .map(stat => normalizeMetricTaskId(stat.task_id)),
  )
  if (!metricRecords.length || [...metricTaskIds].some(taskId => !exactStatTaskIds.has(taskId)))
    return null

  const taskMap = new Map<number, PingTaskInfo>()
  for (const stat of metricStats) {
    const task = normalizeMetricTask(stat)
    taskMap.set(task.id, task)
  }

  for (const series of normalizeMetricSeriesList(
    metricsResult.status === 'fulfilled' ? metricsResult.value.series : [],
  ).filter(isPingMetric)) {
    const taskId = normalizeMetricTaskId(pingTaskId(series))
    if (!taskId || taskMap.has(taskId))
      continue

    taskMap.set(taskId, {
      id: taskId,
      name: pingTaskName(series) || `Task ${taskId}`,
      interval: series.interval_seconds ?? 0,
      loss: 0,
    })
  }

  return {
    records: metricRecords,
    tasks: orderPingTasksByBackend(
      [...taskMap.values()],
      backendTasksResult.status === 'fulfilled' ? backendTasksResult.value : [],
    ),
  }
}
