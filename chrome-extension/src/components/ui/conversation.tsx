import * as React from "react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"
import { ArrowDown, MessageSquare } from "lucide-react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility for merging classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 1. Main Container
// REMOVE ref forwarding here to fix the TS error
const Conversation = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof StickToBottom>) => {
  return (
    <StickToBottom
      className={cn("relative flex h-full flex-col overflow-hidden", className)}
      initial="smooth"
      resize="smooth"
      {...props}
    >
      {children}
    </StickToBottom>
  )
}
Conversation.displayName = "Conversation"

// 2. Content Area (The scrollable part)
// REMOVE ref forwarding here to fix the TS error
const ConversationContent = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof StickToBottom.Content>) => {
  return (
    <StickToBottom.Content
      className={cn("flex flex-col gap-4 p-4", className)}
      {...props}
    >
      {children}
    </StickToBottom.Content>
  )
}
ConversationContent.displayName = "ConversationContent"

// 3. Scroll Button (Appears when scrolled up)
const ConversationScrollButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  if (isAtBottom) return null

  return (
    <button
      ref={ref}
      onClick={() => scrollToBottom()}
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 z-10",
        "flex h-8 w-8 items-center justify-center rounded-full",
        "bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700",
        "animate-in fade-in zoom-in duration-200",
        className
      )}
      {...props}
    >
      <ArrowDown className="h-4 w-4" />
    </button>
  )
})
ConversationScrollButton.displayName = "ConversationScrollButton"

// 4. Empty State
interface ConversationEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  icon?: React.ReactNode
}

const ConversationEmptyState = React.forwardRef<HTMLDivElement, ConversationEmptyStateProps>(
  ({ className, title = "No messages yet", description, icon, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex h-full flex-col items-center justify-center p-8 text-center text-gray-500",
          className
        )}
        {...props}
      >
        {children || (
          <>
            <div className="mb-4 rounded-full bg-gray-100 p-3 text-gray-400">
              {icon || <MessageSquare className="h-6 w-6" />}
            </div>
            <h3 className="mb-1 text-sm font-semibold text-gray-900">{title}</h3>
            {description && <p className="text-xs text-gray-500 max-w-[200px]">{description}</p>}
          </>
        )}
      </div>
    )
  }
)
ConversationEmptyState.displayName = "ConversationEmptyState"

export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
}