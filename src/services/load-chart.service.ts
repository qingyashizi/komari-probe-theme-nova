import type { NormalizedMetricSeries } from '@/utils/metricSeries'
import type { MetricQueryParams } from '@/utils/rpc'
import { normalizeMetricSeriesList } from '@/utils/metricSeries'
import { loadMetricDefinitions, queryMetrics } from '@/services/metrics.service'

export interface LoadChartMetricHistory {
  availableMetricKeys: Set<string>
  series: NormalizedMetricSeries[]
}

export async function loadLoadChartMetricHistory(
  uuid: string,
  supportedMetricKeys: readonly string[],
  params: Pick<MetricQueryParams, 'hours' | 'start' | 'end'>,
  maxPoints: number,
): Promise<LoadChartMetricHistory> {
  const definitions = await loadMetricDefinitions()
  const availableMetricKeys = new Set(definitions.map(definition => definition.name))
  const metricKeys = supportedMetricKeys.filter(key => availableMetricKeys.has(key))
  if (!metricKeys.length)
    return { availableMetricKeys, series: [] }

  const result = await queryMetrics({
    metric_keys: metricKeys,
    entity_id: uuid,
    ...params,
    downsample: true,
    fill_empty: true,
    max_points: maxPoints,
    aggregation: 'avg',
    aggregation_by_metric: {
      'net.total.up': 'last',
      'net.total.down': 'last',
    },
  })
  const series = normalizeMetricSeriesList(result.series)
  return { availableMetricKeys, series }
}

export async function loadRealtimeLoadChartPingSeries(
  uuid: string,
  availableMetricKeys: ReadonlySet<string>,
  supportedMetricKeys: readonly string[],
  maxPoints: number,
): Promise<NormalizedMetricSeries[]> {
  const metricKeys = supportedMetricKeys.filter(key => availableMetricKeys.has(key))
  if (!metricKeys.length)
    return []

  const result = await queryMetrics({
    metric_keys: metricKeys,
    entity_id: uuid,
    hours: 1,
    downsample: true,
    fill_empty: true,
    max_points: maxPoints,
    aggregation: 'avg',
  })
  return normalizeMetricSeriesList(result.series)
}
