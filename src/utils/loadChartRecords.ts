import type { RecordFormat } from '@/utils/recordHelper'
import type { MetricSeries, StatusRecord } from '@/utils/rpc'
import dayjs from 'dayjs'
import { gpuUsageFromStatus } from '@/utils/gpuHelper'
import { metricTags, normalizeMetricSeriesList } from '@/utils/metricSeries'

export const LOAD_METRIC_KEYS = [
  'cpu.usage',
  'load.average',
  'memory.used',
  'memory.total',
  'swap.used',
  'swap.total',
  'temperature',
  'disk.used',
  'disk.total',
  'net.in.rate',
  'net.out.rate',
  'net.total.down',
  'net.total.up',
  'traffic.down',
  'traffic.up',
  'process.count',
  'connections.tcp',
  'connections.udp',
  'gpu.usage',
  'gpu.device.usage',
  'gpu.memory.used',
  'gpu.memory.total',
  'gpu.temperature',
  'ping.latency_ms',
  'ping.loss',
] as const

export const PING_METRIC_KEYS = ['ping.latency_ms', 'ping.loss'] as const

export type LoadMetricKey = typeof LOAD_METRIC_KEYS[number]

interface NodeDiskAndMemoryTotals {
  mem_total?: number | null
  swap_total?: number | null
  disk_total?: number | null
  gpu_name?: string | null
}

export function metricValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function gpuDetailsFromStatus(record: StatusRecord): RecordFormat['gpu_detailed'] {
  if (!record.gpu_detailed_info?.length)
    return undefined

  const details: NonNullable<RecordFormat['gpu_detailed']> = {}
  record.gpu_detailed_info.forEach((item, index) => {
    const deviceIndex = item.device_index ?? index
    const memUsed = metricValue(item.memory_used)
    const memTotal = metricValue(item.memory_total)
    details[deviceIndex] = {
      usage: metricValue(item.utilization ?? item.usage),
      memory: memUsed != null && memTotal && memTotal > 0 ? memUsed / memTotal * 100 : null,
      temperature: metricValue(item.temperature),
      device_index: deviceIndex,
      device_name: item.device_name || item.name,
      mem_total: memTotal ?? undefined,
      mem_used: memUsed ?? undefined,
    }
  })
  return details
}

function averageGpuMemoryPercent(details: NonNullable<RecordFormat['gpu_detailed']>): number | null {
  const percents = Object.values(details)
    .map(detail => detail.memory)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!percents.length)
    return null
  return percents.reduce((sum, value) => sum + value, 0) / percents.length
}

export function statusToRecordFormat(records: StatusRecord[]): RecordFormat[] {
  return records.map((r) => {
    const gpuDetailed = gpuDetailsFromStatus(r)
    const gpu = metricValue(gpuUsageFromStatus(r))
    return {
      client: r.client,
      time: r.time,
      cpu: metricValue(r.cpu),
      gpu,
      gpu_usage: gpu,
      gpu_memory: gpuDetailed
        ? averageGpuMemoryPercent(gpuDetailed)
        : null,
      gpu_detailed: gpuDetailed,
      ram: metricValue(r.ram),
      ram_total: metricValue(r.ram_total),
      swap: metricValue(r.swap),
      swap_total: metricValue(r.swap_total),
      load: metricValue(r.load),
      temp: metricValue(r.temp),
      disk: metricValue(r.disk),
      disk_total: metricValue(r.disk_total),
      net_in: metricValue(r.net_in),
      net_out: metricValue(r.net_out),
      net_total_up: metricValue(r.net_total_up),
      net_total_down: metricValue(r.net_total_down),
      traffic_up: metricValue(r.traffic_up),
      traffic_down: metricValue(r.traffic_down),
      process: metricValue(r.process),
      connections: metricValue(r.connections),
      connections_udp: metricValue(r.connections_udp),
    }
  })
}

function getMetricDeviceKey(series: MetricSeries): string {
  const tags = metricTags(series)
  const index = tags.device_index ?? tags.gpu_index ?? tags.index
  const name = tags.device_name ?? tags.gpu_name ?? tags.name
  return String(index ?? name ?? '0')
}

function getMetricDeviceIndex(series: MetricSeries): number {
  const tags = metricTags(series)
  const rawIndex = tags.device_index ?? tags.gpu_index ?? tags.index
  const numericIndex = Number(rawIndex)
  return Number.isFinite(numericIndex) ? numericIndex : Math.abs(getMetricDeviceKey(series).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0))
}

function getMetricDeviceName(series: MetricSeries): string | undefined {
  const tags = metricTags(series)
  const name = tags.device_name ?? tags.gpu_name ?? tags.name
  return typeof name === 'string' && name.trim() ? name.trim() : undefined
}

function ensureMetricRow(rows: Map<string, RecordFormat>, time: string, uuid: string, node: NodeDiskAndMemoryTotals | undefined): RecordFormat {
  const existing = rows.get(time)
  if (existing)
    return existing

  const row: RecordFormat = {
    client: uuid,
    time,
    cpu: null,
    gpu: null,
    gpu_usage: null,
    gpu_memory: null,
    ram: null,
    ram_total: node?.mem_total ?? null,
    swap: null,
    swap_total: node?.swap_total ?? null,
    load: null,
    temp: null,
    disk: null,
    disk_total: node?.disk_total ?? null,
    net_in: null,
    net_out: null,
    net_total_up: null,
    net_total_down: null,
    traffic_up: null,
    traffic_down: null,
    process: null,
    connections: null,
    connections_udp: null,
  }
  rows.set(time, row)
  return row
}

