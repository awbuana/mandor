import { useAppStore } from '@/stores/appStore'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  GitBranch,
  FileCode,
  Plus,
  Minus,
  Folder,
  CaretRight,
  CaretDown,
  GitCommit,
  Circle,
  ChatText,
  Check,
  X,
  Robot
} from '@phosphor-icons/react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FileStatus, FileComment } from '@/types'
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

  // Load worktree status when selected worktree changes
  useEffect(() => {
    if (selectedWorktree) {
      loadWorktreeStatus()
    }
  }, [selectedWorktree?.path])

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

  const getStatusIcon = (statusType: FileChange['status']) => {
    switch (statusType) {
      case 'added':
        return <Plus className="w-3.5 h-3.5 text-[#4ade80]" />
      case 'removed':
        return <Minus className="w-3.5 h-3.5 text-[#f87171]" />
      case 'untracked':
        return <Plus className="w-3.5 h-3.5 text-[#6a9bcc]" />
      default:
        return <Circle className="w-2 h-2 rounded-full bg-[#d97757]" weight="fill" />
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
            className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-[#111111] transition-colors group"
            style={{ paddingLeft: `${16 + depth * 12}px` }}
          >
            {isExpanded ? (
              <CaretDown className="w-3.5 h-3.5 text-[#5b5b5b]" />
            ) : (
              <CaretRight className="w-3.5 h-3.5 text-[#5b5b5b]" />
            )}
            <Folder className="w-4 h-4 text-[#6b6b6b]" />
            <span className="flex-1 text-left text-sm text-[#6b6b6b] truncate">{item.path}</span>
            {(item.added > 0 || item.removed > 0) && (
              <div className="flex items-center gap-1 text-xs">
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
        className="group flex items-center gap-2 px-4 py-1.5 hover:bg-[#111111] transition-colors"
        style={{ paddingLeft: `${16 + depth * 12}px` }}
      >
        {/* Stage/Unstage Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            isStaged ? handleUnstage(fullPath) : handleStage(fullPath)
          }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#2a2a2a] transition-all"
          title={isStaged ? 'Unstage file' : 'Stage file'}
        >
          {isStaged ? (
            <Minus className="w-3.5 h-3.5 text-[#f87171]" />
          ) : (
            <Plus className="w-3.5 h-3.5 text-[#4ade80]" />
          )}
        </button>

        <div
          onClick={handleFileClick}
          className="flex-1 flex items-center gap-2 cursor-pointer"
        >
          {getStatusIcon(item.status)}
          <FileCode className="w-4 h-4 text-[#6b6b6b]" />
          <span className="text-sm text-[#9b9b9b] truncate">{item.path}</span>
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
      <div className="w-80 h-full bg-[#0a0a0a] flex flex-col">
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#1a1a1a]">
          <span className="text-sm text-[#6b6b6b]">Review Changes</span>
          <GitBranch className="w-4 h-4 text-[#6b6b6b]" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-[#5b5b5b]">
          <GitCommit className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">Select a worktree to review changes</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="w-80 h-full bg-[#0a0a0a] flex flex-col"
    >
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#1a1a1a]">
        <span className="text-sm text-[#9b9b9b]">Source Control</span>
        <div className="flex items-center gap-1 text-[#6b6b6b]">
          <GitBranch className="w-4 h-4" />
          <span className="text-xs">{status?.commit.slice(0, 7) || '...'}</span>
        </div>
      </div>

      {/* Commit Section */}
      <div className="p-4 space-y-3 border-b border-[#1a1a1a]">
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={`Message (⌘Enter to commit on "${status?.branch || 'HEAD'}")`}
          className="w-full px-3 py-2 bg-[#111111] border border-[#1a1a1a] rounded-md text-sm text-[#e0e0e0] placeholder-[#5b5b5b] outline-none focus:border-[#2a2a2a]"
        />
        
        <button
          onClick={handleCommit}
          disabled={!commitMessage.trim() || !hasStagedFiles || isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a4a8a] hover:bg-[#2a5a9a] disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm text-white transition-colors"
        >
          <Check className="w-4 h-4" />
          <span>Commit</span>
          {stagedCount > 0 && (
            <span className="text-xs text-white/60">{stagedCount}</span>
          )}
        </button>

        {error && (
          <p className="text-xs text-[#f87171]">{error}</p>
        )}
      </div>

      {/* Staged Changes Section */}
      <div className="border-b border-[#1a1a1a]">
        <button
          onClick={() => setStagedExpanded(!stagedExpanded)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#111111] transition-colors"
        >
          <div className="flex items-center gap-2">
            {stagedExpanded ? (
              <CaretDown className="w-3.5 h-3.5 text-[#5b5b5b]" />
            ) : (
              <CaretRight className="w-3.5 h-3.5 text-[#5b5b5b]" />
            )}
            <span className="text-sm font-medium text-[#9b9b9b]">Staged Changes</span>
            {stagedCount > 0 && (
              <span className="text-xs text-[#5b5b5b]">{stagedCount}</span>
            )}
          </div>
          {stagedCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleUnstageAll()
              }}
              className="text-xs text-[#6b6b6b] hover:text-[#9b9b9b] px-2 py-1 rounded hover:bg-[#2a2a2a]"
              title="Unstage all changes"
            >
              −
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
                <div className="flex items-center justify-center h-20 text-[#6b6b6b]">
                  <div className="animate-spin w-4 h-4 border-2 border-[#2a2a2a] border-t-[#d97757] rounded-full" />
                </div>
              ) : !hasStagedFiles ? (
                <div className="px-4 py-3 text-xs text-[#5b5b5b]">
                  No staged changes
                </div>
              ) : (
                <div className="py-1">
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
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#111111] transition-colors border-b border-[#1a1a1a]"
        >
          <div className="flex items-center gap-2">
            {changesExpanded ? (
              <CaretDown className="w-3.5 h-3.5 text-[#5b5b5b]" />
            ) : (
              <CaretRight className="w-3.5 h-3.5 text-[#5b5b5b]" />
            )}
            <span className="text-sm font-medium text-[#9b9b9b]">Changes</span>
            {changesCount > 0 && (
              <span className="text-xs text-[#5b5b5b]">{changesCount}</span>
            )}
          </div>
          {changesCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleStageAll()
              }}
              className="text-xs text-[#6b6b6b] hover:text-[#9b9b9b] px-2 py-1 rounded hover:bg-[#2a2a2a]"
              title="Stage all changes"
            >
              +
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
                <div className="flex items-center justify-center h-20 text-[#6b6b6b]">
                  <div className="animate-spin w-4 h-4 border-2 border-[#2a2a2a] border-t-[#d97757] rounded-full" />
                </div>
              ) : !hasChanges ? (
                <div className="px-4 py-3 text-xs text-[#5b5b5b]">
                  No changes
                </div>
              ) : (
                <div className="py-1">
                  {changesTree.map(item => renderFileChange(item, 0, '', false))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Comments Section */}
      {selectedWorktree && (
        <div className="border-t border-[#1a1a1a] max-h-64 overflow-auto">
          <button
            onClick={() => setCommentsExpanded(!commentsExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#111111] transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChatText className="w-4 h-4 text-[#9b9b9b]" />
              <span className="text-sm font-medium text-[#9b9b9b]">Comments</span>
              {(() => {
                const allComments = getAllComments(selectedWorktree.path)
                const unresolvedCount = allComments.filter(c => !c.resolved).length
                return unresolvedCount > 0 && (
                  <span className="text-xs bg-[#d97757] text-white px-1.5 py-0.5 rounded-full">
                    {unresolvedCount}
                  </span>
                )
              })()}
            </div>
            {commentsExpanded ? (
              <CaretDown className="w-3.5 h-3.5 text-[#5b5b5b]" />
            ) : (
              <CaretRight className="w-3.5 h-3.5 text-[#5b5b5b]" />
            )}
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
                <div className="px-4 py-2 space-y-2 max-h-48 overflow-y-auto">
                  {(() => {
                    const allComments = getAllComments(selectedWorktree.path)
                    if (allComments.length === 0) {
                      return (
                        <p className="text-xs text-[#5b5b5b] py-2">No comments yet</p>
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
                      <div key={filePath} className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <button
                            onClick={() => openFile(selectedWorktree.path, filePath)}
                            className="text-xs text-[#6b6b6b] hover:text-[#9b9b9b] truncate text-left flex-1"
                          >
                            {filePath}
                          </button>
                          {hasUserComments && (
                            <button
                              onClick={() => handleImplementFeedback(filePath, comments)}
                              disabled={implementingFile === filePath}
                              className={cn(
                                'ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                                implementingFile === filePath
                                  ? 'bg-[#2a2a2a] text-[#5b5b5b] cursor-wait'
                                  : 'bg-[#d97757]/10 text-[#d97757] hover:bg-[#d97757]/20 border border-[#d97757]/30'
                              )}
                            >
                              <Robot className={cn('w-3 h-3', implementingFile === filePath && 'animate-pulse')} />
                              {implementingFile === filePath ? 'Working...' : `Implement (${userComments.length})`}
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          {comments.filter(c => !c.resolved).map(comment => (
                            <div
                              key={comment.id}
                              className={cn(
                                'text-xs p-2 rounded border',
                                comment.author === 'user'
                                  ? 'bg-[#d97757]/10 border-[#d97757]/20'
                                  : 'bg-[#1a1a1a] border-[#2a2a2a]'
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={cn(
                                  'text-[10px] uppercase',
                                  comment.author === 'user' ? 'text-[#d97757]' : 'text-[#9b9b9b]'
                                )}>
                                  {comment.author === 'user' ? 'You' : 'Agent'}
                                </span>
                                {comment.lineNumber && (
                                  <span className="text-[10px] text-[#5b5b5b]">
                                    Line {comment.lineNumber}
                                  </span>
                                )}
                              </div>
                              <p className="text-[#e0e0e0] line-clamp-2">{comment.content}</p>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <button
                                  onClick={() => resolveComment(selectedWorktree.path, filePath, comment.id)}
                                  className="p-1 rounded hover:bg-[#2a3a2a] text-[#57d977]"
                                  title="Resolve"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => removeComment(selectedWorktree.path, filePath, comment.id)}
                                  className="p-1 rounded hover:bg-[#3a2a2a] text-[#d97757]"
                                  title="Delete"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
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

    </motion.div>
  )
}
