/**
 * Helpers for starting / stopping the Java (Spring Boot) backend
 * during e2e tests.
 *
 * Unlike the TypeScript prepare-backend that does a full regen + npm install,
 * the Java backend reads metadata.json directly — so preparation is just
 * building the Gradle project once and then spawning `gradle bootRun`
 * with the right env vars for each fixture.
 */
import { execSync, spawn } from 'node:child_process'
import path from 'node:path'
import type { StartedServer } from './prepare-backend.js'

const javaProjectDir = path.resolve(import.meta.dirname, '../../java')
const fixturesBaseDir = path.resolve(import.meta.dirname, '../fixtures')

let buildDone = false

/**
 * Ensure the Java project is compiled (gradle build).
 * Cached per process — only runs once.
 */
export function ensureJavaBuild(): void {
  if (buildDone) return
  execSync('gradle build -x test', {
    cwd: javaProjectDir,
    stdio: 'pipe',
    timeout: 120000,
  })
  buildDone = true
}

/**
 * Create a PostgreSQL schema (for test isolation) and return the JDBC URL.
 */
function ensureSchema(schema: string): string {
  execSync(
    `psql postgresql://test:test@localhost:5432/test -c "DROP SCHEMA IF EXISTS \\"${schema}\\" CASCADE; CREATE SCHEMA \\"${schema}\\";"`,
    { stdio: 'pipe', timeout: 10000 },
  )
  return `jdbc:postgresql://localhost:5432/test?currentSchema=${schema}`
}

/**
 * Start the Java backend for a given fixture and DB schema.
 *
 * @param fixture - Name of the fixture directory under tests/fixtures/
 * @param schema  - PostgreSQL schema name for isolation
 * @returns A StartedServer compatible with the graphql-client helpers
 */
export function startJavaServer(fixture: string, schema: string): Promise<StartedServer> {
  ensureJavaBuild()

  const metadataPath = path.join(fixturesBaseDir, fixture, 'metadata.json')
  const jdbcUrl = ensureSchema(schema)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Java server did not start within 30s'))
    }, 30000)

    const proc = spawn('gradle', ['bootRun'], {
      cwd: javaProjectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        METADATA_PATH: metadataPath,
        DATABASE_URL: jdbcUrl,
        DATABASE_USER: 'test',
        DATABASE_PASSWORD: 'test',
        SERVER_PORT: '0', // let OS pick a free port
      },
    })

    let stderr = ''
    let stdout = ''
    let resolved = false

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      stdout += text
      if (resolved) return
      // Spring Boot logs "Tomcat started on port XXXX"
      const portMatch = text.match(/Tomcat started on port (\d+)/)
      if (portMatch) {
        const port = Number(portMatch[1])
        clearTimeout(timeout)
        resolved = true
        // Wait a moment for CommandLineRunner (migration) to finish
        setTimeout(() => {
          resolve({
            process: proc,
            port,
            baseUrl: `http://localhost:${port}`,
          })
        }, 2000)
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (resolved) return
      clearTimeout(timeout)
      reject(
        new Error(`Java server exited with code ${code}:\nstdout: ${stdout}\nstderr: ${stderr}`),
      )
    })

    proc.on('error', (err) => {
      if (resolved) return
      clearTimeout(timeout)
      reject(err)
    })
  })
}

/** Stop a Java server started by startJavaServer. */
export async function stopJavaServer(server: StartedServer | undefined): Promise<void> {
  if (!server?.process) return
  server.process.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    server.process.on('close', () => resolve())
    setTimeout(resolve, 10000)
  })
}
