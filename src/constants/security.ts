import { TIME_MS } from './time'

export const SECURITY_CONFIG = {
  auth: {
    verifyTtl: TIME_MS.minute,
  },
  csv: {
    formulaPrefixes: ['=', '+', '-', '@'],
  },
  export: {
    secondaryPasswordSessionKey: 'komari-theme-export-secondary-password-verified',
  },
} as const
