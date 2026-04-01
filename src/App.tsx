import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { CenterPanel } from './components/layout/CenterPanel'
import { ReviewPanel } from './components/layout/ReviewPanel'
import { useAppStore } from './stores/appStore'
import { invoke } from '@tauri-apps/api/core'
import { WorktreeStatus, DiffStats } from './types'

function App() {
  const { setWorktrees, setWorktreeStatus, setDiffStats } = useAppStore()

  useEffect(() => {
    let unlistenFn: (() => void) | null = null

    const init = async () => {
      await loadWorktrees()

      // Subscribe to real-time file change events pushed by the Rust watcher.
      // The watcher emits 'worktree-changed' whenever files change in any
      // watched worktree directory (debounced at 500ms).
      unlistenFn = await listen<{
        worktree_path: string
        status: WorktreeStatus
        diff_stats: DiffStats
      }>('worktree-changed', (event) => {
        const { worktree_path, status, diff_stats } = event.payload
        setWorktreeStatus(worktree_path, status)
        setDiffStats(worktree_path, diff_stats)
      })
    }

    init()

    return () => {
      unlistenFn?.()
    }
  }, [])

  const loadWorktrees = async () => {
    try {
      // For now, we'll use the current directory as the repo path
      // In a real app, this would come from user selection
      const repoPath = '.'
      const worktrees: any[] = await invoke('list_worktrees', { repoPath })
      setWorktrees(worktrees)

      // Load initial status for each worktree
      for (const worktree of worktrees) {
        try {
          const status = await invoke('get_worktree_status', {
            worktreePath: worktree.path
          })
          setWorktreeStatus(worktree.path, status as any)
        } catch (e) {
          console.error('Failed to load status for', worktree.path, e)
        }
      }

      // Start the filesystem watcher for all worktrees.
      // After this, any file changes will automatically push updated
      // status + diff stats via the 'worktree-changed' event above.
      try {
        await invoke('start_file_watcher', {
          paths: worktrees.map((w: any) => w.path)
        })
      } catch (e) {
        console.error('Failed to start file watcher:', e)
      }
    } catch (error) {
      console.error('Failed to load worktrees:', error)
    }
  }

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-[#e0e0e0] overflow-hidden flex flex-col">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <CenterPanel />
        <ReviewPanel />
      </div>
    </div>
  )
}

export default App