import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../features/auth/models/authStore'
import { useUIStore } from '../shared/store/uiStore'
import Login from '../features/auth/views/LoginView'
import Layout from './LayoutView'
import { PageLoader } from '../shared/ui/Loader'

export default function App() {
  const { isLoggedIn, initAuth } = useAuthStore()
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    initAuth()


    const restoredUser = useAuthStore.getState().user
    if (restoredUser?.role === 'admin') {
      useUIStore.getState().setPage('admin_overview')
    } else {
      useUIStore.getState().setPage('dashboard')
    }

    const t = setTimeout(() => setAppReady(true), 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <AnimatePresence>
        {!appReady && <PageLoader show message="Initializing…" />}
      </AnimatePresence>
      {appReady && (isLoggedIn ? <Layout /> : <Login />)}
    </>
  )
}