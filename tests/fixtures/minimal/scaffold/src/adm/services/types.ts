/* Stub: services types */

import type { AdditionalServices } from './AdditionalServices'
import type { BaseServices } from './BaseServices'

export type Services = BaseServices & AdditionalServices

export interface Context {
  service(name: string): any
}

export type BaseServiceConstrictors = {
  [K in keyof BaseServices]: (...args: unknown[]) => BaseServices[K]
}

export type AdditionalServiceConstrictors = {
  [K in keyof AdditionalServices]: (...args: unknown[]) => AdditionalServices[K]
}

export type IntegrationClientsConstrictors = Record<string, (...args: unknown[]) => unknown>

export type ServiceConstrictors = BaseServiceConstrictors &
  AdditionalServiceConstrictors &
  IntegrationClientsConstrictors
