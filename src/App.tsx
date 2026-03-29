import { useEffect } from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { CenterPanel } from './components/layout/CenterPanel'
import { ReviewPanel } from './components/layout/ReviewPanel'
import { useAppStore } from './stores/appStore'
import { invoke } from '@tauri-apps/api/core'

function App() {
  const { setWorktrees, setWorktreeStatus } = useAppStore()

  useEffect(() => {
    loadWorktrees()
  }, [])

  const loadWorktrees = async () => {
    try {
      // For now, we'll use the current directory as the repo path
      // In a real app, this would come from user selection
      const repoPath = '.'
      const worktrees: any[] = await invoke('list_worktrees', { repoPath })
      setWorktrees(worktrees)
      
      // Load status for each worktree
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
