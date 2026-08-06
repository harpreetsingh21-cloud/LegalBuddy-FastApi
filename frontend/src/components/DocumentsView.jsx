import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, Trash2, Loader2, Brain, BookOpen,
  AlertTriangle, Shield, CheckCircle2, XCircle, Eye,
  Search, ArrowLeft, Target, ShieldAlert, ShieldCheck,
  ChevronRight, Scale, FolderOpen
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useFileStore } from '../store/fileStore'
import { documentAPI, summarizeAPI } from '../utils/api'
import FileViewer from './FileViewer'

/* ─────────────────────────────────────────
   TABS CONFIG
   ───────────────────────────────────────── */
const TABS = [
  { id: 'file',        label: 'PREVIEW',    icon: Eye,         color: 'gray' },
  { id: 'summary',     label: 'SUMMARY',    icon: Brain,       color: 'emerald' },
  { id: 'clauses',     label: 'CLAUSES',    icon: BookOpen,    color: 'blue' },
  { id: 'obligations', label: 'OBJECTIVES', icon: Target,      color: 'orange' },
  { id: 'risks',       label: 'RISK',       icon: ShieldAlert, color: 'rose' },
  { id: 'compliance',  label: 'COMPLIANCE', icon: ShieldCheck, color: 'violet' },
]

const TAB_ACTIVE_CLASS = {
  file:        'bg-[#1f1f1f] text-white',
  summary:     'bg-[#1f1f1f] text-orange-500',
  clauses:     'bg-[#1f1f1f] text-blue-500',
  obligations: 'bg-[#1f1f1f] text-orange-500',
  risks:       'bg-[#1f1f1f] text-rose-500',
  compliance:  'bg-[#1f1f1f] text-violet-500',
}

const TAB_ICON_BG = {
  summary:     'bg-emerald-500',
  clauses:     'bg-blue-500',
  obligations: 'bg-orange-500',
  risks:       'bg-rose-500',
  compliance:  'bg-violet-500',
}

const TAB_TITLES = {
  summary:     'EXECUTIVE SUMMARY',
  clauses:     'DETECTED CLAUSES',
  obligations: 'LEGAL OBJECTIVES',
  risks:       'RISK ASSESSMENT',
  compliance:  'COMPLIANCE STATUS',
}

/* ─────────────────────────────────────────
   PARSER  (Tag-based + heuristic fallback)
   ───────────────────────────────────────── */
function parseAnalysis(raw) {
  if (!raw || typeof raw !== 'string') return null

  const result = {
    summary: '',
    clauses: [],
    obligations: [],
    risks: [],
    compliance: '',
    document_type: 'Legal Document'
  }

  // Check if AI actually used our [TAG] format
  const hasTags = /\[EXECUTIVE_SUMMARY\]/i.test(raw) || /\[CLAUSE_DETECTION\]/i.test(raw)

  // If AI ignored the tags, dump everything into summary so user sees SOMETHING
  if (!hasTags) {
    const cleanText = raw.trim()
    result.summary = cleanText
    result.obligations = [cleanText]
    result.compliance = cleanText
    result.clauses = cleanText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-') || l.startsWith('*') || /^\d+[.)]/.test(l))
      .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(l => l.length > 10)
    // Heuristic: scan for risk sentences
    result.risks = extractRiskLines(cleanText)
    return result
  }

  // Helper: grab content between [TAG] and the next [TAG]
  const getSection = (tagName, nextTagNames = []) => {
    const safeTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const endCheck = nextTagNames.length > 0
      ? `(?=\\n\\s*\\[(?:${nextTagNames.join('|')})\\]|$)`
      : `(?=\\n\\s*\\[|$)`
    const regex = new RegExp(`\\[${safeTag}\\]\\s*\\n?([\\s\\S]*?)${endCheck}`, 'i')
    const m = raw.match(regex)
    return m ? m[1].trim() : ''
  }

  // Helper: try multiple tag names and return the first match that has content
  const getSectionAny = (tagNames, nextTagNames = []) => {
    for (const tagName of tagNames) {
      const text = getSection(tagName, nextTagNames)
      if (text.length > 0) return text
    }
    return ''
  }

  // 1. Summary
  result.summary = getSection('EXECUTIVE_SUMMARY', ['CLAUSE_DETECTION'])

  // 2. Clauses (stops before RISK_ASSESSMENT)
  const clauseText = getSection('CLAUSE_DETECTION', ['RISK_ASSESSMENT', 'CLAUSE_OBJECTIVES', 'RISKS', 'RISK'])
  result.clauses = clauseText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-') || l.startsWith('*') || /^\d+[.)]/.test(l))
    .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(l => l.length > 0)

  // 3. Risks (tag-based + heuristic fallback)
  let riskText = getSectionAny(
    ['RISK_ASSESSMENT', 'RISK ASSESSMENT', 'RISKS', 'RISK'],
    ['CLAUSE_OBJECTIVES', 'COMPLIANCE_STATUS', 'OBJECTIVES']
  )

  if (riskText.length > 0) {
    const lines = riskText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.match(/^\[.*\]$/))  // remove empty lines & stray tags
    result.risks = lines.length > 0 ? lines : [riskText]
  } else {
    // HEURISTIC FALLBACK: scan entire raw text for risk-related sentences
    result.risks = extractRiskLines(raw)
  }

  // 4. Objectives (stops before COMPLIANCE_STATUS)
  const objText = getSection('CLAUSE_OBJECTIVES', ['COMPLIANCE_STATUS'])
  result.obligations = objText ? [objText] : ['No objectives identified.']

  // 5. Compliance (goes to end of text)
  result.compliance = getSection('COMPLIANCE_STATUS', [])

  return result
}

