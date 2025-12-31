import React, { memo } from "react"
import Markdown from "markdown-to-jsx"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { PlayCircle, FileText, ExternalLink, ArrowUpRight, Headphones } from "lucide-react"
import type { SourceDocument } from "./sourceReferenceCard" 

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- HELPER: Decode HTML Entities ---
function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  const doc = new DOMParser().parseFromString(text, "text/html");
  return doc.documentElement.textContent || "";
}

// --- HELPER: Generate Text Fragment URL ---
function generateTextFragmentUrl(baseUrl: string, chunkContent?: string): string {
  if (!chunkContent || !baseUrl) return baseUrl || '#'

  try {
    let cleanContent = decodeHtmlEntities(chunkContent)
    cleanContent = cleanContent.replace(/\s+/g, ' ').trim()
    const words = cleanContent.split(' ')
    if (words.length < 4) return baseUrl
    const snippet = words.slice(0, 6).join(' ')
    return `${baseUrl}#:~:text=${encodeURIComponent(snippet)}`
  } catch (e) {
    return baseUrl
  }
}

// --- 1. THE BADGE COMPONENT ---
const CitationBadge = ({ title, timestamp, sources }: { title: string, timestamp?: string, sources: SourceDocument[] }) => {
  
  const source = sources?.find(s => 
    s.title.toLowerCase().includes(title.toLowerCase()) || 
    title.toLowerCase().includes(s.title.toLowerCase())
  )

  // ✅ FIX 1: Robust Type Checking
  const type = (source?.media_type || '').toLowerCase();
  const isVideo = type === 'video' || type === 'youtube';
  const isAudio = type === 'audio' || type === 'podcast'; // Include 'audio'
  
  // ✅ FIX 2: Allow both Audio and Video to be playable
  const isPlayable = isVideo || isAudio;

  const showTimestamp = isPlayable && timestamp;

  // Helper for Seconds
  const getSeconds = (timeStr: string) => {
    if (!timeStr) return 0
    const parts = timeStr.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault() 

    if (!source?.source_url) return
    let finalUrl = source.source_url.trim()
    
    // --- PATH A: PLAYABLE (Audio/Video) ---
    if (isPlayable && timestamp) {
       const seconds = getSeconds(timestamp)
       try {
         const urlObj = new URL(finalUrl)
         const hostname = urlObj.hostname.toLowerCase()

         // 1. YouTube
         if (hostname.includes('youtu')) {
            urlObj.searchParams.set('t', seconds.toString())
            finalUrl = urlObj.toString()
         } 
         // 2. Spotify (Web Player)
         // Matches both 'open.spotify.com' and 'googleusercontent.com/spotify'
         else if (hostname.includes('spotify') || finalUrl.includes('spotify.com')) {
            // Spotify Web Player uses '?t=120'
            urlObj.searchParams.set('t', seconds.toString())
            finalUrl = urlObj.toString()
         }
         // 3. Generic Fallback
         else {
            finalUrl = `${finalUrl}#t=${seconds}`
         }
       } catch (e) {
         finalUrl = `${finalUrl}#t=${seconds}`
       }
    } 
    // --- PATH B: DOCUMENTS (Text Highlight) ---
    else {
      const content = (source as any).content || source.content
      if (content) {
        finalUrl = generateTextFragmentUrl(finalUrl, content)
      }
    }
    
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
        {/* ICON LOGIC */}
        {source?.cover_image_url ? (
          <img src={source.cover_image_url} alt="src" className="w-4 h-4 rounded-full object-cover border border-slate-100 shrink-0"/>
        ) : isVideo ? (
          <PlayCircle size={14} className="ml-0.5 shrink-0 text-blue-500 fill-blue-50" />
        ) : isAudio ? (
           // Optional: Use headphones icon for podcasts
          <Headphones size={14} className="ml-0.5 shrink-0 text-purple-500 fill-purple-50" />
        ) : (
          <FileText size={12} className="ml-0.5 shrink-0 text-orange-500" />
        )}
        
        <span className="max-w-[100px] truncate hidden sm:inline-block opacity-80 leading-none mt-[1px]">
          {title}
        </span>
        
        {showTimestamp ? (
          <>
            <span className="opacity-20 leading-none mt-[1px]">|</span>
            <span className="font-bold font-mono text-[9px] text-blue-600 leading-none mt-[1px]">
              {timestamp}
            </span>
          </>
        ) : (
             source?.source_url && <ArrowUpRight size={10} className="opacity-40 group-hover:opacity-100 transition-opacity ml-0.5 text-slate-500" />
        )}
      </span>
    </span>
  )
}

// ... Rest of file (Response wrapper) remains the same ...
// Just ensure you export Response correctly
interface ResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  sources?: SourceDocument[]
}

export const Response = memo(({ className, children, sources, ...props }: ResponseProps) => {
  let content: string = typeof children === "string" ? children : (children ? String(children) : "")
  content = content.replace(/^[\t ]+([*-])/gm, '$1')

  content = content.replace(
      /\[\[(.*?)(?:,\s*(?:Timestamp:)?\s*(\d{1,2}:\d{2}))?\]\]/g, 
      (match, title, time) => {
         const cleanTitle = title.trim().replace(/"/g, '"')
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