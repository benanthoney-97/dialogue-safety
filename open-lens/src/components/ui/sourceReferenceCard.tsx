import { FileText, PlayCircle, Newspaper } from "lucide-react"

export interface SourceDocument {
  id: number
  title: string
  source_url: string
  cover_image_url?: string | null
  media_type?: 'video' | 'article' | 'pdf'
  similarity?: number
  content?: string
  // Added metadata to handle timestamps
  metadata?: {
    timestampStart?: number
    timestampEnd?: number
  }
}

export function SourceReferenceCard({ document }: { document: SourceDocument }) {
  
  // --- 🔗 DEEP LINK GENERATOR ---
  const getSmartLink = () => {
    if (!document.source_url) return "#"

    try {
      const url = new URL(document.source_url)

      // 1. VIDEO LOGIC (YouTube Timestamps)
      // Check both the explicit type OR if the URL is obviously YouTube
      const isVideo = document.media_type === 'video' || url.hostname.includes('youtube') || url.hostname.includes('youtu.be')
      
      if (isVideo && document.metadata?.timestampStart) {
        // Handle existing query params (e.g., ?v=...)
        if (url.searchParams.has('t')) {
          url.searchParams.set('t', Math.floor(document.metadata.timestampStart).toString())
        } else {
          url.searchParams.append('t', `${Math.floor(document.metadata.timestampStart)}s`)
        }
        return url.toString()
      }

      // 2. ARTICLE LOGIC (Text Fragments)
      // If it's an article/pdf and we have the chunk text, highlight it
      if (document.content && (!isVideo || document.media_type === 'article')) {
        // Clean the content slightly
        const cleanContent = document.content.replace(/\s+/g, ' ').trim()
        
        // Take the first ~6 words to create a unique anchor
        const words = cleanContent.split(' ')
        if (words.length >= 4) {
          const snippet = words.slice(0, 6).join(' ')
          // Append the Text Fragment standard: #:~:text=
          return `${document.source_url}#:~:text=${encodeURIComponent(snippet)}`
        }
      }

      // Fallback: Just return the original URL
      return document.source_url

    } catch (e) {
      // If URL parsing fails, return original string
      return document.source_url
    }
  }

  const finalUrl = getSmartLink()
  const isVideo = document.media_type === 'video' || (document.source_url && document.source_url.includes('youtu'))

  return (
    <a
      href={finalUrl}
      target="_blank"
      rel="noopener noreferrer"
      // CARD STYLING (Preserved exactly as you had it)
      className="group flex flex-row items-center gap-3 min-w-[200px] max-w-[200px] h-[52px] px-2.5 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-sm transition-all snap-start text-left no-underline cursor-pointer shrink-0"
    >
      {/* LEFT: Thumbnail / Icon */}
      <div className="shrink-0">
        {document.cover_image_url ? (
          <img 
            src={document.cover_image_url} 
            alt="" 
            className="w-8 h-8 rounded-md object-cover border border-slate-100 bg-slate-50"
          />
        ) : (
          <div className={`w-8 h-8 rounded-md flex items-center justify-center border ${
            isVideo 
              ? 'bg-red-50 text-red-500 border-red-100' // Red for Video
              : 'bg-orange-50 text-orange-500 border-orange-100' // Orange for Text
          }`}>
            {isVideo ? <PlayCircle size={14} /> : <FileText size={14} />}
          </div>
        )}
      </div>

      {/* RIGHT: Content Column */}
      <div className="flex flex-col justify-center min-w-0 flex-1">
        {/* Title */}
        <span className="text-[10px] font-semibold text-slate-700 truncate group-hover:text-orange-700 leading-tight">
          {document.title}
        </span>
        
        {/* Domain + Context */}
        <div className="flex items-center gap-1 mt-0.5 opacity-80">
          <span className="text-[9px] text-slate-400 truncate max-w-[80px]">
            {document.source_url ? new URL(document.source_url).hostname.replace('www.', '') : 'Source'}
          </span>
          
          {/* Optional: Show timestamp indicator if video */}
          {isVideo && document.metadata?.timestampStart && (
            <span className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded">
              {new Date(document.metadata.timestampStart * 1000).toISOString().substring(14, 19)}
            </span>
          )}
        </div>
      </div>
    </a>
  )
}