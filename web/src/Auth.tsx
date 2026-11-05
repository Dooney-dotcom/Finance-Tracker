import { useState, type FormEvent, type ReactNode } from 'react'
import { appUrl, supabase } from './lib'

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-mark" aria-hidden="true"><span className="plane in" /><span className="plane out" /></div>
      <h1>{title}</h1>
      {children}
    </main>
  )
}

function Field(props: { label: string; type: string; value: string; onChange: (v: string) => void; autoComplete: string; inputMode?: 'numeric' }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input required type={props.type} value={props.value} autoComplete={props.autoComplete} inputMode={props.inputMode}
        onChange={(e) => props.onChange(e.target.value)} />
    </label>
  )
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
  </svg>
)

export function SignIn({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<'sign-in' | 'forgot'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError ?? '')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setNotice('')
    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      // Same message whether the email exists or not.
      if (error) setError(error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'That email and password don’t match an account.')
    } else {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })
      setNotice('If that email has an account, a reset link is on its way. Open it in this browser.')
    }
    setBusy(false)
  }

  async function google() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } })
    if (error) setError('Google sign-in isn’t available right now.')
  }

  return (
    <Frame title={mode === 'sign-in' ? 'Sign in to Finance Tracker' : 'Reset your password'}>
      <form onSubmit={submit} className="stack">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
        {mode === 'sign-in' && <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />}
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Send reset link'}</button>
      </form>
      {mode === 'sign-in' && (
        <>
          <div className="or"><span>or</span></div>
          <button className="btn google" onClick={google}><GoogleIcon />Continue with Google</button>
        </>
      )}
      <button className="link" onClick={() => { setMode(mode === 'sign-in' ? 'forgot' : 'sign-in'); setError(''); setNotice('') }}>
        {mode === 'sign-in' ? 'Forgot your password?' : 'Back to sign in'}
      </button>
      <p className="fine">Accounts are by invitation only.</p>
    </Frame>
  )
}

export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp.find((f) => f.status === 'verified')
    const { error } = factor
      ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') })
      : { error: new Error('no factor') }
    setBusy(false)
    if (error) { setError('That code didn’t work. Codes change every 30 seconds — try the current one.'); setCode('') }
    else onDone()
  }

  return (
    <Frame title="Enter your authenticator code">
      <p className="lede">Open your authenticator app and type the 6-digit code for Finance Tracker.</p>
      <form onSubmit={submit} className="stack">
        <Field label="Code" type="text" inputMode="numeric" value={code} onChange={setCode} autoComplete="one-time-code" />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy || code.replace(/\s/g, '').length !== 6}>{busy ? 'Checking…' : 'Verify'}</button>
      </form>
      <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </Frame>
  )
}

export const MIN_PASSWORD = 12

export function SetPassword({ invite, onDone }: { invite: boolean; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (password !== confirm) return setError('The two passwords don’t match.')
    setBusy(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message.includes('weak') || error.message.includes('characters')
      ? 'That password is too weak. Use a longer one with letters, numbers and symbols.'
      : 'The password couldn’t be saved. Your link may have expired — request a new one.')
    else onDone()
  }

  return (
    <Frame title={invite ? 'Welcome — choose a password' : 'Choose a new password'}>
      <form onSubmit={submit} className="stack">
        <Field label={`New password (at least ${MIN_PASSWORD} characters)`} type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <Field label="Repeat it" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </Frame>
  )
}
