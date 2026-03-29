import { useAppStore } from '@/stores/appStore';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  X, 
  Plus, 
  Command,
  CaretDown,
  Robot
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { TerminalInstance } from './TerminalInstance';
import { AgentType } from '@/types';

export function TerminalPanel() {
  const { 
    showTerminalPanel, 
    toggleTerminalPanel, 
    terminalPanelHeight,
    terminals,
    activeTerminalId,
    addTerminal,
    removeTerminal,
    setActiveTerminal,
    selectedWorktree
  } = useAppStore();

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isResizing) {
      const handleMouseMove = (e: MouseEvent) => {
        if (panelRef.current) {
          const newHeight = window.innerHeight - e.clientY;
          if (newHeight > 100 && newHeight < window.innerHeight * 0.7) {
            useAppStore.setState({ terminalPanelHeight: newHeight });
          }
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  const handleCreateTerminal = (agentType: AgentType) => {
    if (!selectedWorktree) {
      alert('Please select a worktree first');
      return;
    }

    const newTerminal = {
      id: `term_${Date.now()}`,
      worktree_path: selectedWorktree.path,
      agent_type: agentType,
      name: `${agentType} - ${selectedWorktree.branch?.replace('refs/heads/', '') || 'detached'}`,
    };

    addTerminal(newTerminal);
  };

  return (
    <AnimatePresence>
      {showTerminalPanel && (
        <motion.div
          ref={panelRef}
          initial={{ height: 0 }}
          animate={{ height: terminalPanelHeight }}
          exit={{ height: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-slate-800 bg-slate-900 flex flex-col"
        >
          {/* Resize Handle */}
          <div
            onMouseDown={() => setIsResizing(true)}
            className="h-1 cursor-ns-resize hover:bg-blue-500/50 transition-colors"
          />

          {/* Terminal Header */}
          <div className="h-10 border-b border-slate-800 flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-slate-400">
                <Terminal className="w-4 h-4" />
                <span className="text-sm font-medium">Terminal</span>
              </div>

              {/* Terminal Tabs */}
              <div className="flex items-center gap-1">
                {terminals.map((term) => (
                  <button
                    key={term.id}
                    onClick={() => setActiveTerminal(term.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors group",
                      activeTerminalId === term.id
                        ? "bg-slate-800 text-slate-200"
                        : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                    )}
                  >
                    <Robot className="w-3.5 h-3.5" />
                    <span className="max-w-32 truncate">{term.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTerminal(term.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </button>
                ))}

                {/* New Terminal Menu */}
                <div className="relative group">
                  <button className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300 rounded-md hover:bg-slate-800/50">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-full left-0 mb-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="p-1">
                      <button
                        onClick={() => handleCreateTerminal('opencode')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-md"
                      >
                        <Command className="w-4 h-4" />
                        OpenCode
                      </button>
                      <button
                        onClick={() => handleCreateTerminal('claude')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-md"
                      >
                        <Robot className="w-4 h-4" />
                        Claude Code
                      </button>
                      <button
                        onClick={() => handleCreateTerminal('bash')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-md"
                      >
                        <Terminal className="w-4 h-4" />
                        Bash
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTerminalPanel}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
              >
                <CaretDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 overflow-hidden relative">
            {terminals.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Terminal className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">No active terminals</p>
                <p className="text-xs text-slate-600 mt-1">Click + to start an agent</p>
              </div>
            ) : (
              terminals.map((term) => (
                <div
                  key={term.id}
                  className={cn(
                    "absolute inset-0",
                    activeTerminalId === term.id ? "visible" : "invisible"
                  )}
                >
                  <TerminalInstance terminal={term} />
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
