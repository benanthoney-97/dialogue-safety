import { ShieldCheck, MousePointer2, Sparkles } from "lucide-react"

interface DashboardProps {
  activeProvider: any
  onScan: (type: 'full' | 'selection' | 'summary') => void
}

export function Dashboard({ activeProvider, onScan }: DashboardProps) {
  return (
    <div className="flex flex-col h-full p-6 space-y-4 justify-center pb-20">
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Ready to Analyze?</h2>
        <p className="text-xs text-slate-500">Using intelligence from <span className="font-semibold">{activeProvider?.name || "..."}</span></p>
      </div>

      <button onClick={() => onScan('full')} className="w-full group bg-white border border-slate-200 hover:border-amber-400 hover:shadow-md p-4 rounded-xl transition-all active:scale-[0.98] flex items-center gap-4 text-left">
        <div className="bg-amber-50 p-3 rounded-lg group-hover:bg-amber-100 transition"><ShieldCheck className="w-6 h-6 text-amber-600" /></div>
        <div><span className="block font-bold text-sm text-slate-800">Scan Full Page</span><span className="block text-[10px] text-slate-500">Check for risks</span></div>
      </button>

      <button onClick={() => onScan('selection')} className="w-full group bg-slate-900 text-white shadow-lg shadow-slate-200 hover:bg-slate-800 p-4 rounded-xl transition-all active:scale-[0.98] flex items-center gap-4 text-left">
        <div className="bg-slate-700 p-3 rounded-lg group-hover:bg-slate-600 transition"><MousePointer2 className="w-6 h-6 text-white" /></div>
        <div><span className="block font-bold text-sm">Analyze Selection</span><span className="block text-[10px] text-slate-300">Highlight text first</span></div>
      </button>

      <button onClick={() => onScan('summary')} className="w-full group bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md p-4 rounded-xl transition-all active:scale-[0.98] flex items-center gap-4 text-left">
        <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition"><Sparkles className="w-6 h-6 text-blue-600" /></div>
        <div><span className="block font-bold text-sm text-slate-800">Summarize Page</span><span className="block text-[10px] text-slate-500">Quick overview</span></div>
      </button>
    </div>
  )
}