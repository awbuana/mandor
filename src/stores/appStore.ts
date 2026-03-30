import { create } from 'zustand';
import { Worktree, TerminalSession, WorktreeStatus, FileComment } from '@/types';

/**
 * Represents an instance of the opencode server running for a specific worktree
 */
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

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageId?: string;
  partId?: string;
  type?: string;
}

// Unified worktree session container - everything in CenterPanel is scoped here
export interface WorktreeSession {
  files: {
    openFiles: string[];
    activeFile: string | null;
  };
  agent: {
    messages: AgentMessage[];
    isSending: boolean;
    streamingContent: string;
    // Streaming messages tracked by messageID for SSE event handling
    streamingMessages: Record<string, AgentMessage>;
    // Selected model for this worktree's agent (format: "providerId/modelId")
    selectedModel?: string;
    // Available providers with their models
    availableProviders: Array<{
      id: string;
      name: string;
      models: Record<string, { id: string; name: string }>;
    }>;
    // Opencode session info scoped to this worktree
    opencodeSession?: {
      sessionId: string;
      port: number;
      hostname: string;
      isRunning: boolean;
    };
  };
  // File comments for code review
  comments: Record<string, FileComment[]>;
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

  // Terminals
  terminals: TerminalSession[];
  activeTerminalId: string | null;

  // View State
  activeView: 'console' | 'changes';

  // Worktree Sessions (scoped state for CenterPanel - files, agent messages, etc.)
  worktreeSessions: Record<string, WorktreeSession>;

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

  // Worktree Session Actions
  getWorktreeSession: (worktreePath: string) => WorktreeSession;

  // File Actions (per worktree)
  openFile: (worktreePath: string, file: string) => void;
  closeFile: (worktreePath: string, file: string) => void;
  setActiveFile: (worktreePath: string, file: string | null) => void;

  // Agent Actions (per worktree)
  addAgentMessage: (worktreePath: string, message: AgentMessage) => void;
  clearAgentMessages: (worktreePath: string) => void;
  setAgentOpencodeSession: (worktreePath: string, session: { sessionId: string; port: number; hostname: string; isRunning: boolean } | undefined) => void;
  setAgentIsSending: (worktreePath: string, isSending: boolean) => void;
  setAgentStreamingContent: (worktreePath: string, content: string) => void;
  appendAgentStreamingContent: (worktreePath: string, content: string) => void;
  setAgentSelectedModel: (worktreePath: string, model: string | undefined) => void;
  setAgentAvailableProviders: (worktreePath: string, providers: Array<{ id: string; name: string; models: Record<string, { id: string; name: string }> }>) => void;
  fetchAgentModels: (worktreePath: string) => Promise<void>;
  // Streaming message actions (per worktree)
  addStreamingMessage: (worktreePath: string, message: AgentMessage) => void;
  updateStreamingMessage: (worktreePath: string, messageId: string, updates: Partial<AgentMessage>) => void;
  upsertStreamingMessage: (worktreePath: string, message: AgentMessage) => void;
  appendStreamingMessageDelta: (worktreePath: string, messageId: string, delta: string) => void;
  finalizeStreamingMessage: (worktreePath: string, messageId: string) => void;
  clearStreamingMessages: (worktreePath: string) => void;

  // File comment actions (per worktree)
  addComment: (worktreePath: string, comment: FileComment) => void;
  removeComment: (worktreePath: string, filePath: string, commentId: string) => void;
  resolveComment: (worktreePath: string, filePath: string, commentId: string) => void;
  getFileComments: (worktreePath: string, filePath: string) => FileComment[];
  getAllComments: (worktreePath: string) => FileComment[];

  // Opencode Server Actions
  getOpencodeServer: (worktreePath: string) => OpencodeServerInstance | undefined;
  setOpencodeServer: (worktreePath: string, state: Partial<OpencodeServerInstance>) => void;
  startOpencodeServer: (worktreePath: string, worktreeName: string) => Promise<void>;
  stopOpencodeServer: (worktreePath: string) => Promise<void>;

