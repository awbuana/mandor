import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/stores/appStore'
import { invoke } from '@tauri-apps/api/core'

interface CreateWorktreeModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Modal component for creating a new git worktree
 * Provides a terminal-styled interface for entering branch name and worktree path
 */
export function CreateWorktreeModal({ isOpen, onClose }: CreateWorktreeModalProps) {
  const { currentRepoPath, worktrees, addWorktree } = useAppStore()
  const [branchName, setBranchName] = useState('')
  const [worktreePath, setWorktreePath] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get main worktree path for repo operations
  const mainWorktree = worktrees.find(w => w.is_main)
  const repoPath = currentRepoPath || (mainWorktree ? mainWorktree.path : null)

  // Auto-generate worktree path when branch name changes
  useEffect(() => {
    if (branchName.trim()) {
      const repoName = repoPath
        ? repoPath.split('/').pop() || 'repo'
        : 'repo'
      const cleanBranch = branchName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      setWorktreePath(`../${repoName}-${cleanBranch}`)
    } else {
      setWorktreePath('')
    }
  }, [branchName, repoPath])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setBranchName('')
      setWorktreePath('')
      setError(null)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    // Prevent default form submission to avoid page reload
    e.preventDefault()

    // Validate repository is loaded
    if (!repoPath) {
      setError('Please open a repository first')
      return
    }

    // Validate inputs
    if (!branchName.trim()) {
      setError('Please enter a branch name')
      return
    }

    if (!worktreePath.trim()) {
      setError('Please enter a worktree path')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const newWorktree = await invoke('create_worktree', {
        repoPath: repoPath,
        branch: branchName.trim(),
        path: worktreePath.trim()
      })

      addWorktree(newWorktree as any)

      // Register the new worktree with the filesystem watcher so changes are
      // pushed to the frontend in real-time.
      await invoke('add_watch_path', { path: (newWorktree as any).path }).catch(() => {})

      onClose()
    } catch (err) {
      console.error('Failed to create worktree:', err)
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

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

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 flex items-center justify-center z-50"
          >
            <div
              className="w-[480px] bg-[#0a0a0a] border border-[#1a1a1a] shadow-2xl font-mono"
              // Prevent clicks inside modal from bubbling up to backdrop and closing the modal
              onClick={(e) => e.stopPropagation()}
            >
              {/* Terminal Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-[#111111] border-b border-[#1a1a1a]">
                <div className="flex items-center gap-2">
                  <span className="text-[#d97757]">⌥</span>
                  <span className="text-xs text-[#6b6b6b] uppercase tracking-wider">create_worktree</span>
                </div>
                <button
                  onClick={onClose}
                  className="text-[#6b6b6b] hover:text-[#9b9b9b] text-xs"
                >
                  [x]
                </button>
              </div>

              {/* Terminal Content */}
              <div className="p-4 space-y-4">
                {/* Command Preview */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#4ade80]">➜</span>
                    <span className="text-[#6b6b6b]">~</span>
                    <span className="text-[#9b9b9b]">git worktree add</span>
                    <span className="text-[#d97757]">{worktreePath || '<path>'}</span>
                    <span className="text-[#6a9bcc]">{branchName || '<branch>'}</span>
                  </div>
                </div>

                {/* Input Fields */}
                <div className="space-y-3">
                  {/* Branch Name */}
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#6b6b6b] mb-1">
                      <span>[-]</span>
                      <span>BRANCH</span>
                    </div>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="feature/my-branch"
                      className="w-full px-3 py-2 bg-[#111111] border border-[#1a1a1a] text-sm text-[#e0e0e0] placeholder-[#5b5b5b] outline-none focus:border-[#2a2a2a] transition-colors font-mono"
                      autoFocus
                    />
                  </div>

                  {/* Worktree Path */}
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#6b6b6b] mb-1">
                      <span>[-]</span>
                      <span>PATH</span>
                    </div>
                    <input
                      type="text"
                      value={worktreePath}
                      onChange={(e) => setWorktreePath(e.target.value)}
                      placeholder="../my-project-feature"
                      className="w-full px-3 py-2 bg-[#111111] border border-[#1a1a1a] text-sm text-[#e0e0e0] placeholder-[#5b5b5b] outline-none focus:border-[#2a2a2a] transition-colors font-mono"
                    />
                    <p className="text-[10px] text-[#4a4a4a] mt-1">
                      // auto-generated from branch name
                    </p>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="border-l-2 border-[#f87171] pl-3 py-1">
                    <p className="text-xs text-[#f87171]">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-[#111111] hover:bg-[#1a1a1a] border border-[#1a1a1a] text-[#9b9b9b] text-xs transition-colors disabled:opacity-50"
                  >
                    [ Cancel ]
                  </button>
                  <button
                    type="submit"
                    onClick={handleSubmit}
                    disabled={!branchName.trim() || !worktreePath.trim() || isLoading}
                    className="px-3 py-1.5 bg-[#d97757]/10 hover:bg-[#d97757]/20 border border-[#d97757]/30 text-[#d97757] text-xs transition-colors disabled:opacity-50"
                  >
                    {isLoading ? '[ Creating... ]' : '[ Create ]'}
                  </button>
                </div>
              </div>

              {/* Terminal Footer */}
              <div className="px-3 py-2 bg-[#111111] border-t border-[#1a1a1a] flex items-center justify-between">
                <span className="text-[10px] text-[#4a4a4a]">mandor-workbench</span>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-[#4ade80]" />
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}