import React, { memo } from "react"
import Markdown from "markdown-to-jsx"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { PlayCircle, FileText, ExternalLink } from "lucide-react"
import type { SourceDocument } from "./sourceReferenceCard" 

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- HELPER: Generate Text Fragment URL ---
function generateTextFragmentUrl(baseUrl: string, chunkContent?: string): string {
  if (!chunkContent || !baseUrl) return baseUrl || '#'

  // 1. Flatten whitespace to single spaces
  const cleanContent = chunkContent.replace(/\s+/g, ' ').trim()
  
  // 2. Split into words
  const words = cleanContent.split(' ')
  
  // If too short, just return the base URL
  if (words.length < 4) {
    console.warn("[TextFragment] Text too short for fragment:", cleanContent)
    return baseUrl
  }

  // 3. Take first 6-8 words for a robust match
  // We strip punctuation from the start/end of the match string to avoid browser matching issues
  let snippet = words.slice(0, 7).join(' ')
  
  // Encode carefully for URL
  const fragment = `#:~:text=${encodeURIComponent(snippet)}`

  return `${baseUrl}${fragment}`
}

// --- 1. THE BADGE COMPONENT ---
const CitationBadge = ({ title, timestamp, sources }: { title: string, timestamp?: string, sources: SourceDocument[] }) => {
  
  // Find source by partial title match
  const source = sources?.find(s => s.title.includes(title) || title.includes(s.title))
  const isVideo = source?.media_type === 'video' || timestamp
  
  // Helper for Video Timestamps
  const getSeconds = (timeStr: string) => {
    if (!timeStr) return 0
    const parts = timeStr.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault() // Prevent any default anchor behavior

    // --- DEBUGGING (Check Browser Console) ---
    console.group("🖱️ Citation Clicked")
    console.log("Title:", title)
    console.log("Source Object:", source)
    
    if (!source?.source_url) {
      console.error("❌ No Source URL found")
      console.groupEnd()
      return
    }

    let finalUrl = source.source_url.trim()
    
    // A. VIDEO LOGIC
    if (isVideo && timestamp) {
       const seconds = getSeconds(timestamp)
       if (finalUrl.includes('youtube.com') || finalUrl.includes('youtu.be')) {
          const hasParams = finalUrl.includes('?')
          finalUrl = `${finalUrl}${hasParams ? '&' : '?'}t=${seconds}`
       } else if (finalUrl.includes('vimeo.com')) {
          finalUrl = `${finalUrl}#t=${seconds}s`
       }
    } 
    // B. ARTICLE LOGIC (Text Fragment)
    else {
      // Access content safely
      const content = (source as any).content
      console.log("Content for Fragment:", content ? content.substring(0, 30) + "..." : "MISSING")
      
      finalUrl = generateTextFragmentUrl(finalUrl, content)
    }
    
    console.log("🚀 Opening URL:", finalUrl)
    console.groupEnd()
    
    window.open(finalUrl, "_blank")
  }

  return (
    <span className="inline-flex items-center gap-1 mx-1 align-baseline transform translate-y-[2px]">
      <span 
        onClick={handleClick}
        className={cn(
          "inline-flex items-center h-5 gap-1.5 pl-0.5 pr-2 rounded-full text-[10px] font-medium transition-all select-none whitespace-nowrap border shadow-sm group",
          source?.source_url 
            ? "bg-white text-slate-700 border-slate-200 hover:border-orange-300 hover:text-orange-700 hover:shadow-md cursor-pointer" 
            : "bg-slate-50 text-slate-400 border-slate-100 cursor-default"
        )}
        title={source?.source_url ? `Open "${title}"` : `Source: ${title}`}
      >
        {/* ICON / AVATAR */}
        {source?.cover_image_url ? (
          <img 
            src={source.cover_image_url} 
            alt="source" 
            className="w-4 h-4 rounded-full object-cover border border-slate-100 shrink-0"
          />
        ) : isVideo ? (
          <PlayCircle size={14} className={cn(
            "ml-0.5 shrink-0",
            source?.source_url ? "text-blue-500 fill-blue-50" : "text-slate-300"
          )} />
        ) : (
          <FileText size={12} className={cn(
            "ml-0.5 shrink-0",
            source?.source_url ? "text-orange-500" : "text-slate-300"
          )} />
        )}
        
        {/* TITLE */}
        <span className="max-w-[100px] truncate hidden sm:inline-block opacity-80 leading-none mt-[1px]">
          {title}
        </span>
        
        {/* TIMESTAMP or ARROW */}
        {timestamp ? (
          <>
            <span className="opacity-20 leading-none mt-[1px]">|</span>
            <span className="font-bold font-mono text-[9px] text-blue-600 leading-none mt-[1px]">
              {timestamp}
            </span>
          </>
        ) : (
             source?.source_url && <ExternalLink size={8} className="opacity-40 group-hover:opacity-100 transition-opacity ml-0.5" />
        )}
      </span>
    </span>
  )
}

// --- 2. THE RESPONSE WRAPPER ---
interface ResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  sources?: SourceDocument[]
}

export const Response = memo(({ className, children, sources, ...props }: ResponseProps) => {
  
  let content: string = typeof children === "string" ? children : (children ? String(children) : "")
  content = content.replace(/^[\t ]+([*-])/gm, '$1')

  // Regex handles both time-stamped videos AND articles
  content = content.replace(
      /\[\[(.*?)(?:,\s*(?:Timestamp:)?\s*(\d{1,2}:\d{2}))?\]\]/g, 
      (match, title, time) => {
         const cleanTitle = title.trim().replace(/"/g, '&quot;')
         return `<Citation title="${cleanTitle}" ${time ? `timestamp="${time}"` : ''} />`
      }
    )

  return (
    <div 
      className={cn(
        "prose prose-sm max-w-none prose-slate dark:prose-invert",
        "prose-p:text-slate-700 prose-p:leading-relaxed prose-p:my-1",
        "prose-li:my-0",
        "prose-pre:bg-slate-50 prose-pre:text-slate-700 prose-pre:border prose-pre:border-slate-200 prose-pre:rounded-lg prose-pre:shadow-sm",
        "prose-code:bg-transparent prose-code:text-slate-800 prose-code:font-semibold prose-code:text-[11px]",
        className
      )}
      {...props}
    >
      <Markdown
        options={{
          overrides: {
            Citation: {
              component: CitationBadge,
              props: { sources: sources || [] }
            },
            a: {
              component: (props) => (
                <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium" />
              ),
            },
          },
        }}
      >
        {content as string}
      </Markdown>
    </div>
  )
})

Response.displayName = "Response"