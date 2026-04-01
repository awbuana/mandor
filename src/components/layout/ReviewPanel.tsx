import { useAppStore } from '@/stores/appStore'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitCommit as GitCommitIcon
} from '@phosphor-icons/react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { invoke } from '@/lib/invokeLogger'
import { FileStatus, FileComment, GitCommit as GitCommitType } from '@/types'
import { cn } from '@/lib/utils'

interface FileChange {
  id: string
  path: string
  added: number
  removed: number
  status: 'added' | 'removed' | 'modified' | 'untracked'
  type: 'file' | 'folder'
  children?: FileChange[]
  expanded?: boolean
}

function buildFileTree(files: { path: string; status: FileChange['status']; fileStatus?: FileStatus }[]): FileChange[] {
  const root: FileChange[] = []
  const folderMap = new Map<string, FileChange>()

  // Sort files by path depth
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))

  for (const file of sortedFiles) {
    const parts = file.path.split('/')
    let currentPath = ''
    let parent: FileChange | null = null

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLast = i === parts.length - 1

      if (isLast) {
        // This is a file
        const fileChange: FileChange = {
          id: currentPath,
          path: part,
          added: file.status === 'added' ? 1 : 0,
          removed: file.status === 'removed' ? 1 : 0,
          status: file.status,
          type: 'file',
        }

        if (parent) {
          parent.children = parent.children || []
          parent.children.push(fileChange)
        } else {
          root.push(fileChange)
        }
      } else {
        // This is a folder
        if (!folderMap.has(currentPath)) {
          const folder: FileChange = {
            id: currentPath,
            path: part,
            added: 0,
            removed: 0,
            status: 'modified',
            type: 'folder',
            children: [],
          }
          folderMap.set(currentPath, folder)

          if (parent) {
            parent.children = parent.children || []
            parent.children.push(folder)
          } else {
            root.push(folder)
          }
        }
        parent = folderMap.get(currentPath)!
      }
    }
  }

  // Calculate folder stats from children
  const calculateFolderStats = (item: FileChange): { added: number; removed: number } => {
    if (item.type === 'file') {
      return { added: item.added, removed: item.removed }
    }

    let added = 0
    let removed = 0
    if (item.children) {
      for (const child of item.children) {
        const stats = calculateFolderStats(child)
        added += stats.added
        removed += stats.removed
      }
    }
    item.added = added
    item.removed = removed
    return { added, removed }
  }

  for (const item of root) {
    calculateFolderStats(item)
  }

  return root
}

