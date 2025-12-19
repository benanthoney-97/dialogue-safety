import { ArrowLeft, Building2, FlaskConical, ChevronDown, Bot } from "lucide-react"

interface HeaderProps {
  currentView: 'dashboard' | 'chat'
  activeProvider: any
  providers: any[]
  onBack: () => void
  onProviderSelect: (providerId: string) => void
}

export function Header({ currentView, activeProvider, providers, onBack, onProviderSelect }: HeaderProps) {
  
  // Helper to render the correct Icon or Logo
  const renderProviderIcon = () => {
    
    // 1. DYNAMIC LOGO (Priority)
    // If the provider has a custom logo URL, display it
    if (activeProvider?.logo_url) {
      return (
        <div className="h-8 w-8 rounded-full border border-white/20 bg-white/10 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
           <img 
            src={activeProvider.logo_url} 
            alt={activeProvider.name} 
            className="h-full w-full object-cover" 
          />
        </div>
      )
    }

    // 2. FALLBACK ICONS (If no logo uploaded)
    // We use white/20 so it looks good on any colored background
    const isLaw = activeProvider?.name?.includes("Law")
    return (
      <div className="h-8 w-8 rounded-full border border-white/10 bg-white/10 flex items-center justify-center shrink-0 text-white">
        {isLaw ? <Building2 size={18}/> : <Bot size={18}/>}
      </div>
    )
  }

  return (
    <div 
      className="p-3 shadow-md z-10 flex items-center justify-between h-16 shrink-0 transition-colors duration-300 relative border-b border-white/10"
      style={{
        // DYNAMIC HEADER BACKGROUND
        // Uses your new 'primary_colour' field, defaults to Slate-900 if missing
        backgroundColor: activeProvider?.primary_colour || '#0f172a' 
      }}
    >
      
      {/* LEFT SIDE: Back Button OR Logo+Name */}
      {currentView === 'chat' ? (
        <div className="flex items-center gap-3">
            <button 
                onClick={onBack} 
                className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition"
            >
            <ArrowLeft size={20} />
            </button>
            
            <div className="flex flex-col">
                <span className="font-bold text-sm text-white leading-tight drop-shadow-sm">
                    {activeProvider?.name}
                </span>
                <span className="text-[10px] text-white/60 font-medium">
                    Assistant Active
                </span>
            </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 pl-1 overflow-hidden">
          
          {renderProviderIcon()}

          <span className="font-bold text-sm tracking-wide text-white truncate drop-shadow-sm">
            {activeProvider?.name || "Select Provider"}
          </span>

        </div>
      )}

      {/* RIGHT SIDE: Provider Dropdown */}
      <div className="relative group shrink-0 ml-2">
        <select 
          value={activeProvider?.id || ""}
          onChange={(e) => onProviderSelect(e.target.value)}
          // Kept exactly as you requested (Clean Slate-800 style)
          className="appearance-none bg-slate-800 border border-slate-700 text-white text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-500 hover:border-slate-600 transition-all max-w-[160px] truncate shadow-sm"
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}>
                {p.name}
            </option>
          ))}
        </select>
        
        <ChevronDown 
            size={14} 
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>
    </div>
  )
}