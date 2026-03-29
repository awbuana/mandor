import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, GitBranch, Folder } from '@phosphor-icons/react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '@/stores/appStore'

interface CreateWorktreeModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateWorktreeModal({ isOpen, onClose }: CreateWorktreeModalProps) {
  const { currentRepoPath, addWorktree } = useAppStore()
  const [branchName, setBranchName] = useState('')
  const [worktreePath, setWorktreePath] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-generate worktree path when branch name changes
  useEffect(() => {
    if (branchName.trim()) {
      const repoName = currentRepoPath 
        ? currentRepoPath.split('/').pop() || 'repo'
        : 'repo'
      const cleanBranch = branchName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      setWorktreePath(`../${repoName}-${cleanBranch}`)
    } else {
      setWorktreePath('')
    }
  }, [branchName, currentRepoPath])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setBranchName('')
      setWorktreePath('')
      setError(null)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate repository is loaded
    if (!currentRepoPath) {
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
        repoPath: currentRepoPath,
        branch: branchName.trim(),
        path: worktreePath.trim()
      })
      
      addWorktree(newWorktree as any)
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
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-96 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg shadow-2xl overflow-hidden pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-[#d97757]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#e0e0e0]">Create Worktree</h3>
                  <p className="text-xs text-[#6b6b6b]">New branch from main</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-[#1a1a1a] rounded text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Branch Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">
                  Branch Name
                </label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5b5b5b]" />
                  <input
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="feature/my-branch"
                    className="w-full pl-10 pr-3 py-2.5 bg-[#111111] border border-[#1a1a1a] rounded-md text-sm text-[#e0e0e0] placeholder-[#5b5b5b] outline-none focus:border-[#2a2a2a] transition-colors"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-[#5b5b5b]">
                  Branch will be created if it doesn't exist
                </p>
              </div>

              {/* Worktree Path Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">
                  Worktree Path
                </label>
                <div className="relative">
                  <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5b5b5b]" />
                  <input
                    type="text"
                    value={worktreePath}
                    onChange={(e) => setWorktreePath(e.target.value)}
                    placeholder="../my-project-feature"
                    className="w-full pl-10 pr-3 py-2.5 bg-[#111111] border border-[#1a1a1a] rounded-md text-sm text-[#e0e0e0] placeholder-[#5b5b5b] outline-none focus:border-[#2a2a2a] transition-colors font-mono"
                  />
                </div>
                <p className="text-xs text-[#5b5b5b]">
                  Auto-generated from branch name
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-[#f87171]/10 border border-[#f87171]/20 rounded-md">
                  <p className="text-xs text-[#f87171]">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-transparent hover:bg-[#1a1a1a] border border-[#1a1a1a] text-[#9b9b9b] rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!branchName.trim() || !worktreePath.trim() || isLoading}
                  className="flex-1 px-4 py-2.5 bg-[#d97757] hover:bg-[#c2694e] disabled:bg-[#1a1a1a] disabled:text-[#5b5b5b] disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Create Worktree'
                  )}
                </button>
              </div>
            </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
