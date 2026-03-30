import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatCenteredText } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { FileComment } from '@/types'

interface FileCommentsProps {
  comments: FileComment[]
  onAddComment: (content: string, lineNumber?: number) => void
  onResolveComment: (commentId: string) => void
  onDeleteComment: (commentId: string) => void
  filePath: string
}

function CommentBubble({ comment, onResolve, onDelete }: {
  comment: FileComment
  onResolve: () => void
  onDelete: () => void
}) {
  const isUser = comment.author === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative mb-2 py-1.5 px-2 text-[10px]',
        'border-l-2',
        isUser
          ? 'bg-[#1a1512] border-l-[#d97757]'
          : 'bg-[#12151a] border-l-[#6a9bcc]'
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
        {comment.lineNumber && (
          <span className="text-[8px] font-mono text-[#4a4a4a]">
            :{comment.lineNumber}
          </span>
        )}
        <span className="text-[8px] font-mono text-[#3a3a3a] ml-auto">
          {new Date(comment.timestamp).toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: '2-digit'
          })}
        </span>
        {!comment.resolved && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <button
              onClick={onResolve}
              className="text-[#57d977] hover:text-[#77f797] text-[9px] font-mono"
              title="Resolve"
            >
              [✓]
            </button>
            <button
              onClick={onDelete}
              className="text-[#d97757] hover:text-[#f99777] text-[9px] font-mono"
              title="Delete"
            >
              [✕]
            </button>
          </div>
        )}
        {comment.resolved && (
          <span className="text-[9px] font-mono text-[#57d977]">
            [RESOLVED]
          </span>
        )}
      </div>

      {/* Content */}
      <p className="text-[#a0a0a0] text-[10px] leading-tight mt-0.5 font-mono whitespace-pre-wrap">
        {comment.content}
      </p>
    </motion.div>
  )
}

function CommentInput({ onSubmit, placeholder = 'Add a comment...' }: {
  onSubmit: (content: string) => void
  placeholder?: string
}) {
  const [content, setContent] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content.trim())
      setContent('')
    }
  }

  return (
    <div className={cn(
      'border transition-all',
      isFocused
        ? 'border-[#d97757]/50 bg-[#1a1a1a]'
        : 'border-[#2a2a2a] bg-[#0a0a0a]'
    )}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs text-[#e0e0e0] placeholder-[#5b5b5b] p-2 resize-none outline-none font-mono"
        rows={isFocused ? 3 : 1}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit()
          }
        }}
      />
      <AnimatePresence>
        {isFocused && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between px-2 pb-2"
          >
            <span className="text-[10px] text-[#5b5b5b] font-mono">
              Cmd+Enter to submit
            </span>
            <button
              onClick={handleSubmit}
              disabled={!content.trim()}
              className={cn(
                'px-2 py-1 text-xs font-mono transition-colors',
                content.trim()
                  ? 'bg-[#d97757] text-white hover:bg-[#e88565]'
                  : 'bg-[#2a2a2a] text-[#5b5b5b] cursor-not-allowed'
              )}
            >
              COMMENT
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FileComments({
  comments,
  onAddComment,
  onResolveComment,
  onDeleteComment,
}: FileCommentsProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const unresolvedComments = comments.filter(c => !c.resolved)
  const resolvedComments = comments.filter(c => c.resolved)

  return (
    <div className="border-l border-[#1a1a1a] bg-[#0a0a0a] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <ChatCenteredText className="w-3.5 h-3.5 text-[#9b9b9b]" />
          <span className="text-xs font-medium text-[#e0e0e0] font-mono">
            COMMENTS
          </span>
          {unresolvedComments.length > 0 && (
            <span className="text-[10px] bg-[#d97757]/20 text-[#d97757] px-1 py-0 font-mono">
              {unresolvedComments.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors text-xs font-mono"
        >
          {isExpanded ? '[−]' : '[+]'}
        </button>
      </div>

      {/* Comments List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto p-2"
          >
            {comments.length === 0 ? (
              <div className="text-center py-6 text-[#5b5b5b]">
                <p className="text-[10px] font-mono">// no comments</p>
              </div>
            ) : (
              <>
                {/* Unresolved comments */}
                {unresolvedComments.map((comment) => (
                  <CommentBubble
                    key={comment.id}
                    comment={comment}
                    onResolve={() => onResolveComment(comment.id)}
                    onDelete={() => onDeleteComment(comment.id)}
                  />
                ))}

                {/* Resolved comments */}
                {resolvedComments.length > 0 && (
                  <>
                    <div className="my-3 flex items-center gap-2">
                      <div className="flex-1 h-px bg-[#2a2a2a]" />
                      <span className="text-[9px] text-[#5b5b5b] font-mono">
                        {resolvedComments.length} RESOLVED
                      </span>
                      <div className="flex-1 h-px bg-[#2a2a2a]" />
                    </div>
                    {resolvedComments.map((comment) => (
                      <CommentBubble
                        key={comment.id}
                        comment={comment}
                        onResolve={() => {}}
                        onDelete={() => onDeleteComment(comment.id)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      {isExpanded && (
        <div className="p-2 border-t border-[#1a1a1a]">
          <CommentInput
            onSubmit={(content) => onAddComment(content)}
            placeholder="Add a comment..."
          />
        </div>
      )}
    </div>
  )
}