// Heuristic risk extractor: finds lines/paragraphs that smell like risks
function extractRiskLines(text) {
  const riskKeywords = [
    'risk', 'penalty', 'fine', 'imprisonment', 'liability', 'non-compliance',
    'non compliance', 'breach', 'violation', 'consequence', 'sanction',
    'disqualification', 'legal action', 'proceeding', 'punishment', 'forfeiture'
  ]
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 15 && !l.match(/^\[.*\]$/)) // ignore tags & very short lines

  const riskLines = lines.filter(line => {
    const lower = line.toLowerCase()
    return riskKeywords.some(kw => lower.includes(kw))
  })

  return riskLines.length > 0
    ? riskLines
    : ['Review the identified clauses for potential operational and legal risks.']
}

function normalizeSummary(res) {
  if (!res) return res

  const raw = res.raw_markdown || res.analysis || res.summary || res.content || ''
  const parsed = parseAnalysis(raw)
  if (!parsed) return res

  return {
    ...res,
    status: 'done',
    summary: parsed.summary,
    clauses: parsed.clauses,
    obligations: parsed.obligations,
    risks: parsed.risks,
    compliance: parsed.compliance,
    document_type: res.document_type || parsed.document_type
  }
}

/* ─────────────────────────────────────────
   UI HELPERS
   ───────────────────────────────────────── */
function getFileTypeMeta(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase()
  if (ext === 'docx') return { iconColor: 'text-blue-500', label: 'DOCX', badgeColor: 'text-blue-500' }
  if (ext === 'pdf') return { iconColor: 'text-orange-500', label: 'PDF', badgeColor: 'text-orange-500' }
  if (ext === 'txt') return { iconColor: 'text-gray-400', label: 'TXT', badgeColor: 'text-gray-400' }
  return { iconColor: 'text-orange-500', label: 'FILE', badgeColor: 'text-orange-500' }
}

