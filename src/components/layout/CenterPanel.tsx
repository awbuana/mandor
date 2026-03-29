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
import { AgentType } from '@/types'
import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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
}

interface StreamEventPayload {
  session_id: string
  event?: string
  data: StreamEventData
}

interface StreamEventData {
  type?: string
  event?: string
  message?: MessageData
  info?: {
    id?: string
    role?: string
  }
  parts?: Array<{
    type?: string
    text?: string
  }>
  content?: string
  text?: string
  delta?: string
}

interface MessageData {
  info?: {
    id?: string
    role?: string
  }
  parts?: Array<{
    type?: string
    text?: string
  }>
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
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<string>('codex')
  const [command, setCommand] = useState('')
  const [diffContent, setDiffContent] = useState<DiffLine[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const terminalRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const unlistenRef = useRef<(() => void) | null>(null)

  // Get server for selected worktree
  const currentServer = selectedWorktree ? getOpencodeServer(selectedWorktree.path) : undefined
  
  // Debug logging
  useEffect(() => {
    if (currentServer) {
      console.log('Current server state:', {
        isRunning: currentServer.isRunning,
        sessionId: currentServer.sessionId,
        port: currentServer.port,
        hostname: currentServer.hostname
      })
    }
  }, [currentServer])

  // Get worktree session (includes files and agent messages)
  const worktreeSession = selectedWorktree 
    ? getWorktreeSession(selectedWorktree.path)
    : { files: { openFiles: [], activeFile: null }, agent: { messages: [], opencodeSession: undefined } }
  const { openFiles, activeFile } = worktreeSession.files
  
  // Get agent messages for selected worktree
  const agentMessages = worktreeSession.agent.messages

  // Setup event listener for streaming
  useEffect(() => {
    if (!currentServer?.isRunning || !currentServer.sessionId) return

    console.log('Setting up event listener for session:', currentServer.sessionId)

    const setupListener = async () => {
      // Start the event stream in background
      invoke('stream_opencode_events', {
        hostname: currentServer.hostname,
        port: currentServer.port,
        sessionId: currentServer.sessionId,
      }).catch(err => {
        console.error('Event stream error:', err)
      })

      // Listen for events
      const unlisten = await listen<StreamEventPayload>('opencode-event', (event) => {
        console.log('Received opencode event:', event.payload)
        
        const { event: eventName, data } = event.payload
        
        // Handle different event types
        if (eventName === 'message.delta' || data?.type === 'delta') {
          // Handle streaming delta content
          const delta = data?.delta || data?.content || data?.text || ''
          if (delta) {
            console.log('Received delta:', delta)
            setStreamingContent(prev => prev + delta)
          }
        } else if (data?.parts && data.parts.length > 0) {
          // Handle complete message parts
          const textContent = data.parts
            .filter((part: {type?: string, text?: string}) => part.type === 'text' || part.type === 'content')
            .map((part: {type?: string, text?: string}) => part.text || '')
            .join('')
          
          if (textContent) {
            console.log('Received message content:', textContent.substring(0, 100))
            setStreamingContent(prev => prev + textContent)
          }
        } else if (data?.content || data?.text) {
          // Handle direct content
          const content = data.content || data.text || ''
          console.log('Received direct content:', content.substring(0, 100))
          setStreamingContent(prev => prev + content)
        }
      })

      unlistenRef.current = unlisten
    }

    setupListener()

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [currentServer?.isRunning, currentServer?.sessionId, currentServer?.hostname, currentServer?.port])

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
    setCommand('')
    setIsSending(true)
    setStreamingContent('')

    try {
      console.log('Sending message to session:', currentServer.sessionId)
      console.log('Server:', currentServer.hostname, currentServer.port)
      
      // Send message and wait for response (synchronous)
      setIsSending(true)
      const response = await invoke('send_opencode_message', {
        hostname: currentServer.hostname,
        port: currentServer.port,
        sessionId: currentServer.sessionId,
        message: userMessage.content
      }) as { info: { id: string, role: string }, parts: Array<{ type: string, text?: string }> }

      console.log('Received response:', response)

      // Extract text content from parts
      const textContent = response.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n')

      if (textContent) {
        const assistantMessage: Message = {
          id: response.info.id || Date.now().toString(),
          role: 'assistant',
          content: textContent,
          timestamp: new Date()
        }
        addAgentMessage(selectedWorktree.path, assistantMessage)
      } else {
        const errorMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'No text content in response.',
          timestamp: new Date()
        }
        addAgentMessage(selectedWorktree.path, errorMessage)
      }
      setIsSending(false)
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
      setIsSending(false)
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
                {agentMessages.length === 0 && !streamingContent ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
                    <Command className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-sm">Send a message to start the conversation</p>
                  </div>
                ) : (
                  agentMessages.map((message: Message) => (
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
                  ))
                )}
                {/* Streaming message */}
                {(isSending || streamingContent) && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Command className="w-4 h-4 text-[#9b9b9b]" />
                    </div>
                    <div className="bg-[#1a1a1a] px-4 py-2 rounded-lg max-w-[80%]">
                      {streamingContent ? (
                        <p className="whitespace-pre-wrap text-sm text-[#e0e0e0]">{streamingContent}</p>
                      ) : (
                        <div className="w-4 h-4 border-2 border-[#2a2a2a] border-t-[#9b9b9b] rounded-full animate-spin" />
                      )}
                    </div>
                  </div>
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
                    <button
                      key={file}
                      onClick={() => selectedWorktree && setActiveFile(selectedWorktree.path, file)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 text-sm border-r border-[#1a1a1a] min-w-fit",
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
                    </button>
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
                      
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-[#4ade80]">
                          +{addedCount}
                        </span>
                        <span className="flex items-center gap-1 text-[#f87171]">
                          -{removedCount}
                        </span>
                      </div>
                    </div>

                    {/* Diff Content */}
                    <div className="flex-1 overflow-auto">
                      <div className="font-mono text-sm">
                        {diffContent.map((line, idx) => (
                          <div key={idx} className="flex hover:bg-[#1a1a1a]/50">
                            {/* Line Numbers */}
                            <div className="flex w-20 text-xs text-[#4a4a4a] select-none bg-[#0f0f0f] border-r border-[#1a1a1a]">
                              <span className="w-10 text-right pr-2 py-0.5">
                                {line.oldLine || ''}
                              </span>
                              <span className="w-10 text-right pr-2 py-0.5">
                                {line.newLine || ''}
                              </span>
                            </div>
                            
                            {/* Content */}
                            <div className={`
                              flex-1 py-0.5 pl-3 pr-4 whitespace-pre
                              ${line.type === 'add' ? 'bg-[#1a3a1a]/30 text-[#4ade80]' : ''}
                              ${line.type === 'remove' ? 'bg-[#3a1a1a]/30 text-[#f87171]' : ''}
                              ${line.type === 'header' ? 'text-[#6b6b6b] bg-[#1a1a1a]/50' : ''}
                              ${line.type === 'context' ? 'text-[#9b9b9b]' : ''}
                            `}>
                              {/* Line indicator */}
                              <span className={`
                                inline-block w-4 mr-2 select-none
                                ${line.type === 'add' ? 'text-[#4ade80]' : ''}
                                ${line.type === 'remove' ? 'text-[#f87171]' : ''}
                                ${line.type === 'context' ? 'text-[#4a4a4a]' : ''}
                              `}>
                                {line.type === 'add' && '+'}
                                {line.type === 'remove' && '-'}
                                {line.type === 'context' && ' '}
                              </span>
                              {line.content.slice(1)}
                            </div>
                          </div>
                        ))}
                      </div>
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
        <div className="border-t border-[#1a1a1a] p-4">
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