import { useState } from "react"
import "./style.css"

// Hooks
import { useScanEngine } from "./hooks/useScanEngine"

// Components
import { Header } from "./components/ui/header"
import { Dashboard } from "./components/ui/dashboard"
import { ChatInterface } from "./components/ui/chat-interface"
import { InputArea } from "./components/ui/input-area"

function SidePanel() {
  const { 
    currentView, activeProvider, providers, messages, isScanning, pendingFallback,
    setActiveProvider, handleReset, runAnalysis, performScan 
  } = useScanEngine()

  const [input, setInput] = useState("")

const handleSend = async () => {
    if (!input.trim() || !activeProvider) return
    const textToSend = input
    setInput("") 

    await runAnalysis(textToSend, 'chat')
  }

  // Provider selection handler
  const handleProviderSelect = (id: string) => {
    const selected = providers.find(p => p.id == id)
    setActiveProvider(selected)
    handleReset()
  }

// src/sidepanel.tsx

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 font-sans text-slate-900">
       
       {/* 1. Header (Keep as is) */}
       <Header 
         currentView={currentView}
         activeProvider={activeProvider}
         providers={providers}
         onBack={handleReset}
         onProviderSelect={handleProviderSelect}
       />

       {/* 2. Main Content Area (LOCKED) */}
       {/* change 'overflow-y-auto' to 'overflow-hidden' 👇 */}
       <div className="flex-1 overflow-hidden relative flex flex-col">
          
          {currentView === 'dashboard' ? (
             // Dashboard needs its own scroll since we locked the parent
             <div className="h-full overflow-y-auto">
                <Dashboard 
                    activeProvider={activeProvider} 
                    onScan={performScan} 
                />
             </div>
          ) : (
             // ChatInterface handles its own scrolling internally
             <ChatInterface 
               messages={messages}
               isScanning={isScanning}
               activeProvider={activeProvider}
               pendingFallback={pendingFallback}
               onRetry={(text, type) => runAnalysis(text, type, true)}
               onCancel={handleReset}
             />
          )}

       </div>

       {/* 3. Input Footer (Keep as is) */}
       <InputArea 
         input={input}
         setInput={setInput}
         onSend={handleSend}
         activeProvider={activeProvider}
         isScanning={isScanning}
       />

    </div>
  )
}

export default SidePanel