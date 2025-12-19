import { AlertTriangle, FileSearch, FileText } from "lucide-react"
import { Conversation, ConversationContent, ConversationScrollButton } from "./conversation"
import { Response } from "./response"
import { SourceReferenceCard, type SourceDocument } from "./sourceReferenceCard" // Re-add this import

interface ChatInterfaceProps {
  messages: Array<{ 
    role: "user" | "assistant"; 
    content: string; 
    sources?: SourceDocument[] 
  }>
  isScanning: boolean
  activeProvider: any
  pendingFallback: { text: string; type: string } | null
  onRetry: (text: string, type: string) => void
  onCancel: () => void
}

export function ChatInterface({ 
  messages, isScanning, activeProvider, pendingFallback, onRetry, onCancel 
}: ChatInterfaceProps) {
  
  // Helper to deduplicate sources
  const getUniqueSources = (sources: SourceDocument[] = []) => {
    const uniqueIds = new Set()
    return sources.filter(doc => {
      if (!doc.id) return false
      if (uniqueIds.has(doc.id)) return false
      uniqueIds.add(doc.id)
      return true
    })
  }

  return (
    <div className="h-full w-full relative bg-slate-50">
      
      <Conversation className="h-full w-full"> 
        <ConversationContent className="p-4">
            
            {messages.map((m, i) => (
              <div key={i} className={`mb-4 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`text-sm max-w-[95%] ${ // Increased max-width slightly for better carousel fit
                    m.role === 'user' 
                    ? 'bg-slate-800 text-white p-3 rounded-xl shadow-sm' 
                    : 'text-slate-800 pl-1 py-1 w-full' 
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm prose-slate max-w-none dark:prose-invert leading-relaxed">
                        
                        <Response sources={m.sources}>
                          {m.content}
                        </Response>

{/* --- HORIZONTAL SOURCES CAROUSEL --- */}
{m.sources && m.sources.length > 0 && (
  <div className="mt-4 border-t border-slate-100 pt-3 max-w-full">
    <div className="flex items-center justify-between mb-2 px-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        Sources ({getUniqueSources(m.sources).length})
      </p>
    </div>
    
    {/* Horizontal Scroll Container */}
    <div className="flex gap-2 overflow-x-auto pb-2 w-full flex-nowrap scrollbar-hide snap-x mask-linear-fade">
      {getUniqueSources(m.sources).map((source) => (
        <SourceReferenceCard key={source.id} document={source} />
      ))}
    </div>
  </div>
)}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            ))}

            <div className="h-4" /> 
            
        </ConversationContent>
        
        <ConversationScrollButton />
      </Conversation>

      {/* Fallback Modal */}
      {pendingFallback && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-[2px] p-6 animate-in fade-in zoom-in duration-200">
          <div className="w-full max-w-xs p-5 bg-white border border-amber-200 rounded-2xl shadow-lg text-center">
            
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 ring-4 ring-amber-50">
              <AlertTriangle size={24} />
            </div>

            <h3 className="font-bold text-slate-900 text-base mb-2">No Internal Records</h3>
            
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              <strong>{activeProvider?.name}</strong> has no verified precedents matching this content.
            </p>

            <button 
              onClick={() => onRetry(pendingFallback.text, pendingFallback.type)}
              className="w-full py-3 px-4 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 hover:scale-[1.02] transition shadow-md flex items-center justify-center gap-2"
            >
              <FileSearch size={16} />
              Generate General Opinion
            </button>

            <button 
              onClick={onCancel}
              className="mt-3 text-[10px] text-slate-400 hover:text-slate-600 font-semibold uppercase tracking-wide"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}