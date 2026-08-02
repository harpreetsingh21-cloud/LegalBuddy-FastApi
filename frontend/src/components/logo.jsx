import { Scale } from 'lucide-react'

export default function Logo({ 
  size = 'md',
  showTagline = true, 
}) {
  const sizes = {
    sm: { box: 'w-8 h-8', icon: 18, title: 'text-lg', tagline: 'text-[9px]' },
    md: { box: 'w-10 h-10', icon: 22, title: 'text-xl', tagline: 'text-[10px]' },
    lg: { box: 'w-12 h-12', icon: 26, title: 'text-2xl', tagline: 'text-xs' },
  }

  const s = sizes[size]

  return (
    <div className="flex items-center gap-3 select-none">
      <div className={`${s.box} bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0`}>
        <Scale size={s.icon} className="text-white" strokeWidth={2.5} />
      </div>

      <div className="flex flex-col">
        <div className={`font-outfit ${s.title} font-black text-gray-900 dark:text-white tracking-tight uppercase leading-none`}>
          Legal<span className="text-orange-500">Buddy</span>
        </div>
        {showTagline && (
          <div className={`${s.tagline} text-gray-600 dark:text-gray-400 font-medium font-poppins tracking-wider mt-0.5`}>
            AI LEGAL INTELLIGENCE PLATFORM
          </div>
        )}
      </div>
    </div>
  )
}