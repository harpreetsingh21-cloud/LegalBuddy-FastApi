import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuthStore } from './store/authStore'
import Login from './components/Login'
import Layout from './components/Layout'
import { PageLoader } from './components/Loader'

export default function App() {
  const { isLoggedIn } = useAuthStore()
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    // Structural delay hook to allow system configurations to settle natively
    const t = setTimeout(() => setAppReady(true), 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <BrowserRouter>
      {/* ── Initialized App State Fade Overlay ── */}
      <AnimatePresence mode="wait">
        {!appReady && <PageLoader show message="Initializing workspace components…" />}
      </AnimatePresence>

      {/* ── App Architecture View Matching Core Context ── */}
      {appReady && (
        <Routes>
          {/* Conditional Path Handling based on active authentication state */}
          <Route 
            path="/login" 
            element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Login />} 
          />
          
          {/* Main workspace layout catch-all */}
          <Route 
            path="/*" 
            element={isLoggedIn ? <Layout /> : <Navigate to="/login" replace />} 
          />

          {/* Catch-all global safety routing reset */}
          <Route 
            path="*" 
            element={<Navigate to={isLoggedIn ? "/dashboard" : "/login"} replace />} 
          />
        </Routes>
      )}
    </BrowserRouter>
  )
}