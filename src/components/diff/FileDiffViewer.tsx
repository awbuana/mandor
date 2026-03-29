import { useAppStore } from '@/stores/appStore'
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Plus, Minus, X } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

interface DiffLine {
  type: 'header' | 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

interface FileDiffViewerProps {
  filePath: string
  isOpen: boolean
  onClose: () => void
}

export function FileDiffViewer({ filePath, isOpen, onClose }: FileDiffViewerProps) {
  const { selectedWorktree } = useAppStore()
  const [diffContent, setDiffContent] = useState<DiffLine[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && filePath && selectedWorktree) {
      loadDiff(filePath)
    }
  }, [isOpen, filePath, selectedWorktree])

  const loadDiff = async (path: string) => {
    if (!selectedWorktree) return
    setLoading(true)
    
    try {
      const diff: string = await invoke('get_diff', { 
        worktreePath: selectedWorktree.path,
        filePath: path
      })
      
      const lines = parseDiff(diff)
      setDiffContent(lines)
    } catch (error) {
      console.error('Failed to load diff:', error)
      setDiffContent([])
    } finally {
      setLoading(false)
    }
  }

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

  // Get file extension for icon
  const getFileExtension = (path: string) => {
    const parts = path.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : ''
  }

  // Build breadcrumb path
  const getBreadcrumbs = (path: string) => {
    const parts = path.split('/')
    if (parts.length <= 1) return path
    return parts.slice(0, -1).join(' > ')
  }

  const getFileName = (path: string) => {
    const parts = path.split('/')
    return parts[parts.length - 1]
  }

  const addedCount = diffContent.filter(l => l.type === 'add').length
  const removedCount = diffContent.filter(l => l.type === 'remove').length

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50"
            onClick={onClose}
          />

          {/* Diff Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg z-50 flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#111111] border-b border-[#1a1a1a]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[#6b6b6b]">
                  <span className="text-xs font-medium px-2 py-0.5 bg-[#1a1a1a] rounded">
                    {getFileExtension(filePath)}
                  </span>
                  <span className="text-sm text-[#5b5b5b]">{getBreadcrumbs(filePath)}</span>
                </div>
                <span className="text-sm text-[#e0e0e0] font-medium">
                  {getFileName(filePath)}
                </span>
                <span className="text-xs text-[#d97757] border border-[#d97757]/30 px-1.5 py-0.5 rounded">
                  M
                </span>
              </div>
              
              <div className="flex items-center gap-4">
                {/* Change stats */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-[#4ade80]">
                    <Plus className="w-3.5 h-3.5" />
                    {addedCount}
                  </span>
                  <span className="flex items-center gap-1 text-[#f87171]">
                    <Minus className="w-3.5 h-3.5" />
                    {removedCount}
                  </span>
                </div>
                
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-[#2a2a2a] rounded text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* File Info Bar */}
            <div className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] border-b border-[#1a1a1a] text-xs text-[#5b5b5b]">
              <span>~/Documents/projects/mandor/src/stores</span>
              <span className="text-[#3a3a3a]">•</span>
              <span>Contains emphasized items</span>
            </div>

            {/* Diff Content */}
            <div className="flex-1 overflow-auto bg-[#0a0a0a]">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[#6b6b6b]">
                  <div className="animate-spin w-6 h-6 border-2 border-[#2a2a2a] border-t-[#d97757] rounded-full" />
                </div>
              ) : (
                <div className="font-mono text-sm">
                  {diffContent.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex hover:bg-[#1a1a1a]/50"
                    >
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
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
