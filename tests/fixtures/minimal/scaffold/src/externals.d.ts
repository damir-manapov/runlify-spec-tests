declare module 'apollo-server' {
  export function gql(strings: TemplateStringsArray, ...args: unknown[]): unknown
}

declare module 'apollo-server-express' {
  import type { Express } from 'express'
  export class ApolloServer {
    constructor(config: any)
    start(): Promise<void>
    stop(): Promise<void>
    applyMiddleware(opts: { app: Express; path?: string }): void
  }
  export function gql(strings: TemplateStringsArray, ...args: unknown[]): unknown
}

declare module 'graphile-worker' {
  export interface WorkerUtils {
    release(): void
  }
  export function makeWorkerUtils(options: {
    connectionString: string
    noPreparedStatements?: boolean
  }): Promise<WorkerUtils>
}

declare module 'express-list-endpoints' {
  import type { Express } from 'express'
  interface Endpoint {
    path: string
    methods: string[]
  }
  function expressListEndpoints(app: Express): Endpoint[]
  export = expressListEndpoints
}

declare module 'fs-jetpack' {
  const jetpack: {
    read(path: string): string | undefined
  }
  export default jetpack
  export function read(path: string): string | undefined
}
