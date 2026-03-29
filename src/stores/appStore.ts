import { create } from 'zustand';
import { Worktree, TerminalSession, WorktreeStatus } from '@/types';

export interface OpencodeServerInstance {
  worktreePath: string;
  worktreeName: string;
  isRunning: boolean;
  port: number | null;
  hostname: string;
  sessionId: string | null;
  isInitializing: boolean;
  error: string | null;
}

export interface WorktreeFileSession {
  openFiles: string[];
  activeFile: string | null;
}

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

  // File Tabs (per worktree)
  worktreeFileSessions: Record<string, WorktreeFileSession>;

  // Opencode Servers (per worktree)
  opencodeServers: Record<string, OpencodeServerInstance>;

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

  // File Tab Actions (per worktree)
  getWorktreeFileSession: (worktreePath: string) => WorktreeFileSession;
  openFile: (worktreePath: string, file: string) => void;
  closeFile: (worktreePath: string, file: string) => void;
  setActiveFile: (worktreePath: string, file: string | null) => void;

  // Opencode Server Actions
  getOpencodeServer: (worktreePath: string) => OpencodeServerInstance | undefined;
  setOpencodeServer: (worktreePath: string, state: Partial<OpencodeServerInstance>) => void;
  startOpencodeServer: (worktreePath: string, worktreeName: string) => Promise<void>;
  stopOpencodeServer: (worktreePath: string) => Promise<void>;

  toggleSidebar: () => void;
  setTerminalPanelHeight: (height: number) => void;
  toggleTerminalPanel: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentRepoPath: null,
  worktrees: [],
  selectedWorktree: null,
  worktreeStatus: {},
  terminals: [],
  activeTerminalId: null,
  activeView: 'console',
  worktreeFileSessions: {},
  opencodeServers: {},
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

  // File Tab Actions (per worktree)
  getWorktreeFileSession: (worktreePath: string) => {
    const session = get().worktreeFileSessions[worktreePath];
    if (!session) {
      return { openFiles: [], activeFile: null };
    }
    return session;
  },

  openFile: (worktreePath: string, file: string) => set((state) => {
    const currentSession = state.worktreeFileSessions[worktreePath] || { openFiles: [], activeFile: null };

    // If file is not already open, add it
    if (!currentSession.openFiles.includes(file)) {
      return {
        worktreeFileSessions: {
          ...state.worktreeFileSessions,
          [worktreePath]: {
            openFiles: [...currentSession.openFiles, file],
            activeFile: file,
          }
        },
        activeView: 'changes'
      };
    }

    // If already open, just make it active
    return {
      worktreeFileSessions: {
        ...state.worktreeFileSessions,
        [worktreePath]: {
          ...currentSession,
          activeFile: file,
        }
      },
      activeView: 'changes'
    };
  }),

  closeFile: (worktreePath: string, file: string) => set((state) => {
    const currentSession = state.worktreeFileSessions[worktreePath] || { openFiles: [], activeFile: null };
    const newOpenFiles = currentSession.openFiles.filter(f => f !== file);

    // If closing the active file, switch to another file or null
    let newActiveFile = currentSession.activeFile;
    if (currentSession.activeFile === file) {
      newActiveFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null;
    }

    return {
      worktreeFileSessions: {
        ...state.worktreeFileSessions,
        [worktreePath]: {
          openFiles: newOpenFiles,
          activeFile: newActiveFile,
        }
      }
    };
  }),

  setActiveFile: (worktreePath: string, file: string | null) => set((state) => {
    const currentSession = state.worktreeFileSessions[worktreePath] || { openFiles: [], activeFile: null };

    return {
      worktreeFileSessions: {
        ...state.worktreeFileSessions,
        [worktreePath]: {
          ...currentSession,
          activeFile: file,
        }
      }
    };
  }),

  // Opencode Server Actions
  getOpencodeServer: (worktreePath: string) => {
    return get().opencodeServers[worktreePath];
  },

  setOpencodeServer: (worktreePath: string, serverState) => set((state) => ({
    opencodeServers: {
      ...state.opencodeServers,
      [worktreePath]: {
        ...state.opencodeServers[worktreePath],
        ...serverState,
        worktreePath,
      } as OpencodeServerInstance
    }
  })),

  startOpencodeServer: async (worktreePath: string, worktreeName: string) => {
    const { opencodeServers } = get();
    const existingServer = opencodeServers[worktreePath];

    // Don't start if already running or initializing
    if (existingServer?.isRunning || existingServer?.isInitializing) {
      return;
    }

    // Initialize server state
    set((state) => ({
      opencodeServers: {
        ...state.opencodeServers,
        [worktreePath]: {
          worktreePath,
          worktreeName,
          isRunning: false,
          port: null,
          hostname: '127.0.0.1',
          sessionId: null,
          isInitializing: true,
          error: null,
        }
      }
    }));

    try {
      // Import invoke dynamically to avoid issues
      const { invoke } = await import('@tauri-apps/api/core');

      // Start the opencode server via Tauri command
      // Use a different port for each worktree (base port 4096 + worktree index)
      const worktrees = get().worktrees;
      const worktreeIndex = worktrees.findIndex(w => w.path === worktreePath);
      const port = 4096 + (worktreeIndex >= 0 ? worktreeIndex : 0);

      const result = await invoke('start_opencode_server', {
        worktreePath,
        port,
      }) as { port: number; hostname: string; session_id: string };

      console.log('Server started:', result)

      set((state) => ({
        opencodeServers: {
          ...state.opencodeServers,
          [worktreePath]: {
            worktreePath,
            worktreeName,
            isRunning: true,
            port: result.port,
            hostname: result.hostname,
            sessionId: result.session_id,
            isInitializing: false,
            error: null,
          }
        }
      }));
    } catch (error) {
      console.error('Failed to start opencode server:', error);
      set((state) => ({
        opencodeServers: {
          ...state.opencodeServers,
          [worktreePath]: {
            worktreePath,
            worktreeName,
            isRunning: false,
            port: null,
            hostname: '127.0.0.1',
            sessionId: null,
            isInitializing: false,
            error: error instanceof Error ? error.message : 'Failed to start server',
          }
        }
      }));
    }
  },

  stopOpencodeServer: async (worktreePath: string) => {
    const { opencodeServers } = get();
    const server = opencodeServers[worktreePath];

    if (!server?.isRunning || !server.port) {
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_opencode_server', {
        hostname: server.hostname,
        port: server.port,
      });
    } catch (error) {
      console.error('Failed to stop opencode server:', error);
    }

    set((state) => ({
      opencodeServers: {
        ...state.opencodeServers,
        [worktreePath]: {
          ...state.opencodeServers[worktreePath],
          isRunning: false,
          port: null,
          sessionId: null,
          error: null,
        }
      }
    }));
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setTerminalPanelHeight: (height) => set({ terminalPanelHeight: height }),
  toggleTerminalPanel: () => set((state) => ({ showTerminalPanel: !state.showTerminalPanel })),
}));