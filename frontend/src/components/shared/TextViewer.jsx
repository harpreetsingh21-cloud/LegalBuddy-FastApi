import { useState, useEffect } from 'react'
import { FileText, Download } from 'lucide-react'

export function TextViewer({ blobUrl, filename, onDownload }) {
  const [text, setText] = useState('')

  useEffect(() => {
    fetch(blobUrl)
      .then(r => r.text())
      .then(setText)
      .catch(() => setText('Could not read file.'))
  }, [blobUrl])

  return (
    <div className="flex flex-col h-full bg-[#111111]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f] shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-orange-500" />
          <span className="text-xs font-semibold text-gray-300">{filename}</span>
        </div>
        <button
          onClick={onDownload}
          className="bg-transparent text-gray-300 border border-[#2a2a2a] py-1.5 px-3 rounded-lg font-semibold text-xs cursor-pointer transition-all hover:bg-[#1a1a1a] hover:text-white"
        >
          <Download size={12} className="inline mr-1" /> Download
        </button>
      </div>
      <pre className="flex-1 overflow-y-auto p-4 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre-wrap break-words bg-transparent m-0">
        {text || 'Loading…'}
      </pre>
    </div>
  )
}