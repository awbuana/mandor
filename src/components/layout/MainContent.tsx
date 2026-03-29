import { useAppStore } from '@/stores/appStore';
import { WorktreeView } from '@/components/worktree/WorktreeView';
import { DiffViewer } from '@/components/diff/DiffViewer';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, GitDiff } from '@phosphor-icons/react';
import { useState } from 'react';

type Tab = 'worktree' | 'diff';

export function MainContent() {
  const { selectedWorktree, showTerminalPanel } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('worktree');

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
      {/* Tabs */}
      <div className="h-10 border-b border-slate-800 flex items-center px-4 gap-1">
        <button
          onClick={() => setActiveTab('worktree')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'worktree' 
              ? 'bg-slate-800 text-slate-100' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Worktree
        </button>
        <button
          onClick={() => setActiveTab('diff')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'diff' 
              ? 'bg-slate-800 text-slate-100' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <GitDiff className="w-4 h-4" />
          Changes
        </button>
      </div>

      {/* Content */}
      <div 
        className="flex-1 overflow-hidden"
        style={{ 
          height: showTerminalPanel 
            ? `calc(100% - 300px - 40px)` 
            : 'calc(100% - 40px)' 
        }}
      >
        <AnimatePresence mode="wait">
          {activeTab === 'worktree' ? (
            <motion.div
              key="worktree"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-auto p-6"
            >
              {selectedWorktree ? (
                <WorktreeView worktree={selectedWorktree} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                  <GitBranch className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Select a worktree</p>
                  <p className="text-sm">Choose a worktree from the sidebar to get started</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="diff"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-auto"
            >
              <DiffViewer />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
