import { useAppStore } from '@/stores/appStore';
import { Worktree } from '@/types';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { 
  GitBranch, 
  Folder, 
  Circle,
  Trash,
  ArrowSquareOut,
  Plus
} from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

export function WorktreeList() {
  const { worktrees, selectedWorktree, setSelectedWorktree, setWorktrees } = useAppStore();
  const [hoveredWorktree, setHoveredWorktree] = useState<string | null>(null);

  const handleSelect = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
  };

  const handleDelete = async (worktree: Worktree, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete worktree at ${worktree.path}?`)) return;
    
    try {
      await invoke('delete_worktree', { 
        repoPath: '.',
        worktreePath: worktree.path 
      });
      setWorktrees(worktrees.filter(w => w.path !== worktree.path));
      if (selectedWorktree?.path === worktree.path) {
        setSelectedWorktree(null);
      }
    } catch (error) {
      console.error('Failed to delete worktree:', error);
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

  const getStatusColor = (worktree: Worktree) => {
    // This would be based on actual worktree status
    return 'bg-emerald-500';
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
                  onClick={(e) => handleDelete(worktree, e)}
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
        className="w-full flex items-center gap-2 px-3 py-2 mt-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Worktree
      </motion.button>
    </div>
  );
}
