import { Worktree, FileStatus } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { motion } from 'framer-motion';
import { 
  GitBranch, 
  GitCommit, 
  FolderOpen,
  FileCode,
  Plus,
  Minus,
  Circle,
  Terminal,
  Play,
  Check,
  X
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface WorktreeViewProps {
  worktree: Worktree;
}

export function WorktreeView({ worktree }: WorktreeViewProps) {
  const { worktreeStatus, setWorktreeStatus } = useAppStore();
  const status = worktreeStatus[worktree.path];
  const [commitMessage, setCommitMessage] = useState('');

  useEffect(() => {
    loadStatus();
  }, [worktree.path]);

  const loadStatus = async () => {
    try {
      const status = await invoke('get_worktree_status', { 
        worktreePath: worktree.path 
      });
      setWorktreeStatus(worktree.path, status as any);
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const getTotalChanges = () => {
    if (!status) return 0;
    return status.modified.length + status.staged.length + status.untracked.length;
  };

  const handleStage = async (file: FileStatus) => {
    try {
      await invoke('stage_file', { 
        worktreePath: worktree.path,
        filePath: file.path 
      });
      loadStatus();
    } catch (error) {
      console.error('Failed to stage file:', error);
    }
  };

  const handleUnstage = async (file: FileStatus) => {
    try {
      await invoke('unstage_file', { 
        worktreePath: worktree.path,
        filePath: file.path 
      });
      loadStatus();
    } catch (error) {
      console.error('Failed to unstage file:', error);
    }
  };

  const handleDiscard = async (file: FileStatus) => {
    if (!confirm(`Discard changes in ${file.path}?`)) return;
    try {
      await invoke('discard_changes', { 
        worktreePath: worktree.path,
        filePath: file.path 
      });
      loadStatus();
    } catch (error) {
      console.error('Failed to discard changes:', error);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    try {
      await invoke('commit', { 
        worktreePath: worktree.path,
        message: commitMessage 
      });
      setCommitMessage('');
      loadStatus();
    } catch (error) {
      console.error('Failed to commit:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            {worktree.branch?.replace('refs/heads/', '') || 'Detached HEAD'}
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <GitCommit className="w-4 h-4" />
              <code className="text-slate-300">{worktree.head.slice(0, 7)}</code>
            </div>
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4" />
              <span className="truncate max-w-md">{worktree.path}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors">
            <Terminal className="w-4 h-4" />
            Open Terminal
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
            <Play className="w-4 h-4" />
            Launch Agent
          </button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-3 gap-4">
        <StatusCard 
          title="Modified" 
          count={status?.modified.length || 0} 
          icon={FileCode}
          color="text-yellow-400"
        />
        <StatusCard 
          title="Staged" 
          count={status?.staged.length || 0} 
          icon={Check}
          color="text-emerald-400"
        />
        <StatusCard 
          title="Untracked" 
          count={status?.untracked.length || 0} 
          icon={Plus}
          color="text-blue-400"
        />
      </div>

      {/* Changes Section */}
      {status && getTotalChanges() > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-medium text-slate-200">Changes</h3>
            <span className="text-xs text-slate-500">{getTotalChanges()} files changed</span>
          </div>
          
          <div className="divide-y divide-slate-800">
            {/* Staged Files */}
            {status.staged.map((file) => (
              <FileChangeRow 
                key={file.path} 
                file={file} 
                onUnstage={() => handleUnstage(file)}
                onDiscard={() => handleDiscard(file)}
                isStaged
              />
            ))}
            
            {/* Modified Files */}
            {status.modified.map((file) => (
              <FileChangeRow 
                key={file.path} 
                file={file} 
                onStage={() => handleStage(file)}
                onDiscard={() => handleDiscard(file)}
              />
            ))}
            
            {/* Untracked Files */}
            {status.untracked.map((path) => (
              <FileChangeRow 
                key={path} 
                file={{ path, status: '?', staged: false }} 
                onStage={() => handleStage({ path, status: '?', staged: false })}
                isNew
              />
            ))}
          </div>
        </div>
      )}

      {/* Commit Section */}
      {status && (status.staged.length > 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="font-medium text-slate-200 mb-3">Commit Changes</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Enter commit message..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCommit}
              disabled={!commitMessage.trim()}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
            >
              Commit
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function StatusCard({ title, count, icon: Icon, color }: { 
  title: string; 
  count: number; 
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{count}</p>
        </div>
        <div className={cn("p-3 bg-slate-800 rounded-lg", color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

interface FileChangeRowProps {
  file: FileStatus;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  isStaged?: boolean;
  isNew?: boolean;
}

function FileChangeRow({ file, onStage, onUnstage, onDiscard, isStaged, isNew }: FileChangeRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const getStatusIcon = () => {
    if (isNew) return <Plus className="w-4 h-4 text-blue-400" />;
    if (file.status === 'M') return <FileCode className="w-4 h-4 text-yellow-400" />;
    if (file.status === 'D') return <Minus className="w-4 h-4 text-red-400" />;
    return <Circle className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div 
      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-800/50 transition-colors"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {getStatusIcon()}
      <span className="flex-1 text-sm text-slate-300 font-mono truncate">{file.path}</span>
      
      {isHovered && (
        <div className="flex items-center gap-1">
          {onStage && (
            <button 
              onClick={onStage}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-emerald-400"
              title="Stage"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {onUnstage && (
            <button 
              onClick={onUnstage}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-yellow-400"
              title="Unstage"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
          {onDiscard && (
            <button 
              onClick={onDiscard}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
              title="Discard"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      
      {isStaged && (
        <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
          staged
        </span>
      )}
    </div>
  );
}
