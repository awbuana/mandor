# AGENTS.md - Agentic Coding Guidelines

## Project Overview

**Mandor Workbench** is an IDE for managing git worktrees with an integrated opencode console and code review/diff viewer capabilities.

Key features:
- **Git Worktree Management** - List, create, and delete git worktrees with visual indicators for status
- **Opencode Console** - Built-in terminal integration for running AI agents (opencode, claude, cursor) within each worktree context
- **Git Diff/Code Review** - Visual diff viewer for reviewing changes across worktrees

Inspired by: https://superset.sh/

## Build Commands

```bash
# Development
npm run dev          # Start Vite dev server on port 1420

# Production Build
npm run build        # TypeScript compile + Vite build

# Tauri
npm run tauri dev    # Start Tauri dev mode
npm run tauri build  # Build Tauri app

# Rust (src-tauri/)
cd src-tauri && cargo build       # Build Rust dependencies
cd src-tauri && cargo check       # Check Rust code
cd src-tauri && cargo clippy      # Run Rust linter
cd src-tauri && cargo test        # Run Rust tests
```

## Code Style Guidelines

### TypeScript/React Conventions
- **Use single quotes** for strings
- **No semicolons** at end of statements
- **2-space indentation**
- **PascalCase** for component names, interfaces, types
- **camelCase** for functions, variables, props
- **Interface names**: Descriptive (e.g., `Worktree`, `AppState`)
- **Always use TypeScript** - no `.js` files

### Imports
- Use path alias `@/` for src imports
- Group imports: React, third-party, internal (stores, types, components, utils)
- Example order:
  ```typescript
  import { useState } from 'react'
  import { motion } from 'framer-motion'
  import { useAppStore } from '@/stores/appStore'
  import { Worktree } from '@/types'
  import { cn } from '@/lib/utils'
  ```

### Components
- Use function declarations (not const arrow functions)
- Props interfaces named with `Props` suffix
- Use Radix UI primitives for accessibility
- Wrap interactive elements with Framer Motion for animations
- Example:
  ```typescript
  interface ButtonProps {
    children: ReactNode
    onClick?: () => void
  }
  
  export function Button({ children, onClick }: ButtonProps) {
    return <button onClick={onClick}>{children}</button>
  }
  ```

### Styling
- Use TailwindCSS utility classes
- Use `cn()` from `@/lib/utils` for conditional classes
- Dark mode is default (slate-950 background)
- Use semantic colors from tailwind.config.js (primary, secondary, muted, etc.)

### State Management
- Use Zustand for global state
- Store files in `src/stores/` with naming `*Store.ts`
- Store interfaces defined in same file

### Types
- Define in `src/types/index.ts`
- Export all types/interfaces
- Use descriptive names

### Error Handling
- Use try/catch for async operations
- Log errors to console with descriptive messages
- Use user-friendly error messages for UI

### Rust Conventions
- Use snake_case for functions and variables
- Use PascalCase for structs and enums
- Organize commands in modules (git.rs, worktree.rs, terminal.rs, opencode.rs)
- Use `tauri::command` for frontend-facing functions

## Architecture

### Rendering Overview

The application uses a **three-panel layout** with Zustand for state management:

```
┌──────────────────────────────────────────────────────────────────────┐
│  TitleBar (drag region + window controls)                            │
├────────────┬─────────────────────────────────────┬───────────────────┤
│            │                                     │                   │
│  Sidebar   │       CenterPanel                   │   ReviewPanel     │
│  (worktree │   ┌─────────────────────────────┐    │   (source control│
│   list)    │   │ Agent Tabs │ View Tabs      │    │    + comments     │
│            │   ├────────────┴─────────────────┤    │                   │
│  Ports     │   │                             │    │   - Staged        │
│  Panel     │   │  Console View                │    │   - Changes       │
│            │   │  (agent chat + streaming)    │    │   - Comments      │
│            │   │                              │    │   - History       │
│            │   │  OR                          │    │                   │
│            │   │                              │    │                   │
│            │   │  Changes View                │    │                   │
│            │   │  (diff + inline comments)    │    │                   │
│            │   └─────────────────────────────┘    │                   │
│            │   Command Input                     │                   │
└────────────┴─────────────────────────────────────┴───────────────────┘
```

### State Management (Zustand Store)

**Worktree Sessions** - All per-worktree state is scoped in `worktreeSessions`:
- `files.openFiles[]` - Open file tabs
- `files.activeFile` - Currently selected file
- `agent.messages[]` - Chat message history
- `agent.streamingMessages{}` - Active streaming messages by ID
- `agent.selectedModel` - Current provider/model selection
- `comments{}` - File comments indexed by path

