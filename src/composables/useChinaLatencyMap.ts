import type { MaybeRefOrGetter } from 'vue'
import type { ChinaLatencyMapData } from '@/services/china-latency-map.service'
import { onBeforeUnmount, onMounted, ref, shallowRef, toValue, watch } from 'vue'
import { TIME_MS } from '@/constants/time'
import { loadChinaLatencyMapData } from '@/services/china-latency-map.service'

const REFRESH_INTERVAL = TIME_MS.minute
const STATS_WINDOW_HOURS = 1

export function useChinaLatencyMap(uuid: MaybeRefOrGetter<string>) {
  const data = shallowRef<ChinaLatencyMapData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let fetchSequence = 0

  async function load() {
    const requestedUuid = toValue(uuid)
    if (!requestedUuid)
      return

    const sequence = ++fetchSequence
    loading.value = true
    error.value = null

    try {
      const result = await loadChinaLatencyMapData(requestedUuid, STATS_WINDOW_HOURS)
      if (sequence !== fetchSequence)
        return
      data.value = result
    }
    catch (err) {
      if (sequence !== fetchSequence)
        return
      error.value = err instanceof Error ? err.message : '获取数据失败'
      data.value = null
    }
    finally {
      if (sequence === fetchSequence)
        loading.value = false
    }
  }

  watch(() => toValue(uuid), () => {
    data.value = null
    load()
  }, { immediate: true })

  onMounted(() => {
    refreshTimer = setInterval(load, REFRESH_INTERVAL)
  })

  onBeforeUnmount(() => {
    if (refreshTimer)
      clearInterval(refreshTimer)
  })

  return { data, loading, error, refresh: load }
}
