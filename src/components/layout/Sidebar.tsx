import { useAppStore } from '@/stores/appStore'
import { Worktree } from '@/types'
import { motion } from 'framer-motion'
import { 
  GitBranch, 
  Plus,
  Globe,
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

  const getBranchSlug = (worktree: Worktree) => {
    const branchName = getBranchName(worktree)
    return branchName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
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
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#9b9b9b]">{repoName}</span>
            <span className="text-xs text-[#6b6b6b]">({worktrees.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleCreateWorktreeClick}
              className="p-1 hover:bg-[#1a1a1a] rounded text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors"
              title={currentRepoPath ? "Create new worktree" : "Open repository first"}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button className="p-1 hover:bg-[#1a1a1a] rounded text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors">
              <GitBranch className="w-4 h-4" />
            </button>
          </div>
        </div>

      {/* Branch List */}
      <div className="flex-1 overflow-auto px-2">
        <div className="space-y-0.5">
          {worktrees.length === 0 ? (
            <div className="px-4 py-8 text-center text-[#6b6b6b]">
              <p className="text-sm">No worktrees found</p>
              <p className="text-xs mt-1">Open a repository to get started</p>
            </div>
          ) : (
            worktrees.map((worktree, index) => {
              const branchName = getBranchName(worktree)
              const branchSlug = getBranchSlug(worktree)
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
                      "group relative px-3 py-2 rounded-md cursor-pointer transition-all",
                      isSelected
                        ? "bg-[#1a1a1a]"
                        : "hover:bg-[#111111]"
                    )}
                  >
                    <div
                      onClick={() => setSelectedWorktree(worktree)}
                      className="flex items-start justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        {/* Branch Name */}
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-medium truncate",
                            isSelected ? "text-[#e0e0e0]" : "text-[#9b9b9b]"
                          )}>
                            {branchName}
                          </span>
                          {worktree.is_main && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#1a1a1a] text-[#6b6b6b] rounded">
                              main
                            </span>
                          )}
                        </div>
                        
                        {/* Branch Slug */}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[#5b5b5b]">{branchSlug}</span>
                          <span className="text-xs text-[#5b5b5b] font-mono">
                            {worktree.head.slice(0, 7)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
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
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-[#f87171]/20 rounded text-[#6b6b6b] hover:text-[#f87171] transition-all"
                            title="Delete worktree"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-[#d97757] rounded-r" />
                    )}
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      {/* Ports Section */}
      <div className="border-t border-[#1a1a1a]">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#6b6b6b]" />
            <span className="text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">Ports</span>
          </div>
          <span className="text-xs text-[#5b5b5b]">0</span>
        </div>
        
        <div className="px-2 pb-2">
          <div className="px-3 py-2 text-xs text-[#5b5b5b] text-center">
            No forwarded ports
          </div>
        </div>
      </div>
      </motion.aside>

      {/* Create Worktree Modal */}
      <CreateWorktreeModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

      {/* Delete Confirmation Modal */}
      {worktreeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60"
            onClick={() => setWorktreeToDelete(null)}
          />
          <div className="relative w-80 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg shadow-2xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#f87171]/10 rounded-lg flex items-center justify-center">
                <Trash className="w-5 h-5 text-[#f87171]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#e0e0e0]">Delete Worktree</h3>
                <p className="text-xs text-[#6b6b6b]">{getBranchName(worktreeToDelete)}</p>
              </div>
            </div>
            
            <p className="text-sm text-[#9b9b9b] mb-4">
              Are you sure you want to delete this worktree? This action cannot be undone.
            </p>
            
            <div className="flex gap-2">
              <button
                onClick={() => setWorktreeToDelete(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-transparent hover:bg-[#1a1a1a] border border-[#1a1a1a] text-[#9b9b9b] rounded-md text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteWorktree}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-[#f87171] hover:bg-[#ef4444] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
