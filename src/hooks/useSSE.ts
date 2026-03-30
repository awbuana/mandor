import { useEffect, useCallback, useState } from 'react'
import { useSSEContext, SSEContextEvent } from '@/contexts/SSEContext'

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed'

export interface UseSSEOptions {
  sessionId: string
  onSessionStatus?: (status: 'busy' | 'idle') => void
  onSessionIdle?: () => void
  onQuestionAsked?: (data: {
    id: string
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    callID: string
  }) => void
  onMessageUpdated?: (data: { messageId: string; role: string }) => void
  onMessagePartDelta?: (data: { partId: string; messageId: string; delta: string }) => void
  onMessagePartUpdated?: (data: {
    partId: string
    messageId: string
    partType: string
    text: string
    tool?: string
    callID?: string
    state?: { status?: string; input?: Record<string, unknown>; output?: string }
  }) => void
}

export interface UseSSEReturn {
  isConnected: boolean
  connectionState: ConnectionState
  lastEventTime: number | null
  reconnectAttempts: number
  reconnect: () => void
}

export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const {
    sessionId,
    onSessionStatus,
    onSessionIdle,
    onQuestionAsked,
    onMessageUpdated,
    onMessagePartDelta,
    onMessagePartUpdated,
  } = options

  const { subscribe, reconnect: contextReconnect, getConnectionState } = useSSEContext()

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [lastEventTime, setLastEventTime] = useState<number | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!sessionId) return

    const handlers: Array<() => void> = []

    const handleEvent = (event: SSEContextEvent) => {
      setLastEventTime(Date.now())

      const data = event.data as { type?: string; id?: string; properties?: Record<string, unknown> }

      if (data.type === 'session.status') {
        const status = (data.properties?.status as { type?: string })?.type
        if (status === 'busy' || status === 'idle') {
          onSessionStatus?.(status)
        }
        return
      }

      if (data.type === 'session.idle') {
        onSessionIdle?.()
        return
      }

      if (data.type === 'question.asked') {
        const props = data.properties as Record<string, unknown>
        const questions = (props?.questions as Array<{
          question?: string
          header?: string
          options?: Array<{ label?: string; description?: string }>
        }>) || []
        const tool = props?.tool as { messageID?: string; callID?: string } | undefined

        if (questions.length > 0) {
          const q = questions[0]
          onQuestionAsked?.({
            id: (props?.id as string) || '',
            question: q.question || '',
            header: q.header || '',
            options: (q.options || []).map(o => ({ label: o.label || '', description: o.description || '' })),
            callID: tool?.callID || '',
          })
        }
        return
      }

      if (data.type === 'message.updated') {
        const props = data.properties as Record<string, unknown>
        const info = props?.info as { id?: string; role?: string }
        if (info?.id && info?.role) {
          onMessageUpdated?.({ messageId: info.id, role: info.role })
        }
        return
      }

      if (data.type === 'message.part.delta') {
        const props = data.properties as {
          partID?: string
          messageID?: string
          field?: string
          delta?: string
        }
        if (props.partID && props.messageID && props.delta) {
          onMessagePartDelta?.({
            partId: props.partID,
            messageId: props.messageID,
            delta: props.delta,
          })
        }
        return
      }

      if (data.type === 'message.part.updated') {
        const props = data.properties as {
          part?: {
            id?: string
            messageID?: string
            type?: string
            tool?: string
            callID?: string
            text?: string
            state?: { status?: string; input?: Record<string, unknown>; output?: string }
          }
        }
        const part = props?.part
        if (part) {
          onMessagePartUpdated?.({
            partId: part.id || '',
            messageId: part.messageID || '',
            partType: part.type || '',
            text: part.text || '',
            tool: part.tool,
            callID: part.callID,
            state: part.state,
          })
        }
        return
      }
    }

    const unsubscribe = subscribe(sessionId, handleEvent)
    handlers.push(unsubscribe)

    return () => {
      handlers.forEach(h => h())
    }
  }, [sessionId, subscribe, onSessionStatus, onSessionIdle, onQuestionAsked, onMessageUpdated, onMessagePartDelta, onMessagePartUpdated])

  useEffect(() => {
    if (!sessionId) return

    const conn = getConnectionState(sessionId)
    if (conn) {
      setConnectionState(conn.state)
      setReconnectAttempts(conn.reconnectAttempts)
      setIsConnected(conn.state === 'connected')
    }
  }, [sessionId, getConnectionState])

  const reconnect = useCallback(() => {
    contextReconnect(sessionId)
  }, [sessionId, contextReconnect])

  return {
    isConnected,
    connectionState,
    lastEventTime,
    reconnectAttempts,
    reconnect,
  }
}

