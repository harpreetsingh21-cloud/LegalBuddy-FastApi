import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Trash2, Sparkles, Clock, CheckCircle, Search,
  LayoutGrid, X, Loader2, Upload, Eye, Brain, BookOpen, Target,
  ShieldAlert, ShieldCheck, ArrowLeft, CheckCircle2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { documentAPI, summarizeAPI } from '../../../shared/utils/api'
import { useFileStore } from '../models/fileStore'
import { useFileUpload } from '../intents/useFileUpload'
import { useAnalysisPolling } from '../intents/useAnalysisPolling'
import FileViewerView from './FileViewerView'

const FILTER_TABS = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'analyzed', label: 'Analyzed', icon: CheckCircle },
]

const DETAIL_TABS = [
  { id: 'preview',    label: 'PREVIEW' },
  { id: 'summary',    label: 'SUMMARY',    icon: Brain,       iconBg: 'bg-emerald-500' },
  { id: 'clauses',    label: 'CLAUSES',    icon: BookOpen,    iconBg: 'bg-blue-500' },
  { id: 'objectives', label: 'OBJECTIVES', icon: Target,      iconBg: 'bg-orange-500' },
  { id: 'risk',       label: 'RISK',       icon: ShieldAlert, iconBg: 'bg-rose-500' },
  { id: 'compliance', label: 'COMPLIANCE', icon: ShieldCheck, iconBg: 'bg-violet-500' },
]

const isAnalyzed = (s) => ['analyzed', 'done', 'completed'].includes(String(s || '').toLowerCase())

