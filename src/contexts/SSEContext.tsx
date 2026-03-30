import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { sseLogger } from '@/lib/logger'

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed'

export type SSEErrorType = 'network' | 'parse' | 'server' | 'unknown'

export interface SSEError {
  type: SSEErrorType
  message: string
  timestamp: number
  recoverable: boolean
}

export interface SSEConnection {
  sessionId: string
  worktreePath: string
  state: ConnectionState
  reconnectAttempts: number
  lastEventTime: number
  errors: SSEError[]
}

export interface SSEContextEvent {
  session_id: string
  event: string
  data: Record<string, unknown>
}

interface SSEContextValue {
  connections: Map<string, SSEConnection>
  startStream: (sessionId: string, worktreePath: string, hostname: string, port: number) => void
  stopStream: (sessionId: string) => void
  subscribe: (sessionId: string, handler: (event: SSEContextEvent) => void) => () => void
  reconnect: (sessionId: string) => void
  getConnectionState: (sessionId: string) => SSEConnection | null
  pauseReconnect: (sessionId: string) => void
  resumeReconnect: (sessionId: string) => void
  isPageVisible: boolean
}

const SSEContext = createContext<SSEContextValue | null>(null)

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<Map<string, SSEConnection>>(new Map())
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden)
  const handlersRef = useRef<Map<string, Set<(event: SSEContextEvent) => void>>>(new Map())
  const reconnectTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const serverInfoRef = useRef<Map<string, { hostname: string; port: number; worktreePath: string }>>(new Map())
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const unlistenDisconnectRef = useRef<UnlistenFn | null>(null)
  const pausedConnectionsRef = useRef<Set<string>>(new Set())

  const getReconnectDelay = useCallback((attempt: number): number => {
    const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempt), RECONNECT_MAX_DELAY)
    return delay
  }, [])

  const addError = useCallback((sessionId: string, error: SSEError) => {
    setConnections(prev => {
      const next = new Map(prev)
      const conn = next.get(sessionId)
      if (conn) {
        next.set(sessionId, {
          ...conn,
          errors: [...conn.errors.slice(-9), error],
        })
      }
      return next
    })
  }, [])

  const startStream = useCallback(async (sessionId: string, worktreePath: string, hostname: string, port: number) => {
    sseLogger.info('Starting stream', {
      sessionId,
      worktreePath,
      hostname,
      port,
    })

    serverInfoRef.current.set(sessionId, { hostname, port, worktreePath })

    setConnections(prev => {
      const next = new Map(prev)
      next.set(sessionId, {
        sessionId,
        worktreePath,
        state: 'connecting',
        reconnectAttempts: 0,
        lastEventTime: Date.now(),
        errors: [],
      })
      return next
    })

    try {
      await invoke('stream_opencode_events', {
        hostname,
        port,
        sessionId,
      })
      sseLogger.info('Stream started successfully', {
        sessionId,
        worktreePath,
      })
    } catch (error) {
      sseLogger.error('Failed to start stream', {
        sessionId,
        worktreePath,
        error: error instanceof Error ? error.message : String(error),
      })
      addError(sessionId, {
        type: 'unknown',
        message: error instanceof Error ? error.message : 'Failed to start stream',
        timestamp: Date.now(),
        recoverable: false,
      })
      setConnections(prev => {
        const next = new Map(prev)
        const conn = next.get(sessionId)
        if (conn) {
          next.set(sessionId, { ...conn, state: 'error' })
        }
        return next
      })
    }
  }, [addError])

  const stopStream = useCallback(async (sessionId: string) => {
    sseLogger.info('Stopping stream', { sessionId })

    if (reconnectTimeoutsRef.current.has(sessionId)) {
      clearTimeout(reconnectTimeoutsRef.current.get(sessionId))
      reconnectTimeoutsRef.current.delete(sessionId)
    }

    pausedConnectionsRef.current.delete(sessionId)

    try {
      await invoke('stop_sse_stream', { sessionId })
    } catch (error) {
      sseLogger.warn('Stop stream error (may already be stopped)', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    serverInfoRef.current.delete(sessionId)

    setConnections(prev => {
      const next = new Map(prev)
      const conn = next.get(sessionId)
      if (conn) {
        next.set(sessionId, { ...conn, state: 'closed' })
      }
      return next
    })
  }, [])

  const reconnect = useCallback((sessionId: string) => {
    sseLogger.info('Manual reconnect triggered', { sessionId })

    const conn = connections.get(sessionId)
    if (!conn) {
      sseLogger.warn('No connection found for reconnect', { sessionId })
      return
    }

    const serverInfo = serverInfoRef.current.get(sessionId)
    if (!serverInfo) {
      sseLogger.warn('No server info found for reconnect', { sessionId })
      return
    }

    if (reconnectTimeoutsRef.current.has(sessionId)) {
      clearTimeout(reconnectTimeoutsRef.current.get(sessionId))
      reconnectTimeoutsRef.current.delete(sessionId)
    }

    setConnections(prev => {
      const next = new Map(prev)
      next.set(sessionId, {
        ...conn,
        state: 'reconnecting',
        reconnectAttempts: 0,
      })
      return next
    })

    startStream(conn.sessionId, conn.worktreePath, serverInfo.hostname, serverInfo.port)
  }, [connections, startStream])

  const pauseReconnect = useCallback((sessionId: string) => {
    sseLogger.debug('Pausing reconnect', { sessionId })
    pausedConnectionsRef.current.add(sessionId)

    if (reconnectTimeoutsRef.current.has(sessionId)) {
      clearTimeout(reconnectTimeoutsRef.current.get(sessionId))
      reconnectTimeoutsRef.current.delete(sessionId)
    }
  }, [])

  const resumeReconnect = useCallback((sessionId: string) => {
    sseLogger.debug('Resuming reconnect', { sessionId })
    pausedConnectionsRef.current.delete(sessionId)

    const conn = connections.get(sessionId)
    const serverInfo = serverInfoRef.current.get(sessionId)

    if (!conn || !serverInfo || conn.state !== 'reconnecting') {
      return
    }

    const delay = getReconnectDelay(conn.reconnectAttempts)

    reconnectTimeoutsRef.current.set(sessionId, setTimeout(() => {
      setConnections(prev => {
        const next = new Map(prev)
        const c = next.get(sessionId)
        if (c && c.state === 'reconnecting' && !pausedConnectionsRef.current.has(sessionId)) {
          next.set(sessionId, {
            ...c,
            reconnectAttempts: c.reconnectAttempts + 1,
          })
          startStream(c.sessionId, c.worktreePath, serverInfo.hostname, serverInfo.port)
        }
        return next
      })
      reconnectTimeoutsRef.current.delete(sessionId)
    }, delay))
  }, [connections, getReconnectDelay, startStream])

  const subscribe = useCallback((sessionId: string, handler: (event: SSEContextEvent) => void) => {
    if (!handlersRef.current.has(sessionId)) {
      handlersRef.current.set(sessionId, new Set())
    }
    handlersRef.current.get(sessionId)!.add(handler)

    return () => {
      const handlers = handlersRef.current.get(sessionId)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          handlersRef.current.delete(sessionId)
        }
      }
    }
  }, [])

  const getConnectionState = useCallback((sessionId: string): SSEConnection | null => {
    return connections.get(sessionId) || null
  }, [connections])

  const handleIncomingEvent = useCallback((event: SSEContextEvent) => {
    const { session_id, event: eventType, data } = event

    sseLogger.debug('Incoming event', {
      sessionId: session_id,
      eventType,
      dataType: data?.type as string,
      subscriberCount: handlersRef.current.get(session_id)?.size || 0,
    })

    if (data?.type === 'session.status') {
      sseLogger.debug('Session status changed', {
        sessionId: session_id,
        status: (data.properties as { status?: { type?: string } })?.status?.type,
      })
    }

    if (data?.type === 'session.idle') {
      sseLogger.info('Session idle', {
        sessionId: session_id,
        activeHandlers: handlersRef.current.get(session_id)?.size || 0,
      })
    }

    if (data?.type === 'question.asked') {
      const props = data.properties as {
        questions?: Array<{ question?: string; header?: string; options?: Array<{ label?: string }> }>
      }
      const questions = props?.questions || []
      sseLogger.info('Question asked', {
        sessionId: session_id,
        questionId: data.id,
        questionHeader: questions[0]?.header,
        optionsCount: questions[0]?.options?.length || 0,
      })
    }

    if (data?.type === 'message.updated') {
      const props = data.properties as { info?: { id?: string; role?: string } }
      sseLogger.debug('Message updated', {
        sessionId: session_id,
        messageId: props?.info?.id,
        role: props?.info?.role,
      })
    }

    if (data?.type === 'message.part.delta') {
      const props = data.properties as { partID?: string; messageID?: string; field?: string; delta?: string }
      sseLogger.debug('Message part delta', {
        sessionId: session_id,
        partId: props?.partID,
        messageId: props?.messageID,
        field: props?.field,
        deltaLength: props?.delta?.length || 0,
      })
    }

    if (data?.type === 'message.part.updated') {
      const props = data.properties as {
        part?: { id?: string; type?: string; tool?: string; callID?: string; state?: { status?: string } }
      }
      sseLogger.debug('Message part updated', {
        sessionId: session_id,
        partId: props?.part?.id,
        partType: props?.part?.type,
        tool: props?.part?.tool,
        toolStatus: props?.part?.state?.status,
      })
    }

    setConnections(prev => {
      const next = new Map(prev)
      const conn = next.get(session_id)
      if (conn) {
        next.set(session_id, {
          ...conn,
          state: 'connected',
          lastEventTime: Date.now(),
        })
      }
      return next
    })

    const handlers = handlersRef.current.get(session_id)
    if (handlers) {
      handlers.forEach(handler => handler(event))
    }
  }, [])

  const handleDisconnection = useCallback((sessionId: string) => {
    sseLogger.warn('Disconnection detected', { sessionId })

    if (pausedConnectionsRef.current.has(sessionId)) {
      sseLogger.debug('Skipping reconnect - connection is paused', { sessionId })
      return
    }

    setConnections(prev => {
      const next = new Map(prev)
      const conn = next.get(sessionId)
      if (!conn) return prev

      if (conn.state === 'closed') {
        return prev
      }

      if (conn.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        sseLogger.error('Max reconnect attempts reached', {
          sessionId,
          attempts: conn.reconnectAttempts,
        })
        addError(sessionId, {
          type: 'network',
          message: 'Max reconnection attempts reached',
          timestamp: Date.now(),
          recoverable: false,
        })
        next.set(sessionId, { ...conn, state: 'error' })
        return next
      }

      const delay = getReconnectDelay(conn.reconnectAttempts)
      sseLogger.info('Scheduling reconnect', {
        sessionId,
        delayMs: delay,
        attempt: conn.reconnectAttempts + 1,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
      })

      addError(sessionId, {
        type: 'network',
        message: `Connection lost, reconnecting (attempt ${conn.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`,
        timestamp: Date.now(),
        recoverable: true,
      })

      next.set(sessionId, {
        ...conn,
        state: 'reconnecting',
      })

      reconnectTimeoutsRef.current.set(sessionId, setTimeout(() => {
        const serverInfo = serverInfoRef.current.get(sessionId)
        setConnections(prev => {
          const next = new Map(prev)
          const c = next.get(sessionId)
          if (c && c.state === 'reconnecting' && !pausedConnectionsRef.current.has(sessionId)) {
            next.set(sessionId, {
              ...c,
              reconnectAttempts: c.reconnectAttempts + 1,
            })
            if (serverInfo) {
              startStream(c.sessionId, c.worktreePath, serverInfo.hostname, serverInfo.port)
            }
          }
          return next
        })
        reconnectTimeoutsRef.current.delete(sessionId)
      }, delay))

      return next
    })
  }, [getReconnectDelay, startStream, addError])

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden
      setIsPageVisible(isVisible)

      if (isVisible) {
        sseLogger.debug('Page visible - resuming paused connections', {
          pausedCount: Array.from(pausedConnectionsRef.current),
        })
        connections.forEach((_, sessionId) => {
          if (pausedConnectionsRef.current.has(sessionId)) {
            resumeReconnect(sessionId)
          }
        })
      } else {
        const reconnectingSessions = Array.from(connections.entries())
          .filter(([_, conn]) => conn.state === 'reconnecting')
          .map(([id]) => id)
        sseLogger.debug('Page hidden - pausing active reconnects', {
          reconnectingSessions,
        })
        connections.forEach((conn, sessionId) => {
          if (conn.state === 'reconnecting') {
            pauseReconnect(sessionId)
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [connections, pauseReconnect, resumeReconnect])

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRef.current = await listen<SSEContextEvent>('opencode-event', (event) => {
        handleIncomingEvent(event.payload)
      })

      unlistenDisconnectRef.current = await listen<{ session_id: string }>('opencode-disconnected', (event) => {
        handleDisconnection(event.payload.session_id)
      })
    }

    setupListeners()

    return () => {
      unlistenRef.current?.()
      unlistenDisconnectRef.current?.()
      reconnectTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
    }
  }, [handleIncomingEvent, handleDisconnection])

  const value: SSEContextValue = {
    connections,
    startStream,
    stopStream,
    subscribe,
    reconnect,
    getConnectionState,
    pauseReconnect,
    resumeReconnect,
    isPageVisible,
  }

  return (
    <SSEContext.Provider value={value}>
      {children}
    </SSEContext.Provider>
  )
}

export function useSSEContext(): SSEContextValue {
  const context = useContext(SSEContext)
  if (!context) {
    throw new Error('useSSEContext must be used within an SSEProvider')
  }
  return context
}
