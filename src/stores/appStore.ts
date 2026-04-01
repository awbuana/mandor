import { create } from 'zustand';
import { Worktree, TerminalSession, WorktreeStatus, DiffStats, FileComment } from '@/types';

// Unified worktree session container - everything in CenterPanel is scoped here
export interface OpenCodeServer {
  isRunning: boolean
  port: number
  hostname: string
  sessionId: string | null
}

export interface WorktreeSession {
  files: {
    openFiles: string[];
    activeFile: string | null;
  };
  // File comments for code review
  comments: Record<string, FileComment[]>;
  // Opencode TUI server info for this worktree
  opencodeServer?: OpenCodeServer;
}

/**
 * Main application state interface containing all global state
 */
interface AppState {
  // Repository
  currentRepoPath: string | null;

  // Worktrees
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  worktreeStatus: Record<string, WorktreeStatus>;
  // Diff stats per worktree path — updated in real-time by the file watcher
  diffStats: Record<string, DiffStats>;

  // Terminals
  terminals: TerminalSession[];
  activeTerminalId: string | null;

  // View State
  activeView: 'changes' | 'terminal' | 'tui';

  // Worktree Sessions (scoped state for CenterPanel - files, comments, etc.)
  worktreeSessions: Record<string, WorktreeSession>;

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
  setDiffStats: (path: string, stats: DiffStats) => void;

  addTerminal: (terminal: TerminalSession) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;

  setActiveView: (view: 'changes' | 'terminal' | 'tui') => void;

  // Worktree Session Actions
  getWorktreeSession: (worktreePath: string) => WorktreeSession;

  // File Actions (per worktree)
  openFile: (worktreePath: string, file: string) => void;
  closeFile: (worktreePath: string, file: string) => void;
  setActiveFile: (worktreePath: string, file: string | null) => void;

  // File comment actions (per worktree)
  addComment: (worktreePath: string, comment: FileComment) => void;
  removeComment: (worktreePath: string, filePath: string, commentId: string) => void;
  resolveComment: (worktreePath: string, filePath: string, commentId: string) => void;
  getFileComments: (worktreePath: string, filePath: string) => FileComment[];
  getAllComments: (worktreePath: string) => FileComment[];

  // Opencode server actions (per worktree)
  setOpencodeServer: (worktreePath: string, server: OpenCodeServer) => void;
  getOpencodeServer: (worktreePath: string) => OpenCodeServer | undefined;

  toggleSidebar: () => void;
  setTerminalPanelHeight: (height: number) => void;
  toggleTerminalPanel: () => void;
}

const createDefaultSession = (): WorktreeSession => ({
  files: {
    openFiles: [],
    activeFile: null,
  },
  comments: {},
});

/**
 * Main application state store using Zustand
 * Contains all global state for worktrees, terminals, and UI state
 */
export const useAppStore = create<AppState>((set, get) => ({
  currentRepoPath: null,
  worktrees: [],
  selectedWorktree: null,
  worktreeStatus: {},
  diffStats: {},
  terminals: [],
  activeTerminalId: null,
  activeView: 'changes',
  worktreeSessions: {},
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
  setDiffStats: (path, stats) => set((state) => ({
    diffStats: { ...state.diffStats, [path]: stats }
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

  // Worktree Session Actions
  getWorktreeSession: (worktreePath: string) => {
    return get().worktreeSessions[worktreePath] || createDefaultSession();
  },

  // File Actions (per worktree)
  openFile: (worktreePath: string, file: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    // If file is not already open, add it
    if (!currentSession.files.openFiles.includes(file)) {
      return {
        worktreeSessions: {
          ...state.worktreeSessions,
          [worktreePath]: {
            ...currentSession,
            files: {
              openFiles: [...currentSession.files.openFiles, file],
              activeFile: file,
            }
          }
        },
        activeView: 'changes'
      };
    }

    // If already open, just make it active
    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          files: {
            ...currentSession.files,
            activeFile: file,
          }
        }
      },
      activeView: 'changes'
    };
  }),

  closeFile: (worktreePath: string, file: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const newOpenFiles = currentSession.files.openFiles.filter(f => f !== file);

    // If closing the active file, switch to another file or null
    let newActiveFile = currentSession.files.activeFile;
    if (currentSession.files.activeFile === file) {
      newActiveFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null;
    }

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          files: {
            openFiles: newOpenFiles,
            activeFile: newActiveFile,
          }
        }
      }
    };
  }),

  setActiveFile: (worktreePath: string, file: string | null) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          files: {
            ...currentSession.files,
            activeFile: file,
          }
        }
      }
    };
  }),

  // File comment actions
  addComment: (worktreePath: string, comment: FileComment) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const fileComments = currentSession.comments[comment.filePath] || [];

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          comments: {
            ...currentSession.comments,
            [comment.filePath]: [...fileComments, comment],
          },
        },
      },
    };
  }),

  // Remove a comment from a file by its ID
  removeComment: (worktreePath: string, filePath: string, commentId: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const fileComments = currentSession.comments[filePath] || [];

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          comments: {
            ...currentSession.comments,
            [filePath]: fileComments.filter(c => c.id !== commentId),
          },
        },
      },
    };
  }),

  resolveComment: (worktreePath: string, filePath: string, commentId: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const fileComments = currentSession.comments[filePath] || [];

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          comments: {
            ...currentSession.comments,
            [filePath]: fileComments.map(c =>
              c.id === commentId ? { ...c, resolved: true } : c
            ),
          },
        },
      },
    };
  }),

  /**
   * Retrieves all comments for a specific file in a worktree session.
   * Returns an empty array if no comments exist for the file.
   *
   * @param worktreePath - The path to the worktree
   * @param filePath - The path to the file within the worktree
   * @returns Array of comments for the specified file
   */
  getFileComments: (worktreePath: string, filePath: string) => {
    const state = get();
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    return currentSession.comments[filePath] || [];
  },

  getAllComments: (worktreePath: string) => {
    const state = get();
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    return Object.values(currentSession.comments).flat();
  },

  setOpencodeServer: (worktreePath: string, server: OpenCodeServer) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          opencodeServer: server,
        },
      },
    };
  }),

  getOpencodeServer: (worktreePath: string) => {
    return get().worktreeSessions[worktreePath]?.opencodeServer;
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setTerminalPanelHeight: (height) => set({ terminalPanelHeight: height }),
  toggleTerminalPanel: () => set((state) => ({ showTerminalPanel: !state.showTerminalPanel })),
}));
