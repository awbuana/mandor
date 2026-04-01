import { invoke as originalInvoke } from '@tauri-apps/api/core'

export interface InvokeLogEntry {
  command: string
  params: Record<string, unknown>
  duration?: number
  error?: string
  timestamp: string
}

const isDevelopment = import.meta.env.DEV

function formatInvokeLog(entry: InvokeLogEntry): string {
  const base = {
    type: 'invoke',
    command: entry.command,
    params: entry.params,
    timestamp: entry.timestamp,
  }
  if (entry.duration !== undefined) {
    return JSON.stringify({ ...base, duration_ms: entry.duration })
  }
  if (entry.error) {
    return JSON.stringify({ ...base, error: entry.error })
  }
  return JSON.stringify(base)
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const timestamp = new Date().toISOString()
  const startTime = isDevelopment ? performance.now() : 0

  try {
    const result = await originalInvoke<T>(command, args)

    if (isDevelopment) {
      const duration = performance.now() - startTime
      console.log(formatInvokeLog({
        command,
        params: args || {},
        duration,
        timestamp,
      }))
    }

    return result
  } catch (error) {
    if (isDevelopment) {
      console.log(formatInvokeLog({
        command,
        params: args || {},
        error: String(error),
        timestamp,
      }))
    }
    throw error
  }
}
