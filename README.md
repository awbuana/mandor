# Mandor Workbench

IDE for managing git worktrees with an integrated opencode console and code review/diff viewer capabilities.

## Features

- **Git Worktree Management** - List, create, and delete git worktrees with visual indicators for status
- **Opencode Console** - Built-in terminal integration for running AI agents (opencode, claude, cursor) within each worktree context
- **Git Diff/Code Review** - Visual diff viewer for reviewing changes across worktrees

## Prerequisites

- Node.js 20+
- Rust 1.70+
- npm or yarn

## Installing Rust

If you don't have Rust installed, use rustup:

```bash
# Install rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify installation
rustc --version
cargo --version

# Update to latest stable
rustup update stable
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd mandor

# Install frontend dependencies
npm install

# Build Rust dependencies
cd src-tauri && cargo build
```

## Development

```bash
# Start Vite dev server (port 1420)
npm run dev

# Start Tauri dev mode
npm run tauri dev
```

## Production Build

```bash
# Build frontend and Tauri app
npm run tauri build

# Frontend only
npm run build
```

## Tech Stack

### Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.3.1 | UI framework |
| react-dom | ^18.3.1 | React DOM rendering |
| typescript | ^5.6.2 | Type safety |
| vite | ^5.4.10 | Build tool |
| tailwindcss | ^3.4.14 | Styling |
| framer-motion | ^11.11.0 | Animations |
| zustand | ^5.0.0 | State management |
| @tauri-apps/api | ^2 | Tauri JavaScript API |
| @tauri-apps/cli | ^2 | Tauri CLI tooling |
| @phosphor-icons/react | ^2.1.7 | Icons |
| @radix-ui/* | various | Radix UI primitives |
| @xterm/xterm | ^5.5.0 | Terminal emulator |
| @xterm/addon-fit | ^0.10.0 | Terminal fit addon |
| chrome-devtools-mcp | ^0.20.3 | Chrome DevTools integration |
| class-variance-authority | ^0.7.0 | Component variants |
| clsx | ^2.1.1 | Class utilities |
| tailwind-merge | ^2.5.4 | Tailwind merge |
| tailwindcss-animate | ^1.0.7 | Tailwind animations |

### Rust Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2 | Desktop framework |
| tauri-plugin-shell | 2 | Shell integration |
| tauri-plugin-process | 2 | Process management |
| tauri-plugin-dialog | 2 | Native dialogs |
| tauri-plugin-devtools | 2.0.0 | DevTools support |
| serde | 1 | Serialization |
| serde_json | 1 | JSON handling |
| tokio | 1 | Async runtime |
| chrono | 0.4 | Date/time |
| reqwest | 0.12 | HTTP client |
| uuid | 1 | UUID generation |
| futures | 0.3 | Async utilities |

## Project Structure

```
mandor/
├── src/                    # React frontend
│   ├── components/         # React components
│   ├── stores/             # Zustand stores
│   ├── types/              # TypeScript types
│   ├── lib/                # Utilities
│   └── App.tsx             # Root component
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── git.rs         # Git operations
│   │   ├── worktree.rs    # Worktree operations
│   │   ├── terminal.rs    # Terminal operations
│   │   └── opencode.rs    # Opencode agent integration
│   └── Cargo.toml
├── package.json
└── vite.config.ts
```
