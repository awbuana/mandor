import { useAppStore } from '@/stores/appStore'
import { Worktree } from '@/types'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Trash
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { CreateWorktreeModal } from '@/components/worktree/CreateWorktreeModal'
import { invoke } from '@tauri-apps/api/core'

interface DiffStats {
  files_changed: number
  insertions: number
  deletions: number
}

// Ports Panel Component
function PortsPanel() {
  const { opencodeServers } = useAppStore()

  // Get all running servers
  const runningServers = Object.values(opencodeServers).filter(s => s.isRunning && s.port)

  return (
    <div className="border-t border-[#1a1a1a] font-mono">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#6b6b6b]">[-]</span>
          <span className="text-xs text-[#6b6b6b] uppercase tracking-wider">PORTS</span>
        </div>
        <span className="text-xs text-[#5b5b5b]">{runningServers.length}</span>
      </div>

      <div className="px-2 pb-2">
        {runningServers.length > 0 ? (
          <div className="space-y-0">
            {runningServers.map((server) => (
              <div
                key={server.worktreePath}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#111111]"
              >
                <span className="w-2 h-2 bg-[#4ade80]" />
                <span className="text-xs text-[#9b9b9b]">
                  {server.hostname}:{server.port}
                </span>
                <span className="text-xs text-[#6b6b6b] truncate flex-1">
                  {server.worktreeName}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-2 text-xs text-[#5b5b5b]">
            // no forwarded ports
          </div>
        )}
      </div>
    </div>
  )
}

interface DiffStats {
  files_changed: number
  insertions: number
  deletions: number
}

export function Sidebar() {
  const { worktrees, selectedWorktree, setSelectedWorktree, currentRepoPath, worktreeStatus, setWorktrees } = useAppStore()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [diffStats, setDiffStats] = useState<Record<string, DiffStats>>({})

  const getBranchName = (worktree: Worktree) => {
    if (!worktree.branch) return 'detached HEAD'
    return worktree.branch.replace('refs/heads/', '')
  }

  // Fetch diff stats for all worktrees
  useEffect(() => {
    const fetchDiffStats = async () => {
      const stats: Record<string, DiffStats> = {}
      
      for (const worktree of worktrees) {
        try {
          const diffStat = await invoke('get_diff_stats', { 
            worktreePath: worktree.path 
          }) as DiffStats
          stats[worktree.path] = diffStat
        } catch (error) {
          // If no changes or error, default to zero
          stats[worktree.path] = { files_changed: 0, insertions: 0, deletions: 0 }
        }
      }
      
      setDiffStats(stats)
    }
    
    if (worktrees.length > 0) {
      fetchDiffStats()
    }
  }, [worktrees, worktreeStatus]) // Re-fetch when worktrees or status changes

  const getChangeCount = (worktree: Worktree) => {
    const stats = diffStats[worktree.path]
    if (!stats) return { added: 0, removed: 0, total: 0 }
    
    return { 
      added: stats.insertions, 
      removed: stats.deletions, 
      total: stats.files_changed 
    }
  }

  const repoName = currentRepoPath ? currentRepoPath.split('/').pop() : 'mandor'

  const handleCreateWorktreeClick = async () => {
    // For browser testing: always open modal
    setIsCreateModalOpen(true)
  }

  const handleDeleteWorktree = async () => {
    if (!worktreeToDelete || !currentRepoPath) return
    
    setIsDeleting(true)
    try {
      await invoke('delete_worktree', {
        repoPath: currentRepoPath,
        worktreePath: worktreeToDelete.path
      })
      
      // Remove from list
      setWorktrees(worktrees.filter(w => w.path !== worktreeToDelete.path))
      
      // If deleted worktree was selected, clear selection
      if (selectedWorktree?.path === worktreeToDelete.path) {
        setSelectedWorktree(null)
      }
      
      setWorktreeToDelete(null)
    } catch (error) {
      console.error('Failed to delete worktree:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="w-72 h-full bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col"
      >
        {/* Repository Header */}
        <div className="px-3 py-2 flex items-center justify-between font-mono border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b6b6b]">[-]</span>
            <span className="text-xs text-[#6b6b6b] uppercase tracking-wider">WORKTREES</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#5b5b5b]">{worktrees.length}</span>
            <button 
              onClick={handleCreateWorktreeClick}
              className="p-1 hover:bg-[#1a1a1a] text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors"
              title={currentRepoPath ? "Create new worktree" : "Open repository first"}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Repository Info */}
        <div className="px-3 py-2 font-mono">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#4ade80]">➜</span>
            <span className="text-[#9b9b9b]">{repoName}</span>
          </div>
        </div>

      {/* Branch List */}
      <div className="flex-1 overflow-auto px-2 font-mono">
        <div className="space-y-0">
          {worktrees.length === 0 ? (
            <div className="px-3 py-4 text-xs text-[#5b5b5b]">
              // no worktrees found
            </div>
          ) : (
            worktrees.map((worktree, index) => {
              const branchName = getBranchName(worktree)
              const changes = getChangeCount(worktree)
              const isSelected = selectedWorktree?.path === worktree.path

              return (
                <motion.div
                  key={worktree.path}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                >
                  <div
                    className={cn(
                      "group relative flex items-start justify-between px-3 py-2 transition-all",
                      isSelected
                        ? "bg-[#1a1a1a]"
                        : "hover:bg-[#111111]"
                    )}
                  >
                    {/* Clickable content area */}
                    <div
                      onClick={() => setSelectedWorktree(worktree)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      {/* Branch Name with indicator */}
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="text-[#d97757]">▸</span>
                        )}
                        <span className={cn(
                          "text-sm truncate",
                          isSelected ? "text-[#e0e0e0]" : "text-[#9b9b9b]"
                        )}>
                          {branchName}
                        </span>
                        {worktree.is_main && (
                          <span className="text-[10px] px-1 py-0.5 bg-[#1a1a1a] text-[#6b6b6b]">
                            main
                          </span>
                        )}
                      </div>
                      
                      {/* Commit Hash */}
                      <div className="mt-0.5">
                        <span className="text-xs text-[#5b5b5b]">
                          {worktree.head.slice(0, 7)}
                        </span>
                      </div>
                      
                      {/* Worktree Path */}
                      <div className="mt-1" title={worktree.path}>
                        <span className="text-[10px] text-[#4a4a4a] block overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                          {worktree.path.replace(/^\/Users\/[^/]+/, '~')}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons - separate from clickable area */}
                    <div className="flex items-center gap-2 ml-2">
                      {/* Change Stats */}
                      {(changes.added > 0 || changes.removed > 0) && (
                        <div className="flex items-center gap-1 text-xs">
                          {changes.added > 0 && (
                            <span className="text-[#4ade80]">+{changes.added}</span>
                          )}
                          {changes.removed > 0 && (
                            <span className="text-[#f87171]">-{changes.removed}</span>
                          )}
                        </div>
                      )}
                      
                      {/* Delete Button - Only show on hover and for non-main worktrees */}
                      {!worktree.is_main && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setWorktreeToDelete(worktree)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#f87171]/20 text-[#6b6b6b] hover:text-[#f87171] transition-all"
                          title="Delete worktree"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      {/* Ports Section */}
      <PortsPanel />
      </motion.aside>

      {/* Create Worktree Modal */}
      <CreateWorktreeModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {worktreeToDelete && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50"
              onClick={() => setWorktreeToDelete(null)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.1 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-96 bg-[#0a0a0a] border border-[#1a1a1a] shadow-2xl pointer-events-auto font-mono">
                {/* Terminal Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-[#111111] border-b border-[#1a1a1a]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#f87171]">⚠</span>
                    <span className="text-xs text-[#6b6b6b] uppercase tracking-wider">confirm_delete</span>
                  </div>
                  <button
                    onClick={() => setWorktreeToDelete(null)}
                    className="text-[#6b6b6b] hover:text-[#9b9b9b] text-xs"
                  >
                    [x]
                  </button>
                </div>

                {/* Terminal Content */}
                <div className="p-4 space-y-4">
                  {/* Command Line Style Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#4ade80]">➜</span>
                      <span className="text-[#6b6b6b]">~</span>
                      <span className="text-[#9b9b9b]">rm -rf</span>
                      <span className="text-[#f87171]">{getBranchName(worktreeToDelete)}</span>
                    </div>
                  </div>

                  {/* Warning Message */}
                  <div className="border-l-2 border-[#f87171] pl-3 py-1">
                    <p className="text-sm text-[#9b9b9b]">
                      Warning: This action will permanently delete the worktree.
                    </p>
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      Path: {worktreeToDelete.path.replace(/^\/Users\/[^/]+/, '~')}
                    </p>
                  </div>

                  {/* Terminal Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-xs text-[#6b6b6b]">Proceed? [Y/n]</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setWorktreeToDelete(null)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 bg-[#111111] hover:bg-[#1a1a1a] border border-[#1a1a1a] text-[#9b9b9b] text-xs transition-colors disabled:opacity-50"
                      >
                        n (Cancel)
                      </button>
                      <button
                        onClick={handleDeleteWorktree}
                        disabled={isDeleting}
                        className="px-3 py-1.5 bg-[#f87171]/10 hover:bg-[#f87171]/20 border border-[#f87171]/30 text-[#f87171] text-xs transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? 'Y (Deleting...)' : 'Y (Delete)'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Terminal Footer */}
                <div className="px-3 py-2 bg-[#111111] border-t border-[#1a1a1a] flex items-center justify-between">
                  <span className="text-[10px] text-[#4a4a4a]">mandor-workbench</span>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-[#f87171]" />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