function applyMetricPoint(row: RecordFormat, key: LoadMetricKey, value: number | null, series: MetricSeries): void {
  switch (key) {
    case 'cpu.usage':
      row.cpu = value
      break
    case 'load.average':
      row.load = value
      break
    case 'memory.used':
      row.ram = value
      break
    case 'memory.total':
      row.ram_total = value
      break
    case 'swap.used':
      row.swap = value
      break
    case 'swap.total':
      row.swap_total = value
      break
    case 'temperature':
      row.temp = value
      break
    case 'disk.used':
      row.disk = value
      break
    case 'disk.total':
      row.disk_total = value
      break
    case 'net.in.rate':
      row.net_in = value
      break
    case 'net.out.rate':
      row.net_out = value
      break
    case 'net.total.down':
      row.net_total_down = value
      break
    case 'net.total.up':
      row.net_total_up = value
      break
    case 'traffic.down':
      row.traffic_down = value
      break
    case 'traffic.up':
      row.traffic_up = value
      break
    case 'process.count':
      row.process = value
      break
    case 'connections.tcp':
      row.connections = value
      break
    case 'connections.udp':
      row.connections_udp = value
      break
    case 'gpu.usage':
      row.gpu = value
      row.gpu_usage = value
      break
    case 'gpu.device.usage': {
      const deviceIndex = getMetricDeviceIndex(series)
      row.gpu_detailed ??= {}
      row.gpu_detailed[deviceIndex] ??= { usage: null, memory: null, temperature: null, device_index: deviceIndex, device_name: getMetricDeviceName(series) }
      row.gpu_detailed[deviceIndex].usage = value
      row.gpu_usage = row.gpu_usage ?? value
      row.gpu = row.gpu ?? value
      break
    }
    case 'gpu.memory.used': {
      const deviceIndex = getMetricDeviceIndex(series)
      row.gpu_detailed ??= {}
      row.gpu_detailed[deviceIndex] ??= { usage: null, memory: null, temperature: null, device_index: deviceIndex, device_name: getMetricDeviceName(series) }
      row.gpu_detailed[deviceIndex].mem_used = value ?? undefined
      break
    }
    case 'gpu.memory.total': {
      const deviceIndex = getMetricDeviceIndex(series)
      row.gpu_detailed ??= {}
      row.gpu_detailed[deviceIndex] ??= { usage: null, memory: null, temperature: null, device_index: deviceIndex, device_name: getMetricDeviceName(series) }
      row.gpu_detailed[deviceIndex].mem_total = value ?? undefined
      break
    }
    case 'gpu.temperature': {
      const deviceIndex = getMetricDeviceIndex(series)
      row.gpu_detailed ??= {}
      row.gpu_detailed[deviceIndex] ??= { usage: null, memory: null, temperature: null, device_index: deviceIndex, device_name: getMetricDeviceName(series) }
      row.gpu_detailed[deviceIndex].temperature = value
      break
    }
  }
}

function finalizeGpuRows(rows: RecordFormat[]): RecordFormat[] {
  for (const row of rows) {
    if (!row.gpu_detailed)
      continue

    const usages: number[] = []
    const memories: number[] = []
    for (const detail of Object.values(row.gpu_detailed)) {
      if (detail.mem_used != null && detail.mem_total && detail.mem_total > 0)
        detail.memory = detail.mem_used / detail.mem_total * 100
      if (typeof detail.usage === 'number' && Number.isFinite(detail.usage))
        usages.push(detail.usage)
      if (typeof detail.memory === 'number' && Number.isFinite(detail.memory))
        memories.push(detail.memory)
    }

    if (row.gpu_usage == null && usages.length)
      row.gpu_usage = usages.reduce((sum, value) => sum + value, 0) / usages.length
    row.gpu ??= row.gpu_usage
    if (row.gpu_memory == null && memories.length)
      row.gpu_memory = memories.reduce((sum, value) => sum + value, 0) / memories.length
  }
  return rows
}

export function getGpuDeviceNames(record: RecordFormat | null, fallbackGpuName: string | null | undefined): string {
  if (!record?.gpu_detailed)
    return fallbackGpuName || ''
  return Object.values(record.gpu_detailed)
    .map(detail => detail.device_name || (detail.device_index === undefined ? '' : `GPU ${detail.device_index}`))
    .filter(Boolean)
    .join(' / ')
}

export function metricSeriesToRecordFormat(seriesList: MetricSeries[], uuid: string, node: NodeDiskAndMemoryTotals | undefined): RecordFormat[] {
  const rows = new Map<string, RecordFormat>()
  const normalizedSeriesList = normalizeMetricSeriesList(seriesList)

  for (const series of normalizedSeriesList) {
    if (!LOAD_METRIC_KEYS.includes(series.metric_key as LoadMetricKey))
      continue

    const key = series.metric_key as LoadMetricKey
    if (key === 'ping.latency_ms' || key === 'ping.loss')
      continue

    for (const point of series.points) {
      const row = ensureMetricRow(rows, point.time, uuid, node)
      applyMetricPoint(row, key, metricValue(point.value), series)
    }
  }

  return finalizeGpuRows([...rows.values()].sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf()))
}
