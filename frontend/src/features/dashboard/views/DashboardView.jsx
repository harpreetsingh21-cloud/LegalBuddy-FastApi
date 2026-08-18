import { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Scale, FileText, Clock, CheckCircle, Sparkles,
  Upload, ArrowRight
} from 'lucide-react'
import { useAuthStore } from '../../auth/models/authStore'
import { useFileStore } from '../../documents/models/fileStore'
import { healthCheck } from '../../../shared/utils/api'
import { useFileUpload } from '../../documents/intents/useFileUpload'

export default function DashboardView() {
  const { user } = useAuthStore()
  const { files, refreshFiles, setActiveDoc } = useFileStore()
  const { dragging, setDragging, inputRef, handleFile, onDrop } = useFileUpload()

  useEffect(() => {
    refreshFiles()
    const h = setInterval(async () => {}, 10000)
    return () => clearInterval(h)
  }, [])

  const validFiles = files.filter(d => d.doc_id && String(d.doc_id).trim() !== '')
  const isAnalyzed = (s) => ['analyzed', 'done', 'completed'].includes(String(s || '').toLowerCase())

  const recentFiles = [...validFiles].reverse().slice(0, 5)
  const total = validFiles.length
  const queued = validFiles.filter(d => !isAnalyzed(d.status)).length
  const analyzed = validFiles.filter(d => isAnalyzed(d.status)).length

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-outfit font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Scale className="w-6 h-6 text-orange-500" />
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Your LegalBuddy agent dashboard — upload and analyze legal documents
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total', value: total, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
            { label: 'Queued', value: queued, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
            { label: 'Analyzed', value: analyzed, icon: Sparkles, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-gray-200 dark:border-[#1f1f1f] bg-white dark:bg-[#161616] p-4 flex items-center gap-3"
            >
              <div className={`w-10 h-10 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <div className="text-xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragging
              ? 'border-orange-500 bg-orange-500/5'
              : 'border-gray-300 dark:border-neutral-700 bg-white dark:bg-[#161616] hover:border-orange-400'
          }`}
        >
          <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Upload className="w-6 h-6 text-orange-500" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Drop your legal document here</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">PDF, DOCX, TXT · Max 50MB</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Recent Documents</h2>
          </div>
          <div className="space-y-2">
            {recentFiles.map((doc, i) => (
              <motion.div
                key={doc.doc_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setActiveDoc(doc.doc_id, doc)}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-[#1f1f1f] bg-white dark:bg-[#161616] hover:border-orange-500/40 cursor-pointer transition-all"
              >
                <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{doc.filename}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  isAnalyzed(doc.status)
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                }`}>
                  {isAnalyzed(doc.status) ? 'Analyzed' : 'Queued'}
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </motion.div>
            ))}
            {recentFiles.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No documents yet. Upload your first file above.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
