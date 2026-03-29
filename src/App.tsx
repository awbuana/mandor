import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { MainContent } from './components/layout/MainContent';
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { useAppStore } from './stores/appStore';
import { invoke } from '@tauri-apps/api/core';

function App() {
  const { setWorktrees, setWorktreeStatus } = useAppStore();

  useEffect(() => {
    loadWorktrees();
  }, []);

  const loadWorktrees = async () => {
    try {
      // For now, we'll use the current directory as the repo path
      // In a real app, this would come from user selection
      const repoPath = '.';
      const worktrees: any[] = await invoke('list_worktrees', { repoPath });
      setWorktrees(worktrees);
      
      // Load status for each worktree
      for (const worktree of worktrees) {
        try {
          const status = await invoke('get_worktree_status', { 
            worktreePath: worktree.path 
          });
          setWorktreeStatus(worktree.path, status as any);
        } catch (e) {
          console.error('Failed to load status for', worktree.path, e);
        }
      }
    } catch (error) {
      console.error('Failed to load worktrees:', error);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      <AppShell>
        <Sidebar />
        <MainContent />
        <TerminalPanel />
      </AppShell>
    </div>
  );
}

export default App;
