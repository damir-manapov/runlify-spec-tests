/* Stub: config */
import type { Config } from './config'
import log from '../log'

export const getConfig = async (): Promise<Config> =>
  ({
    env: 'test',
  }) as Config

/** Stub configUtils — generated services use configUtils.getLog() */
export const configUtils = {
  getLog: (_label?: string) => log,
}
