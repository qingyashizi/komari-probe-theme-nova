import type { VersionInfo } from '@/utils/api'
import { requestManager } from '@/services/request.service'
import { getSharedApi } from '@/utils/api'

export async function loadServerVersion(): Promise<VersionInfo> {
  return requestManager.run(
    'server-info:version',
    () => getSharedApi().getVersion(),
  )
}
