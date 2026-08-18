const API_BASE = 'http://localhost:5000'

// ── Get token safely ──
const getToken = () => {
  try {
    const u = JSON.parse(localStorage.getItem('lb_user') || 'null')
    return u?.access_token || null
  } catch { return null }
}

// ── Build auth headers only if token exists ──
const authH = () => {
  const t = getToken()
  return t && t !== 'undefined' && t !== 'null'
    ? { Authorization: `Bearer ${t}` }
    : {}
}

// ── Handle responses ──
const handleRes = async (res) => {
  if (!res.ok) {
    // If 401, clear bad token so user can re-login
    if (res.status === 401) {
      localStorage.removeItem('lb_user')
    }
    const t = await res.text().catch(() => '')
    let msg = t
    try { const j = JSON.parse(t); msg = j.detail || j.message || t } catch(e) {}
    throw new Error(msg || `${res.status} Error`)
  }
  return res.json()
}

const req = async (path, opts = {}) => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authH(), ...opts.headers }
  })
  return handleRes(res)
}

// ═══════════════════════════════════════
// Auth
// ═══════════════════════════════════════
export const authAPI = {
  signup: (email, company, is_new_to_ai, purpose, source, captchaToken) =>
    fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, company, is_new_to_ai, purpose, source, captcha_token: captchaToken })
    }).then(handleRes),

  login: (email, password, captchaToken) =>
    fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, captcha_token: captchaToken })
    }).then(handleRes),

  verifyOTP: (temp_token, otp) =>
    fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp_token, otp })
    }).then(handleRes),

  getMe: (token) =>
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then(handleRes),
}

// ═══════════════════════════════════════
// Admin (kept for compatibility)
// ═══════════════════════════════════════
export const adminAPI = {
  getPendingAgents: () => req('/api/auth/admin/agents/pending'),
  getAllAgents:     () => req('/api/auth/admin/agents/all'),
  approveAgent:     (id) => req(`/api/auth/admin/agents/approve/${id}`, { method: 'POST' }),
  resetLimit:       (id) => req(`/api/auth/admin/agents/reset-limit/${id}`, { method: 'POST' }),
  getStats:         () => req('/api/auth/admin/stats'),
}

// ═══════════════════════════════════════
// Documents
// ═══════════════════════════════════════
export const documentAPI = {
  list: () => req('/api/documents'),

  upload: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_BASE}/api/documents/upload`, {
      method: 'POST',
      headers: authH(),  // FormData needs no Content-Type
      body: fd
    })
    return handleRes(res)
  },

  getMeta: (docId) => req(`/api/documents/${docId}`),

  delete: (docId) => req(`/api/documents/${docId}`, { method: 'DELETE' }),

  fileUrl: (docId) => `${API_BASE}/api/documents/${docId}/file`,
  downloadUrl: (docId) => `${API_BASE}/api/documents/${docId}/download`,
}

// ═══════════════════════════════════════
// Summarize / Result
// ═══════════════════════════════════════
export const summarizeAPI = {
  trigger: (docId) =>
    fetch(`${API_BASE}/api/summarize/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH() }
    }).then(handleRes),

  get: (docId) => req(`/api/summarize/${docId}`),

  getResult: (docId) => req(`/result/${docId}`),
}

// ═══════════════════════════════════════
// RAG
// ═══════════════════════════════════════
export const ragAPI = {
  search: (query, top_k = 3) =>
    fetch(`${API_BASE}/api/rag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH() },
      body: JSON.stringify({ query, top_k })
    }).then(handleRes),

  generate: (query, results = [], file_excerpt = '') =>
    fetch(`${API_BASE}/api/rag/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH() },
      body: JSON.stringify({ query, results, file_excerpt })
    }).then(handleRes),
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════
export const fetchFileAsBlob = async (docId) => {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/file`, { headers: authH() })
  if (!res.ok) throw new Error('Cannot fetch file')
  return res.blob()
}

export const healthCheck = async () => {
  try { return (await fetch(`${API_BASE}/health`)).ok } catch { return false }
}