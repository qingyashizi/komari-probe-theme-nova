import type { BuiltinPingCarrier, BuiltinPingNode, BuiltinPingProvince } from '@/utils/rpc'
import { loadBuiltinPingPresets, loadPingMetricStats } from '@/services/metrics.service'

export interface ChinaLatencyCell {
  latency?: number
  loss: number
  volatility?: number
}

export interface ChinaLatencyProvinceData {
  code: string
  name: string
  carriers: Partial<Record<string, ChinaLatencyCell>>
}

export interface ChinaLatencyMapData {
  provinces: BuiltinPingProvince[]
  carriers: BuiltinPingCarrier[]
  provinceData: Map<string, ChinaLatencyProvinceData>
}

/**
 * 内置节点的 v4/v6 任务名字相同（都是"省份-运营商"，因为管理端只勾选 v4），
 * 用名字反查省份/运营商代码，不依赖 target 字符串（公开接口不下发 target）。
 */
function buildNameToNodeMap(nodes: BuiltinPingNode[]): Map<string, BuiltinPingNode> {
  const map = new Map<string, BuiltinPingNode>()
  for (const node of nodes) map.set(node.name, node)
  return map
}

export async function loadChinaLatencyMapData(nodeUuid: string, hours: number): Promise<ChinaLatencyMapData> {
  const [presets, statsResponse] = await Promise.all([
    loadBuiltinPingPresets(),
    loadPingMetricStats({ entity_id: nodeUuid, hours }),
  ])

  const nameToNode = buildNameToNodeMap(presets.nodes_v4)

  const provinceData = new Map<string, ChinaLatencyProvinceData>()
  for (const province of presets.provinces) {
    provinceData.set(province.code, { code: province.code, name: province.name, carriers: {} })
  }

  for (const stat of statsResponse.stats) {
    if (stat.entity_id !== nodeUuid || !stat.name)
      continue
    const node = nameToNode.get(stat.name)
    if (!node)
      continue
    const bucket = provinceData.get(node.province_code)
    if (!bucket)
      continue
    bucket.carriers[node.carrier_code] = {
      latency: stat.latest ?? stat.avg,
      loss: stat.loss,
      volatility: stat.p99_p50_ratio,
    }
  }

  return { provinces: presets.provinces, carriers: presets.carriers, provinceData }
}
