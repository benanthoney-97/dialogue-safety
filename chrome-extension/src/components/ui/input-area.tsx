import { Send } from "lucide-react"

interface InputAreaProps {
  input: string
  setInput: (val: string) => void
  onSend: () => void
  activeProvider: any
  isScanning: boolean
}

export function InputArea({ input, setInput, onSend, activeProvider, isScanning }: InputAreaProps) {
  return (
    <div className="p-4 bg-white border-t border-slate-200 shrink-0">
      <div className="relative flex items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder={activeProvider ? `Ask ${activeProvider.name}...` : "Select a provider..."}
          disabled={isScanning || !activeProvider}
          className="w-full rounded-full border border-slate-300 bg-slate-50 py-3 pl-4 pr-10 text-sm focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 transition shadow-sm disabled:opacity-50"
        />
        <button 
          onClick={onSend}
          disabled={!input.trim() || isScanning} 
          className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}