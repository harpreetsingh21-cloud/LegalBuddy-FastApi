import { useEffect, useState, useRef } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import { documentAPI, fetchFileAsBlob } from '../../../shared/utils/api'

export default function FileViewerView({ docId, filename, onClose }) {
  const [text, setText] = useState('')
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)
  const prevPdfUrl = useRef(null)

  const lower = filename ? filename.toLowerCase() : ''
  const isPdf = lower.endsWith('.pdf')
  const isDocx = lower.endsWith('.docx')
  const isTxt = lower.endsWith('.txt')
  const fileUrl = documentAPI.fileUrl(docId)
  const downloadUrl = documentAPI.downloadUrl(docId)

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    setError(null)

    if (isPdf) {
      fetchFileAsBlob(docId)
        .then(function (blob) {
          var url = URL.createObjectURL(blob)
          if (prevPdfUrl.current) {
            URL.revokeObjectURL(prevPdfUrl.current)
          }
          prevPdfUrl.current = url
          setPdfUrl(url)
        })
        .catch(function (err) {
          setError(err.message || 'Could not load PDF')
        })
        .finally(function () {
          setLoading(false)
        })
    } else if (isTxt) {
      fetchFileAsBlob(docId)
        .then(function (blob) {
          return blob.text()
        })
        .then(setText)
        .catch(function () {
          setError('Could not read file.')
        })
        .finally(function () {
          setLoading(false)
        })
    } else if (isDocx) {
      fetchFileAsBlob(docId)
        .then(function (blob) {
          return blob.arrayBuffer()
        })
        .then(function (buffer) {
          return import('docx-preview').then(function (mod) {
            if (containerRef.current) {
              return mod.renderAsync(buffer, containerRef.current, null, {
                className: 'docx-document',
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
              })
            }
          })
        })
        .then(function () {
          setLoading(false)
        })
        .catch(function (err) {
          setError(err.message || 'Could not render DOCX')
          setLoading(false)
        })
    } else {
      setLoading(false)
    }

    return function () {
      if (prevPdfUrl.current) {
        URL.revokeObjectURL(prevPdfUrl.current)
        prevPdfUrl.current = null
      }
    }
  }, [docId, filename, isTxt, isDocx, isPdf, fileUrl])

  const downloadLinkStyle = "bg-transparent text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#2a2a2a] py-1.5 px-3 rounded-lg font-semibold text-xs transition-all hover:bg-gray-100 dark:hover:bg-neutral-800 flex items-center gap-1.5 shrink-0"

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#1f1f1f] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={14} className="text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{filename}</span>
      </div>
      <a href={downloadUrl} target="_blank" rel="noreferrer" className={downloadLinkStyle}>
        <Download size={12} />
        {' '}Download
      </a>
    </div>
  )

  if (isPdf) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#111111] rounded-2xl border border-gray-200 dark:border-[#1f1f1f] overflow-hidden">
        {header}
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#111111]">
              <Loader2 size={24} className="animate-spin text-orange-500" />
            </div>
          )}
          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <a href={downloadUrl} target="_blank" rel="noreferrer" className="text-orange-500 text-sm underline">Download file instead</a>
            </div>
          )}
          {!loading && !error && pdfUrl && (
            <iframe src={pdfUrl} title={filename} width="100%" height="100%" style={{ border: 'none' }} />
          )}
        </div>
      </div>
    )
  }

  if (isDocx) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#111111] rounded-2xl border border-gray-200 dark:border-[#1f1f1f] overflow-hidden">
        {header}
        <div className="flex-1 overflow-y-auto p-4 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#111111]">
              <Loader2 size={24} className="animate-spin text-orange-500" />
            </div>
          )}
          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <a href={downloadUrl} target="_blank" rel="noreferrer" className="text-orange-500 text-sm underline">Download file instead</a>
            </div>
          )}
          <div ref={containerRef} className={(loading || error ? 'opacity-0' : 'opacity-100') + ' transition-opacity'} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111111] rounded-2xl border border-gray-200 dark:border-[#1f1f1f] overflow-hidden">
      {header}
      <pre className="flex-1 overflow-y-auto p-4 text-xs font-mono text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words bg-transparent m-0">
        {loading ? 'Loading...' : (text || 'Empty file')}
      </pre>
    </div>
  )
}