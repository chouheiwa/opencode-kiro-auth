import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const getLogDir = () => {
  const platform = process.platform
  const base = platform === 'win32' ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'opencode') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode')
  return join(base, 'kiro-logs')
}

const writeToFile = (level: string, message: string, ...args: unknown[]) => {
  try {
    const dir = getLogDir()
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'plugin.log')
    const timestamp = new Date().toISOString()
    const content = `[${timestamp}] ${level}: ${message} ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}\n`
    appendFileSync(path, content)
  } catch (e) {}
}

export function log(message: string, ...args: unknown[]): void {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args)
  writeToFile('INFO', message, ...args)
}

export function error(message: string, ...args: unknown[]): void {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, ...args)
  writeToFile('ERROR', message, ...args)
}

export function warn(message: string, ...args: unknown[]): void {
  console.warn(`[${new Date().toISOString()}] WARN: ${message}`, ...args)
  writeToFile('WARN', message, ...args)
}

export function debug(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG) {
    console.debug(`[${new Date().toISOString()}] DEBUG: ${message}`, ...args)
    writeToFile('DEBUG', message, ...args)
  }
}
