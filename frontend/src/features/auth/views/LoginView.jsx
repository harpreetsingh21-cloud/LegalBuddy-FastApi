import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Gavel, BookOpen, Shield, Sun, Moon, Loader2, Scale } from 'lucide-react'
import toast from 'react-hot-toast'
import ReCAPTCHA from 'react-google-recaptcha'
import { useAuthStore } from '../models/authStore'
import { useUIStore } from '../../../shared/store/uiStore'
import { authAPI } from '../../../shared/utils/api'
import CustomSelect from '../../../shared/ui/CustomSelect'
import CustomCheckbox from '../../../shared/ui/CustomCheckbox'

const features = [
  { icon: Gavel,    label: 'Companies Act 2013', sub: 'Full RAG knowledge base indexed' },
  { icon: BookOpen, label: 'Clause Detection',   sub: '52 clause types recognized'     },
  { icon: Shield,   label: 'Risk Analysis',       sub: 'Compliance & obligations'       },
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
})

function routeByRole(role) {
  if (role === 'admin') {
    useUIStore.getState().setPage('admin_overview')
  } else {
    useUIStore.getState().setPage('dashboard')
  }
}

export default function Login() {
  const isAdminPath = window.location.pathname.startsWith('/admin')
  const [tab, setTab]     = useState('login')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [company, setCompany] = useState('')
  const [isNewToAi, setIsNewToAi] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [source, setSource] = useState('')
  const [show, setShow]   = useState(false)
  const [busy, setBusy]   = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const [tempToken, setTempToken] = useState(null)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef([])
  const captchaRef = useRef(null)

  const { login }         = useAuthStore()
  const { theme, toggleTheme } = useUIStore()

  const handleOtpChange = (index, value) => {
    if (!/^[0-9]*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const submit = async (e) => {
    e.preventDefault()

    const token = captchaRef.current?.getValue()
    if (tab !== 'otp' && !token) {
      return toast.error('Please complete the CAPTCHA')
    }

    if (tab === 'login') {
      if (!email || !pass) return toast.error('Please fill in all fields')
      setBusy(true)
      const tid = toast.loading('Verifying credentials…')
      try {
        const data = await authAPI.login(email, pass, token)
        if (data.requires_otp) {
          setTempToken(data.temp_token)
          setTab('otp')
          toast.success('OTP sent to your email!', { id: tid })
          return
        } else if (data.access_token) {
          if (isAdminPath && data.role !== 'admin') {
            toast.error('Access denied. Admins only.', { id: tid })
            return
          }
          login({ access_token: data.access_token, user_id: data.user_id, email: data.email, name: data.email.split('@')[0], role: data.role })
          routeByRole(data.role)
          toast.success(`Welcome, ${data.email.split('@')[0]}!`, { id: tid })
          if (data.role === 'admin') {
            window.location.href = '/admin'
          }
        }
      } catch (err) {
        captchaRef.current?.reset()
        toast.error(err.message.replace(/^\d+:\s*/, '').replace(/^{.*"detail":"([^"]+)".*}$/, "$1").slice(0, 80) || 'Authentication failed', { id: tid })
      } finally { setBusy(false) }
    } else if (tab === 'otp') {
      const code = otp.join('')
      if (code.length !== 6) return toast.error('Enter 6 digit OTP')
      setBusy(true)
      const tid = toast.loading('Verifying OTP…')
      try {
        const data = await authAPI.verifyOTP(tempToken, code)
        if (isAdminPath && data.role !== 'admin') {
           throw new Error('Access denied. Admins only.')
        }

        login({ access_token: data.access_token, user_id: data.user_id, email: data.email, name: data.email.split('@')[0], role: data.role })
        routeByRole(data.role)
        toast.success(`Welcome, ${data.email.split('@')[0]}!`, { id: tid })

        if (data.role === 'admin') {
            window.location.href = '/admin'
        }
      } catch (err) {
        toast.error(err.message.replace(/^\d+:\s*/, '').replace(/^{.*"detail":"([^"]+)".*}$/, "$1").slice(0, 80) || 'OTP Verification failed', { id: tid })
      } finally { setBusy(false) }
    } else {
      if (!email) return toast.error('Please provide an email')
      if (tab === 'signup' && (!purpose || !source)) return toast.error('Please complete the onboarding questions')

      setBusy(true)
      const tid = toast.loading('Submitting application…')
      try {
        await authAPI.signup(email, company, isNewToAi, purpose, source, token)
        toast.success('Application submitted!', { id: tid })
        setSuccessMsg('Your registration request has been sent to the administrator. You will receive an email with your credentials once approved.')
        setTab('login')
        setEmail('')
        setCompany('')
        setPurpose('')
        setSource('')
        setIsNewToAi(false)
      } catch (err) {
        captchaRef.current?.reset()
        toast.error(err.message.replace(/^\d+:\s*/, '').replace(/^{.*"detail":"([^"]+)".*}$/, "$1").slice(0, 80) || 'Registration failed', { id: tid })
      } finally { setBusy(false) }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">

      <div className="absolute rounded-full pointer-events-none blur-[80px] bg-orange-500 w-[500px] h-[500px] -top-32 -right-24 opacity-10 dark:opacity-5 z-0" />
      <div className="absolute rounded-full pointer-events-none blur-[80px] bg-orange-500 w-[300px] h-[300px] -bottom-32 -left-16 opacity-10 dark:opacity-[3%] z-0" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-4xl flex flex-col md:flex-row rounded-[30px] overflow-hidden border border-white/60 dark:border-neutral-800/50 shadow-2xl relative z-10 bg-white/60 dark:bg-black/40 backdrop-blur-xl"
      >
        <div className="hidden md:flex flex-col w-[55%] bg-white/40 dark:bg-neutral-900/30 border-r border-white/60 dark:border-neutral-800/50 p-10 gap-6 relative overflow-hidden shrink-0">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.12)_0%,transparent_70%)] pointer-events-none" />

          <motion.div {...fadeUp(0.1)} className="flex items-center gap-3">
            <motion.div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 shadow-md shadow-orange-500/30">
              <Scale size={20} color="#fff" />
            </motion.div>
            <div>
              <div className="font-outfit text-lg font-extrabold text-gray-900 dark:text-white tracking-tight">LegalBuddy</div>
              <div className="text-[10px] text-gray-600 dark:text-gray-400 font-medium font-poppins">AI Legal Intelligence Platform</div>
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.15)}>
            <h1 className="font-outfit text-3xl font-black leading-tight mb-3 text-gray-900 dark:text-white tracking-tight">
              AI-powered<br />
              <span className="bg-gradient-to-br from-gray-900 to-gray-500 dark:from-white dark:to-orange-500 bg-clip-text text-transparent">legal analysis</span><br />
              in seconds.
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed font-poppins">
              Upload contracts, agreements &amp; board resolutions.
              Get instant analysis grounded in Indian corporate law.
            </p>
          </motion.div>

          <motion.div {...fadeUp(0.2)} className="flex flex-col gap-2">
            {features.map(({ icon: Icon, label, sub }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.05, duration: 0.3 }}
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-orange-500/5 border border-white/50 dark:border-neutral-800/50"
              >
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-orange-500" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white font-outfit">{label}</div>
                  <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-px font-poppins">{sub}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            {...fadeUp(0.4)}
            className="mt-auto py-3 px-4 rounded-xl bg-orange-500/5 border border-white/50 dark:border-neutral-800/50"
          >
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed font-poppins italic">
              "The only legal AI that reads the actual document — not just guesses."
            </p>
          </motion.div>
        </div>

        <div className="flex-1 bg-transparent p-8 md:p-10 flex flex-col justify-center gap-5 relative">

          <motion.button
            {...fadeUp(0)}
            onClick={toggleTheme}
            className="absolute top-4 right-4 border border-gray-200/50 dark:border-neutral-800/50 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md p-2 rounded-xl cursor-pointer text-gray-600 dark:text-gray-400 flex items-center justify-center transition-all duration-200 hover:bg-white/80 dark:hover:bg-neutral-800 hover:text-gray-900 dark:hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </motion.button>

          <div className="flex md:hidden items-center gap-2 mt-4">
            <motion.div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center shrink-0 shadow-md shadow-orange-500/30">
              <Scale size={16} color="#fff" />
            </motion.div>
            <span className="font-outfit text-base font-extrabold text-gray-900 dark:text-white">
              LegalBuddy
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab + '-heading'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="font-outfit text-2xl font-extrabold text-gray-900 dark:text-white mb-1 tracking-tight">
                {tab === 'otp' ? 'Verification' : isAdminPath ? 'Admin Portal' : (tab === 'login' ? 'Agent Login' : 'Become an Agent')}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-poppins">
                {tab === 'otp' ? 'Check your email for the 6-digit code' : isAdminPath ? 'Sign in to manage the platform' : (tab === 'login' ? 'Sign in to your agent workspace' : 'Submit your details for admin approval')}
              </p>
            </motion.div>
          </AnimatePresence>

          {successMsg && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 p-3 rounded-lg text-xs font-poppins mb-2 text-center">
              {successMsg}
            </div>
          )}

          {!isAdminPath && tab !== 'otp' && (
            <div className="flex bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md rounded-xl p-1 gap-0.5 border border-white/60 dark:border-neutral-800/50">
            {['login', 'signup'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 p-2 rounded-lg cursor-pointer text-xs font-semibold transition-all duration-200 ease-in-out font-outfit ${
                  tab === t ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30' : 'bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Apply Now'}
              </button>
            ))}
          </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-4"
              >
                {tab === 'otp' ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between gap-2 mt-4">
                      {otp.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={el => inputRefs.current[idx] = el}
                          type="text"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          className="w-10 sm:w-12 h-14 text-center text-2xl font-black bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md border border-white/60 dark:border-neutral-800/60 rounded-xl text-orange-500 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-outfit"
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 tracking-wider uppercase font-outfit">Email</label>
                      <div className="relative flex items-center">
                        <Mail size={14} className="absolute left-3 text-gray-500 pointer-events-none" />
                        <input
                          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@company.com" required
                          className="w-full bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md border border-white/60 dark:border-neutral-800/60 rounded-xl text-gray-900 dark:text-white font-poppins text-sm py-3 pr-3 pl-9 outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                      </div>
                    </div>

                    {tab === 'login' ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 tracking-wider uppercase font-outfit">Password</label>
                        <div className="relative flex items-center">
                          <Lock size={14} className="absolute left-3 text-gray-500 pointer-events-none" />
                          <input
                            type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)}
                            placeholder="Your password" required
                            className="w-full bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md border border-white/60 dark:border-neutral-800/60 rounded-xl text-gray-900 dark:text-white font-poppins text-sm py-3 pr-9 pl-9 outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                          />
                          <button
                            type="button" onClick={() => setShow((s) => !s)}
                            className="absolute right-3 cursor-pointer text-gray-500 flex items-center bg-transparent border-none hover:text-gray-900 dark:hover:text-white transition-colors"
                          >
                            {show ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 tracking-wider uppercase font-outfit">Company (Optional)</label>
                        <div className="relative flex items-center">
                          <Shield size={14} className="absolute left-3 text-gray-500 pointer-events-none" />
                          <input
                            type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                            placeholder="Company name"
                            className="w-full bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md border border-white/60 dark:border-neutral-800/60 rounded-xl text-gray-900 dark:text-white font-poppins text-sm py-3 pr-3 pl-9 outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-2">
                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 tracking-wider uppercase font-outfit">Primary Purpose</label>
                        <CustomSelect
                          value={purpose}
                          onChange={setPurpose}
                          placeholder="Select your purpose..."
                          options={[
                            { value: 'law_firm', label: 'Law Firm / Attorney' },
                            { value: 'in_house', label: 'In-house Counsel' },
                            { value: 'student', label: 'Law Student' },
                            { value: 'other', label: 'Other' }
                          ]}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 mt-2">
                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 tracking-wider uppercase font-outfit">How did you hear about us?</label>
                        <CustomSelect
                          value={source}
                          onChange={setSource}
                          placeholder="Select an option..."
                          options={[
                            { value: 'google', label: 'Google Search' },
                            { value: 'social_media', label: 'Social Media' },
                            { value: 'colleague', label: 'Colleague / Friend' },
                            { value: 'other', label: 'Other' }
                          ]}
                        />
                      </div>
                      <div className="mt-4">
                        <CustomCheckbox
                          checked={isNewToAi}
                          onChange={setIsNewToAi}
                          label="I am new to AI legal tools"
                        />
                      </div>
                      </>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {tab !== 'otp' && (
              <div className="flex justify-center mt-2 transform scale-[0.85] origin-top h-[65px]">
                <ReCAPTCHA
                  ref={captchaRef}
                  sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                />
              </div>
            )}

            <motion.button
              type="submit"
              disabled={busy}
              className={`mt-2 flex items-center justify-center gap-2 bg-orange-500 text-white font-semibold text-sm py-3 rounded-xl font-outfit tracking-wide transition-all duration-200 shadow-md shadow-orange-500/30 ${
                busy ? 'opacity-80 cursor-not-allowed' : 'hover:bg-orange-400 hover:-translate-y-px hover:shadow-lg hover:shadow-orange-500/40 cursor-pointer'
              }`}
              whileTap={!busy ? { scale: 0.98 } : {}}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {tab === 'login' ? 'Verifying...' : tab === 'otp' ? 'Confirming...' : 'Submitting...'}
                </>
              ) : (
                <>
                  {tab === 'login' ? 'Continue securely' : tab === 'otp' ? 'Verify OTP' : 'Submit Application'}
                  <ArrowRight size={16} />
                </>
              )}
            </motion.button>
          </form>

          {!isAdminPath && tab !== 'otp' && (
            <p className="text-center text-xs text-gray-600 dark:text-gray-400 font-poppins mt-2">
              {tab === 'login' ? "Want to join as an agent? " : 'Already an agent? '}
            <button
              onClick={() => setTab(tab === 'login' ? 'signup' : 'login')}
              className="bg-transparent border-none cursor-pointer text-orange-500 font-semibold text-xs font-poppins hover:underline underline-offset-2"
            >
              {tab === 'login' ? 'Apply Now' : 'Sign in'}
            </button>
          </p>
          )}

          {tab === 'otp' && (
            <p className="text-center text-xs text-gray-600 dark:text-gray-400 font-poppins mt-2">
              Didn't receive the code?{' '}
            <button
              onClick={() => setTab('login')}
              className="bg-transparent border-none cursor-pointer text-orange-500 font-semibold text-xs font-poppins hover:underline underline-offset-2"
            >
              Go back
            </button>
          </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}