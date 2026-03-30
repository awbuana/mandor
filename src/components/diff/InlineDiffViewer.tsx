import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const isUser = comment.author === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className={cn(
        'ml-[72px] mr-4 mt-1 mb-2 py-1.5 px-2 text-[10px]',
        'border-l-2',
        isUser
          ? 'bg-[#1a1512] border-l-[#d97757]'
          : 'bg-[#12151a] border-l-[#6a9bcc]',
        comment.resolved && 'opacity-60'
      )}
    >
      {/* Single line header with metadata and actions */}
      <div className="flex items-center gap-1.5">
        <span className={cn(
          'font-mono text-[9px] uppercase',
          isUser ? 'text-[#d97757]' : 'text-[#6a9bcc]'
        )}>
          {isUser ? 'YOU' : 'AGENT'}
        </span>
        <span className="text-[8px] font-mono text-[#4a4a4a]">
          :{comment.lineNumber}
        </span>
        <span className="text-[8px] font-mono text-[#3a3a3a] ml-auto">
          {new Date(comment.timestamp).toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: '2-digit'
          })}
        </span>
        {!comment.resolved && (
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={() => onResolve(comment.id)}
              className="text-[#57d977] hover:text-[#77f797] text-[9px] font-mono"
              title="Resolve"
            >
              [✓]
            </button>
            <button
              onClick={() => onDelete(comment.id)}
              className="text-[#d97757] hover:text-[#f99777] text-[9px] font-mono"
              title="Delete"
            >
              [✕]
            </button>
          </div>
        )}
        {comment.resolved && (
          <span className="text-[9px] font-mono text-[#57d977] ml-2">
            [RESOLVED]
          </span>
        )}
      </div>

      {/* Content */}
      <p className={cn(
        'text-[#a0a0a0] text-[10px] leading-tight mt-0.5 font-mono',
        comment.resolved && 'line-through text-[#5b5b5b]'
      )}>
        {comment.content}
      </p>
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
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="ml-[72px] mr-4 mt-1 mb-2"
    >
      <div className="bg-[#1a1512] border border-[#d97757]/50 py-1.5 px-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a comment..."
          className="w-full bg-transparent text-[10px] text-[#e0e0e0] placeholder-[#5b5b5b] resize-none outline-none font-mono px-2 py-1.5"
          rows={2}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit()
            }
          }}
        />
        <div className="flex items-center justify-end gap-2 mt-1">
          <span className="text-[9px] text-[#5b5b5b] font-mono mr-auto">
            Cmd+Enter
          </span>
          <button
            onClick={onCancel}
            className="text-[9px] text-[#9b9b9b] hover:text-[#e0e0e0] font-mono transition-colors"
          >
            [CANCEL]
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim()}
            className={cn(
              'text-[9px] font-mono transition-colors',
              content.trim()
                ? 'text-[#d97757] hover:text-[#f99777]'
                : 'text-[#5b5b5b] cursor-not-allowed'
            )}
          >
            [COMMENT]
          </button>
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
            const isHovered = hoveredLine === index && !isHeader
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
                  onMouseEnter={() => !isHeader && setHoveredLine(index)}
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
                          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-[#d97757] hover:text-[#f99777] cursor-pointer transition-opacity font-mono text-[10px]',
                          isHovered && !isAddingComment ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        )}
                        style={{ zIndex: 100 }}
                        title="Add comment"
                      >
                        [+]
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
