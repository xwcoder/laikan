import { router } from '@/router/settings/electron-main/settings'
import * as settings from '@/services/settings/electron-main/settings'
import { push } from '@/services/push/electron-main/push'

export const createApp = () => {
  router.listen()
  settings.on('change', () => push('/settings/change', null))
}
