import type { MaybeRefOrGetter } from 'vue'
import type { NodeData } from '@/stores/nodes'
import type { TopNodeMetric } from '@/utils/nodeMetricsHelper'
import { computed, toValue } from 'vue'
import { useAppStore } from '@/stores/app'
import { gpuUsageFromStatus } from '@/utils/gpuHelper'
import {
  getConnectionCount,
  getRealtimeTotalSpeed,
  getTrafficUsed,
  isExpiringNode,
  isHighLoadNode,
  isTrafficWarningNode,
} from '@/utils/nodeMetricsHelper'
import { getRegionDisplayName } from '@/utils/regionHelper'

interface OnlineStats {
  count: number
  totalSpeed: { up: number, down: number }
  avgCpu: number
  totalGpu: number
  gpuNodeCount: number
  avgLoad: number
  avgLoad5: number
  avgLoad15: number
  totalProcesses: number
  totalConnectionsTcp: number
  totalConnectionsUdp: number
  trafficPeak: TopNodeMetric | null
  uploadPeakNode: TopNodeMetric | null
  downloadPeakNode: TopNodeMetric | null
  gpuPeakNode: TopNodeMetric | null
  connectionPeakNode: TopNodeMetric | null
  highLoadNodes: NodeData[]
}

function updateTopMetric(current: TopNodeMetric | null, node: NodeData, value: number): TopNodeMetric | null {
  if (!Number.isFinite(value))
    return current

  if (!current || value > current.value)
    return { node, value: Math.max(0, value) }

  return current
}

