type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogMetadata {
  [key: string]: unknown
}

interface StructuredLog {
  timestamp: string
  tag: string
  level: LogLevel
  message: string
  metadata?: LogMetadata
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel = 'debug'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function formatLog(log: StructuredLog): string {
  const base = `${log.timestamp} ${log.tag} [${log.level.toUpperCase()}] ${log.message}`
  if (log.metadata && Object.keys(log.metadata).length > 0) {
    return `${base} ${JSON.stringify(log.metadata)}`
  }
  return base
}

export function createLogger(tag: string) {
  const timestamp = () => new Date().toISOString()

  const log = (level: LogLevel, message: string, metadata?: LogMetadata) => {
    if (!shouldLog(level)) return

    const structuredLog: StructuredLog = {
      timestamp: timestamp(),
      tag,
      level,
      message,
      metadata,
    }

    const formatted = formatLog(structuredLog)

    switch (level) {
      case 'debug':
        console.debug(formatted)
        break
      case 'info':
        console.info(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
        console.error(formatted)
        break
    }
  }

  return {
    debug: (message: string, metadata?: LogMetadata) => log('debug', message, metadata),
    info: (message: string, metadata?: LogMetadata) => log('info', message, metadata),
    warn: (message: string, metadata?: LogMetadata) => log('warn', message, metadata),
    error: (message: string, metadata?: LogMetadata) => log('error', message, metadata),
  }
}

export const sseLogger = createLogger('SSE')
