import type { MaybeRefOrGetter } from 'vue'
import type { StatusRecord } from '@/utils/rpc'
import dayjs from 'dayjs'
import { ref, shallowRef, toValue } from 'vue'
import { getSharedRpc } from '@/utils/rpc'

const RECENT_STATUS_MAX_RECORDS = 150

export function useRecentNodeStatus(uuid: MaybeRefOrGetter<string>) {
  const records = shallowRef<StatusRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRecentStatus(): Promise<void> {
    const requestedUuid = toValue(uuid)
    if (!requestedUuid)
      return

    loading.value = true
    error.value = null
    try {
      const result = await getSharedRpc().getNodeRecentStatus(requestedUuid)
      if (toValue(uuid) !== requestedUuid)
        return
      records.value = (result?.records ?? [])
        .sort((left, right) => dayjs(left.time).valueOf() - dayjs(right.time).valueOf())
        .slice(-RECENT_STATUS_MAX_RECORDS)
    }
    catch (cause) {
      if (toValue(uuid) !== requestedUuid)
        return
      error.value = cause instanceof Error ? cause.message : '获取数据失败'
      records.value = []
    }
    finally {
      if (toValue(uuid) === requestedUuid)
        loading.value = false
    }
  }

  return { records, loading, error, fetchRecentStatus }
}
