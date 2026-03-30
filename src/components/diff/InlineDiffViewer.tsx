import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Check, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { FileComment } from '@/types'

interface DiffLine {
  type: 'header' | 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

interface InlineDiffViewerProps {
  diffContent: DiffLine[]
  filePath: string
  comments: FileComment[]
  zoom?: number
  onAddComment: (lineNumber: number, content: string) => void
  onResolveComment: (commentId: string) => void
  onDeleteComment: (commentId: string) => void
}

interface CommentBubbleProps {
  comment: FileComment
  onResolve: (commentId: string) => void
  onDelete: (commentId: string) => void
}

function CommentBubble({ comment, onResolve, onDelete }: CommentBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'ml-[72px] mr-4 mt-2 mb-3 p-3 rounded-lg border',
        'bg-[#1a1a1a] border-[#0f0f0f]',
        comment.resolved && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-[#9b9b9b]">
              {new Date(comment.timestamp).toLocaleDateString()}
            </span>
            {comment.resolved && (
              <span className="text-xs text-[#4ade80] flex items-center gap-1">
                <Check size={12} />
                Resolved
              </span>
            )}
          </div>
          <p className={cn(
            'text-sm text-[#e0e0e0] whitespace-pre-wrap',
            comment.resolved && 'line-through text-[#5b5b5b]'
          )}>
            {comment.content}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!comment.resolved && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onResolve(comment.id)}
              className="p-1.5 rounded hover:bg-[#0f0f0f] text-[#9b9b9b] hover:text-[#4ade80] transition-colors"
              title="Resolve comment"
            >
              <Check size={14} />
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onDelete(comment.id)}
            className="p-1.5 rounded hover:bg-[#0f0f0f] text-[#9b9b9b] hover:text-[#f87171] transition-colors"
            title="Delete comment"
          >
            <X size={14} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

interface InlineCommentInputProps {
  onSubmit: (content: string) => void
  onCancel: () => void
}

function InlineCommentInput({ onSubmit, onCancel }: InlineCommentInputProps) {
  const [content, setContent] = useState('')

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content.trim())
      setContent('')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="ml-[72px] mr-4 mt-2 mb-3"
    >
      <div className="bg-[#1a1a1a] border border-[#d97757] rounded-lg overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a comment..."
          className="w-full bg-transparent text-sm text-[#e0e0e0] placeholder-[#5b5b5b] p-3 resize-none outline-none"
          rows={3}
          autoFocus
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-[#9b9b9b] hover:text-[#e0e0e0] transition-colors"
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!content.trim()}
            className={cn(
              'px-3 py-1.5 text-xs rounded transition-colors',
              content.trim()
                ? 'bg-[#d97757] text-white hover:bg-[#c06a4b]'
                : 'bg-[#5b5b5b] text-[#9b9b9b] cursor-not-allowed'
            )}
          >
            Comment
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

export function InlineDiffViewer({
  diffContent,
  filePath: _filePath,
  comments,
  zoom = 100,
  onAddComment,
  onResolveComment,
  onDeleteComment,
}: InlineDiffViewerProps) {
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)

  const getCommentsForLine = (lineNumber: number) => {
    return comments.filter((c) => c.lineNumber === lineNumber && !c.resolved)
  }

  const handleAddComment = (lineNumber: number, content: string) => {
    onAddComment(lineNumber, content)
    setActiveCommentLine(null)
  }

  return (
    <div className="bg-[#0a0a0a] h-full overflow-auto">
      <div 
        className="min-w-full font-mono transition-all duration-200"
        style={{ fontSize: `${zoom}%` }}
      >
          {diffContent.map((line, index) => {
            const isHeader = line.type === 'header'
            const lineNumber = line.newLine || line.oldLine || index
            const lineComments = isHeader ? [] : getCommentsForLine(lineNumber)
            const isAddingComment = activeCommentLine === lineNumber
            const isHovered = hoveredLine === lineNumber && !isHeader
            const showComments = lineComments.length > 0 || isAddingComment

            return (
              <div key={index} className="group">
                <div
                  className={cn(
                    'flex items-stretch relative',
                    line.type === 'add' && 'bg-[#1a3a1a]/20',
                    line.type === 'remove' && 'bg-[#3a1a1a]/20',
                    isHovered && 'bg-[#1a1a1a]'
                  )}
                  onMouseEnter={() => !isHeader && setHoveredLine(lineNumber)}
                  onMouseLeave={() => setHoveredLine(null)}
                >
                  <div
                    className={cn(
                      'flex items-center w-[72px] flex-shrink-0 text-xs select-none relative',
                      'border-r border-[#0f0f0f]',
                      isHeader && 'bg-[#1a1a1a] text-[#5b5b5b]'
                    )}
                  >
                    {!isHeader && (
                      <>
                        <span className="w-9 text-right pr-2 text-[#5b5b5b]">
                          {line.oldLine || ''}
                        </span>
                        <span className="w-9 text-right pr-2 text-[#5b5b5b]">
                          {line.newLine || ''}
                        </span>
                      </>
                    )}
                    {isHeader && <span className="px-2 text-[#9b9b9b]">...</span>}

                    {!isHeader && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveCommentLine(lineNumber)
                        }}
                        className={cn(
                          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#316dca] flex items-center justify-center text-white hover:bg-[#4184e4] shadow-lg cursor-pointer transition-opacity',
                          isHovered && !isAddingComment ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        )}
                        style={{ zIndex: 100 }}
                        title="Add comment"
                      >
                        <Plus size={12} weight="bold" />
                      </button>
                    )}
                  </div>

                  <div
                    className={cn(
                      'flex-1 py-0.5 px-3 whitespace-pre',
                      line.type === 'header' && 'text-[#9b9b9b]',
                      line.type === 'add' && 'text-[#4ade80]',
                      line.type === 'remove' && 'text-[#f87171]',
                      line.type === 'context' && 'text-[#e0e0e0]'
                    )}
                  >
                    {line.type !== 'context' && !isHeader && (
                      <span
                        className={cn(
                          'mr-2 select-none',
                          line.type === 'add' && 'text-[#4ade80]',
                          line.type === 'remove' && 'text-[#f87171]'
                        )}
                      >
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                      </span>
                    )}
                    {line.content}
                  </div>
                </div>

                <AnimatePresence>
                  {showComments && (
                    <div className="bg-[#0f0f0f]/50">
                      {lineComments.map((comment) => (
                        <CommentBubble
                          key={comment.id}
                          comment={comment}
                          onResolve={onResolveComment}
                          onDelete={onDeleteComment}
                        />
                      ))}
                      {isAddingComment && (
                        <InlineCommentInput
                          onSubmit={(content) => handleAddComment(lineNumber, content)}
                          onCancel={() => setActiveCommentLine(null)}
                        />
                      )}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
      </div>
    </div>
  )
}
