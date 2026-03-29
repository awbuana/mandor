import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { 
  X,
  Plus,
  Terminal,
  Square,
  Command,
  Robot,
  Sparkle,
  Diamond,
  Cursor
} from '@phosphor-icons/react'
import { AgentType } from '@/types'
import { useState, useRef } from 'react'
import { TerminalInstance } from '@/components/terminal/TerminalInstance'

type AgentTab = {
  id: string
  type: AgentType
  name: string
  icon: React.ReactNode
  color: string
}

const AGENT_TABS: AgentTab[] = [
  { id: 'claude', type: 'claude', name: 'claude', icon: <Sparkle className="w-4 h-4" />, color: '#d97757' },
  { id: 'codex', type: 'opencode', name: 'codex', icon: <Command className="w-4 h-4" />, color: '#9b9b9b' },
  { id: 'gemini', type: 'claude', name: 'gemini', icon: <Diamond className="w-4 h-4" />, color: '#6a9bcc' },
  { id: 'cursor', type: 'cursor', name: 'cursor', icon: <Cursor className="w-4 h-4" />, color: '#9b9b9b' },
]

// Mock agent info
const AGENT_INFO: Record<string, { version: string; model: string; subtitle: string; path: string }> = {
  claude: { 
    version: 'v2.0.74', 
    model: 'Opus 4.5 · Claude Max', 
    subtitle: 'Claude Code',
    path: '~/.mandor/worktrees/mandor/main'
  },
  codex: { 
    version: 'v1.0.0', 
    model: 'GPT-4 · OpenCode', 
    subtitle: 'OpenCode Agent',
    path: '~/.mandor/worktrees/mandor/main'
  },
  gemini: { 
    version: 'v1.0.0', 
    model: 'Gemini Pro · Google', 
    subtitle: 'Gemini Code',
    path: '~/.mandor/worktrees/mandor/main'
  },
  cursor: { 
    version: 'v0.1.0', 
    model: 'Claude 3.5 · Cursor', 
    subtitle: 'Cursor Agent',
    path: '~/.mandor/worktrees/mandor/main'
  },
}

export function CenterPanel() {
  const { 
    terminals, 
    addTerminal, 
    removeTerminal, 
    setActiveTerminal,
    selectedWorktree 
  } = useAppStore()
  
  const [activeTab, setActiveTab] = useState<string>('claude')
  const [command, setCommand] = useState('')
  const terminalRef = useRef<HTMLDivElement>(null)

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    
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

  const handleSubmitCommand = (e: React.FormEvent) => {
    e.preventDefault()
    if (command.trim()) {
      // In real implementation, this would send to terminal
      setCommand('')
    }
  }

  const activeAgent = AGENT_INFO[activeTab]
  const hasTerminal = terminals.some(t => t.agent_type === activeTab)

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
        
        <button className="flex items-center gap-1 px-3 py-2 text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Terminal Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2 text-[#6b6b6b]">
          <Terminal className="w-4 h-4" />
          <span className="text-sm">TERMINAL</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-[#1a1a1a] rounded text-[#6b6b6b] hover:text-[#9b9b9b]">
            <Square className="w-3.5 h-3.5" />
          </button>
          <button className="p-1.5 hover:bg-[#1a1a1a] rounded text-[#6b6b6b] hover:text-[#9b9b9b]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 overflow-hidden relative">
        {!selectedWorktree ? (
          <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
            <Robot className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">Select a worktree to start an agent</p>
          </div>
        ) : !hasTerminal ? (
          <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-[#1a1a1a] rounded-lg flex items-center justify-center">
                <Sparkle className="w-10 h-10 text-[#d97757]" />
              </div>
              <div>
                <p className="text-lg font-medium text-[#9b9b9b]">{activeAgent.subtitle}</p>
                <p className="text-sm text-[#6b6b6b]">{activeAgent.model}</p>
              </div>
              <p className="text-xs text-[#5b5b5b] font-mono">{activeAgent.path}</p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Agent Info Banner */}
            <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center gap-4">
              <div className="w-10 h-10 bg-[#1a1a1a] rounded-lg flex items-center justify-center">
                <Sparkle className="w-5 h-5 text-[#d97757]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[#e0e0e0] font-medium">{activeAgent.subtitle}</span>
                  <span className="text-xs text-[#6b6b6b]">{activeAgent.version}</span>
                </div>
                <p className="text-sm text-[#6b6b6b]">{activeAgent.model}</p>
              </div>
              <p className="text-xs text-[#5b5b5b] font-mono">{activeAgent.path}</p>
            </div>

            {/* Terminal Output */}
            <div ref={terminalRef} className="flex-1 overflow-auto p-4 font-mono text-sm">
              {terminals
                .filter(t => t.agent_type === activeTab)
                .map(terminal => (
                  <TerminalInstance key={terminal.id} terminal={terminal} />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Command Input */}
      <div className="p-4 border-t border-[#1a1a1a]">
        <form onSubmit={handleSubmitCommand} className="relative">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#111111] border border-[#1a1a1a] rounded-lg focus-within:border-[#2a2a2a]">
            <span className="text-[#6b6b6b]">›</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={`Type a task for ${activeTab}...`}
              className="flex-1 bg-transparent text-[#e0e0e0] placeholder-[#5b5b5b] outline-none text-sm"
              disabled={!selectedWorktree}
            />
            <button
              type="submit"
              disabled={!command.trim() || !selectedWorktree}
              className="p-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed rounded text-[#9b9b9b] transition-colors"
            >
              <Command className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
