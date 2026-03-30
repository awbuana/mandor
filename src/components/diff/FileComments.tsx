import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatText, Check, X, ChatCenteredText } from '@phosphor-icons/react'
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
  const [showActions, setShowActions] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative mb-3 p-3 rounded-lg text-sm',
        isUser
          ? 'bg-[#d97757]/10 border border-[#d97757]/20'
          : 'bg-[#1a1a1a] border border-[#2a2a2a]'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          'text-xs font-medium',
          isUser ? 'text-[#d97757]' : 'text-[#9b9b9b]'
        )}>
          {isUser ? 'You' : 'Agent'}
        </span>
        <span className="text-xs text-[#5b5b5b]">
          {new Date(comment.timestamp).toLocaleTimeString()}
        </span>
        {comment.lineNumber && (
          <span className="text-xs text-[#5b5b5b] bg-[#0a0a0a] px-1.5 py-0.5 rounded">
            Line {comment.lineNumber}
          </span>
        )}
        {comment.resolved && (
          <span className="text-xs text-[#57d977] flex items-center gap-1">
            <Check className="w-3 h-3" />
            Resolved
          </span>
        )}
      </div>

      <p className="text-[#e0e0e0] whitespace-pre-wrap">{comment.content}</p>

      <AnimatePresence>
        {showActions && !comment.resolved && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 right-2 flex items-center gap-1"
          >
            <button
              onClick={onResolve}
              className="p-1.5 rounded bg-[#2a3a2a] text-[#57d977] hover:bg-[#3a4a3a] transition-colors"
              title="Resolve"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded bg-[#3a2a2a] text-[#d97757] hover:bg-[#4a3a3a] transition-colors"
              title="Delete"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
      'border rounded-lg transition-all',
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
        className="w-full bg-transparent text-sm text-[#e0e0e0] placeholder-[#5b5b5b] p-3 resize-none outline-none"
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
            className="flex items-center justify-between px-3 pb-3"
          >
            <span className="text-xs text-[#5b5b5b]">
              Cmd+Enter to submit
            </span>
            <button
              onClick={handleSubmit}
              disabled={!content.trim()}
              className={cn(
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                content.trim()
                  ? 'bg-[#d97757] text-white hover:bg-[#e88565]'
                  : 'bg-[#2a2a2a] text-[#5b5b5b] cursor-not-allowed'
              )}
            >
              Comment
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <ChatCenteredText className="w-4 h-4 text-[#9b9b9b]" />
          <span className="text-sm font-medium text-[#e0e0e0]">
            Comments
          </span>
          {unresolvedComments.length > 0 && (
            <span className="text-xs bg-[#d97757] text-white px-2 py-0.5 rounded-full">
              {unresolvedComments.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors"
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {/* Comments List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto p-4"
          >
            {comments.length === 0 ? (
              <div className="text-center py-8 text-[#5b5b5b]">
                <ChatText className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No comments yet</p>
                <p className="text-xs mt-1">
                  Add comments to discuss changes
                </p>
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
                    <div className="my-4 flex items-center gap-2">
                      <div className="flex-1 h-px bg-[#2a2a2a]" />
                      <span className="text-xs text-[#5b5b5b]">
                        {resolvedComments.length} resolved
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
        <div className="p-4 border-t border-[#1a1a1a]">
          <CommentInput
            onSubmit={(content) => onAddComment(content)}
            placeholder="Add a general comment on this file..."
          />
        </div>
      )}
    </div>
  )
}
