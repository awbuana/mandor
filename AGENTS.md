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

## Project Structure

```
src/
  components/
    layout/
      AppShell.tsx    # Main app shell
      CenterPanel.tsx
      Sidebar.tsx
      TitleBar.tsx
      ReviewPanel.tsx
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
  stores/
    appStore.ts      # Zustand store
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

## Available Scripts

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript compile + Vite build
npm run preview      # Preview production build
npm run tauri dev    # Start Tauri dev mode
npm run tauri build  # Build Tauri app
```
