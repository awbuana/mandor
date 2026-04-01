import { useAppStore } from '@/stores/appStore';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileCode, Plus, Minus, GitCommit } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface DiffLine {
  type: 'header' | 'add' | 'remove' | 'context';
  content: string;
  oldLine?: number;
  newLine?: number;
}

export function DiffViewer() {
  const { selectedWorktree, worktreeStatus } = useAppStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<DiffLine[]>([]);
  const [loading, setLoading] = useState(false);

  const status = selectedWorktree ? worktreeStatus[selectedWorktree.path] : null;
  const allFiles = [
    ...(status?.staged || []),
    ...(status?.modified || []),
  ];

  useEffect(() => {
    if (selectedFile && selectedWorktree) {
      loadDiff(selectedFile);
    }
  }, [selectedFile, selectedWorktree]);

  const loadDiff = async (filePath: string) => {
    if (!selectedWorktree) return;
    setLoading(true);

    try {
      const diff: string = await invoke('get_diff', {
        worktreePath: selectedWorktree.path,
        filePath
      });

      const lines = parseDiff(diff);
      setDiffContent(lines);
    } catch (error) {
      console.error('Failed to load diff:', error);
      setDiffContent([]);
    } finally {
      setLoading(false);
    }
  };

  const parseDiff = (diff: string): DiffLine[] => {
    const lines: DiffLine[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (const line of diff.split('\n')) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+).*\+(\d+)/);
        if (match) {
          oldLine = parseInt(match[1]) - 1;
          newLine = parseInt(match[2]) - 1;
        }
        lines.push({ type: 'header', content: line });
      } else if (line.startsWith('+')) {
        newLine++;
        lines.push({ type: 'add', content: line, newLine });
      } else if (line.startsWith('-')) {
        oldLine++;
        lines.push({ type: 'remove', content: line, oldLine });
      } else if (line.startsWith(' ')) {
        oldLine++;
        newLine++;
        lines.push({ type: 'context', content: line, oldLine, newLine });
      } else {
        lines.push({ type: 'context', content: line });
      }
    }

    return lines;
  };

  if (!selectedWorktree) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500">
        <GitCommit className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg font-medium">Select a worktree to view changes</p>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* File List */}
      <div className="w-64 border-r border-slate-800 bg-slate-900/50 overflow-auto">
        <div className="p-3 border-b border-slate-800">
          <h3 className="text-sm font-medium text-slate-300">Changed Files</h3>
          <p className="text-xs text-slate-500 mt-1">{allFiles.length} files</p>
        </div>
        <div className="divide-y divide-slate-800">
          {allFiles.map((file) => (
            <button
              key={file.path}
              onClick={() => setSelectedFile(file.path)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                selectedFile === file.path
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              <FileCode className="w-4 h-4" />
              <span className="truncate font-mono text-xs">{file.path}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto bg-slate-950">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="animate-spin w-6 h-6 border-2 border-slate-600 border-t-blue-500 rounded-full" />
          </div>
        ) : selectedFile ? (
          <div className="min-w-full">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-mono text-slate-300">{selectedFile}</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-400 flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  {diffContent.filter(l => l.type === 'add').length}
                </span>
                <span className="text-red-400 flex items-center gap-1">
                  <Minus className="w-3 h-3" />
                  {diffContent.filter(l => l.type === 'remove').length}
                </span>
              </div>
            </div>
            <div className="p-4 font-mono text-sm">
              {diffContent.map((line, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex",
                    line.type === 'add' && "bg-emerald-500/10",
                    line.type === 'remove' && "bg-red-500/10",
                    line.type === 'header' && "text-slate-400 bg-slate-800/50"
                  )}
                >
                  {/* Line Numbers */}
                  <div className="flex w-16 text-xs text-slate-600 select-none">
                    <span className="w-8 text-right pr-2">
                      {line.oldLine || ''}
                    </span>
                    <span className="w-8 text-right pr-2">
                      {line.newLine || ''}
                    </span>
                  </div>

                  {/* Content */}
                  <span className={cn(
                    "flex-1 whitespace-pre",
                    line.type === 'add' && "text-emerald-300",
                    line.type === 'remove' && "text-red-300",
                    line.type === 'header' && "text-slate-500",
                    line.type === 'context' && "text-slate-300"
                  )}>
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <FileCode className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">Select a file to view diff</p>
          </div>
        )}
      </div>
    </div>
  );
}