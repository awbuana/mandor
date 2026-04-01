export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  is_main: boolean;
  is_bare: boolean;
}

export interface FileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface WorktreeStatus {
  branch: string;
  commit: string;
  ahead: number;
  behind: number;
  modified: FileStatus[];
  staged: FileStatus[];
  untracked: string[];
}

export interface DiffStats {
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface GitCommit {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
  is_head: boolean;
}

export interface TerminalSession {
  id: string;
  worktree_path: string;
  agent_type: string;
  name: string;
}

export interface FileDiff {
  path: string;
  old_path?: string;
  lines_added: number;
  lines_deleted: number;
  content: string;
}

/** Represents a comment attached to a specific file or line during code review */
export interface FileComment {
  id: string;
  filePath: string;
  lineNumber?: number;
  author: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  parentId?: string;
  resolved: boolean;
}

/** Configuration for an external code editor that can be launched from the app */
export interface EditorType {
  id: string;
  name: string;
  command: string;
}

export const EDITORS: EditorType[] = [
  { id: 'vscode', name: 'VS Code', command: 'code' },
  { id: 'cursor', name: 'Cursor', command: 'cursor' },
  { id: 'windsurf', name: 'Windsurf', command: 'windsurf' },
  { id: 'zed', name: 'Zed', command: 'zed' },
  { id: 'fleet', name: 'Fleet', command: 'fleet' },
];