**Opencode Servers** - Each worktree can have its own server instance:
- `isRunning`, `port`, `hostname`, `sessionId`
- Per-worktree server instances (port 4096 + worktree index)

### View Rendering Logic

**CenterPanel** switches between two views based on `activeView` state:
- `'console'` - Agent chat interface with SSE streaming
- `'changes'` - Diff viewer with inline comments

**ReviewPanel** shows git status:
- Staged files (tree view with expand/collapse)
- Unstaged changes
- Comments grouped by file
- Git log/history

### Component Hierarchy

```
App
├── TitleBar
├── Sidebar
│   ├── WorktreeList (branch names, commit hash, diff stats)
│   ├── PortsPanel (running opencode servers)
│   ├── CreateWorktreeModal
│   └── DeleteWorktreeModal (confirmation dialog)
├── CenterPanel
│   ├── AgentTabs (opencode console)
│   ├── ViewTabs (console | changes)
│   ├── ConsoleView
│   │   ├── Messages (role-based styling)
│   │   │   ├── User messages (orange bubble)
│   │   │   ├── Assistant text (dark bubble)
│   │   │   ├── Reasoning (subtle styling)
│   │   │   └── Tool calls (status badges)
│   │   ├── StreamingMessages (real-time SSE)
│   │   ├── PendingQuestion (option buttons)
│   │   └── CommandInput (provider/model selectors)
│   └── ChangesView
│       ├── FileTabs
│       ├── FileHeader (extension, path, zoom)
│       └── InlineDiffViewer
│           ├── Line numbers (old/new)
│           ├── Diff content (syntax colored)
│           └── CommentBubbles (inline)
└── ReviewPanel
    ├── CommitInput
    ├── StagedChanges (tree view)
    ├── Changes (tree view)
    ├── CommentsSection
    └── GitLog
```

### SSE Streaming Flow

1. Server starts via `startOpencodeServer` → stores session info
2. `stream_opencode_events` invoked to start SSE connection
3. Events handled in `opencode-event` listener via `listen('opencode-event', ...)`:

#### Event Processing Order

```
┌─────────────────────────────────────────────────────────────┐
│  Incoming SSE Event                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  session.status?  ──→  Update isBusy flag                   │
│  (busy/idle)         If busy (was idle) → finalize all      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  session.idle?   ──→  Finalize all streaming messages       │
│                     Clear activeMessageIds & messageRoles     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  question.asked? ──→  Finalize streaming, show options      │
│                     Set pendingQuestion state                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  message.updated? ──→  Store messageId → role mapping       │
│                      Set isBusy = true if role=assistant     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  message.part.delta? ──→  Only if field='text'              │
│  (streaming text)      AND role='assistant'                  │
│                        Create streaming message, append delta│
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  !isBusy? ──→  Skip event (return early)                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  message.part.updated?                                       │
│    ├── partType='tool' → Create tool call message            │
│    │                    Track status: pending/running/        │
│    │                        completed/error                  │
│    │                    Extract output from state            │
│    │                                                  │
│    └── text content  →  Create text/reasoning message        │
│                         type='reasoning' if applicable      │
└─────────────────────────────────────────────────────────────┘
```

#### Event Details

| Event Type | Condition | Action |
|------------|-----------|--------|
| `session.status` | - | Updates `isBusy` flag. When transitioning **idle→busy**, finalizes all active streaming messages |
| `session.idle` | - | Finalizes all `activeMessageIds`, clears tracking maps, sets `isSending=false` |
| `question.asked` | - | Finalizes all streaming messages, stores question options in `pendingQuestion` state |
| `message.updated` | - | Stores `messageId → role` mapping in `messageRoles`. Sets `isBusy=true` for assistant role |
| `message.part.delta` | `field === 'text'` AND `role === 'assistant'` | Creates/upserts streaming message (content=''), appends delta via `appendStreamingMessageDelta` |
| `message.part.updated` | `isBusy === true` AND `role === 'assistant'` | Creates tool call messages (type='tool') or text/reasoning messages |

#### Tool Call Message Structure

When `partType === 'tool'`, the message includes:
```typescript
{
  type: 'tool',
  toolCall: {
    tool: string,           // Tool name (read, grep, etc.)
    callID: string,        // Call identifier
    status: 'pending' | 'running' | 'completed' | 'error',
    input?: Record<string, unknown>,  // Tool input from state
    output?: string        // Output/error from state
  }
}
```

Output is extracted from `state` with priority: `output` → `error` → `message`

#### State Variables (local to SSE listener)

- `activeMessageIds: Set<string>` - PartIds being streamed, cleared on session transitions
- `messageRoles: Map<string, string>` - messageId → role ('user'/'assistant') mapping  
- `isBusy: boolean` - Agent busy state, set true on `message.updated` with assistant role

