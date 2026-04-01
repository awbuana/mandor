import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import {
  FileCode,
  Terminal,
  MonitorPlay,
} from '@phosphor-icons/react'
import { FileComment } from '@/types'
import { InlineDiffViewer } from '@/components/diff/InlineDiffViewer'
import { TerminalView } from '@/components/terminal/TerminalInstance'
import { TuiView } from '@/components/terminal/TUIInstance'
import { useState, useEffect } from 'react'
import { invoke } from '@/lib/invokeLogger'

interface DiffLine {
  type: 'header' | 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

export function CenterPanel() {
  const {
    selectedWorktree,
    worktrees,
    activeView,
    setActiveView,
    getWorktreeSession,
    closeFile,
    setActiveFile,
    addComment,
    removeComment,
    resolveComment,
    getFileComments,
    startedTuiWorktrees,
    tuiPorts,
    startTui,
  } = useAppStore()

  const [diffContent, setDiffContent] = useState<DiffLine[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [diffZoom, setDiffZoom] = useState<number>(50)

  // Port = 9900 + 0-based index of the worktree in the list
  const worktreeIndex = selectedWorktree
    ? worktrees.findIndex((w) => w.path === selectedWorktree.path)
    : -1
  const opencodePort = 9900 + (worktreeIndex >= 0 ? worktreeIndex : 0)

  // Get worktree session (includes files)
  const worktreeSession = selectedWorktree
    ? getWorktreeSession(selectedWorktree.path)
    : { files: { openFiles: [], activeFile: null }, comments: {} }
  const { openFiles, activeFile } = worktreeSession.files

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
      {/* View Tabs */}
      <div className="h-9 flex items-center px-3 border-b border-[#1a1a1a] font-mono">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveView('changes')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] transition-all",
              activeView === 'changes'
                ? "bg-[#1a1a1a] text-[#e0e0e0]"
                : "text-[#6b6b6b] hover:text-[#9b9b9b] hover:bg-[#111111]"
            )}
          >
            <span>[&lt;&gt;]</span>
            <span className="uppercase">Changes</span>
          </button>
          <button
            onClick={() => setActiveView('terminal')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] transition-all",
              activeView === 'terminal'
                ? "bg-[#1a1a1a] text-[#e0e0e0]"
                : "text-[#6b6b6b] hover:text-[#9b9b9b] hover:bg-[#111111]"
            )}
          >
            <span>[&gt;_]</span>
            <span className="uppercase">Terminal</span>
          </button>
          <button
            onClick={() => setActiveView('tui')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] transition-all",
              activeView === 'tui'
                ? "bg-[#1a1a1a] text-[#e0e0e0]"
                : "text-[#6b6b6b] hover:text-[#9b9b9b] hover:bg-[#111111]"
            )}
          >
            <MonitorPlay size={11} />
            <span className="uppercase">TUI</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">

        {/* Terminal View — always mounted once a worktree is selected so PTY session persists across tab switches */}
        {selectedWorktree && (
          <div
            className="absolute inset-0"
            style={{ display: activeView === 'terminal' ? 'block' : 'none' }}
          >
            <TerminalView
              worktreePath={selectedWorktree.path}
              isVisible={activeView === 'terminal'}
            />
          </div>
        )}

        {/* TUI Views — always mounted for all started worktrees so PTY sessions persist across worktree switches */}
        {startedTuiWorktrees.map((wtPath) => (
          <div
            key={wtPath}
            className="absolute inset-0"
            style={{ display: activeView === 'tui' && selectedWorktree?.path === wtPath ? 'block' : 'none' }}
          >
            <TuiView
              worktreePath={wtPath}
              port={tuiPorts[wtPath] || opencodePort}
              isVisible={activeView === 'tui' && selectedWorktree?.path === wtPath}
            />
          </div>
        ))}

        {/* TUI empty states and Start button */}
        {activeView === 'tui' && !selectedWorktree ? (
          <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
            <MonitorPlay className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">Select a worktree to open the TUI</p>
          </div>
        ) : activeView === 'tui' && selectedWorktree && !startedTuiWorktrees.includes(selectedWorktree.path) ? (
          <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b] gap-4">
            <MonitorPlay className="w-12 h-12 opacity-30" />
            <div className="text-center">
              <p className="text-xs font-mono text-[#6b6b6b] mb-1">opencode console</p>
              <p className="text-[10px] font-mono text-[#4a4a4a]">
                port {opencodePort}
              </p>
            </div>
            <button
              onClick={() => {
                startTui(selectedWorktree.path, opencodePort)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#111111] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#d97757]/50 text-[10px] text-[#e0e0e0] transition-all font-mono group"
            >
              <span className="text-[#d97757] opacity-70 group-hover:opacity-100">[</span>
              <span className="group-hover:text-white">Start OpenCode</span>
              <span className="text-[#d97757] opacity-70 group-hover:opacity-100">]</span>
            </button>
          </div>
        ) : null}

        {/* Terminal empty state */}
        {activeView === 'terminal' && !selectedWorktree && (
          <div className="h-full flex flex-col items-center justify-center text-[#5b5b5b]">
            <Terminal className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">Select a worktree to open a terminal</p>
          </div>
        )}

        {/* Changes View */}
        {activeView === 'changes' && (
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
              <div className="flex items-center border-b border-[#1a1a1a] overflow-x-auto font-mono">
                {openFiles.map((file: string) => {
                  const isActive = activeFile === file
                  const fileName = getFileName(file)

                  return (
                    <div
                      key={file}
                      onClick={() => selectedWorktree && setActiveFile(selectedWorktree.path, file)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-[10px] border-r border-[#1a1a1a] min-w-fit cursor-pointer",
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
                        className="text-[9px] text-[#6b6b6b] hover:text-[#e0e0e0] font-mono"
                      >
                        [x]
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
                    <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0f0f0f] font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#1a1a1a] text-[#6b6b6b]">
                          {getFileExtension(activeFile)}
                        </span>
                        <span className="text-[11px] text-[#e0e0e0]">
                          {activeFile}
                        </span>
                        <span className="text-[9px] text-[#d97757]">
                          [M]
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Zoom Controls */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDiffZoom(z => Math.max(50, z - 10))}
                            className="px-1.5 py-0.5 text-[10px] bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#9b9b9b] transition-colors font-mono"
                            title="Zoom out"
                          >
                            [−]
                          </button>
                          <span className="text-[10px] text-[#6b6b6b] w-8 text-center">{diffZoom}%</span>
                          <button
                            onClick={() => setDiffZoom(z => Math.min(200, z + 10))}
                            className="px-1.5 py-0.5 text-[10px] bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#9b9b9b] transition-colors font-mono"
                            title="Zoom in"
                          >
                            [+]
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="text-[#4ade80]">
                            +{addedCount}
                          </span>
                          <span className="text-[#f87171]">
                            −{removedCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Diff Content with Inline Comments */}
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
    </div>
  )
}