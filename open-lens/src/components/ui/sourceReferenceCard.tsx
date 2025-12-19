import { FileText } from "lucide-react"

export interface SourceDocument {
  id: number
  title: string
  source_url: string
  cover_image_url?: string | null
  media_type?: 'video' | 'article' | 'pdf'
  similarity?: number
  content?: string
}

export function SourceReferenceCard({ document }: { document: SourceDocument }) {
  return (
    <a
      href={document.source_url}
      target="_blank"
      rel="noopener noreferrer"
      // CARD STYLING:
      // - flex-row & items-center: Places image and text side-by-side, perfectly centered vertically
      // - min-w-[200px]: Gives it that "wide rectangle" shape
      // - h-[50px]: Fixes the height to keep it compact and uniform
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
          <div className="w-8 h-8 rounded-md bg-orange-50 flex items-center justify-center text-orange-500 border border-orange-100">
            <FileText size={14} />
          </div>
        )}
      </div>

      {/* RIGHT: Content Column */}
      {/* 'min-w-0' is required for text truncation to work inside a flex child */}
      <div className="flex flex-col justify-center min-w-0 flex-1">
        {/* Title */}
        <span className="text-[10px] font-semibold text-slate-700 truncate group-hover:text-orange-700 leading-tight">
          {document.title}
        </span>
        
        {/* Domain */}
        <span className="text-[9px] text-slate-400 truncate opacity-80 mt-0.5">
          {document.source_url ? new URL(document.source_url).hostname.replace('www.', '') : 'Source'}
        </span>
      </div>
    </a>
  )
}