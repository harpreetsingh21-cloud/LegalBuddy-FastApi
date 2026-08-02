import { motion } from 'framer-motion'

export function ListSection({ items, theme, emptyMsg }) {
  if (!items?.length) {
    return <p className="text-gray-500 text-sm py-2">{emptyMsg}</p>
  }

  const themes = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 border-l-emerald-500 text-emerald-100',
    blue:    'bg-blue-500/10    border-blue-500/20    border-l-blue-500    text-blue-100',
    orange:  'bg-orange-500/10  border-orange-500/20  border-l-orange-500  text-orange-100',
    rose:    'bg-rose-500/10    border-rose-500/20    border-l-rose-500    text-rose-100',
    violet:  'bg-violet-500/10  border-violet-500/20  border-l-violet-500  text-violet-100',
  }

  const activeTheme = themes[theme] || themes.orange

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className={`p-4 rounded-xl border border-l-[3px] text-sm leading-relaxed transition-colors duration-150 ${activeTheme}`}
        >
          {item}
        </motion.div>
      ))}
    </div>
  )
}