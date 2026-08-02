import { motion } from 'framer-motion'

const fadeItem = (i) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }
})

export function StatCard({ icon: Icon, label, value, color, delay = 0 }) {
  return (
    <motion.div
      {...fadeItem(delay)}
      className="bg-[#161616] border border-[#1f1f1f] rounded-2xl p-6 flex items-center gap-4 hover:border-[#2a2a2a] transition-all cursor-default"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: `${color}1F`,
          border: `1px solid ${color}38`
        }}
      >
        <Icon size={22} color={color} />
      </div>
      <div>
        <div className="text-3xl font-black text-white leading-none tracking-tight">{value}</div>
        <div className="text-xs text-gray-500 mt-1.5 font-medium uppercase tracking-wider">{label}</div>
      </div>
    </motion.div>
  )
}