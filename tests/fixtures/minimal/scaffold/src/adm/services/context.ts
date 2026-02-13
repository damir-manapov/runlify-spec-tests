/* Stub: context */
import type { Context } from './types'

export const createContext = async (_container: unknown): Promise<Context> => {
  return {
    service: () => ({}) as never,
  }
}
