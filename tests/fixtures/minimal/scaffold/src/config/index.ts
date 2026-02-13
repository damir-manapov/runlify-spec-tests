/* Stub: config */
import type { Config } from './config'

export const getConfig = async (): Promise<Config> =>
  ({
    env: 'test',
  }) as Config
