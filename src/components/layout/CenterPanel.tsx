import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
  X,
  Terminal,
  Command,
  Robot,
  FileCode,
  Play
} from '@phosphor-icons/react'
import { AgentType, FileComment } from '@/types'
import { InlineDiffViewer } from '@/components/diff/InlineDiffViewer'
import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'


type AgentTab = {
  id: string
  type: AgentType
  name: string
  icon: React.ReactNode
  color: string
}

interface DiffLine {
  type: 'header' | 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  messageId?: string
  partId?: string
  type?: string
  toolCall?: {
    tool: string
    callID: string
    status: 'pending' | 'running' | 'completed' | 'error'
    input?: Record<string, unknown>
  }
}

interface QuestionOption {
  label: string
  description: string
}

interface PendingQuestion {
  id: string
  question: string
  header: string
  options: QuestionOption[]
  callID: string
}



const AGENT_TABS: AgentTab[] = [
  { id: 'codex', type: 'opencode', name: 'opencode', icon: <Command className="w-4 h-4" />, color: '#9b9b9b' },
]

// Mock agent info
const AGENT_INFO: Record<string, { version: string; model: string; subtitle: string; path: string }> = {
  codex: {
    version: 'v1.0.0',
    model: 'AI Assistant',
    subtitle: 'OpenCode Agent',
    path: '~'
  },
}