/* Render **bold** markdown inline without dangerouslySetInnerHTML */
function BoldText({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

/* Turn a string OR array into a bullet list. Splits multi-line strings on \n. */
function BulletBlock({ content }) {
  let lines = []
  if (Array.isArray(content)) {
    lines = content.filter(Boolean)
  } else if (typeof content === 'string') {
    lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  }

  if (lines.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed">No items identified.</p>
  }

  const looksLikeBullets = lines.length > 1 || lines[0].startsWith('-') || lines[0].startsWith('*')

  if (!looksLikeBullets) {
    return (
      <p className="text-gray-700 dark:text-gray-300 text-base leading-relaxed whitespace-pre-wrap">
        <BoldText text={lines[0]} />
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {lines.map((line, i) => {
        const clean = line.replace(/^[-*]\s*/, '')
        return (
          <div key={i} className="text-gray-700 dark:text-gray-300 text-base leading-relaxed">
            <span className="text-orange-500 mr-2">-</span>
            <BoldText text={clean} />
          </div>
        )
      })}
    </div>
  )
}

function DetailCard({ icon: Icon, iconBg, title, children }) {
  return (
    <div className="bg-white dark:bg-[#111111] rounded-3xl border border-gray-200 dark:border-[#1f1f1f] p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center text-white shrink-0`}>
          <Icon size={24} />
        </div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function DocumentsView() {
  const {
    files, activeDocId, activeDoc, setActiveDoc,
    refreshFiles, clearActive, summaryData, analyzing, setAnalyzing
  } = useFileStore()
  const { dragging, setDragging, inputRef, handleFile, onDrop } = useFileUpload()
  const [filterTab, setFilterTab] = useState('all')
  const [detailTab, setDetailTab] = useState('preview')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(null)

  useAnalysisPolling(activeDocId)

  useEffect(() => {
    setLoading(true)
    refreshFiles().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setDetailTab('preview')
  }, [activeDocId])

  const validFiles = files.filter(d => d.doc_id && String(d.doc_id).trim() !== '')

  const filteredFiles = validFiles.filter((doc) => {
    if (filterTab === 'analyzed') return isAnalyzed(doc.status)
    return true
  }).filter((doc) =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const displayFiles = filterTab === 'recent'
    ? [...filteredFiles].reverse().slice(0, 6)
    : filteredFiles

  const handleDelete = async (e, doc) => {
    e.stopPropagation()
    if (!confirm(`Delete "${doc.filename}"?`)) return
    setDeleting(doc.doc_id)
    try {
      await documentAPI.delete(doc.doc_id)
      toast.success('Deleted')
      await refreshFiles()
      if (activeDocId === doc.doc_id) clearActive()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleAnalyze = async (e, doc) => {
    e.stopPropagation()
    setAnalyzing(true)
    const tid = toast.loading(`Analyzing ${doc.filename}...`)
    try {
      await summarizeAPI.trigger(doc.doc_id)
      toast.success('Analysis started!', { id: tid })
      await refreshFiles()
    } catch (err) {
      toast.error(err.message, { id: tid })
    }
  }

  const activeDocMeta = files.find((f) => f.doc_id === activeDocId)
  const docStatusReady = isAnalyzed(summaryData?.status) || isAnalyzed(activeDocMeta?.status)

  return (
    <div className="flex h-[calc(100vh-58px)] bg-gray-50 dark:bg-[#050505] overflow-hidden flex-col text-gray-900 dark:text-white transition-colors duration-300">
      <AnimatePresence mode="wait">
        {!activeDocId ? (
          <motion.div
            key="library"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full overflow-y-auto p-6 md:p-8"
          >
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-500" />
                  Documents
                </h1>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 rounded-xl text-sm bg-white dark:bg-[#161616] border border-gray-200 dark:border-[#1f1f1f] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 w-56"
                  />
                </div>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                  dragging ? 'border-orange-500 bg-orange-500/5' : 'border-gray-300 dark:border-[#2a2a2a] bg-white dark:bg-[#0d0d0d] hover:border-orange-400'
                }`}
              >
                <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
                <div className="flex items-center justify-center gap-3">
                  <Upload className="w-5 h-5 text-orange-500" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Drop file or click to upload</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">PDF, DOCX, TXT</span>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#111111] p-1 rounded-xl w-fit border border-gray-200 dark:border-[#1f1f1f]">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterTab(tab.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      filterTab === tab.id ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <tab.icon size={14} /> {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <div key={i} className="bg-gray-100 dark:bg-[#161616] rounded-2xl p-6 border border-gray-200 dark:border-[#1f1f1f] h-40 animate-pulse" />
                  ))
                ) : displayFiles.length === 0 ? (
                  <div className="col-span-full text-center py-12 bg-white dark:bg-[#111111] rounded-2xl border border-gray-200 dark:border-[#1f1f1f]">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{searchQuery ? 'No documents match your search.' : 'No documents uploaded yet.'}</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {displayFiles.map((doc, i) => (
                      <motion.div
                        key={doc.doc_id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => setActiveDoc(doc.doc_id, doc)}
                        className="bg-white dark:bg-[#161616] rounded-2xl p-6 border border-gray-200 dark:border-[#1f1f1f] hover:border-orange-500/40 transition-colors cursor-pointer group relative"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                            <FileText size={20} className="text-orange-500" />
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!isAnalyzed(doc.status) && (
                              <button onClick={(e) => handleAnalyze(e, doc)} className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 hover:bg-orange-500/20" title="Analyze">
                                <Sparkles size={14} />
                              </button>
                            )}
                            <button onClick={(e) => handleDelete(e, doc)} disabled={deleting === doc.doc_id} className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20" title="Delete">
                              {deleting === doc.doc_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </div>
                        <div className="text-gray-900 dark:text-white font-bold text-base truncate" title={doc.filename}>
                          {doc.filename.replace(/\.[^.]+$/, '')}
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 ${
                            isAnalyzed(doc.status) ? 'bg-green-500/10 text-green-600 dark:text-green-500' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500'
                          }`}>
                            {isAnalyzed(doc.status) ? <CheckCircle size={11} /> : <Clock size={11} />}
                            {isAnalyzed(doc.status) ? 'Analyzed' : 'Queued'}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">{doc.doc_id}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex flex-col bg-gray-50 dark:bg-[#050505]"
          >
            <div className="flex items-center justify-between py-4 px-6 border-b border-gray-200 dark:border-[#1a1a1a] shrink-0 gap-4 flex-wrap">
              <button onClick={clearActive} className="shrink-0 flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium">
                <ArrowLeft size={16} /> Back
              </button>
              <div className="flex items-center bg-gray-100 dark:bg-[#111111] rounded-full p-1 border border-gray-200 dark:border-[#1f1f1f] overflow-x-auto flex-nowrap">
                {DETAIL_TABS.map((tab) => {
                  const active = detailTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setDetailTab(tab.id)}
                      className={`shrink-0 whitespace-nowrap px-3 py-2 md:px-5 rounded-full text-[11px] md:text-xs font-bold uppercase tracking-wider transition-all ${
                        active ? 'bg-white dark:bg-[#1f1f1f] text-orange-500 shadow-sm' : 'text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-[#1a1a1a] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={16} className="text-orange-500 shrink-0" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{activeDoc?.filename}</span>
              </div>
              {docStatusReady && (
                <div className="shrink-0 flex items-center gap-2 py-1 px-3 rounded-full bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 size={12} className="text-green-600 dark:text-green-500" />
                  <span className="text-[11px] text-green-600 dark:text-green-500 font-bold uppercase tracking-wider">Analysis Ready</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {detailTab === 'preview' && (
                <div className="h-[calc(100vh-220px)]">
                  <FileViewerView docId={activeDocId} filename={activeDoc?.filename} onClose={clearActive} />
                </div>
              )}

              {detailTab !== 'preview' && analyzing && !docStatusReady && (
                <div className="flex flex-col items-center py-24 gap-4">
                  <div className="relative w-14 h-14">
                    <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-[#222222]" />
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-500" />
                  </div>
                  <div className="font-black text-gray-900 dark:text-white text-base uppercase tracking-tight">Analyzing document...</div>
                  <div className="text-gray-500 dark:text-gray-400 text-sm">This may take 30-90 seconds</div>
                </div>
              )}

              {detailTab !== 'preview' && !docStatusReady && !analyzing && (
                <div className="text-center py-24 text-gray-500 dark:text-gray-400 text-sm">
                  No analysis yet. Go back and click the sparkles icon to start.
                </div>
              )}

              {detailTab === 'summary' && docStatusReady && (
                <DetailCard icon={Brain} iconBg="bg-emerald-500" title="Executive Summary">
                  <BulletBlock content={summaryData?.summary} />
                </DetailCard>
              )}

              {detailTab === 'clauses' && docStatusReady && (
                <DetailCard icon={BookOpen} iconBg="bg-blue-500" title="Detected Clauses">
                  <BulletBlock content={summaryData?.clauses} />
                </DetailCard>
              )}

              {detailTab === 'objectives' && docStatusReady && (
                <DetailCard icon={Target} iconBg="bg-orange-500" title="Legal Objectives">
                  <BulletBlock content={summaryData?.obligations} />
                </DetailCard>
              )}

              {detailTab === 'risk' && docStatusReady && (
                <DetailCard icon={ShieldAlert} iconBg="bg-rose-500" title="Risk Assessment">
                  <BulletBlock content={summaryData?.risks} />
                </DetailCard>
              )}

              {detailTab === 'compliance' && docStatusReady && (
                <DetailCard icon={ShieldCheck} iconBg="bg-violet-500" title="Compliance Status">
                  <BulletBlock content={summaryData?.compliance} />
                </DetailCard>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}