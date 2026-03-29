import { create } from 'zustand';
import { Worktree, TerminalSession, WorktreeStatus } from '@/types';

interface AppState {
  // Worktrees
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  worktreeStatus: Record<string, WorktreeStatus>;
  
  // Terminals
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  
  // UI State
  sidebarCollapsed: boolean;
  terminalPanelHeight: number;
  showTerminalPanel: boolean;
  
  // Actions
  setWorktrees: (worktrees: Worktree[]) => void;
  setSelectedWorktree: (worktree: Worktree | null) => void;
  setWorktreeStatus: (path: string, status: WorktreeStatus) => void;
  
  addTerminal: (terminal: TerminalSession) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;
  
  toggleSidebar: () => void;
  setTerminalPanelHeight: (height: number) => void;
  toggleTerminalPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  worktrees: [],
  selectedWorktree: null,
  worktreeStatus: {},
  terminals: [],
  activeTerminalId: null,
  sidebarCollapsed: false,
  terminalPanelHeight: 300,
  showTerminalPanel: true,
  
  setWorktrees: (worktrees) => set({ worktrees }),
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
  
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setTerminalPanelHeight: (height) => set({ terminalPanelHeight: height }),
  toggleTerminalPanel: () => set((state) => ({ showTerminalPanel: !state.showTerminalPanel })),
}));
