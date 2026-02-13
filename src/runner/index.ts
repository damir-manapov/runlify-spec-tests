import { spawn, spawnSync } from 'node:child_process'

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface Implementation {
  name: string
  command: string
  args?: string[]
}

const implementations: Record<string, Implementation> = {
  typescript: {
    name: 'TypeScript (original)',
    command: 'runlify',
  },
  // Add more implementations here as they become available
  // rust: { name: 'Rust', command: 'runlify-rs' },
  // go: { name: 'Go', command: 'runlify-go' },
}

export function getImplementation(): Implementation {
  const implName = process.env.RUNLIFY_IMPL ?? 'typescript'
  const impl = implementations[implName]

  if (!impl) {
    throw new Error(
      `Unknown implementation: ${implName}. Available: ${Object.keys(implementations).join(', ')}`,
    )
  }

  return impl
}

export function checkRunlifyAvailable(): boolean {
  const impl = getImplementation()
  const result = spawnSync('which', [impl.command], { shell: true })
  return result.status === 0
}

export function assertRunlifyAvailable(): void {
  const impl = getImplementation()
  if (!checkRunlifyAvailable()) {
    throw new Error(`${impl.command} not found. Install with: npm i -g runlify`)
  }
}

export async function runRunlify(args: string[], cwd?: string): Promise<RunResult> {
  const impl = getImplementation()

  return new Promise((resolve) => {
    const proc = spawn(impl.command, [...(impl.args ?? []), ...args], {
      cwd: cwd ?? process.cwd(),
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Close stdin immediately to prevent waiting for input
    proc.stdin?.end()

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      })
    })
  })
}