// Get worktree name from path
const getWorktreeNameFromPath = (path: string): string => {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export function CenterPanel() {
  const {
    terminals,
    addTerminal,
    removeTerminal,
    setActiveTerminal,
    selectedWorktree,
    activeView,
    setActiveView,
    getWorktreeSession,
    closeFile,
    setActiveFile,
    getOpencodeServer,
    startOpencodeServer,
    addAgentMessage,
    setAgentIsSending,
    setAgentStreamingContent,
    setAgentSelectedModel,
    fetchAgentModels,
    upsertStreamingMessage,
    finalizeStreamingMessage,
    clearStreamingMessages,
    appendStreamingMessageDelta,
    addComment,
    removeComment,
    resolveComment,
    getFileComments,
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<string>('codex')
  const [command, setCommand] = useState('')
  const [diffContent, setDiffContent] = useState<DiffLine[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const [diffZoom, setDiffZoom] = useState<number>(50)
  const terminalRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Get server for selected worktree
  const currentServer = selectedWorktree ? getOpencodeServer(selectedWorktree.path) : undefined

  // Get worktree session (includes files and agent messages)
  const worktreeSession = selectedWorktree
    ? getWorktreeSession(selectedWorktree.path)
    : { files: { openFiles: [], activeFile: null }, agent: { messages: [], isSending: false, streamingContent: '', streamingMessages: {}, selectedModel: undefined, availableProviders: [], opencodeSession: undefined } }
  const { openFiles, activeFile } = worktreeSession.files

  // Get agent state for selected worktree
  const agentMessages = worktreeSession.agent.messages
  const isSending = worktreeSession.agent.isSending
  const streamingContent = worktreeSession.agent.streamingContent
  const streamingMessages = worktreeSession.agent.streamingMessages
  const selectedModel = worktreeSession.agent.selectedModel
  const availableProviders = worktreeSession.agent.availableProviders

  // Parse selected model to get provider ID
  const selectedProviderId = selectedModel?.split('/')[0] || ''

  // Note: Streaming is disabled for now - using synchronous responses instead
  // Each worktree has its own isSending state in the store

  // Fetch available models when server starts
  useEffect(() => {
    if (currentServer?.isRunning && selectedWorktree && availableProviders.length === 0) {
      fetchAgentModels(selectedWorktree.path)
    }
  }, [currentServer?.isRunning, selectedWorktree?.path, availableProviders.length])

  // Start SSE stream when server starts
  useEffect(() => {
    if (!currentServer?.isRunning || !currentServer.sessionId || !selectedWorktree) {
      return
    }

    let isStreamStarted = false

    const startStream = async () => {
      if (isStreamStarted) return
      isStreamStarted = true

      try {
        console.log('Starting SSE stream for session:', currentServer.sessionId)
        await invoke('stream_opencode_events', {
          hostname: currentServer.hostname,
          port: currentServer.port,
          sessionId: currentServer.sessionId,
        })
        console.log('SSE stream started successfully')
      } catch (error) {
        console.error('Failed to start SSE stream:', error)
        isStreamStarted = false
      }
    }

    startStream()
  }, [currentServer?.isRunning, currentServer?.sessionId, selectedWorktree?.path])

  // Listen for SSE events
  useEffect(() => {
    if (!selectedWorktree) return

    let unlisten: UnlistenFn | undefined
    let activeMessageIds = new Set<string>()
    let messageRoles = new Map<string, string>()
    let isBusy = false

    const setupListener = async () => {
      unlisten = await listen<{
        session_id: string
        event: string
        data: {
          type?: string
          properties?: {
            status?: { type?: string }
            part?: {
              id?: string
              messageID?: string
              text?: string
              type?: string
              tool?: string
              callID?: string
              state?: {
                status?: string
                input?: Record<string, unknown>
              }
            }
          }
        }
      }>('opencode-event', (event) => {
        const { data } = event.payload

        if (data?.type === 'session.status') {
          const wasBusy = isBusy
          isBusy = data?.properties?.status?.type === 'busy'
          if (isBusy && !wasBusy) {
            activeMessageIds.forEach(id => finalizeStreamingMessage(selectedWorktree.path, id))
            activeMessageIds.clear()
          }
          return
        }

        if (data?.type === 'session.idle') {
          activeMessageIds.forEach(id => finalizeStreamingMessage(selectedWorktree.path, id))
          activeMessageIds.clear()
          messageRoles.clear()
          setAgentIsSending(selectedWorktree.path, false)
          isBusy = false
          return
        }

        if (data?.type === 'question.asked') {
          activeMessageIds.forEach(id => finalizeStreamingMessage(selectedWorktree.path, id))
          activeMessageIds.clear()
          messageRoles.clear()
          setAgentIsSending(selectedWorktree.path, false)
          isBusy = false

          const props = data?.properties as Record<string, unknown>
          const questions = (props?.questions as Array<{
            question?: string
            header?: string
            options?: Array<{ label?: string; description?: string }>
          }>) || []
          const tool = props?.tool as { messageID?: string; callID?: string } | undefined

          if (questions.length > 0) {
            const q = questions[0]
            setPendingQuestion({
              id: props?.id as string || '',
              question: q.question || '',
              header: q.header || '',
              options: (q.options || []).map(o => ({ label: o.label || '', description: o.description || '' })),
              callID: tool?.callID || '',
            })
          }
          return
        }

        if (data?.type === 'message.updated') {
          const props = data?.properties as Record<string, unknown> | undefined
          const info = props?.info as Record<string, unknown> | undefined
          const msgId = info?.id as string | undefined
          const role = info?.role as string | undefined

          if (msgId && role) {
            messageRoles.set(msgId, role)
            if (role === 'assistant') {
              isBusy = true
            }
          }
          return
        }

        if (data?.type === 'message.part.delta') {
          const props = data?.properties as Record<string, unknown> | undefined
          const partId = props?.partID as string | undefined
          const messageId = props?.messageID as string | undefined
          const field = props?.field as string | undefined
          const delta = props?.delta as string | undefined

          if (partId && field === 'text' && delta && messageId) {
            const role = messageRoles.get(messageId)
            if (role === 'assistant') {
              activeMessageIds.add(partId)

              const streamingMsg: Message = {
                id: partId,
                messageId: partId,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                isStreaming: true,
              }
              upsertStreamingMessage(selectedWorktree.path, streamingMsg)
              appendStreamingMessageDelta(selectedWorktree.path, partId, delta)
            }
          }
          return
        }

        if (!isBusy) return

        if (data?.type !== 'message.part.updated') return

        const part = data?.properties?.part
        const partType = part?.type
        const text = part?.text || ''
        const partMsgId = part?.messageID as string | undefined
        const role = partMsgId ? messageRoles.get(partMsgId) : undefined

        if (role !== 'assistant') return

        const partId = part?.id || part?.messageID || `msg-${Date.now()}`

        if (partType === 'tool') {
          const toolCall: Message['toolCall'] = {
            tool: part?.tool || 'unknown',
            callID: part?.callID || '',
            status: (part?.state?.status as 'pending' | 'running' | 'completed' | 'error') || 'pending',
            input: part?.state?.input,
          }

          const streamingMsg: Message = {
            id: partId,
            messageId: partId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            type: 'tool',
            toolCall,
          }

          activeMessageIds.add(partId)
          upsertStreamingMessage(selectedWorktree.path, streamingMsg)
          return
        }

        if (!text) return

        const streamingMsg: Message = {
          id: partId,
          messageId: partId,
          role: 'assistant',
          content: text,
          timestamp: new Date(),
          isStreaming: true,
        }

        activeMessageIds.add(partId)
        upsertStreamingMessage(selectedWorktree.path, streamingMsg)
      })
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [selectedWorktree?.path])

  // Parse diff from string
  const parseDiff = (diff: string): DiffLine[] => {
    const lines: DiffLine[] = []
    let oldLine = 0
    let newLine = 0

    for (const line of diff.split('\n')) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+).*\+(\d+)/)
        if (match) {
          oldLine = parseInt(match[1]) - 1
          newLine = parseInt(match[2]) - 1
        }
        lines.push({ type: 'header', content: line })
      } else if (line.startsWith('+')) {
        newLine++
        lines.push({ type: 'add', content: line, newLine })
      } else if (line.startsWith('-')) {
        oldLine++
        lines.push({ type: 'remove', content: line, oldLine })
      } else if (line.startsWith(' ')) {
        oldLine++
        newLine++
        lines.push({ type: 'context', content: line, oldLine, newLine })
      } else {
        lines.push({ type: 'context', content: line })
      }
    }

    return lines
  }

  // Load diff when active file changes
  useEffect(() => {
    const loadDiff = async () => {
      if (!activeFile || !selectedWorktree || activeView !== 'changes') return

      setLoadingDiff(true)
      try {
        const diff: string = await invoke('get_diff', {
          worktreePath: selectedWorktree.path,
          filePath: activeFile
        })
        setDiffContent(parseDiff(diff))
      } catch (error) {
        console.error('Failed to load diff:', error)
        setDiffContent([])
      } finally {
        setLoadingDiff(false)
      }
    }

    loadDiff()
  }, [activeFile, selectedWorktree, activeView])

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages, streamingContent])

  const handleTabClick = async (tabId: string) => {
    setActiveTab(tabId)

    // If opencode tab and server not running, start it
    if (tabId === 'codex' && selectedWorktree) {
      const server = getOpencodeServer(selectedWorktree.path)
      if (!server?.isRunning && !server?.isInitializing) {
        const worktreeName = getWorktreeNameFromPath(selectedWorktree.path)
        await startOpencodeServer(selectedWorktree.path, worktreeName)
      }
    }

    // Check if terminal exists for this agent
    const existingTerminal = terminals.find(t => t.agent_type === tabId)
    if (existingTerminal) {
      setActiveTerminal(existingTerminal.id)
    } else if (selectedWorktree) {
      // Create new terminal for this agent
      const agentInfo = AGENT_TABS.find(t => t.id === tabId)
      if (agentInfo) {
        const newTerminal = {
          id: `${tabId}_${Date.now()}`,
          worktree_path: selectedWorktree.path,
          agent_type: tabId,
          name: `${agentInfo.name} - ${selectedWorktree.branch?.replace('refs/heads/', '') || 'detached'}`,
        }
        addTerminal(newTerminal)
      }
    }
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    const terminal = terminals.find(t => t.agent_type === tabId)
    if (terminal) {
      removeTerminal(terminal.id)
    }
  }

  const handleSubmitCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || !selectedWorktree || !currentServer?.isRunning) {
      console.log('Cannot send message:', { command: !!command.trim(), selectedWorktree: !!selectedWorktree, serverRunning: currentServer?.isRunning })
      return
    }

    if (!currentServer.sessionId) {
      console.error('No session ID available')
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Error: No active session. Please restart the server.',
        timestamp: new Date()
      }
      addAgentMessage(selectedWorktree.path, errorMessage)
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: command.trim(),
      timestamp: new Date()
    }

    addAgentMessage(selectedWorktree.path, userMessage)
    clearStreamingMessages(selectedWorktree.path)
    setCommand('')
    setAgentIsSending(selectedWorktree.path, true)
    setAgentStreamingContent(selectedWorktree.path, '')

    try {
      console.log('Sending message to session:', currentServer.sessionId)
      console.log('Server:', currentServer.hostname, currentServer.port)

      // Extract provider and model IDs from "providerId/modelId" format
      const [providerId, modelId] = selectedModel ? selectedModel.split('/') : ['', '']
      console.log('Using provider ID:', providerId, 'model ID:', modelId)

      // Send message asynchronously and rely on SSE for streaming response
      await invoke('send_opencode_message_async', {
        hostname: currentServer.hostname,
        port: currentServer.port,
        sessionId: currentServer.sessionId,
        message: userMessage.content,
        providerId: providerId || null,
        modelId: modelId || null,
      })

      console.log('Message sent, waiting for SSE events...')
      // Don't set isSending to false here - SSE events will handle the response
    } catch (error) {
      console.error('Failed to send message:', error)
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date()
      }
      if (selectedWorktree) {
        addAgentMessage(selectedWorktree.path, errorMessage)
      }
      setAgentIsSending(selectedWorktree.path, false)
    }
  }

  const handleAnswerQuestion = async (label: string) => {
    if (!pendingQuestion || !selectedWorktree || !currentServer?.isRunning) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: label,
      timestamp: new Date()
    }

    addAgentMessage(selectedWorktree.path, userMessage)
    setPendingQuestion(null)
    clearStreamingMessages(selectedWorktree.path)
    setAgentIsSending(selectedWorktree.path, true)
    setAgentStreamingContent(selectedWorktree.path, '')

    try {
      await invoke('reply_question', {
        hostname: currentServer.hostname,
        port: currentServer.port,
        questionId: pendingQuestion.id,
        answer: label,
      })
    } catch (error) {
      console.error('Failed to answer question:', error)
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to answer question'}`,
        timestamp: new Date()
      }
      if (selectedWorktree) {
        addAgentMessage(selectedWorktree.path, errorMessage)
      }
      setAgentIsSending(selectedWorktree.path, false)
    }
  }

  const activeAgent = AGENT_INFO[activeTab]

  // Get file extension for icon
  const getFileExtension = (path: string) => {
    const parts = path.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : ''
  }

  // Get filename from path
  const getFileName = (path: string) => {
    const parts = path.split('/')
    return parts[parts.length - 1]
  }

  const addedCount = diffContent.filter(l => l.type === 'add').length
  const removedCount = diffContent.filter(l => l.type === 'remove').length

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a0a] border-r border-[#1a1a1a] min-w-0">
      {/* Agent Tabs */}
      <div className="h-12 flex items-center px-4 gap-1 border-b border-[#1a1a1a]">
        {AGENT_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const hasActiveTerminal = terminals.some(t => t.agent_type === tab.id)

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 text-sm transition-all",
                isActive ? "text-[#e0e0e0]" : "text-[#6b6b6b] hover:text-[#9b9b9b]"
              )}
            >
              {/* Active Indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d97757]"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}

              <span style={{ color: isActive ? tab.color : undefined }}>{tab.icon}</span>
              <span>{tab.name}</span>

              {hasActiveTerminal && (
                <button
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className="ml-1 p-0.5 hover:bg-[#2a2a2a] rounded text-[#6b6b6b] hover:text-[#e0e0e0]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </button>
          )
        })}
      </div>

      {/* View Tabs */}
      <div className="h-10 flex items-center px-4 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveView('console')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm transition-all rounded-md",
              activeView === 'console'
                ? "bg-[#1a1a1a] text-[#e0e0e0]"
                : "text-[#6b6b6b] hover:text-[#9b9b9b] hover:bg-[#111111]"
            )}
          >
            <Terminal className="w-4 h-4" />
            <span>Console</span>
          </button>
          <button
            onClick={() => setActiveView('changes')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm transition-all rounded-md",
              activeView === 'changes'
                ? "bg-[#1a1a1a] text-[#e0e0e0]"
                : "text-[#6b6b6b] hover:text-[#9b9b9b] hover:bg-[#111111]"
            )}
          >
            <FileCode className="w-4 h-4" />
            <span>Changes</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeView === 'console' ? (
          // Console View
          !selectedWorktree ? (
            <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
              <Robot className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Select a worktree to start an agent</p>
            </div>
          ) : !currentServer?.isRunning ? (
            <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto bg-[#1a1a1a] rounded-lg flex items-center justify-center">
                  {currentServer?.isInitializing ? (
                    <div className="w-10 h-10 border-2 border-[#2a2a2a] border-t-[#9b9b9b] rounded-full animate-spin" />
                  ) : (
                    <Command className="w-10 h-10 text-[#9b9b9b]" />
                  )}
                </div>
                <div>
                  <p className="text-lg font-medium text-[#9b9b9b]">{activeAgent.subtitle}</p>
                  <p className="text-sm text-[#6b6b6b]">
                    {currentServer?.isInitializing ? 'Starting server...' : activeAgent.model}
                  </p>
                </div>
                {currentServer?.error && (
                  <p className="text-xs text-[#f87171]">{currentServer.error}</p>
                )}
                {!currentServer?.isInitializing && (
                  <button
                    onClick={() => {
                      const worktreeName = getWorktreeNameFromPath(selectedWorktree.path)
                      startOpencodeServer(selectedWorktree.path, worktreeName)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-md text-sm text-[#9b9b9b] transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Server</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* Messages Area */}
              <div ref={terminalRef} className="flex-1 overflow-auto p-4 space-y-4">
                {agentMessages.length === 0 && Object.keys(streamingMessages).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
                    <Command className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-sm">Send a message to start the conversation</p>
                  </div>
                ) : (
                  <>
                    {agentMessages.map((message: Message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          message.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        {message.role === 'assistant' && (
                          <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center flex-shrink-0">
                            <Command className="w-4 h-4 text-[#9b9b9b]" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "max-w-[80%] px-4 py-2 rounded-lg text-sm",
                            message.role === 'user'
                              ? "bg-[#d97757] text-white"
                              : "bg-[#1a1a1a] text-[#e0e0e0]"
                          )}
                        >
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          <span className="text-xs opacity-50 mt-1 block">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                    {/* Streaming messages by messageID */}
                    {Object.values(streamingMessages).map((message: Message) => (
                      <div
                        key={message.messageId || message.id}
                        className="flex gap-3 justify-start"
                      >
                        <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center flex-shrink-0">
                          <Command className="w-4 h-4 text-[#9b9b9b]" />
                        </div>
                        <div className="bg-[#1a1a1a] px-4 py-2 rounded-lg max-w-[80%]">
                          {message.toolCall ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[#d97757] uppercase font-mono">{message.toolCall.tool}</span>
                                <span className={cn(
                                  "text-xs px-1.5 py-0.5 rounded",
                                  message.toolCall.status === 'running' ? "bg-[#3a3a2a] text-[#d97757]" :
                                  message.toolCall.status === 'completed' ? "bg-[#2a3a2a] text-[#57d977]" :
                                  "bg-[#2a2a2a] text-[#9b9b9b]"
                                )}>
                                  {message.toolCall.status}
                                </span>
                              </div>
                              {message.toolCall.input && Object.keys(message.toolCall.input).length > 0 && (
                                <pre className="text-xs text-[#6b6b6b] font-mono overflow-x-auto">
                                  {JSON.stringify(message.toolCall.input, null, 2)}
                                </pre>
                              )}
                            </div>
                          ) : message.content ? (
                            <p className="whitespace-pre-wrap text-sm text-[#e0e0e0]">{message.content}</p>
                          ) : (
                            <div className="w-4 h-4 border-2 border-[#2a2a2a] border-t-[#9b9b9b] rounded-full animate-spin" />
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )
        ) : (
          // Changes View
          !selectedWorktree ? (
            <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
              <FileCode className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Select a worktree to view changes</p>
            </div>
          ) : openFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
              <FileCode className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Select a file from Review Changes to view diff</p>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* File Tabs */}
              <div className="flex items-center border-b border-[#1a1a1a] overflow-x-auto">
                {openFiles.map((file: string) => {
                  const isActive = activeFile === file
                  const fileName = getFileName(file)

                  return (
                    <div
                      key={file}
                      onClick={() => selectedWorktree && setActiveFile(selectedWorktree.path, file)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 text-sm border-r border-[#1a1a1a] min-w-fit cursor-pointer",
                        isActive
                          ? "bg-[#1a1a1a] text-[#e0e0e0]"
                          : "text-[#6b6b6b] hover:text-[#9b9b9b] hover:bg-[#111111]"
                      )}
                    >
                      <span className="truncate max-w-[150px]">{fileName}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          selectedWorktree && closeFile(selectedWorktree.path, file)
                        }}
                        className="p-0.5 hover:bg-[#2a2a2a] rounded text-[#6b6b6b] hover:text-[#e0e0e0]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* File Content */}
              {activeFile ? (
                loadingDiff ? (
                  <div className="flex-1 flex items-center justify-center text-[#6b6b6b]">
                    <div className="animate-spin w-6 h-6 border-2 border-[#2a2a2a] border-t-[#d97757] rounded-full" />
                  </div>
                ) : (
                  <>
                    {/* File Header */}
                    <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0f0f0f]">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium px-2 py-0.5 bg-[#1a1a1a] rounded text-[#6b6b6b]">
                          {getFileExtension(activeFile)}
                        </span>
                        <span className="text-sm text-[#e0e0e0] font-medium">
                          {activeFile}
                        </span>
                        <span className="text-xs text-[#d97757] border border-[#d97757]/30 px-1.5 py-0.5 rounded">
                          M
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Zoom Controls */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDiffZoom(z => Math.max(50, z - 10))}
                            className="px-2 py-1 text-xs bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded text-[#9b9b9b] transition-colors"
                            title="Zoom out"
                          >
                            −
                          </button>
                          <span className="text-xs text-[#6b6b6b] w-10 text-center">{diffZoom}%</span>
                          <button
                            onClick={() => setDiffZoom(z => Math.min(200, z + 10))}
                            className="px-2 py-1 text-xs bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded text-[#9b9b9b] transition-colors"
                            title="Zoom in"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-[#4ade80]">
                            +{addedCount}
                          </span>
                          <span className="flex items-center gap-1 text-[#f87171]">
                            -{removedCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Diff Content with Inline Comments - Single scroll container */}
                    <div className="flex-1 bg-[#0a0a0a] overflow-hidden">
                      {selectedWorktree && activeFile && (
                        <InlineDiffViewer
                          diffContent={diffContent}
                          filePath={activeFile}
                          zoom={diffZoom}
                          comments={getFileComments(selectedWorktree.path, activeFile)}
                          onAddComment={(lineNumber: number, content: string) => {
                            const newComment: FileComment = {
                              id: `comment-${Date.now()}`,
                              filePath: activeFile,
                              lineNumber,
                              author: 'user',
                              content,
                              timestamp: new Date(),
                              resolved: false,
                            }
                            addComment(selectedWorktree.path, newComment)
                          }}
                          onResolveComment={(commentId: string) => {
                            resolveComment(selectedWorktree.path, activeFile, commentId)
                          }}
                          onDeleteComment={(commentId: string) => {
                            removeComment(selectedWorktree.path, activeFile, commentId)
                          }}
                        />
                      )}
                    </div>
                  </>
                )
              ) : (
                <div className="flex-1 flex items-center justify-center text-[#5b5b5b]">
                  <p className="text-sm">Select a file tab to view</p>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Bottom Panel - Command Input */}
      {activeView === 'console' && selectedWorktree && currentServer?.isRunning && (
        <div className="border-t border-[#1a1a1a] p-4 space-y-3">
          {/* Provider & Model Selectors */}
          {availableProviders.length > 0 ? (
            <div className="flex items-center gap-4">
              {/* Provider Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6b6b6b]">Provider:</span>
                <select
                  value={selectedProviderId || ''}
                  onChange={(e) => {
                    const providerId = e.target.value
                    if (providerId && selectedWorktree) {
                      // Get first model from selected provider
                      const provider = availableProviders.find(p => p.id === providerId)
                      const firstModelKey = provider ? Object.keys(provider.models)[0] : ''
                      if (firstModelKey) {
                        setAgentSelectedModel(selectedWorktree.path, `${providerId}/${firstModelKey}`)
                      }
                    }
                  }}
                    className="bg-[#111111] text-[#9b9b9b] text-xs px-3 py-1.5 rounded-sm border border-[#1a1a1a] focus:border-[#5b5b5b] outline-none font-mono uppercase tracking-wider appearance-none cursor-pointer hover:border-[#3a3a3a] transition-colors"
                >
                  <option value="">Select provider...</option>
                  {availableProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model Dropdown */}
              {selectedProviderId && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#6b6b6b]">Model:</span>
                  <select
                    value={selectedModel || ''}
                    onChange={(e) => {
                      if (selectedWorktree) {
                        setAgentSelectedModel(selectedWorktree.path, e.target.value || undefined)
                      }
                    }}
                  className="bg-[#111111] text-[#9b9b9b] text-xs px-3 py-1.5 rounded-sm border border-[#1a1a1a] focus:border-[#5b5b5b] outline-none font-mono uppercase tracking-wider appearance-none cursor-pointer hover:border-[#3a3a3a] transition-colors"
                  >
                    {selectedProviderId && availableProviders
                      .find(p => p.id === selectedProviderId)
                      ?.models && Object.entries(
                        availableProviders.find(p => p.id === selectedProviderId)!.models
                      ).map(([modelId, model]) => (
                        <option key={modelId} value={`${selectedProviderId}/${modelId}`}>
                          {model.name || modelId}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-[#6b6b6b]">
              No providers available. Check console for errors.
            </div>
          )}
          {pendingQuestion && (
            <div className="px-4 py-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-[#d97757] uppercase font-mono">Question</span>
                {pendingQuestion.header && (
                  <span className="text-xs text-[#6b6b6b]">— {pendingQuestion.header}</span>
                )}
              </div>
              <p className="text-sm text-[#e0e0e0] mb-3">{pendingQuestion.question}</p>
              <div className="flex flex-col gap-2">
                {pendingQuestion.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswerQuestion(option.label)}
                    className="text-left px-3 py-2 bg-[#111111] hover:bg-[#2a2a2a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded text-sm transition-colors"
                  >
                    <span className="text-[#d97757] font-mono">{option.label}</span>
                    {option.description && (
                      <p className="text-xs text-[#6b6b6b] mt-1">{option.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={handleSubmitCommand} className="relative">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#111111] border border-[#1a1a1a] rounded-lg focus-within:border-[#2a2a2a]">
              <span className="text-[#6b6b6b]">›</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Type a message to opencode..."
                className="flex-1 bg-transparent text-[#e0e0e0] placeholder-[#5b5b5b] outline-none text-sm"
                disabled={!currentServer?.isRunning || isSending}
              />
              <button
                type="submit"
                disabled={!command.trim() || !currentServer?.isRunning || isSending}
                className="p-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed rounded text-[#9b9b9b] transition-colors"
              >
                {isSending ? (
                  <div className="w-4 h-4 border-2 border-[#2a2a2a] border-t-[#9b9b9b] rounded-full animate-spin" />
                ) : (
                  <Command className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}