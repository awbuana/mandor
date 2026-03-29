import { useAppStore } from '@/stores/appStore';
import { WorktreeList } from '@/components/worktree/WorktreeList';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  TreeStructure,
  Terminal,
  GitBranch,
  FolderOpen
} from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { Worktree } from '@/types';

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, currentRepoPath, setCurrentRepoPath, setWorktrees } = useAppStore();

  const handleOpenRepository = async () => {
    console.log('Opening repository...')
    try {
      const repoPath: string = await invoke('open_repository')
      console.log('Selected repo:', repoPath)
      setCurrentRepoPath(repoPath)

      // Load worktrees for the selected repository
      const worktrees: Worktree[] = await invoke('list_worktrees', { repoPath })
      console.log('Loaded worktrees:', worktrees)
      setWorktrees(worktrees)
    } catch (error) {
      console.error('Failed to open repository:', error)
      alert('Error: ' + error)
    }
  }

  return (
    <motion.aside 
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={cn(
        "h-full bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300",
        sidebarCollapsed ? "w-14" : "w-72"
      )}
    >
      {/* Header */}
      <div className="h-14 border-b border-slate-800 flex items-center px-4">
        <motion.div 
          className="flex items-center gap-3"
          layout
        >
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <TreeStructure className="w-5 h-5 text-white" weight="bold" />
          </div>
          {!sidebarCollapsed && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-semibold text-slate-100 tracking-tight"
            >
              Mandor
            </motion.span>
          )}
        </motion.div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-hidden">
        {!sidebarCollapsed && (
          <div className="p-4">
            <div className="space-y-4">
              {/* Worktrees Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Worktrees
                  </h3>
                  <button className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors">
                    <GitBranch className="w-4 h-4" />
                  </button>
                </div>
                <WorktreeList />
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Quick Actions
                </h3>
                <div className="space-y-1">
                  <button
                    onClick={handleOpenRepository}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 rounded-md transition-colors"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Open Repository
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 rounded-md transition-colors">
                    <Terminal className="w-4 h-4" />
                    New Terminal
                  </button>
                </div>
              </div>

              {/* Current Repository */}
              {currentRepoPath && (
                <div className="pt-2 border-t border-slate-800">
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                    Current Repository
                  </h3>
                  <p className="text-xs text-slate-300 truncate" title={currentRepoPath}>
                    {currentRepoPath.split('/').pop()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="h-10 border-t border-slate-800 flex items-center justify-center hover:bg-slate-800 transition-colors"
      >
        <motion.div
          animate={{ rotate: sidebarCollapsed ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </motion.div>
      </button>
    </motion.aside>
  );
}
