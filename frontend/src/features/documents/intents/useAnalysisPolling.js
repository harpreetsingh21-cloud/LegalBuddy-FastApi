import { useEffect } from 'react'
import { summarizeAPI } from '../../../shared/utils/api'
import { useFileStore } from '../models/fileStore'

export const useAnalysisPolling = (docId) => {
  const { setSummary, setAnalyzing } = useFileStore()

  useEffect(() => {
    if (!docId) return
    setAnalyzing(true)
    let interval

    const fetchSummary = async () => {
      try {
        const data = await summarizeAPI.get(docId)
        const status = String(data.status || '').toLowerCase()
        const isDone = ['completed', 'done', 'analyzed'].includes(status)
        const isFailed = status === 'failed'

        if (isDone || isFailed) {
          setSummary(data)
          setAnalyzing(false)
          if (interval) clearInterval(interval)
        }
      } catch (err) {
        console.error('Polling error:', err)
        setAnalyzing(false)
        if (interval) clearInterval(interval)
      }
    }

    fetchSummary()
    interval = setInterval(fetchSummary, 4000)
    return () => clearInterval(interval)
  }, [docId])
}
