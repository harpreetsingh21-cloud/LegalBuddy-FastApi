import { motion } from 'framer-motion'

const fadeItem = (i) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }
})

export function FeatureCard({ icon: Icon, title, desc, delay = 0 }) {
  return (
    <motion.div
      {...fadeItem(delay)}
      className="bg-[#161616] border border-[#1f1f1f] rounded-2xl p-6 hover:border-[#2a2a2a] transition-all cursor-default"
    >
      <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
        <Icon size={18} className="text-orange-500" />
      </div>
      <div className="text-sm font-bold text-white mb-2 uppercase tracking-wide">{title}</div>
      <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
    </motion.div>
  )
}