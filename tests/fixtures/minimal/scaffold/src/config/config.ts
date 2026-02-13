/* Scaffold: config stub that extends generated Config with infrastructure fields */
import type { EnvVarConfig } from './types'

export interface Config {
  env: string
  databaseMainWriteUri: string
  databaseMainReadOnlyUri: string
  databaseMainReadOnlyEnabled: boolean
  [key: string]: unknown
}

export const envVarsConfig: EnvVarConfig[] = []