### Agent Message Rendering

#### Message Storage

Messages are stored in two locations:
- **`agent.messages[]`** - Finalized/completed messages (persistent chat history)
- **`agent.streamingMessages{}`** - Active streaming messages by messageId (real-time updates)

#### Message Interface

```typescript
interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageId?: string;   // For linking SSE events to messages
  partId?: string;      // For multi-part messages (tool calls)
  type?: string;        // 'tool' | 'reasoning' | undefined
  isStreaming?: boolean;
  toolCall?: {
    tool: string;
    callID: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    input?: Record<string, unknown>;
    output?: string;
  };
}
```

#### State Actions

| Action | Description |
|--------|-------------|
| `addStreamingMessage` | Add new streaming message by messageId |
| `updateStreamingMessage` | Update partial fields of streaming message |
| `upsertStreamingMessage` | Create or update streaming message (idempotent) |
| `appendStreamingMessageDelta` | Append text delta to streaming message content |
| `finalarizeStreamingMessage` | Move from streaming to finalized (adds to messages[], removes from streaming) |
| `clearStreamingMessages` | Clear all streaming messages (e.g., on error) |

#### Rendering Flow

1. **Incoming SSE delta** → `appendStreamingMessageDelta` updates `streamingMessages[messageId]`
2. **Tool call starts** → `addStreamingMessage` with type='tool', status='pending'
3. **Tool running** → `updateStreamingMessage` sets status='running'
4. **Tool completes** → `updateStreamingMessage` sets status='completed', adds output
5. **Session idle** → `finalizeStreamingMessage` moves all to `agent.messages[]`

#### Rendering Components

**Finalized Messages** (`agent.messages[]`):
- Displayed with timestamps (except reasoning type)
- Role-based styling: user (orange bubble), assistant (dark bubble)
- Tool calls show status badge and formatted input/output
- Reasoning messages styled subtly with `[+]` icon

**Streaming Messages** (`agent.streamingMessages{}`):
- Real-time updates via `message.part.delta` events
- No timestamps shown while streaming
- Empty content shows animated spinner
- Tool calls transition through statuses: `pending` → `running` → `completed`/`error`
- On `session.idle` or `session.status` busy transition, finalized and moved to `agent.messages[]`

**Message Types**:
- `undefined` - Regular assistant text
- `'tool'` - Tool call invocation (read, grep, etc.)
- `'reasoning'` - Chain-of-thought reasoning (subtle styling)

**Tool Call States**:
- `pending` - Tool invoked but not started (gray badge)
- `running` - Tool executing (orange badge)
- `completed` - Tool finished successfully (green badge)
- `error` - Tool failed (red badge, error output shown)

## Project Structure

```
src/
  components/
    layout/
      AppShell.tsx    # Motion wrapper (entry animation)
      CenterPanel.tsx # Main content (console + changes views)
      Sidebar.tsx     # Worktree list + ports panel
      TitleBar.tsx    # Window title bar
      ReviewPanel.tsx # Source control + comments
    ui/               # Reusable UI primitives
    worktree/
      WorktreeView.tsx
      WorktreeList.tsx
      CreateWorktreeModal.tsx
    terminal/
      TerminalInstance.tsx
    diff/
      DiffViewer.tsx
      FileDiffViewer.tsx
      InlineDiffViewer.tsx  # Diff + inline comments
      FileComments.tsx
  stores/
    appStore.ts      # Zustand store (all application state)
  types/
    index.ts         # TypeScript interfaces
  lib/
    utils.ts         # Utilities (cn, etc.)
  hooks/             # Custom React hooks
  App.tsx            # Root component
  main.tsx           # Entry point
  index.css          # Global styles

src-tauri/
  src/
    main.rs          # Entry point
    git.rs           # Git operations
    worktree.rs      # Worktree operations
    terminal.rs      # Terminal operations
    opencode.rs      # Opencode agent integration
```

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Rust, Tauri v2
- **Styling**: TailwindCSS, Radix UI primitives
- **State**: Zustand
- **Animation**: Framer Motion
- **Icons**: Phosphor Icons
- **Terminal**: XTerm.js
- **Diff**: Custom diff viewer implementation

## Troubleshooting

### RemoteLayerTreeDrawingAreaProxyMac Error on macOS

**Symptom**: Console shows `RemoteLayerTreeDrawingAreaProxyMac::scheduleDisplayLink(): page has no displayID` and UI may hang during worktree switching.

**Root Cause**: This WebKit/macOS error occurs when synchronous blocking operations (like git commands) run on the Tauri main thread, blocking the UI event loop.

**Fix**: All git operations that could block the UI must be async:

