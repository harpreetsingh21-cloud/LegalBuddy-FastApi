import { useEffect, useRef, useState } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'

export default function FileViewer({ docId, filename }) {
  const containerRef = useRef(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const lower = filename?.toLowerCase() || ''
  const isDocx = lower.endsWith('.docx')
  const isPdf = lower.endsWith('.pdf')
  const isTxt = lower.endsWith('.txt')
  const fileUrl = `http://localhost:5000/api/documents/${docId}/file`

  // DOCX preview
  useEffect(() => {
    if (!isDocx || !containerRef.current) return
    let mounted = true
    setLoading(true)
    setError(null)

    fetch(fileUrl)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load DOCX')
        return r.arrayBuffer()
      })
      .then(buffer => {
        if (!mounted) return
        return import('docx-preview').then(({ renderAsync }) => {
          if (!mounted || !containerRef.current) return
          return renderAsync(buffer, containerRef.current, null, {
            className: 'docx-document',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
          })
        })
      })
      .then(() => {
        if (mounted) setLoading(false)
      })
      .catch(err => {
        if (mounted) {
          setError(err.message || 'Could not render DOCX')
          setLoading(false)
        }
      })

    return () => { mounted = false }
  }, [isDocx, fileUrl])

  // TXT preview
  useEffect(() => {
    if (!isTxt) return
    fetch(fileUrl)
      .then(r => r.text())
      .then(setText)
      .catch(() => setText('Could not read file.'))
  }, [isTxt, fileUrl])

  const handleDownload = () => {
    window.open(`http://localhost:5000/api/documents/${docId}/download`, '_blank')
  }

  const header = (iconColor) => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f] shrink-0">
      <div className="flex items-center gap-2">
        <FileText size={14} className={iconColor} />
        <span className="text-xs font-semibold text-gray-300">{filename}</span>
      </div>
      <button
        onClick={handleDownload}
        className="bg-transparent text-gray-300 border border-[#2a2a2a] py-1.5 px-3 rounded-lg font-semibold text-xs cursor-pointer transition-all hover:bg-[#1a1a1a] hover:text-white"
      >
        <Download size={12} className="inline mr-1" /> Download
      </button>
    </div>
  )

  if (isDocx) {
    return (
      <div className="flex flex-col h-full bg-[#111111]">
        {header('text-blue-500')}
        <div className="flex-1 overflow-y-auto p-4 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-orange-500" />
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div ref={containerRef} className={`${loading ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
        </div>
      </div>
    )
  }

  if (isPdf) {
    return (
      <div className="flex flex-col h-full bg-[#111111]">
        {header('text-orange-500')}
        <div className="flex-1 overflow-hidden relative">
          <iframe
            src={fileUrl}
            title={filename}
            width="100%"
            height="100%"
            style={{ border: 'none' }}
          />
        </div>
      </div>
    )
  }

  // TXT fallback
  return (
    <div className="flex flex-col h-full bg-[#111111]">
      {header('text-gray-400')}
      <pre className="flex-1 overflow-y-auto p-4 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre-wrap break-words bg-transparent m-0">
        {text || 'Loading…'}
      </pre>
    </div>
  )
}