function getDistribution(nodes: NodeData[], selector: (node: NodeData) => string | null | undefined): Array<[string, number]> {
  const map = new Map<string, number>()
  for (const node of nodes) {
    const key = selector(node)?.trim() || '未知'
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

function getKnownDistribution(nodes: NodeData[], selector: (node: NodeData) => string | null | undefined): Array<[string, number]> {
  const map = new Map<string, number>()
  for (const node of nodes) {
    const key = selector(node)?.trim()
    if (!key)
      continue
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

/**
 * Aggregates the home summary-card metrics (online/offline counts, speed and
 * usage totals, peak-node lookups, distributions) from a node list. Pure
 * node-data aggregation only — pricing/currency derivations stay in the
 * component since they also depend on the finance settings composable.
 */
export function useNodeSummaryStats(summaryNodes: MaybeRefOrGetter<NodeData[]>) {
  const appStore = useAppStore()
  const nodes = computed(() => toValue(summaryNodes))

  const onlineStats = computed<OnlineStats>(() => {
    const stats: OnlineStats = {
      count: 0,
      totalSpeed: { up: 0, down: 0 },
      avgCpu: 0,
      totalGpu: 0,
      gpuNodeCount: 0,
      avgLoad: 0,
      avgLoad5: 0,
      avgLoad15: 0,
      totalProcesses: 0,
      totalConnectionsTcp: 0,
      totalConnectionsUdp: 0,
      trafficPeak: null,
      uploadPeakNode: null,
      downloadPeakNode: null,
      gpuPeakNode: null,
      connectionPeakNode: null,
      highLoadNodes: [],
    }

    for (const node of nodes.value) {
      if (!node.online)
        continue

      stats.count += 1
      stats.totalSpeed.up += node.net_out || 0
      stats.totalSpeed.down += node.net_in || 0
      stats.avgCpu += node.cpu || 0
      stats.avgLoad += node.load || 0
      stats.avgLoad5 += node.load5 || 0
      stats.avgLoad15 += node.load15 || 0
      stats.totalProcesses += node.process || 0
      stats.totalConnectionsTcp += node.connections || 0
      stats.totalConnectionsUdp += node.connections_udp || 0
      stats.trafficPeak = updateTopMetric(stats.trafficPeak, node, getRealtimeTotalSpeed(node))
      stats.uploadPeakNode = updateTopMetric(stats.uploadPeakNode, node, node.net_out || 0)
      stats.downloadPeakNode = updateTopMetric(stats.downloadPeakNode, node, node.net_in || 0)
      stats.connectionPeakNode = updateTopMetric(stats.connectionPeakNode, node, getConnectionCount(node))
      const gpu = gpuUsageFromStatus(node)
      const hasGpu = Boolean(node.gpu_name?.trim()) || gpu > 0
      if (hasGpu) {
        stats.totalGpu += gpu
        stats.gpuNodeCount += 1
        stats.gpuPeakNode = updateTopMetric(stats.gpuPeakNode, node, gpu)
      }
      if (isHighLoadNode(node, appStore.homeHighLoadThreshold))
        stats.highLoadNodes.push(node)
    }

    if (stats.count > 0) {
      stats.avgCpu /= stats.count
      stats.avgLoad /= stats.count
      stats.avgLoad5 /= stats.count
      stats.avgLoad15 /= stats.count
    }

    return stats
  })

  const totalSpeed = computed(() => onlineStats.value.totalSpeed)

  const totalTraffic = computed(() => {
    const up = nodes.value.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
    const down = nodes.value.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
    return { up, down }
  })

  const totalMemory = computed(() => {
    let used = 0
    let total = 0
    for (const node of nodes.value) {
      used += node.ram || 0
      total += node.mem_total || 0
    }
    return { used, total }
  })

  const totalDisk = computed(() => {
    let used = 0
    let total = 0
    for (const node of nodes.value) {
      used += node.disk || 0
      total += node.disk_total || 0
    }
    return { used, total }
  })

  const totalSwap = computed(() => {
    let used = 0
    let total = 0
    for (const node of nodes.value) {
      used += node.swap || 0
      total += node.swap_total || 0
    }
    return { used, total }
  })

  const onlineNodeCount = computed(() => onlineStats.value.count)
  const totalNodeCount = computed(() => nodes.value.length)
  const avgCpu = computed(() => onlineStats.value.avgCpu)
  const avgGpu = computed(() => onlineStats.value.gpuNodeCount > 0
    ? onlineStats.value.totalGpu / onlineStats.value.gpuNodeCount
    : null)
  const gpuNodes = computed(() => nodes.value.filter(node => Boolean(node.gpu_name?.trim()) || (node.gpu || 0) > 0))
  const onlineGpuNodes = computed(() => gpuNodes.value.filter(node => node.online))
  const gpuPeakNode = computed(() => onlineStats.value.gpuPeakNode)
  const avgLoad = computed(() => onlineStats.value.avgLoad)
  const avgLoad5 = computed(() => onlineStats.value.avgLoad5)
  const avgLoad15 = computed(() => onlineStats.value.avgLoad15)
  const totalProcesses = computed(() => onlineStats.value.totalProcesses)
  const totalConnectionsTcp = computed(() => onlineStats.value.totalConnectionsTcp)
  const totalConnectionsUdp = computed(() => onlineStats.value.totalConnectionsUdp)
  const totalCpuCores = computed(() => nodes.value.reduce((sum, node) => sum + (node.cpu_cores || 0), 0))
  const trafficQuota = computed(() => {
    let used = 0
    let limit = 0

    for (const node of nodes.value) {
      if ((node.traffic_limit || 0) <= 0)
        continue
      used += getTrafficUsed(node)
      limit += node.traffic_limit || 0
    }

    return { used, limit }
  })
  const trafficQuotaPercentage = computed(() => {
    if (trafficQuota.value.limit <= 0)
      return 0
    return trafficQuota.value.used / trafficQuota.value.limit * 100
  })

  const trafficPeak = computed(() => onlineStats.value.trafficPeak)
  const uploadPeakNode = computed(() => onlineStats.value.uploadPeakNode)
  const downloadPeakNode = computed(() => onlineStats.value.downloadPeakNode)
  const connectionPeakNode = computed(() => onlineStats.value.connectionPeakNode)
  const offlineNodes = computed(() => nodes.value.filter(node => !node.online))
  const highLoadNodes = computed(() => onlineStats.value.highLoadNodes)
  const expiringNodes = computed(() => nodes.value.filter(node => isExpiringNode(node, appStore.homeExpiringDays)))
  const trafficWarningNodes = computed(() => nodes.value.filter(node => isTrafficWarningNode(node, appStore.homeTrafficWarningThreshold)))
  const regionDistribution = computed(() => getKnownDistribution(nodes.value, node => getRegionDisplayName(node.region)))
  const systemDistribution = computed(() => getDistribution(nodes.value, node => node.os))
  const virtualizationDistribution = computed(() => getDistribution(nodes.value, node => node.virtualization))

  return {
    onlineStats,
    totalSpeed,
    totalTraffic,
    totalMemory,
    totalDisk,
    totalSwap,
    onlineNodeCount,
    totalNodeCount,
    avgCpu,
    avgGpu,
    gpuNodes,
    onlineGpuNodes,
    gpuPeakNode,
    avgLoad,
    avgLoad5,
    avgLoad15,
    totalProcesses,
    totalConnectionsTcp,
    totalConnectionsUdp,
    totalCpuCores,
    trafficQuota,
    trafficQuotaPercentage,
    trafficPeak,
    uploadPeakNode,
    downloadPeakNode,
    connectionPeakNode,
    offlineNodes,
    highLoadNodes,
    expiringNodes,
    trafficWarningNodes,
    regionDistribution,
    systemDistribution,
    virtualizationDistribution,
  }
}
