import { ShieldCheck, MousePointer2, Sparkles } from "lucide-react"

interface DashboardProps {
  activeProvider: any
  onScan: (type: 'full' | 'selection' | 'summary') => void
}

export function Dashboard({ activeProvider, onScan }: DashboardProps) {
  return (
    <div className="flex flex-col h-full p-6 space-y-4 justify-center pb-20">
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Ready to Analyse?</h2>
        <p className="text-xs text-slate-500">Using intelligence from <span className="font-semibold">{activeProvider?.name || "..."}</span></p>
      </div>

      {/* Card 1: Scan Full Page */}
      <button onClick={() => onScan('full')} className="w-full group bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md p-4 rounded-xl transition-all active:scale-[0.98] flex items-center gap-4 text-left">
        <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition">
          <ShieldCheck className="w-6 h-6 text-[#0f172a]" />
        </div>
        <div>
          <span className="block font-bold text-sm text-slate-800">Scan Full Page</span>
          <span className="block text-[10px] text-slate-500">Check for risks</span>
        </div>
      </button>

      {/* Card 2: Analyse Selection */}
      <button onClick={() => onScan('selection')} className="w-full group bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md p-4 rounded-xl transition-all active:scale-[0.98] flex items-center gap-4 text-left">
        <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition">
          <MousePointer2 className="w-6 h-6 text-[#0f172a]" />
        </div>
        <div>
          <span className="block font-bold text-sm text-slate-800">Analyse Selection</span>
          <span className="block text-[10px] text-slate-500">Highlight text first</span>
        </div>
      </button>

      {/* Card 3: Summarise Page */}
      <button onClick={() => onScan('summary')} className="w-full group bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md p-4 rounded-xl transition-all active:scale-[0.98] flex items-center gap-4 text-left">
        <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition">
          <Sparkles className="w-6 h-6 text-[#0f172a]" />
        </div>
        <div>
          <span className="block font-bold text-sm text-slate-800">Summarise Page</span>
          <span className="block text-[10px] text-slate-500">Quick overview</span>
        </div>
      </button>
    </div>
  )
}