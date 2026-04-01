import { useAppStore } from '@/stores/appStore'
import { Worktree } from '@/types'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { CreateWorktreeModal } from '@/components/worktree/CreateWorktreeModal'
import { invoke } from '@tauri-apps/api/core'


export function Sidebar() {
  const { worktrees, selectedWorktree, setSelectedWorktree, currentRepoPath, diffStats, setWorktrees } = useAppStore()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const getBranchName = (worktree: Worktree) => {
    if (!worktree.branch) return 'detached HEAD'
    return worktree.branch.replace('refs/heads/', '')
  }


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

  // Handles the deletion of a worktree when confirmed by the user
  const handleDeleteWorktree = async () => {
    if (!worktreeToDelete) return

    // Find the main repo path from worktrees
    const mainWorktree = worktrees.find(w => w.is_main)
    const repoPath = currentRepoPath || (mainWorktree ? mainWorktree.path : worktreeToDelete.path)

    setIsDeleting(true)
    try {
      // Remove from filesystem watcher before deleting
      await invoke('remove_watch_path', { path: worktreeToDelete.path }).catch(() => {})

      await invoke('delete_worktree', {
        repoPath: repoPath,
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
        className="w-72 h-full bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col z-20"
      >
        {/* Header */}
        <div className="h-10 flex items-center justify-between px-3 py-2 bg-[#111111] border-b border-[#1a1a1a] font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[#d97757]">▼</span>
            <span className="text-xs text-[#6b6b6b] uppercase tracking-wider">worktrees</span>
            <span className="text-[10px] text-[#d97757] bg-[#1a1a1a] px-1.5 rounded-sm border border-[#2a2a2a] ml-1">
              {worktrees.length}
            </span>
          </div>
          <button
            onClick={handleCreateWorktreeClick}
            className="text-[#6b6b6b] hover:text-[#9b9b9b] text-xs transition-colors"
            title={currentRepoPath ? "Create new worktree" : "Open repository first"}
          >
            [+]
          </button>
        </div>

        {/* Repository Info */}
        <div className="px-4 py-2.5 font-mono border-b border-[#1a1a1a] bg-[#0c0c0c]">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[#4ade80] opacity-80">➜</span>
            <span className="text-[#9b9b9b] font-semibold tracking-tight">{repoName}</span>
          </div>
        </div>

      {/* Branch List */}
      <div className="flex-1 overflow-auto bg-[#050505]">
        <div className="space-y-[1px] py-1">
          {worktrees.length === 0 ? (
            <div className="px-5 py-3 text-[9px] text-[#5b5b5b] font-mono italic">
              ~ empty
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
                      "group relative flex items-start justify-between px-3 py-2.5 mx-1.5 transition-all border border-transparent rounded-sm font-mono",
                      isSelected
                        ? "bg-[#111] border-[#2a2a2a]"
                        : "hover:bg-[#111] hover:border-[#1a1a1a]"
                    )}
                  >
                    {/* Active Indicator Line */}
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#d97757] rounded-l-sm" />
                    )}

                    {/* Clickable content area */}
                    <div
                      onClick={() => setSelectedWorktree(worktree)}
                      className="flex-1 min-w-0 cursor-pointer pl-1"
                    >
                      {/* Branch Name with indicator */}
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[11px] truncate font-mono tracking-tight transition-colors",
                          isSelected ? "text-[#e0e0e0] font-semibold" : "text-[#9b9b9b] group-hover:text-[#c0c0c0]"
                        )}>
                          {branchName}
                        </span>
                        {worktree.is_main && (
                          <span className="text-[8px] px-1 py-0.5 bg-[#1a1a1a] text-[#5b5b5b] border border-[#2a2a2a] rounded-[2px] uppercase">
                            main
                          </span>
                        )}
                      </div>

                      {/* Commit Hash & Stats Row */}
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] text-[#6b6b6b] font-mono">
                          {worktree.head.slice(0, 7)}
                        </span>

                        {/* Change Stats inline */}
                        <div className="flex items-center gap-1.5 text-[9px] font-mono">
                          {changes.added > 0 && (
                            <span className="text-[#4ade80]/90">+{changes.added}</span>
                          )}
                          {changes.removed > 0 && (
                            <span className="text-[#f87171]/90">-{changes.removed}</span>
                          )}
                        </div>
                      </div>

                      {/* Worktree Path */}
                      <div className="mt-1 flex items-center gap-1.5 text-[9px] text-[#4a4a4a] italic" title={worktree.path}>
                        <span className="text-[#3a3a3a] not-italic">└</span>
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                          {worktree.path.replace(/^\/Users\/[^/]+/, '~')}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons - separate from clickable area */}
                    <div className="flex flex-col items-end gap-1 ml-2">
                      {/* Delete Button - Only show on hover and for non-main worktrees */}
                      {!worktree.is_main && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setWorktreeToDelete(worktree)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 bg-[#111] hover:bg-[#f87171]/20 text-[#6b6b6b] hover:text-[#f87171] border border-transparent hover:border-[#f87171]/30 transition-all rounded-sm z-10"
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
              className="fixed inset-0 flex items-center justify-center z-50"
            >
              <div
                className="w-96 bg-[#0a0a0a] border border-[#1a1a1a] shadow-2xl font-mono"
                onClick={(e) => e.stopPropagation()}
              >
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
                        type="button"
                        onClick={() => setWorktreeToDelete(null)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 bg-[#111111] hover:bg-[#1a1a1a] border border-[#1a1a1a] text-[#9b9b9b] text-xs transition-colors disabled:opacity-50"
                      >
                        n (Cancel)
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteWorktree}
                        disabled={isDeleting}
                        className="px-3 py-1.5 bg-[#f87171]/10 hover:bg-[#f87171]/20 border border-[#f87171]/30 text-[#f87171] text-xs transition-colors disabled:opacity-50 cursor-pointer"
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