1. **Rust backend**: Use `spawn_blocking` for git operations:
   ```rust
   #[tauri::command]
   pub async fn get_worktree_status(worktree_path: String) -> Result<WorktreeStatus, String> {
       let path = worktree_path.clone();
       tokio::task::spawn_blocking(move || {
           compute_worktree_status(&path)
       })
       .await
       .map_err(|e| format!("Task join error: {}", e))?
   }
   ```

2. **Frontend**: Cancel stale requests when switching worktrees:
   ```typescript
   const worktreePathRef = useRef<string | null>(null)
   
   useEffect(() => {
       const currentPath = selectedWorktree?.path || null
       worktreePathRef.current = currentPath
       
       const loadData = async () => {
           const status = await invoke('get_worktree_status', { worktreePath: currentPath })
           // Ignore if worktree changed while waiting
           if (worktreePathRef.current !== currentPath) return
           setWorktreeStatus(currentPath!, status as any)
       }
       loadData()
       
       return () => { worktreePathRef.current = null }
   }, [selectedWorktree?.path])
   ```

### Worktree Switching Performance

**Issue**: Rapid worktree switching causes cascading git operations that stack up and freeze the UI.

**Fix**: 
- All git commands are async with `spawn_blocking` in Rust
- Frontend uses ref-based cancellation to ignore stale results
- Single effect loads both status and git log to avoid duplicate calls

## Backend Idempotency Patterns

**IMPORTANT**: All Rust backend commands must handle concurrent and duplicate invocations safely.

### Why Idempotency Matters

1. **React StrictMode** double-invokes effects in development (mount → unmount → remount)
2. **Frontend bugs** may cause duplicate command invocations
3. **Network issues** may cause retries that result in duplicate calls

Without idempotency, duplicate calls lead to:
- Duplicate PTY processes spawned
- Multiple polling loops wasting resources
- Conflicting state modifications

### Global Lock Pattern

For commands that perform initialization (like `start_opencode_server`), use a **global lock** to serialize concurrent calls:

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct OpencodeState {
    cache: Arc<Mutex<HashMap<String, OpencodeServerInfo>>>,
    global_lock: Arc<Mutex<()>>,  // Single lock for all init operations
}

impl OpencodeState {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            global_lock: Arc::new(Mutex::new(())),
        }
    }
}
```

### Command Implementation Pattern

```rust
#[tauri::command]
pub async fn start_opencode_server(
    state: tauri::State<'_, OpencodeState>,
    worktree_path: String,
    port: u16,
    hostname: String,
) -> Result<OpencodeServerInfo, String> {
    // 1. Acquire global lock - second caller blocks here
    let _guard = state.global_lock.lock().await;

    // 2. Check cache (double-check pattern after acquiring lock)
    {
        let cache = state.cache.lock().await;
        if let Some(cached) = cache.get(&worktree_path) {
            return Ok(cached.clone());  // Return cached result immediately
        }
    }

    // 3. Perform initialization (health polling, session creation, etc.)
    // ...

    // 4. Store result in cache
    {
        let mut cache = state.cache.lock().await;
        cache.insert(worktree_path.clone(), result.clone());
    }

    Ok(result)
}
```

### Execution Flow

```
Call A                          Call B
────────                        ────────
acquires global lock
checks cache → miss
performs init (1/30)...        (blocked on global lock)
performs init (2/30)...
...
performs init (30/30)
stores in cache
releases lock ────────────────→→
                               acquires global lock
                               checks cache → HIT!
                               returns cached result immediately
```

### Key Principles

| Principle | Implementation |
|-----------|----------------|
| **Lock before cache check** | Prevents race condition where both callers see cache miss |
| **Cache results** | Subsequent callers return immediately without re-initialization |
| **Release lock after cache store** | Ensures next waiter finds populated cache |
| **Use global lock** | Simpler than per-resource locks; works for initialization commands |

### When to Use Idempotency

Apply this pattern to commands that:
- Perform expensive initialization (polling, process spawning)
- Create resources that should only exist once (sessions, connections)
- Modify shared state that could conflict with duplicate calls

### Cleanup Pattern

When a resource is stopped/destroyed, clear the cache:

```rust
#[tauri::command]
pub async fn stop_opencode_server(
    state: tauri::State<'_, OpencodeState>,
    worktree_path: String,
) -> Result<(), String> {
    let _guard = state.global_lock.lock().await;  // Serialize with init
    let mut cache = state.cache.lock().await;
    cache.remove(&worktree_path);
    Ok(())
}
```

## Available Scripts

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript compile + Vite build
npm run preview      # Preview production build
npm run tauri dev    # Start Tauri dev mode
npm run tauri build  # Build Tauri app
```