  toggleSidebar: () => void;
  setTerminalPanelHeight: (height: number) => void;
  toggleTerminalPanel: () => void;
}

const createDefaultSession = (): WorktreeSession => ({
  files: {
    openFiles: [],
    activeFile: null,
  },
  agent: {
    messages: [],
    isSending: false,
    streamingContent: '',
    streamingMessages: {},
    selectedModel: undefined,
    availableProviders: [],
    opencodeSession: undefined,
  },
  comments: {},
});

/**
 * Main application state store using Zustand
 * Contains all global state for worktrees, terminals, agent sessions, and UI state
 */
export const useAppStore = create<AppState>((set, get) => ({
  currentRepoPath: null,
  worktrees: [],
  selectedWorktree: null,
  worktreeStatus: {},
  terminals: [],
  activeTerminalId: null,
  activeView: 'console',
  worktreeSessions: {},
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

  // Agent Actions (per worktree)
  addAgentMessage: (worktreePath: string, message: AgentMessage) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            messages: [...currentSession.agent.messages, message],
          }
        }
      }
    };
  }),

  clearAgentMessages: (worktreePath: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            messages: [],
          }
        }
      }
    };
  }),

  setAgentOpencodeSession: (worktreePath: string, session: { sessionId: string; port: number; hostname: string; isRunning: boolean } | undefined) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            opencodeSession: session,
          }
        }
      }
    };
  }),

  setAgentIsSending: (worktreePath: string, isSending: boolean) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            isSending,
          }
        }
      }
    };
  }),

  setAgentStreamingContent: (worktreePath: string, content: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingContent: content,
          }
        }
      }
    };
  }),

  appendAgentStreamingContent: (worktreePath: string, content: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingContent: currentSession.agent.streamingContent + content,
          }
        }
      }
    };
  }),

  addStreamingMessage: (worktreePath: string, message: AgentMessage) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingMessages: {
              ...currentSession.agent.streamingMessages,
              [message.messageId || message.id]: message,
            },
          }
        }
      }
    };
  }),

  updateStreamingMessage: (worktreePath: string, messageId: string, updates: Partial<AgentMessage>) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const existingMessage = currentSession.agent.streamingMessages[messageId];

    if (!existingMessage) return state;

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingMessages: {
              ...currentSession.agent.streamingMessages,
              [messageId]: { ...existingMessage, ...updates },
            },
          }
        }
      }
    };
  }),

  upsertStreamingMessage: (worktreePath: string, message: AgentMessage) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const key = message.messageId || message.id;
    const existingMessage = currentSession.agent.streamingMessages[key];

    if (existingMessage) {
      return {
        worktreeSessions: {
          ...state.worktreeSessions,
          [worktreePath]: {
            ...currentSession,
            agent: {
              ...currentSession.agent,
              streamingMessages: {
                ...currentSession.agent.streamingMessages,
                [key]: { ...existingMessage, ...message },
              },
            }
          }
        }
      };
    }

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingMessages: {
              ...currentSession.agent.streamingMessages,
              [key]: message,
            },
          }
        }
      }
    };
  }),

  appendStreamingMessageDelta: (worktreePath: string, messageId: string, delta: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const existingMessage = currentSession.agent.streamingMessages[messageId];

    if (!existingMessage) return state;

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingMessages: {
              ...currentSession.agent.streamingMessages,
              [messageId]: { 
                ...existingMessage, 
                content: existingMessage.content + delta 
              },
            },
          }
        }
      }
    };
  }),

  finalizeStreamingMessage: (worktreePath: string, messageId: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
    const streamingMessage = currentSession.agent.streamingMessages[messageId];

    if (!streamingMessage) return state;

    const { [messageId]: _, ...remainingStreaming } = currentSession.agent.streamingMessages;

    const finalizedMessage = {
      ...streamingMessage,
      isStreaming: false,
      timestamp: streamingMessage.timestamp || new Date(),
    };

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingMessages: remainingStreaming,
            messages: [...currentSession.agent.messages, finalizedMessage],
          }
        }
      }
    };
  }),

  clearStreamingMessages: (worktreePath: string) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            streamingMessages: {},
          }
        }
      }
    };
  }),

  setAgentSelectedModel: (worktreePath: string, model: string | undefined) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            selectedModel: model,
          }
        }
      }
    };
  }),

  setAgentAvailableProviders: (worktreePath: string, providers: Array<{ id: string; name: string; models: Record<string, { id: string; name: string }> }>) => set((state) => {
    const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();

    return {
      worktreeSessions: {
        ...state.worktreeSessions,
        [worktreePath]: {
          ...currentSession,
          agent: {
            ...currentSession.agent,
            availableProviders: providers,
          }
        }
      }
    };
  }),

  fetchAgentModels: async (worktreePath: string) => {
    const server = get().opencodeServers[worktreePath];
    if (!server?.isRunning || !server.port) {
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('get_opencode_providers', {
        hostname: server.hostname,
        port: server.port,
      }) as { 
        all: Array<{ 
          id: string; 
          name: string;
          models: Record<string, { id: string; name: string }>;
        }>;
        connected: string[];
      };

      console.log('Providers response:', result);

      // Filter to only connected providers
      const connectedProviders = result.all?.filter((provider: { id: string }) => 
        result.connected?.includes(provider.id)
      ) || [];

      console.log('Connected providers:', connectedProviders);

      // Update available providers
      get().setAgentAvailableProviders(worktreePath, connectedProviders);
      
      // Set default model if none selected (use first model from first provider)
      const currentSession = get().worktreeSessions[worktreePath];
      if (!currentSession?.agent.selectedModel && connectedProviders.length > 0) {
        const firstProvider = connectedProviders[0];
        const firstModelKey = Object.keys(firstProvider.models)[0];
        if (firstModelKey) {
          get().setAgentSelectedModel(worktreePath, `${firstProvider.id}/${firstModelKey}`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  },

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

      const serverInstance: OpencodeServerInstance = {
        worktreePath,
        worktreeName,
        isRunning: true,
        port: result.port,
        hostname: result.hostname,
        sessionId: result.session_id,
        isInitializing: false,
        error: null,
      };

      set((state) => {
        const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
        
        return {
          opencodeServers: {
            ...state.opencodeServers,
            [worktreePath]: serverInstance,
          },
          worktreeSessions: {
            ...state.worktreeSessions,
            [worktreePath]: {
              ...currentSession,
              agent: {
                ...currentSession.agent,
                opencodeSession: {
                  sessionId: result.session_id,
                  port: result.port,
                  hostname: result.hostname,
                  isRunning: true,
                },
              },
            },
          },
        };
      });
    } catch (error) {
      console.error('Failed to start opencode server:', error);
      set((state) => {
        const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
        
        return {
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
          },
          worktreeSessions: {
            ...state.worktreeSessions,
            [worktreePath]: {
              ...currentSession,
              agent: {
                ...currentSession.agent,
                opencodeSession: undefined,
              },
            },
          },
        };
      });
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

    set((state) => {
      const currentSession = state.worktreeSessions[worktreePath] || createDefaultSession();
      
      return {
        opencodeServers: {
          ...state.opencodeServers,
          [worktreePath]: {
            ...state.opencodeServers[worktreePath],
            isRunning: false,
            port: null,
            sessionId: null,
            error: null,
          }
        },
        worktreeSessions: {
          ...state.worktreeSessions,
          [worktreePath]: {
            ...currentSession,
            agent: {
              ...currentSession.agent,
              opencodeSession: undefined,
            },
          },
        },
      };
    });
  },

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

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setTerminalPanelHeight: (height) => set({ terminalPanelHeight: height }),
  toggleTerminalPanel: () => set((state) => ({ showTerminalPanel: !state.showTerminalPanel })),
}));