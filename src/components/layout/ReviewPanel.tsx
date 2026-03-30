import { useAppStore } from '@/stores/appStore'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  GitBranch,
  FileCode,
  Folder,
  GitCommit as GitCommitIcon
} from '@phosphor-icons/react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
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
  const { selectedWorktree, worktreeStatus, setWorktreeStatus, openFile, getAllComments, resolveComment, removeComment, getOpencodeServer, addAgentMessage, setAgentIsSending } = useAppStore()
  const [commitMessage, setCommitMessage] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commentsExpanded, setCommentsExpanded] = useState(true)
  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [changesExpanded, setChangesExpanded] = useState(true)
  const [implementingFile, setImplementingFile] = useState<string | null>(null)
  const [gitLog, setGitLog] = useState<GitCommitType[]>([])
  const [gitLogExpanded, setGitLogExpanded] = useState(true)

  // Load worktree status and git log when selected worktree changes
  useEffect(() => {
    if (selectedWorktree) {
      loadWorktreeStatus()
      loadGitLog()
    }
  }, [selectedWorktree?.path])

  const loadGitLog = async () => {
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
  }

  const loadWorktreeStatus = async () => {
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
  }

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
    try {
      const allFiles = [...status.modified, ...status.untracked.map(p => ({ path: p, status: '?', staged: false }))]
      for (const file of allFiles) {
        await invoke('stage_file', { worktreePath: selectedWorktree.path, filePath: file.path })
      }
      await loadWorktreeStatus()
    } catch (err) {
      console.error('Failed to stage all files:', err)
    }
  }

  const handleUnstageAll = async () => {
    if (!selectedWorktree || !status) return
    try {
      for (const file of status.staged) {
        await invoke('unstage_file', { worktreePath: selectedWorktree.path, filePath: file.path })
      }
      await loadWorktreeStatus()
    } catch (err) {
      console.error('Failed to unstage all files:', err)
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

  const getStatusIndicator = (statusType: FileChange['status']) => {
    switch (statusType) {
      case 'added':
        return <span className="text-[#4ade80] text-[8px]">[+]</span>
      case 'removed':
        return <span className="text-[#f87171] text-[8px]">[−]</span>
      case 'untracked':
        return <span className="text-[#6a9bcc] text-[8px]">[?]</span>
      default:
        return <span className="text-[#d97757] text-[8px]">[M]</span>
    }
  }

  /**
   * Sends unresolved comments to the opencode agent to implement feedback.
   * Constructs a prompt from user comments and sends it as a chat message.
   */
  const handleImplementFeedback = async (filePath: string, comments: FileComment[]) => {
    if (!selectedWorktree) return

    const server = getOpencodeServer(selectedWorktree.path)
    if (!server?.isRunning || !server.sessionId) {
      console.error('Opencode server not running')
      return
    }

    setImplementingFile(filePath)

    // Build the prompt with all comments for this file
    const unresolvedComments = comments.filter(c => !c.resolved && c.author === 'user')
    if (unresolvedComments.length === 0) {
      setImplementingFile(null)
      return
    }

    // TODO: Improve this prompt to include more context (e.g., file content, surrounding code)
    const promptLines = [
      `Please implement the following feedback for file: ${filePath}`,
      '',
      ...unresolvedComments.map((comment, idx) => {
        const lineInfo = comment.lineNumber ? ` (Line ${comment.lineNumber})` : ''
        return `${idx + 1}.${lineInfo} ${comment.content}`
      }),
      '',
      'Please make the necessary changes to address all these comments.'
    ]

    const prompt = promptLines.join('\n')

    // Add user message to the chat
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: prompt,
      timestamp: new Date()
    }

    addAgentMessage(selectedWorktree.path, userMessage)
    setAgentIsSending(selectedWorktree.path, true)

    try {
      await invoke('send_opencode_message_async', {
        hostname: server.hostname,
        port: server.port,
        sessionId: server.sessionId,
        message: prompt,
        providerId: null,
        modelId: null,
      })
    } catch (error) {
      console.error('Failed to send implementation request:', error)
    } finally {
      setImplementingFile(null)
    }
  }

  const renderFileChange = useCallback((item: FileChange, depth = 0, parentPath = '', isStaged = false): React.ReactNode => {
    const fullPath = parentPath ? `${parentPath}/${item.path}` : item.path
    const isFolder = item.type === 'folder'
    const isExpanded = expandedFolders.has(fullPath)

    if (isFolder) {
      return (
        <div key={fullPath}>
          <button
            onClick={() => toggleFolder(fullPath)}
            className="w-full flex items-center gap-1.5 py-1 hover:bg-[#111111] transition-colors group"
            style={{ paddingLeft: `${12 + depth * 8}px` }}
          >
            <span className="text-[#5b5b5b] text-[10px] font-mono">
              {isExpanded ? '[−]' : '[+]'}
            </span>
            <Folder className="w-3 h-3 text-[#6a9bcc]" />
            <span className="flex-1 text-left text-[10px] text-[#9b9b9b] truncate font-mono">{item.path}</span>
            {(item.added > 0 || item.removed > 0) && (
              <div className="flex items-center gap-1 text-[9px] font-mono">
                {item.added > 0 && <span className="text-[#4ade80]">+{item.added}</span>}
                {item.removed > 0 && <span className="text-[#f87171]">−{item.removed}</span>}
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
        className="group flex items-center gap-1.5 py-1 hover:bg-[#111111] transition-colors"
        style={{ paddingLeft: `${12 + depth * 8}px` }}
      >
        {/* Stage/Unstage Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            isStaged ? handleUnstage(fullPath) : handleStage(fullPath)
          }}
          className="opacity-0 group-hover:opacity-100 text-[9px] font-mono transition-all"
          title={isStaged ? 'Unstage file' : 'Stage file'}
        >
          {isStaged ? (
            <span className="text-[#f87171]">[−]</span>
          ) : (
            <span className="text-[#4ade80]">[+]</span>
          )}
        </button>

        <div
          onClick={handleFileClick}
          className="flex-1 flex items-center gap-1.5 cursor-pointer"
        >
          {getStatusIndicator(item.status)}
          <FileCode className="w-3 h-3 text-[#6b6b6b]" />
          <span className="text-[10px] text-[#a0a0a0] truncate font-mono">{item.path}</span>
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
      <div className="w-80 h-full bg-[#0a0a0a] flex flex-col font-mono">
        <div className="h-10 flex items-center justify-between px-3 border-b border-[#1a1a1a]">
          <span className="text-[11px] text-[#6b6b6b] uppercase tracking-wider">Source Control</span>
          <GitBranch className="w-3.5 h-3.5 text-[#5b5b5b]" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-[#5b5b5b]">
          <GitCommitIcon className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-[10px] font-mono">// select a worktree</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="w-80 h-full bg-[#0a0a0a] flex flex-col font-mono"
    >
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#1a1a1a]">
        <span className="text-[11px] text-[#9b9b9b] uppercase tracking-wider">Source Control</span>
        <div className="flex items-center gap-1.5 text-[#6b6b6b]">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="text-[10px] font-mono">{status?.commit.slice(0, 7) || '...'}</span>
        </div>
      </div>

      {/* Commit Section */}
      <div className="p-2.5 space-y-2 border-b border-[#1a1a1a]">
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={`> commit message (⌘Enter)`}
          className="w-full px-2 py-1.5 bg-[#111111] border border-[#2a2a2a] text-[10px] text-[#e0e0e0] placeholder-[#5b5b5b] outline-none focus:border-[#3a3a3a] font-mono"
        />
        
        <button
          onClick={handleCommit}
          disabled={!commitMessage.trim() || !hasStagedFiles || isLoading}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1a4a8a]/80 hover:bg-[#2a5a9a] disabled:opacity-50 disabled:cursor-not-allowed text-[10px] text-white transition-colors font-mono"
        >
          <span>[</span>
          <span>COMMIT</span>
          <span>]</span>
          {stagedCount > 0 && (
            <span className="text-[9px] text-white/60">({stagedCount})</span>
          )}
        </button>

        {error && (
          <p className="text-[9px] text-[#f87171] font-mono">// {error}</p>
        )}
      </div>

      {/* Staged Changes Section */}
      <div className="border-b border-[#1a1a1a]">
        <button
          onClick={() => setStagedExpanded(!stagedExpanded)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#111111] transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[#5b5b5b] text-[9px] font-mono">
              {stagedExpanded ? '[−]' : '[+]'}
            </span>
            <span className="text-[10px] text-[#9b9b9b] font-mono uppercase">STAGED</span>
            {stagedCount > 0 && (
              <span className="text-[9px] text-[#5b5b5b] font-mono">({stagedCount})</span>
            )}
          </div>
          {stagedCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleUnstageAll()
              }}
              className="text-[9px] text-[#6b6b6b] hover:text-[#9b9b9b] font-mono transition-colors"
              title="Unstage all"
            >
              [−ALL]
            </button>
          )}
        </button>

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
                <div className="px-2.5 py-2 text-[9px] text-[#5b5b5b] font-mono">
                  // no staged changes
                </div>
              ) : (
                <div className="py-0.5">
                  {stagedTree.map(item => renderFileChange(item, 0, '', true))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Changes Section (Unstaged) */}
      <div className="flex-1 overflow-auto">
        <button
          onClick={() => setChangesExpanded(!changesExpanded)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#111111] transition-colors border-b border-[#1a1a1a]"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[#5b5b5b] text-[9px] font-mono">
              {changesExpanded ? '[−]' : '[+]'}
            </span>
            <span className="text-[10px] text-[#9b9b9b] font-mono uppercase">CHANGES</span>
            {changesCount > 0 && (
              <span className="text-[9px] text-[#5b5b5b] font-mono">({changesCount})</span>
            )}
          </div>
          {changesCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleStageAll()
              }}
              className="text-[9px] text-[#6b6b6b] hover:text-[#9b9b9b] font-mono transition-colors"
              title="Stage all"
            >
              [+ALL]
            </button>
          )}
        </button>

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
                <div className="px-2.5 py-2 text-[9px] text-[#5b5b5b] font-mono">
                  // no changes
                </div>
              ) : (
                <div className="py-0.5">
                  {changesTree.map(item => renderFileChange(item, 0, '', false))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Comments Section */}
      {selectedWorktree && (
        <div className="border-t border-[#1a1a1a]">
          <button
            onClick={() => setCommentsExpanded(!commentsExpanded)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#111111] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[#5b5b5b] text-[9px] font-mono">
                {commentsExpanded ? '[−]' : '[+]'}
              </span>
              <span className="text-[10px] text-[#9b9b9b] font-mono uppercase">COMMENTS</span>
              {(() => {
                const allComments = getAllComments(selectedWorktree.path)
                const unresolvedCount = allComments.filter(c => !c.resolved).length
                return unresolvedCount > 0 && (
                  <span className="text-[9px] text-[#d97757] font-mono">
                    ({unresolvedCount})
                  </span>
                )
              })()}
            </div>
          </button>

          <AnimatePresence>
            {commentsExpanded && selectedWorktree && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-2 pb-2 max-h-48 overflow-y-auto">
                  {(() => {
                    const allComments = getAllComments(selectedWorktree.path)
                    if (allComments.length === 0) {
                      return (
                        <p className="text-[9px] text-[#5b5b5b] py-1.5 font-mono">// no comments</p>
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
                      const userComments = comments.filter(c => !c.resolved && c.author === 'user')
                      const hasUserComments = userComments.length > 0

                      return (
                      <div key={filePath} className="mb-2">
                        {/* File path header */}
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[#3a3a3a] text-[9px]">├</span>
                          <button
                            onClick={() => openFile(selectedWorktree.path, filePath)}
                            className="text-[9px] text-[#6a9bcc] hover:text-[#8ab8dd] truncate text-left font-mono hover:underline"
                          >
                            {filePath}
                          </button>
                          {hasUserComments && (
                            <button
                              onClick={() => handleImplementFeedback(filePath, comments)}
                              disabled={implementingFile === filePath}
                              className={cn(
                                'ml-auto text-[8px] font-mono transition-colors',
                                implementingFile === filePath
                                  ? 'text-[#5b5b5b] cursor-wait'
                                  : 'text-[#d97757] hover:text-[#f99777]'
                              )}
                            >
                              {implementingFile === filePath ? '[...]' : `[IMPLEMENT(${userComments.length})]`}
                            </button>
                          )}
                        </div>
                        
                        {/* Comments list */}
                        <div className="space-y-1 pl-2 border-l border-[#2a2a2a] ml-1">
                          {comments.filter(c => !c.resolved).map((comment) => (
                            <div
                              key={comment.id}
                              className={cn(
                                'group text-[9px] py-1 px-1.5',
                                'border-l-2',
                                comment.author === 'user'
                                  ? 'bg-[#1a1512] border-l-[#d97757]'
                                  : 'bg-[#12151a] border-l-[#6a9bcc]'
                              )}
                            >
                              <div className="flex items-center gap-1">
                                <span className={cn(
                                  'font-mono text-[8px] uppercase',
                                  comment.author === 'user' ? 'text-[#d97757]' : 'text-[#6a9bcc]'
                                )}>
                                  {comment.author === 'user' ? 'YOU' : 'AGENT'}
                                </span>
                                {comment.lineNumber && (
                                  <span className="text-[8px] font-mono text-[#4a4a4a]">
                                    :{comment.lineNumber}
                                  </span>
                                )}
                                <span className="text-[8px] font-mono text-[#3a3a3a] ml-auto">
                                  {new Date(comment.timestamp).toLocaleDateString('en-GB', { 
                                    day: '2-digit', 
                                    month: '2-digit'
                                  })}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => resolveComment(selectedWorktree.path, filePath, comment.id)}
                                    className="text-[#57d977] hover:text-[#77f797] text-[8px] font-mono"
                                  >
                                    [✓]
                                  </button>
                                  <button
                                    onClick={() => removeComment(selectedWorktree.path, filePath, comment.id)}
                                    className="text-[#d97757] hover:text-[#f99777] text-[8px] font-mono"
                                  >
                                    [✕]
                                  </button>
                                </div>
                              </div>
                              <p className="text-[#a0a0a0] text-[9px] leading-tight truncate font-mono mt-0.5">
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
        <div className="border-t border-[#1a1a1a]">
          <button
            onClick={() => setGitLogExpanded(!gitLogExpanded)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#111111] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[#5b5b5b] text-[9px] font-mono">
                {gitLogExpanded ? '[−]' : '[+]'}
              </span>
              <span className="text-[10px] text-[#9b9b9b] font-mono uppercase">HISTORY</span>
            </div>
          </button>

          <AnimatePresence>
            {gitLogExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="py-0.5 max-h-40 overflow-y-auto">
                  {gitLog.length === 0 ? (
                    <div className="px-2.5 py-2 text-[9px] text-[#5b5b5b] font-mono">
                      // no history
                    </div>
                  ) : (
                    gitLog.map((commit, index) => (
                      <div
                        key={commit.hash}
                        className="flex items-start gap-1.5 px-2.5 py-1 hover:bg-[#111111] transition-colors"
                      >
                        <div className="flex flex-col items-center pt-0.5">
                          <span className={cn(
                            'text-[6px]',
                            commit.is_head ? 'text-[#4ade80]' : index === 0 ? 'text-[#6a9bcc]' : 'text-[#5b5b5b]'
                          )}>
                            ●
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] text-[#c0c0c0] truncate font-mono">
                            {commit.message}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] text-[#6b6b6b] font-mono">
                              {commit.short_hash}
                            </span>
                            <span className="text-[8px] text-[#5b5b5b]">
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

    </motion.div>
  )
}
