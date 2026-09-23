import type { PingTaskInfo } from '@/utils/rpc'
import { shallowRef } from 'vue'
import { loadMetricDefinitions, loadPublicPingTasks } from '@/services/metrics.service'

export function useLoadMetricCatalog() {
  const availableMetricKeys = shallowRef<Set<string>>(new Set())
  const pingTasks = shallowRef<PingTaskInfo[]>([])

  async function loadMetricCatalog(): Promise<void> {
    const [definitions, tasks] = await Promise.all([
      loadMetricDefinitions().catch(() => []),
      loadPublicPingTasks().catch(() => []),
    ])
    availableMetricKeys.value = new Set(definitions.map(definition => definition.name))
    pingTasks.value = tasks
  }

  return { availableMetricKeys, pingTasks, loadMetricCatalog }
}
