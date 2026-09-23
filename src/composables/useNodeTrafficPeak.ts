import type { MaybeRefOrGetter } from 'vue'
import { ref, toValue, watch } from 'vue'
import { LOAD_RECORD_MAX_COUNT } from '@/constants/load'
import { loadNodeLoadRecords } from '@/services/history.service'

interface TrafficRecord {
  net_in?: number
  net_out?: number
}

/**
 * Tracks the peak instantaneous upload/download speed seen in a node's last
 * 24h of load records. Refetches whenever `uuid` changes; results from a
 * stale request are discarded if the node changed again before it resolved.
 */
export function useNodeTrafficPeak(uuid: MaybeRefOrGetter<string | undefined>, options: { enabled: MaybeRefOrGetter<boolean> }) {
  const peakNetOut = ref(0)
  const peakNetIn = ref(0)
  let sequence = 0

  async function loadRecords(nodeUuid: string): Promise<TrafficRecord[]> {
    if (!toValue(options.enabled))
      return []

    try {
      return await loadNodeLoadRecords(nodeUuid, 24, LOAD_RECORD_MAX_COUNT)
    }
    catch {
      return []
    }
  }

  async function refresh(nodeUuid: string): Promise<void> {
    const seq = ++sequence
    peakNetOut.value = 0
    peakNetIn.value = 0

    const records = await loadRecords(nodeUuid)
    if (seq !== sequence || toValue(uuid) !== nodeUuid)
      return

    let up = 0
    let down = 0
    for (const record of records) {
      if (typeof record.net_out === 'number' && record.net_out > up)
        up = record.net_out
      if (typeof record.net_in === 'number' && record.net_in > down)
        down = record.net_in
    }
    peakNetOut.value = up
    peakNetIn.value = down
  }

  watch(() => toValue(uuid), (nodeUuid) => {
    if (nodeUuid)
      void refresh(nodeUuid)
    else
      sequence += 1
  }, { immediate: true })

  return { peakNetOut, peakNetIn }
}