export function useStreamingMessage(sessionId: string, messageId: string) {
  const { subscribe } = useSSEContext()
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'error' | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)

  useEffect(() => {
    if (!sessionId || !messageId) return

    const handlers: Array<() => void> = []

    const handleDelta = (event: SSEContextEvent) => {
      const data = event.data as { type?: string; properties?: { partID?: string; delta?: string } }
      if (data.type === 'message.part.delta') {
        const props = data.properties
        if (props?.partID === messageId && props?.delta) {
          setContent(prev => prev + props.delta!)
          setIsStreaming(true)
        }
      }
    }

    const handleUpdated = (event: SSEContextEvent) => {
      const data = event.data as { type?: string; properties?: { part?: { id?: string; type?: string; state?: { status?: string } } } }
      if (data.type === 'message.part.updated') {
        const part = data.properties?.part
        if (part?.id === messageId && part.type === 'tool') {
          setStatus(part.state?.status as 'pending' | 'running' | 'completed' | 'error' | undefined ?? null)
        }
        if (part?.id === messageId) {
          setIsStreaming(false)
        }
      }
    }

    handlers.push(subscribe(sessionId, handleDelta))
    handlers.push(subscribe(sessionId, handleUpdated))

    return () => {
      handlers.forEach(h => h())
    }
  }, [sessionId, messageId, subscribe])

  return { content, status, isStreaming }
}

export function useQuestion(sessionId: string) {
  const { subscribe } = useSSEContext()
  const [question, setQuestion] = useState<{
    id: string
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    callID: string
  } | null>(null)
  const [isAsking, setIsAsking] = useState(false)

  useEffect(() => {
    if (!sessionId) return

    const handlers: Array<() => void> = []

    const handleQuestion = (event: SSEContextEvent) => {
      const data = event.data as { type?: string; id?: string; properties?: Record<string, unknown> }
      if (data.type === 'question.asked') {
        const props = data.properties
        const questions = (props?.questions as Array<{
          question?: string
          header?: string
          options?: Array<{ label?: string; description?: string }>
        }>) || []
        const tool = props?.tool as { messageID?: string; callID?: string } | undefined

        if (questions.length > 0) {
          const q = questions[0]
          setQuestion({
            id: data.id || '',
            question: q.question || '',
            header: q.header || '',
            options: (q.options || []).map(o => ({ label: o.label || '', description: o.description || '' })),
            callID: tool?.callID || '',
          })
          setIsAsking(true)
        }
      }
    }

    const handleIdle = (event: SSEContextEvent) => {
      const data = event.data as { type?: string }
      if (data.type === 'session.idle') {
        setQuestion(null)
        setIsAsking(false)
      }
    }

    handlers.push(subscribe(sessionId, handleQuestion))
    handlers.push(subscribe(sessionId, handleIdle))

    return () => {
      handlers.forEach(h => h())
    }
  }, [sessionId, subscribe])

  return { question, isAsking }
}

export function useVisibilityChange(onVisible: () => void, onHidden: () => void) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        onHidden()
      } else {
        onVisible()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [onVisible, onHidden])
}
