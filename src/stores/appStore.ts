import { create } from 'zustand';
import { Worktree, TerminalSession, WorktreeStatus } from '@/types';

interface AppState {
  // Repository
  currentRepoPath: string | null;

  // Worktrees
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  worktreeStatus: Record<string, WorktreeStatus>;

  // Terminals
  terminals: TerminalSession[];
  activeTerminalId: string | null;

  // View State
  activeView: 'console' | 'changes';
  
  // File Tabs
  openFiles: string[];
  activeFile: string | null;

  // UI State
  sidebarCollapsed: boolean;
  terminalPanelHeight: number;
  showTerminalPanel: boolean;

  // Actions
  setCurrentRepoPath: (path: string | null) => void;
  setWorktrees: (worktrees: Worktree[]) => void;
  addWorktree: (worktree: Worktree) => void;
  setSelectedWorktree: (worktree: Worktree | null) => void;
  setWorktreeStatus: (path: string, status: WorktreeStatus) => void;

  addTerminal: (terminal: TerminalSession) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;

  setActiveView: (view: 'console' | 'changes') => void;
  
  // File Tab Actions
  openFile: (file: string) => void;
  closeFile: (file: string) => void;
  setActiveFile: (file: string | null) => void;

  toggleSidebar: () => void;
  setTerminalPanelHeight: (height: number) => void;
  toggleTerminalPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRepoPath: null,
  worktrees: [],
  selectedWorktree: null,
  worktreeStatus: {},
  terminals: [],
  activeTerminalId: null,
  activeView: 'console',
  openFiles: [],
  activeFile: null,
  sidebarCollapsed: false,
  terminalPanelHeight: 300,
  showTerminalPanel: true,

  setCurrentRepoPath: (path) => set({ currentRepoPath: path }),
  setWorktrees: (worktrees) => set({ worktrees }),
  addWorktree: (worktree) => set((state) => ({ 
    worktrees: [...state.worktrees, worktree] 
  })),
  setSelectedWorktree: (worktree) => set({ selectedWorktree: worktree }),
  setWorktreeStatus: (path, status) => set((state) => ({
    worktreeStatus: { ...state.worktreeStatus, [path]: status }
  })),

  addTerminal: (terminal) => set((state) => ({
    terminals: [...state.terminals, terminal],
    activeTerminalId: terminal.id,
  })),
  removeTerminal: (id) => set((state) => ({
    terminals: state.terminals.filter((t) => t.id !== id),
    activeTerminalId: state.activeTerminalId === id
      ? state.terminals.find((t) => t.id !== id)?.id || null
      : state.activeTerminalId,
  })),
  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  setActiveView: (view) => set({ activeView: view }),
  
  // File Tab Actions
  openFile: (file) => set((state) => {
    // If file is not already open, add it
    if (!state.openFiles.includes(file)) {
      return {
        openFiles: [...state.openFiles, file],
        activeFile: file,
        activeView: 'changes'
      };
    }
    // If already open, just make it active
    return {
      activeFile: file,
      activeView: 'changes'
    };
  }),
  
  closeFile: (file) => set((state) => {
    const newOpenFiles = state.openFiles.filter(f => f !== file);
    // If closing the active file, switch to another file or null
    let newActiveFile = state.activeFile;
    if (state.activeFile === file) {
      newActiveFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null;
    }
    return {
      openFiles: newOpenFiles,
      activeFile: newActiveFile
    };
  }),
  
  setActiveFile: (file) => set({ activeFile: file }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setTerminalPanelHeight: (height) => set({ terminalPanelHeight: height }),
  toggleTerminalPanel: () => set((state) => ({ showTerminalPanel: !state.showTerminalPanel })),
}));