export function ReviewPanel() {
  const { selectedWorktree, worktreeStatus, setWorktreeStatus, openFile, getAllComments, resolveComment, removeComment, getOpencodeServer, setActiveView } = useAppStore()
  const [commitMessage, setCommitMessage] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commentsExpanded, setCommentsExpanded] = useState(true)
  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [changesExpanded, setChangesExpanded] = useState(true)
  const [isPushing, setIsPushing] = useState(false)
  const [gitLog, setGitLog] = useState<GitCommitType[]>([])
  const [gitLogExpanded, setGitLogExpanded] = useState(true)
  const [implementWarning, setImplementWarning] = useState(false)

  const worktreePathRef = useRef<string | null>(null)

  // Load worktree status and git log when selected worktree changes
  useEffect(() => {
    const currentPath = selectedWorktree?.path || null
    worktreePathRef.current = currentPath

    if (!selectedWorktree) {
      setIsLoading(false)
      return
    }

    const loadData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const status = await invoke('get_worktree_status', {
          worktreePath: currentPath
        })
        if (worktreePathRef.current !== currentPath) return
        setWorktreeStatus(currentPath!, status as any)
      } catch (err) {
        if (worktreePathRef.current !== currentPath) return
        console.error('Failed to load worktree status:', err)
        setError('Failed to load changes')
      }

      try {
        const log = await invoke('get_git_log', {
          worktreePath: currentPath,
          limit: 50
        })
        if (worktreePathRef.current !== currentPath) return
        setGitLog(log as GitCommitType[])
      } catch (err) {
        if (worktreePathRef.current !== currentPath) return
        console.error('Failed to load git log:', err)
      }

      if (worktreePathRef.current === currentPath) {
        setIsLoading(false)
      }
    }

    loadData()

    return () => {
      worktreePathRef.current = null
    }
  }, [selectedWorktree?.path, setWorktreeStatus])

  const loadGitLog = useCallback(async () => {
    if (!selectedWorktree) return
    try {
      const log = await invoke('get_git_log', {
        worktreePath: selectedWorktree.path,
        limit: 50
      })
      setGitLog(log as GitCommitType[])
    } catch (err) {
      console.error('Failed to load git log:', err)
    }
  }, [selectedWorktree?.path])

  const loadWorktreeStatus = useCallback(async () => {
    if (!selectedWorktree) return

    setIsLoading(true)
    setError(null)

    try {
      const status = await invoke('get_worktree_status', {
        worktreePath: selectedWorktree.path
      })
      setWorktreeStatus(selectedWorktree.path, status as any)
    } catch (err) {
      console.error('Failed to load worktree status:', err)
      setError('Failed to load changes')
    } finally {
      setIsLoading(false)
    }
  }, [selectedWorktree?.path, setWorktreeStatus])

  const status = selectedWorktree ? worktreeStatus[selectedWorktree.path] : null

  // Build file trees for staged and unstaged changes
  const { stagedTree, changesTree } = useMemo(() => {
    if (!status) return { stagedTree: [], changesTree: [] }

    const stagedFiles: { path: string; status: FileChange['status'] }[] = [
      ...status.staged.map(f => ({ path: f.path, status: 'added' as const })),
    ]

    const changesFiles: { path: string; status: FileChange['status'] }[] = [
      ...status.modified.map(f => ({ path: f.path, status: 'modified' as const })),
      ...status.untracked.map(p => ({ path: p, status: 'untracked' as const })),
    ]

    return {
      stagedTree: buildFileTree(stagedFiles),
      changesTree: buildFileTree(changesFiles),
    }
  }, [status])

  // Auto-expand folders
  useEffect(() => {
    // Only auto-expand when we first load the trees, to not fight user interactions
    if (expandedFolders.size > 0) return;

    const foldersToExpand = new Set<string>()

    const collectFolders = (items: FileChange[], parentPath = '') => {
      for (const item of items) {
        const fullPath = parentPath ? `${parentPath}/${item.path}` : item.path
        if (item.type === 'folder') {
          foldersToExpand.add(fullPath)
          if (item.children) {
            collectFolders(item.children, fullPath)
          }
        }
      }
    }

    collectFolders(stagedTree)
    collectFolders(changesTree)
    setExpandedFolders(foldersToExpand)
  }, [stagedTree, changesTree])

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedFolders(newExpanded)
  }

  const handleStage = async (filePath: string) => {
    if (!selectedWorktree) return
    try {
      await invoke('stage_file', { worktreePath: selectedWorktree.path, filePath })
      await loadWorktreeStatus()
    } catch (err) {
      console.error('Failed to stage file:', err)
    }
  }

  const handleUnstage = async (filePath: string) => {
    if (!selectedWorktree) return
    try {
      await invoke('unstage_file', { worktreePath: selectedWorktree.path, filePath })
      await loadWorktreeStatus()
    } catch (err) {
      console.error('Failed to unstage file:', err)
    }
  }

  const handleStageAll = async () => {
    if (!selectedWorktree || !status) return
    setIsLoading(true)
    try {
      await invoke('stage_all_files', { worktreePath: selectedWorktree.path })
      await loadWorktreeStatus()
    } catch (err) {
      console.error('Failed to stage all files:', err)
      setIsLoading(false)
    }
  }

  const handleUnstageAll = async () => {
    if (!selectedWorktree || !status) return
    setIsLoading(true)
    try {
      await invoke('unstage_all_files', { worktreePath: selectedWorktree.path })
      await loadWorktreeStatus()
    } catch (err) {
      console.error('Failed to unstage all files:', err)
      setIsLoading(false)
    }
  }

  const handleCommit = async () => {
    if (!selectedWorktree || !commitMessage.trim()) return

    try {
      await invoke('commit', {
        worktreePath: selectedWorktree.path,
        message: commitMessage.trim()
      })
      setCommitMessage('')
      loadWorktreeStatus()
      loadGitLog()
    } catch (err) {
      console.error('Failed to commit:', err)
      let errorMessage = 'Failed to commit changes'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = (err as { message?: string }).message || JSON.stringify(err)
      }
      setError(errorMessage)
    }
  }

  const handlePush = async () => {    if (!selectedWorktree) return
    setIsPushing(true)
    setError(null)

    try {
      await invoke('git_push', {
        worktreePath: selectedWorktree.path,
      })
      // Could show a success toast here
    } catch (err) {
      console.error('Failed to push:', err)
      let errorMessage = 'Failed to push commits'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = (err as { message?: string }).message || JSON.stringify(err)
      }
      setError(errorMessage)
    } finally {
      setIsPushing(false)
    }
  }

  // Send a comment as a prompt to the running opencode TUI
  const handleImplement = async (comment: FileComment, filePath: string) => {
    if (!selectedWorktree) return
    const server = getOpencodeServer(selectedWorktree.path)
    if (!server?.isRunning) {
      setImplementWarning(true)
      setTimeout(() => setImplementWarning(false), 4000)
      return
    }

    const lineRef = comment.lineNumber ? `:${comment.lineNumber}` : ''
    const prompt = `Address this feedback in ${filePath}${lineRef}:\n\n${comment.content}`

    try {
      await invoke('tui_append_prompt', {
        hostname: server.hostname,
        port: server.port,
        text: prompt,
      })
      await invoke('tui_submit_prompt', {
        hostname: server.hostname,
        port: server.port,
      })
      // Switch to TUI tab so the user sees the prompt land
      setActiveView('tui')
    } catch (err) {
      console.error('[ReviewPanel] handleImplement failed:', err)
    }
  }

  const getStatusIndicator = (statusType: FileChange['status']) => {
    switch (statusType) {
      case 'added':
        return <span className="text-[#4ade80] font-bold text-[10px]">A</span>
      case 'removed':
        return <span className="text-[#f87171] font-bold text-[10px]">D</span>
      case 'untracked':
        return <span className="text-[#6a9bcc] font-bold text-[10px]">U</span>
      default:
        return <span className="text-[#d97757] font-bold text-[10px]">M</span>
    }
  }

  const renderFileChange = useCallback((item: FileChange, depth = 0, parentPath = '', isStaged = false): React.ReactNode => {
    const fullPath = parentPath ? `${parentPath}/${item.path}` : item.path
    const isFolder = item.type === 'folder'
    const isExpanded = expandedFolders.has(fullPath)

    // Calculate TUI-style indentation with subtle guide lines
    const indentGuides = Array.from({ length: depth }).map((_, i) => (
      <div key={i} className="w-[12px] h-full border-l border-[#1f1f1f] absolute" style={{ left: `${16 + i * 12}px` }} />
    ))

    if (isFolder) {
      return (
        <div key={fullPath} className="relative">
          {indentGuides}
          <button
            onClick={() => toggleFolder(fullPath)}
            className="w-full flex items-center gap-2 py-1.5 hover:bg-[#111] transition-colors group relative z-10"
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            <span className={cn(
              "text-[9px] font-mono w-3 flex justify-center",
              isExpanded ? "text-[#a0a0a0]" : "text-[#6b6b6b]"
            )}>
              {isExpanded ? '▾' : '▸'}
            </span>
            <span className={cn(
              "flex-1 text-left text-[10px] truncate font-mono tracking-tight",
              isExpanded ? "text-[#c0c0c0]" : "text-[#8b8b8b]"
            )}>
              {item.path}
            </span>
            {(item.added > 0 || item.removed > 0) && (
              <div className="flex items-center gap-1.5 text-[9px] font-mono opacity-80 pr-3">
                {item.added > 0 && <span className="text-[#4ade80]">+{item.added}</span>}
                {item.removed > 0 && <span className="text-[#f87171]">-{item.removed}</span>}
              </div>
            )}
          </button>

          {isExpanded && item.children?.map(child => renderFileChange(child, depth + 1, fullPath, isStaged))}
        </div>
      )
    }

    const handleFileClick = () => {
      if (selectedWorktree) {
        openFile(selectedWorktree.path, fullPath)
      }
    }

    return (
      <div
        key={fullPath}
        className="group flex items-center py-1 hover:bg-[#111] transition-colors relative cursor-pointer"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onClick={handleFileClick}
      >
        {indentGuides}

        {/* State icon / Button wrapper */}
        <div className="w-5 flex items-center justify-center relative z-10 mr-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              isStaged ? handleUnstage(fullPath) : handleStage(fullPath)
            }}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-[#111] text-[10px] font-mono transition-opacity z-20"
            title={isStaged ? 'Unstage file' : 'Stage file'}
          >
            {isStaged ? (
              <span className="text-[#f87171] hover:text-[#ff9999] hover:scale-110 transition-transform">−</span>
            ) : (
              <span className="text-[#4ade80] hover:text-[#77f797] hover:scale-110 transition-transform">+</span>
            )}
          </button>
          <span className="group-hover:opacity-0 transition-opacity flex items-center justify-center z-10 absolute inset-0">
            {getStatusIndicator(item.status)}
          </span>
        </div>

        <div className="flex-1 flex items-center gap-2 relative z-10 min-w-0 pr-3">
          <span className={cn(
            "text-[10px] truncate font-mono tracking-tight",
            isStaged ? "text-[#a0a0a0]" : "text-[#8b8b8b]",
            item.status === 'added' && "text-[#4ade80]/90",
            item.status === 'removed' && "text-[#f87171]/90",
            item.status === 'untracked' && "text-[#6a9bcc]/90"
          )}>
            {item.path}
          </span>
        </div>
      </div>
    )
  }, [expandedFolders, selectedWorktree, openFile])

  const stagedCount = status?.staged.length || 0
  const changesCount = (status?.modified.length || 0) + (status?.untracked.length || 0)
  const hasStagedFiles = stagedCount > 0
  const hasChanges = changesCount > 0

  if (!selectedWorktree) {
    return (
      <div className="w-80 h-full bg-[#0a0a0a] flex flex-col font-mono border-l border-[#1a1a1a]">
        <div className="h-10 flex items-center justify-between px-3 py-2 bg-[#111111] border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <span className="text-[#d97757]">⌥</span>
            <span className="text-xs text-[#6b6b6b] uppercase tracking-wider">source_control</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-[#3a3a3a]">
          <GitCommitIcon className="w-8 h-8 mb-3 opacity-20" />
          <p className="text-[10px] font-mono italic">~ no worktree selected</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="w-80 h-full bg-[#0a0a0a] flex flex-col font-mono border-l border-[#1a1a1a]"
    >
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 py-2 bg-[#111111] border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <span className="text-[#d97757]">⌥</span>
          <span className="text-xs text-[#6b6b6b] uppercase tracking-wider">source_control</span>
        </div>
        <span className="text-xs text-[#6b6b6b]">[{status?.commit.slice(0, 7) || '.......'}]</span>
      </div>

      {/* Commit Section */}
      <div className="p-3 space-y-3 border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="relative group">
          <div className="absolute left-2.5 top-[9px] text-[#5b5b5b] font-mono text-[10px] group-focus-within:text-[#4ade80] transition-colors pointer-events-none">
            $
          </div>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="commit message..."
            rows={2}
            className="w-full pl-6 pr-3 py-2 bg-[#111111] border border-[#1a1a1a] group-focus-within:border-[#d97757]/50 text-xs text-[#e0e0e0] placeholder-[#5b5b5b] outline-none font-mono resize-none transition-colors"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handlePush}
            disabled={isLoading || isPushing}
            className="flex-1 px-3 py-1.5 bg-[#111111] hover:bg-[#1a1a1a] border border-[#1a1a1a] text-[#9b9b9b] text-xs transition-colors disabled:opacity-50 text-center"
            title="Push commits to remote"
          >
            {isPushing ? '[ Pushing... ]' : '[ Push ]'}
          </button>
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || !hasStagedFiles || isLoading}
            className="flex-1 px-3 py-1.5 bg-[#d97757]/10 hover:bg-[#d97757]/20 border border-[#d97757]/30 text-[#d97757] text-xs transition-colors disabled:opacity-50 text-center"
          >
            [ Commit ]
          </button>
        </div>

        {error && (
          <div className="border-l-2 border-[#f87171] pl-3 py-1 mt-2">
            <p className="text-xs text-[#f87171]">{error}</p>
          </div>
        )}
      </div>

      {/* Scrollable sections container */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

      {/* Staged Changes Section */}
      <div className="flex flex-col">
        <div className="sticky top-0 z-10 bg-[#0a0a0a]">
          <button
            onClick={() => setStagedExpanded(!stagedExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#111] transition-colors border-b border-[#1a1a1a] group font-mono"
          >
            <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
              <span>[{stagedExpanded ? '-' : '+'}]</span>
              <span className={stagedExpanded ? "text-[#e0e0e0]" : ""}>STAGED</span>
              {stagedCount > 0 && (
                <span className="text-[#4ade80]">({stagedCount})</span>
              )}
            </div>
          </button>
          {stagedCount > 0 && (
            <div className="absolute right-4 top-0 bottom-0 flex items-center font-mono">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleUnstageAll()
                }}
                className="text-xs text-[#5b5b5b] hover:text-[#f87171] transition-colors"
                title="Unstage all"
              >
                [-all]
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {stagedExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {isLoading ? (
                <div className="flex items-center justify-center h-16 text-[#6b6b6b]">
                  <span className="text-[10px] font-mono animate-pulse">loading...</span>
                </div>
              ) : !hasStagedFiles ? (
                <div className="px-6 py-3 text-[10px] text-[#5b5b5b] font-mono italic">
                  // empty
                </div>
              ) : (
                <div className="py-2">
                  {stagedTree.map(item => renderFileChange(item, 0, '', true))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Changes Section (Unstaged) */}
      <div className="flex flex-col border-t border-[#1a1a1a]">
        <div className="sticky top-0 z-10 bg-[#0a0a0a]">
          <button
            onClick={() => setChangesExpanded(!changesExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#111] transition-colors border-b border-[#1a1a1a] group font-mono"
          >
            <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
              <span>[{changesExpanded ? '-' : '+'}]</span>
              <span className={changesExpanded ? "text-[#e0e0e0]" : ""}>CHANGES</span>
              {changesCount > 0 && (
                <span className="text-[#6a9bcc]">({changesCount})</span>
              )}
            </div>
          </button>
          {changesCount > 0 && (
            <div className="absolute right-4 top-0 bottom-0 flex items-center font-mono">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleStageAll()
                }}
                className="text-xs text-[#5b5b5b] hover:text-[#4ade80] transition-colors"
                title="Stage all"
              >
                [+all]
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {changesExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {isLoading ? (
                <div className="flex items-center justify-center h-16 text-[#6b6b6b]">
                  <span className="text-[10px] font-mono animate-pulse">loading...</span>
                </div>
              ) : !hasChanges ? (
                <div className="px-6 py-3 text-[10px] text-[#5b5b5b] font-mono italic">
                  // working tree clean
                </div>
              ) : (
                <div className="py-2">
                  {changesTree.map(item => renderFileChange(item, 0, '', false))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Comments Section */}
      {selectedWorktree && (
        <div className="flex flex-col border-t border-[#1a1a1a]">
          <div className="sticky top-0 z-10 bg-[#0a0a0a]">
            <button
              onClick={() => setCommentsExpanded(!commentsExpanded)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#111] transition-colors border-b border-[#1a1a1a] group font-mono"
            >
              <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
                <span>[{commentsExpanded ? '-' : '+'}]</span>
                <span className={commentsExpanded ? "text-[#e0e0e0]" : ""}>COMMENTS</span>
                {(() => {
                  const allComments = getAllComments(selectedWorktree.path)
                  const unresolvedCount = allComments.filter(c => !c.resolved).length
                  return unresolvedCount > 0 && (
                    <span className="text-[#d97757]">({unresolvedCount})</span>
                  )
                })()}
              </div>
            </button>
          </div>

          <AnimatePresence>
            {commentsExpanded && selectedWorktree && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <AnimatePresence>
                  {implementWarning && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="mx-4 mt-2 px-2 py-1.5 border-l-2 border-[#d97757] text-xs text-[#d97757] font-mono">
                        Start OpenCode first from the TUI tab
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="px-4 py-2">
                  {(() => {
                    const allComments = getAllComments(selectedWorktree.path)
                    if (allComments.length === 0) {
                      return (
                        <div className="px-2 py-1 text-[10px] text-[#5b5b5b] font-mono italic">
                          // empty
                        </div>
                      )
                    }

                    // Group comments by file
                    const commentsByFile = allComments.reduce((acc, comment) => {
                      if (!acc[comment.filePath]) {
                        acc[comment.filePath] = []
                      }
                      acc[comment.filePath].push(comment)
                      return acc
                    }, {} as Record<string, FileComment[]>)

                      return Object.entries(commentsByFile).map(([filePath, comments]) => {

                      return (
                      <div key={filePath} className="mb-3">
                        {/* File path header */}
                        <div className="flex items-center gap-1 mb-1.5">
                          <span className="text-[#3a3a3a] text-xs">├</span>
                          <button
                            onClick={() => openFile(selectedWorktree.path, filePath)}
                            className="text-xs text-[#6a9bcc] hover:text-[#8ab8dd] truncate text-left font-mono hover:underline"
                          >
                            {filePath}
                          </button>
                        </div>

                        {/* Comments list */}
                        <div className="space-y-1.5 pl-3 border-l border-[#2a2a2a] ml-1">
                          {comments.filter(c => !c.resolved).map((comment) => (
                            <div
                              key={comment.id}
                              className={cn(
                                'group text-xs py-1.5 px-2 bg-[#111111]',
                                'border-l-2',
                                comment.author === 'user'
                                  ? 'border-l-[#d97757]'
                                  : 'border-l-[#6a9bcc]'
                              )}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  'font-mono text-[10px] uppercase',
                                  comment.author === 'user' ? 'text-[#d97757]' : 'text-[#6a9bcc]'
                                )}>
                                  {comment.author === 'user' ? 'YOU' : 'AGENT'}
                                </span>
                                {comment.lineNumber && (
                                  <span className="text-[10px] font-mono text-[#5b5b5b]">
                                    :{comment.lineNumber}
                                  </span>
                                )}
                                <span className="text-[10px] font-mono text-[#4a4a4a] ml-auto">
                                  {new Date(comment.timestamp).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: '2-digit'
                                  })}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleImplement(comment, filePath)}
                                    className="text-[#6a9bcc] hover:text-[#8ab8dd] text-[10px] font-mono"
                                    title="Send to TUI as prompt"
                                  >
                                    [→]
                                  </button>
                                  <button
                                    onClick={() => resolveComment(selectedWorktree.path, filePath, comment.id)}
                                    className="text-[#4ade80] hover:text-[#77f797] text-[10px] font-mono"
                                  >
                                    [✓]
                                  </button>
                                  <button
                                    onClick={() => removeComment(selectedWorktree.path, filePath, comment.id)}
                                    className="text-[#d97757] hover:text-[#f99777] text-[10px] font-mono"
                                  >
                                    [x]
                                  </button>
                                </div>
                              </div>
                              <p className="text-[#a0a0a0] text-xs leading-relaxed font-mono">
                                {comment.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )})
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Git Log Section */}
      {selectedWorktree && (
        <div className="flex flex-col border-t border-[#1a1a1a]">
          <div className="sticky top-0 z-10 bg-[#0a0a0a]">
            <button
              onClick={() => setGitLogExpanded(!gitLogExpanded)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#111] transition-colors border-b border-[#1a1a1a] group font-mono"
            >
              <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
                <span>[{gitLogExpanded ? '-' : '+'}]</span>
                <span className={gitLogExpanded ? "text-[#e0e0e0]" : ""}>HISTORY</span>
              </div>
            </button>
          </div>

          <AnimatePresence>
            {gitLogExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="py-2">
                  {gitLog.length === 0 ? (
                    <div className="px-6 py-1 text-[10px] text-[#5b5b5b] font-mono italic">
                      // empty
                    </div>
                  ) : (
                    gitLog.map((commit, index) => (
                      <div
                        key={commit.hash}
                        className="flex items-start gap-3 px-4 py-2 hover:bg-[#111] transition-colors relative group"
                      >
                        {/* Branch line */}
                        {index < gitLog.length - 1 && (
                          <div className="absolute left-[20px] top-4 bottom-[-8px] w-px bg-[#2a2a2a] group-hover:bg-[#3a3a3a] transition-colors z-0" />
                        )}

                        <div className="flex flex-col items-center pt-1 relative z-10">
                          <div className={cn(
                            'w-2 h-2 rounded-full border-[1.5px] bg-[#0a0a0a]',
                            commit.is_head ? 'border-[#4ade80] shadow-[0_0_4px_rgba(74,222,128,0.5)]' : index === 0 ? 'border-[#6a9bcc]' : 'border-[#5b5b5b]'
                          )} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[#c0c0c0] truncate font-mono">
                            {commit.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1 opacity-70">
                            <span className="text-[9px] text-[#6b6b6b] font-mono font-semibold">
                              {commit.short_hash}
                            </span>
                            <span className="text-[9px] text-[#5b5b5b] italic">
                              {commit.author}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      </div>
      {/* End scrollable sections container */}

    </motion.div>
  )
}