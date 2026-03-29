import { useAppStore } from '@/stores/appStore'
import { motion } from 'framer-motion'
import { 
  GitBranch,
  ArrowUp,
  FileCode,
  Plus,
  Minus,
  Folder,
  CaretRight,
  CaretDown,
  GitCommit,
  Circle
} from '@phosphor-icons/react'
import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FileStatus } from '@/types'
import { FileDiffViewer } from '@/components/diff/FileDiffViewer'

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
  const { selectedWorktree, worktreeStatus, setWorktreeStatus } = useAppStore()
  const [commitMessage, setCommitMessage] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

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

  // Build file tree from real data
  const fileTree = useMemo(() => {
    if (!status) return []

    const allFiles: { path: string; status: FileChange['status'] }[] = [
      ...status.staged.map(f => ({ path: f.path, status: 'added' as const })),
      ...status.modified.map(f => ({ path: f.path, status: 'modified' as const })),
      ...status.untracked.map(p => ({ path: p, status: 'untracked' as const })),
    ]

    return buildFileTree(allFiles)
  }, [status])

  // Auto-expand folders that contain changed files
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
    
    collectFolders(fileTree)
    setExpandedFolders(foldersToExpand)
  }, [fileTree])

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedFolders(newExpanded)
  }

  const totalChanges = status ? status.modified.length + status.staged.length + status.untracked.length : 0

  const handleCommit = async () => {
    if (!selectedWorktree || !commitMessage.trim()) return
    
    try {
      await invoke('commit', {
        worktreePath: selectedWorktree.path,
        message: commitMessage.trim()
      })
      setCommitMessage('')
      loadWorktreeStatus() // Refresh status after commit
    } catch (err) {
      console.error('Failed to commit:', err)
      setError('Failed to commit changes')
    }
  }

  const getStatusIcon = (status: FileChange['status']) => {
    switch (status) {
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

  const renderFileChange = (item: FileChange, depth = 0, parentPath = ''): React.ReactNode => {
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
          
          {isExpanded && item.children?.map(child => renderFileChange(child, depth + 1, fullPath))}
        </div>
      )
    }

    return (
      <div
        key={fullPath}
        onClick={() => setSelectedFile(fullPath)}
        className="flex items-center gap-2 px-4 py-1.5 hover:bg-[#111111] cursor-pointer transition-colors"
        style={{ paddingLeft: `${16 + depth * 12}px` }}
      >
        {getStatusIcon(item.status)}
        <FileCode className="w-4 h-4 text-[#6b6b6b]" />
        <span className="flex-1 text-sm text-[#9b9b9b] truncate">{item.path}</span>
      </div>
    )
  }

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
        <span className="text-sm text-[#9b9b9b]">Review Changes</span>
        <div className="flex items-center gap-1 text-[#6b6b6b]">
          <GitBranch className="w-4 h-4" />
          <span className="text-xs">{status?.commit.slice(0, 7) || '...'}</span>
        </div>
      </div>

      {/* Commit Section */}
      <div className="p-4 space-y-3">
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          className="w-full px-3 py-2 bg-[#111111] border border-[#1a1a1a] rounded-md text-sm text-[#e0e0e0] placeholder-[#5b5b5b] outline-none focus:border-[#2a2a2a]"
        />
        
        <button
          onClick={handleCommit}
          disabled={!commitMessage.trim() || totalChanges === 0 || isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a1a1a] hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm text-[#9b9b9b] transition-colors"
        >
          <ArrowUp className="w-4 h-4" />
          <span>Commit</span>
          {totalChanges > 0 && (
            <span className="text-xs text-[#6b6b6b]">{totalChanges}</span>
          )}
        </button>

        {error && (
          <p className="text-xs text-[#f87171]">{error}</p>
        )}
      </div>

      {/* File Changes */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-[#6b6b6b]">
            <div className="animate-spin w-5 h-5 border-2 border-[#2a2a2a] border-t-[#d97757] rounded-full" />
          </div>
        ) : totalChanges === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[#5b5b5b]">
            <GitCommit className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No changes to review</p>
          </div>
        ) : (
          <div className="py-2">
            {fileTree.map(item => renderFileChange(item))}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      {totalChanges > 0 && status && (
        <div className="px-4 py-3 border-t border-[#1a1a1a] flex items-center justify-between text-xs text-[#6b6b6b]">
          <span>{totalChanges} files changed</span>
          <div className="flex items-center gap-2">
            {status.staged.length > 0 && (
              <span className="text-[#4ade80]">{status.staged.length} staged</span>
            )}
            {status.modified.length > 0 && (
              <span className="text-[#d97757]">{status.modified.length} modified</span>
            )}
            {status.untracked.length > 0 && (
              <span className="text-[#6a9bcc]">{status.untracked.length} new</span>
            )}
          </div>
        </div>
      )}

      {/* File Diff Viewer */}
      <FileDiffViewer
        filePath={selectedFile || ''}
        isOpen={!!selectedFile}
        onClose={() => setSelectedFile(null)}
      />
    </motion.div>
  )
}
