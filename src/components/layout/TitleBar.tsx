import { motion } from 'framer-motion'
import { Plus } from '@phosphor-icons/react'

export function TitleBar() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-10 flex items-center justify-between px-4 bg-[#0a0a0a] border-b border-[#1a1a1a] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Title - Left aligned since Tauri provides native controls */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span className="text-sm font-medium text-[#9b9b9b]">mandor</span>
      </div>

      {/* New Workspace Button */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors">
          <Plus className="w-4 h-4" />
          <span>New Workspace</span>
        </button>
      </div>
    </motion.div>
  )
}
