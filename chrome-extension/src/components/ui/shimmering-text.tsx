import { cn } from "../../lib/utils"
import { motion } from "motion/react"

interface ShimmeringTextProps {
  text: string
  className?: string
  duration?: number
  repeatDelay?: number
}

export function ShimmeringText({
  text,
  className,
  duration = 2,
  repeatDelay = 0.5,
}: ShimmeringTextProps) {
  return (
    <motion.span
      className={cn(
        // Base styles:
        "inline-block bg-clip-text text-transparent bg-[length:200%_100%] bg-no-repeat",
        
        // The Gradient:
        "bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400",
        
        // 👈 FIX: Bind background-position to the CSS variable
        "bg-[position:var(--shimmer-pos)_0]",
        
        className
      )}
      
      // 👈 FIX: Animate the CSS variable instead of the property directly
      initial={{ "--shimmer-pos": "200%" } as any}
      animate={{ "--shimmer-pos": "-200%" } as any}
      
      transition={{
        repeat: Infinity,
        duration: duration,
        repeatDelay: repeatDelay,
        ease: "linear",
      }}
    >
      {text}
    </motion.span>
  )
}