function TabContentCard({ icon: Icon, color, title, children }) {
  return (
    <div className="mt-8 bg-[#111111] rounded-3xl border border-[#1f1f1f] p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center text-white shrink-0`}>
          <Icon size={24} />
        </div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function BulletList({ items }) {
  if (!items?.length) {
    return <p className="text-gray-500 text-lg leading-relaxed">No items identified.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((item, i) => {
        const parts = item.split(':')
        const hasTitle = parts.length > 1 && parts[0].length < 120
        return (
          <div key={i} className="text-gray-300 text-lg leading-relaxed">
            {hasTitle ? (
              <>
                <span className="text-white font-bold">- {parts[0]}:</span>
                <span className="text-gray-400"> {parts.slice(1).join(':')}</span>
              </>
            ) : (
              <span className="text-gray-300">- {item}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'done' || status === 'analyzed') {
    return (
      <div className="flex items-center gap-2 mt-3">
        <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle2 size={10} className="text-green-500" />
        </div>
        <span className="text-green-500 text-xs font-bold uppercase tracking-wider">Analysis Ready</span>
      </div>
    )
  }
  if (status === 'processing' || status === 'queued' || status === 'uploaded') {
    return (
      <div className="flex items-center gap-2 mt-3">
        <div className="w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Loader2 size={10} className="text-amber-500 animate-spin" />
        </div>
        <span className="text-amber-500 text-xs font-bold uppercase tracking-wider">Queued</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 mt-3">
      <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center">
        <XCircle size={10} className="text-red-500" />
      </div>
      <span className="text-red-500 text-xs font-bold uppercase tracking-wider">Failed</span>
    </div>
  )
}

/* ─────────────────────────────────────────
   ANALYSIS CONTENT
   ───────────────────────────────────────── */
function AnalysisContent({ summaryData, activeTab, activeDocId, filename }) {
  const { setSummary } = useFileStore()
  const isProcessing = ['processing', 'uploaded', 'queued'].includes(summaryData?.status)

  useEffect(() => {
    if (!isProcessing || !activeDocId) return
    const t = setInterval(async () => {
      try {
        const res = await summarizeAPI.get(activeDocId)
        setSummary(normalizeSummary(res))
      } catch {}
    }, 3000)
    return () => clearInterval(t)
  }, [isProcessing, activeDocId, setSummary])

  if (activeTab === 'file') {
    return (
      <div className="mt-8 bg-[#111111] rounded-3xl border border-[#1f1f1f] p-1 overflow-hidden h-[calc(100%-2rem)]">
        <FileViewer docId={activeDocId} filename={filename} />
      </div>
    )
  }

  if (isProcessing) {
    return (
      <div className="mt-8 bg-[#111111] rounded-3xl border border-[#1f1f1f] p-12 flex flex-col items-center justify-center text-center h-[calc(100%-2rem)]">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-[#222222]" />
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-500" />
          <div className="absolute inset-3 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Brain size={18} className="text-orange-500" />
          </div>
        </div>
        <div className="font-black text-white text-lg mb-2 uppercase tracking-tight">Analyzing document…</div>
        <div className="text-gray-500 text-sm">Running RAG pipeline against knowledge base</div>
      </div>
    )
  }

  if (summaryData?.status === 'failed') {
    return (
      <div className="mt-8 bg-[#111111] rounded-3xl border border-[#1f1f1f] p-12 flex flex-col items-center justify-center text-center">
        <XCircle size={38} className="text-red-500 opacity-70 mb-4" />
        <div className="font-black text-white text-lg uppercase tracking-tight">Analysis Failed</div>
        <div className="text-gray-500 text-sm mt-2">Re-upload the document to try again.</div>
      </div>
    )
  }

  const d = {
    document_type: summaryData?.document_type || 'Legal Document',
    summary:       summaryData?.summary       || '',
    clauses:       summaryData?.clauses       || [],
    obligations:   summaryData?.obligations   || [],
    risks:         summaryData?.risks         || [],
    compliance:    summaryData?.compliance    || '',
  }

  return (
    <div className="overflow-y-auto h-full pb-10">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {activeTab === 'summary' && (
            <TabContentCard icon={Brain} color={TAB_ICON_BG.summary} title={TAB_TITLES.summary}>
              <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">{d.summary || 'No summary available.'}</p>
            </TabContentCard>
          )}

          {activeTab === 'clauses' && (
            <TabContentCard icon={BookOpen} color={TAB_ICON_BG.clauses} title={TAB_TITLES.clauses}>
              <BulletList items={d.clauses} />
            </TabContentCard>
          )}

          {activeTab === 'obligations' && (
            <TabContentCard icon={Target} color={TAB_ICON_BG.obligations} title={TAB_TITLES.obligations}>
              <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
                {d.obligations?.[0] || 'No objectives available.'}
              </p>
            </TabContentCard>
          )}

          {activeTab === 'risks' && (
            <TabContentCard icon={ShieldAlert} color={TAB_ICON_BG.risks} title={TAB_TITLES.risks}>
              <BulletList items={d.risks} />
            </TabContentCard>
          )}

          {activeTab === 'compliance' && (
            <TabContentCard icon={ShieldCheck} color={TAB_ICON_BG.compliance} title={TAB_TITLES.compliance}>
              <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
                {d.compliance || 'No compliance information available.'}
              </p>
            </TabContentCard>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ─────────────────────────────────────────
   MAIN VIEW
   ───────────────────────────────────────── */
export default function DocumentsView() {
  const { files, setFiles, activeDocId, summaryData, setActive, setSummary, clearActive } = useFileStore()
  const [activeTab, setActiveTab] = useState('file')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploadHovered, setUploadHovered] = useState(false)
  const inputRef = useRef(null)

  const normalizeStatus = (s) => {
    if (s === 'analyzed' || s === 'completed') return 'done'
    if (s === 'queued') return 'uploaded'
    return s
  }

  const fetchFiles = async () => {
    try {
      const r = await documentAPI.list()
      setFiles((r.documents || []).map(d => ({
        ...d,
        doc_id: d.doc_id || d.id,
        status: normalizeStatus(d.status)
      })))
    } catch {}
  }

  useEffect(() => {
    setLoading(true)
    fetchFiles().finally(() => setLoading(false))
  }, [])

  const hasProcessingFiles = files.some((f) => ['processing', 'uploaded', 'queued'].includes(f.status))
  useEffect(() => {
    if (!hasProcessingFiles) return
    const t = setInterval(fetchFiles, 4000)
    return () => clearInterval(t)
  }, [hasProcessingFiles])

  const handleSelect = async (doc) => {
    setActive(doc.doc_id, { status: doc.status, filename: doc.filename, doc_id: doc.doc_id })
    setActiveTab('file')
    if (doc.status === 'done') {
      try {
        const res = await summarizeAPI.get(doc.doc_id)
        setSummary(normalizeSummary(res))
      } catch {}
    } else if (doc.status === 'uploaded') {
      try { await summarizeAPI.trigger(doc.doc_id) } catch {}
      setSummary({ status: 'processing', filename: doc.filename, doc_id: doc.doc_id })
    }
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0])
  }

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    const tid = toast.loading(`Uploading ${file.name}…`)
    try {
      const res = await documentAPI.upload(file)
      toast.success('Uploaded — analyzing…', { id: tid })
      try { await summarizeAPI.trigger(res.doc_id) } catch {}
      setActive(res.doc_id, { status: 'processing', filename: res.filename, doc_id: res.doc_id })
      setActiveTab('file')
      await fetchFiles()
    } catch (err) {
      toast.error(err.message.replace(/^\d+:\s*/, '').slice(0, 80), { id: tid })
    } finally { setUploading(false) }
  }

  const handleDelete = async (e, docId) => {
    e.stopPropagation()
    if (!confirm('Delete this document?')) return
    try {
      await documentAPI.delete(docId)
      if (activeDocId === docId) clearActive()
      await fetchFiles()
      toast.success('Deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  const activeDoc = files.find((f) => f.doc_id === activeDocId)
  const filteredFiles = files.filter(f => f.filename.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="flex h-[calc(100vh-58px)] bg-[#050505] overflow-hidden flex-col md:flex-row text-white">
      <AnimatePresence mode="wait">
        {!activeDocId ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full overflow-y-auto p-8 md:p-10 relative z-10"
          >
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm mb-8">
              <Scale size={14} className="text-orange-500" />
              <span className="text-orange-500 font-bold uppercase tracking-wider text-xs">LEGALBUDDY</span>
              <ChevronRight size={14} className="text-gray-600" />
              <span className="text-gray-300 font-medium">Documents</span>
            </div>

            {/* Title */}
            <h1 className="text-5xl font-black text-white uppercase tracking-tighter">
              LEGAL LIBRARY
              <span className="inline-block w-2 h-2 rounded-full bg-orange-500 ml-2 align-top mt-3" />
            </h1>

            {/* Upload Zone */}
            <div
              className={`mt-10 w-full h-64 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all duration-200 cursor-pointer ${
                dragging || uploadHovered
                  ? 'border-[#3a3a3a] bg-[#111111]'
                  : 'border-[#2a2a2a] bg-[#0d0d0d]'
              } ${uploading ? 'cursor-not-allowed' : ''}`}
              onMouseEnter={() => setUploadHovered(true)}
              onMouseLeave={() => setUploadHovered(false)}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => handleUpload(e.target.files[0])} disabled={uploading} />
              {uploading ? (
                <>
                  <Loader2 size={40} className="animate-spin text-orange-500" />
                  <span className="text-gray-500 text-lg font-medium italic uppercase tracking-wide">Uploading document...</span>
                </>
              ) : (
                <>
                  <Upload size={40} className="text-gray-500" />
                  <span className="text-gray-500 text-lg font-medium italic uppercase tracking-wide text-center px-4">
                    Upload PDF or DOCX for compliance audit
                  </span>
                </>
              )}
            </div>

            {/* Search + Count */}
            <div className="mt-10 flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <FolderOpen size={18} className="text-gray-500" />
                <h3 className="text-base font-semibold text-white uppercase tracking-wide">
                  Recent Files {filteredFiles.length > 0 && `(${filteredFiles.length})`}
                </h3>
              </div>
              <div className="flex items-center gap-2.5 bg-[#111111] border border-[#1f1f1f] px-4 py-2.5 rounded-xl w-80 transition-colors focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500/20">
                <Search size={18} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none text-white outline-none text-sm placeholder:text-gray-600"
                />
              </div>
            </div>

            {/* Files Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-[#161616] rounded-2xl p-6 border border-[#1f1f1f] h-40 animate-pulse" />
                ))}
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="text-center p-12 bg-[#111111] rounded-2xl border border-[#1f1f1f]">
                <p className="text-gray-500 text-sm">{searchQuery ? "No documents match your search." : "No documents uploaded yet."}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <AnimatePresence>
                  {filteredFiles.filter(doc => doc.doc_id && String(doc.doc_id).trim() !== '').map((doc) => (
                    <motion.div
                      key={doc.doc_id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      onClick={() => handleSelect(doc)}
                      className="bg-[#161616] rounded-2xl p-6 border border-[#1f1f1f] hover:border-[#2a2a2a] transition-colors cursor-pointer group relative"
                    >
                      <button
                        onClick={(e) => handleDelete(e, doc.doc_id)}
                        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                      {(() => {
                        const fm = getFileTypeMeta(doc.filename)
                        return (
                          <>
                            <FileText size={24} className={`${fm.iconColor} mb-4`} />
                            <div className="text-white font-bold text-base truncate" title={doc.filename}>
                              {doc.filename.replace(/\.[^.]+$/, '')}
                            </div>
                            <div className="flex items-center justify-between mt-3">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${fm.badgeColor}`}>{fm.label}</span>
                              <StatusBadge status={doc.status} />
                            </div>
                          </>
                        )
                      })()}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        ) : (
          /* ── DETAIL VIEW ── */
          <motion.div
            key="analysis"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full h-full flex flex-col relative z-10 bg-[#050505]"
          >
            {/* Header — RESPONSIVE TABS FIX */}
            <div className="flex items-center justify-between py-4 px-6 border-b border-[#1a1a1a] shrink-0 gap-4">
              <button
                onClick={() => clearActive()}
                className="shrink-0 flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                <ArrowLeft size={16} /> Back
              </button>

              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center bg-[#111111] rounded-full p-1 border border-[#1f1f1f] overflow-x-auto flex-nowrap min-w-0">
                  {TABS.map(({ id, label }) => {
                    const isActive = activeTab === id
                    return (
                      <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`shrink-0 whitespace-nowrap px-3 py-2 md:px-5 rounded-full text-[11px] md:text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
                          isActive
                            ? TAB_ACTIVE_CLASS[id]
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Filename + Ready Badge */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a1a] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={16} className="text-orange-500 shrink-0" />
                <span className="text-sm font-semibold text-white truncate">{activeDoc?.filename}</span>
              </div>
              {summaryData?.status === 'done' && (
                <div className="shrink-0 flex items-center gap-2 py-1 px-3 rounded-full bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 size={12} className="text-green-500" />
                  <span className="text-[11px] text-green-500 font-bold uppercase tracking-wider">Analysis Ready</span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden px-6 pt-2 pb-6">
              <AnalysisContent
                summaryData={summaryData}
                activeTab={activeTab}
                activeDocId={activeDocId}
                filename={activeDoc?.filename}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}