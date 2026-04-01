import { useAppStore } from '@/stores/appStore';
import { Worktree } from '@/types';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  Trash,
  ArrowSquareOut,
  Plus,
  X
} from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

export function WorktreeList() {
  const { worktrees, selectedWorktree, setSelectedWorktree, setWorktrees, currentRepoPath } = useAppStore();
  const [hoveredWorktree, setHoveredWorktree] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [worktreePath, setWorktreePath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmWorktree, setDeleteConfirmWorktree] = useState<Worktree | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-generate worktree path when branch name changes
  useEffect(() => {
    if (branchName.trim()) {
      setWorktreePath(generateWorktreePath(branchName));
    }
  }, [branchName]);

  const handleSelect = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
  };

  const handleDeleteClick = (worktree: Worktree, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmWorktree(worktree);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmWorktree) return;

    setIsDeleting(true);
    try {
      await invoke('delete_worktree', {
        repoPath: '.',
        worktreePath: deleteConfirmWorktree.path
      });
      setWorktrees(worktrees.filter(w => w.path !== deleteConfirmWorktree.path));
      if (selectedWorktree?.path === deleteConfirmWorktree.path) {
        setSelectedWorktree(null);
      }
      setDeleteConfirmWorktree(null);
    } catch (error) {
      console.error('Failed to delete worktree:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenInEditor = async (worktree: Worktree, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('open_in_editor', {
        editor: 'vscode',
        path: worktree.path
      });
    } catch (error) {
      console.error('Failed to open in editor:', error);
    }
  };

  const getBranchName = (worktree: Worktree) => {
    if (!worktree.branch) return 'detached HEAD';
    return worktree.branch.replace('refs/heads/', '');
  };

  const getStatusColor = (_worktree: Worktree) => {
    // This would be based on actual worktree status
    return 'bg-emerald-500';
  };

  // Generate default worktree path based on repo name and branch
  const generateWorktreePath = (branch: string) => {
    const repoName = currentRepoPath
      ? currentRepoPath.split('/').pop() || 'repo'
      : 'repo';
    // Clean branch name for folder (remove special chars)
    const cleanBranch = branch.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    return `../${repoName}-${cleanBranch}`;
  };

  const handleCreateWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || !worktreePath.trim()) return;

    const repoPath = currentRepoPath || '.';
    setIsLoading(true);
    setError(null);

    try {
      const newWorktree: Worktree = await invoke('create_worktree', {
        repoPath,
        branch: branchName.trim(),
        path: worktreePath.trim()
      });
      setWorktrees([...worktrees, newWorktree]);
      setIsModalOpen(false);
      setBranchName('');
      setWorktreePath('');
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      {worktrees.map((worktree, index) => (
        <motion.div
          key={worktree.path}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: index * 0.05 }}
        >
          <div
            onClick={() => handleSelect(worktree)}
            onMouseEnter={() => setHoveredWorktree(worktree.path)}
            onMouseLeave={() => setHoveredWorktree(null)}
            className={cn(
              "group relative flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all",
              selectedWorktree?.path === worktree.path
                ? "bg-blue-500/10 border border-blue-500/20"
                : "hover:bg-slate-800 border border-transparent"
            )}
          >
            {/* Status Indicator */}
            <div className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              getStatusColor(worktree)
            )} />

            {/* Icon */}
            <Folder className={cn(
              "w-4 h-4 flex-shrink-0",
              selectedWorktree?.path === worktree.path
                ? "text-blue-400"
                : "text-slate-400"
            )} />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-medium truncate",
                  selectedWorktree?.path === worktree.path
                    ? "text-slate-100"
                    : "text-slate-300"
                )}>
                  {getBranchName(worktree)}
                </span>
                {worktree.is_main && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">
                    main
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {worktree.path.split('/').pop()}
              </div>
            </div>

            {/* Actions */}
            <div className={cn(
              "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
              hoveredWorktree === worktree.path ? "opacity-100" : ""
            )}>
              <button
                onClick={(e) => handleOpenInEditor(worktree, e)}
                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200"
                title="Open in Editor"
              >
                <ArrowSquareOut className="w-3.5 h-3.5" />
              </button>
              {!worktree.is_main && (
                <button
                  onClick={(e) => handleDeleteClick(worktree, e)}
                  className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                  title="Delete Worktree"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      ))}

      {/* Add Worktree Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: worktrees.length * 0.05 }}
        onClick={() => setIsModalOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 mt-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Worktree
      </motion.button>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmWorktree && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setDeleteConfirmWorktree(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-96 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                  <Trash className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">Delete Worktree</h3>
                  <p className="text-sm text-slate-400">
                    {getBranchName(deleteConfirmWorktree)}
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-300 mb-6">
                Are you sure you want to delete this worktree? This action cannot be undone.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirmWorktree(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Worktree Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-96 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">Create New Worktree</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateWorktree} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="feature/my-branch"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Branch will be created if it doesn't exist
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Worktree Path
                  </label>
                  <input
                    type="text"
                    value={worktreePath}
                    onChange={(e) => setWorktreePath(e.target.value)}
                    placeholder="../my-project-feature-1"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Auto-generated: ../{currentRepoPath ? currentRepoPath.split('/').pop() : 'repo'}-[branch-name]
                  </p>
                </div>

                {error && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !branchName.trim() || !worktreePath.trim()}
                    className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                  >
                    {isLoading ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}