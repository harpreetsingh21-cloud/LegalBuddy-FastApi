import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
<<<<<<< HEAD:frontend/src/hooks/useFileUpload.js
import { documentAPI, summarizeAPI } from '../utils/api'
import { useFileStore } from '../store/fileStore'
=======
import { documentAPI, summarizeAPI } from '../../../shared/utils/api'
import { useFileStore } from '../models/fileStore'
>>>>>>> 051eddf (Update microservices and backend configurations):frontend/src/features/documents/intents/useFileUpload.js

export const useFileUpload = () => {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)
  const { setFiles } = useFileStore()

  const handleFile = async (file) => {
    if (!file) return
    setUploading(true)
    const tid = toast.loading(`Uploading ${file.name}...`)
    try {
      const res = await documentAPI.upload(file)
<<<<<<< HEAD:frontend/src/hooks/useFileUpload.js
      try {
        await summarizeAPI.trigger(res.doc_id)
      } catch {}
      toast.success('Uploaded!', { id: tid })
      const updated = await documentAPI.list()
      setFiles(updated.documents || [])
=======
      toast.success('Uploaded successfully!', { id: tid })

      try {
        await summarizeAPI.trigger(res.doc_id)
      } catch (triggerErr) {
        console.warn('Analysis trigger failed:', triggerErr)
      }

      await refreshFiles()
>>>>>>> 051eddf (Update microservices and backend configurations):frontend/src/features/documents/intents/useFileUpload.js
    } catch (err) {
      toast.error(err.message, { id: tid })
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return {
    dragging,
    setDragging,
    uploading,
    inputRef,
    handleFile,
    onDrop
  }
}
