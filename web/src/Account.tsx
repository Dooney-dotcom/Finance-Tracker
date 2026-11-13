import { useEffect, useState, type FormEvent } from 'react'
import type { Factor } from '@supabase/supabase-js'
import { supabase } from './lib'
import { Loading, Sk } from './Controls'
import { MIN_PASSWORD } from './Auth'

function TwoFactor() {
  const [factor, setFactor] = useState<Factor | null | undefined>(undefined)
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactor(data?.totp.find((f) => f.status === 'verified') ?? null)
  }
  useEffect(() => { load() }, [])

  async function start() {
    setBusy(true); setError('')
    // Drop half-finished enrolments so a new one can start cleanly.
    const { data } = await supabase.auth.mfa.listFactors()
    for (const f of data?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const res = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })
    setBusy(false)
    if (res.error) return setError('Two-factor setup couldn’t start. Try again in a moment.')
    setEnrolling({ id: res.data.id, qr: res.data.totp.qr_code, secret: res.data.totp.secret })
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!enrolling) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: code.replace(/\s/g, '') })
    setBusy(false)
    if (error) return setError('That code didn’t work. Check the time on your phone and try the current code.')
    setEnrolling(null); setCode(''); load()
  }

  async function remove() {
    if (!factor) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    setBusy(false)
    if (error) return setError('Couldn’t turn off two-factor. Sign out, sign in with your code, and try again.')
    await supabase.auth.refreshSession()
    load()
  }

  if (factor === undefined) return <Loading label="two-factor status" className="sk-panel"><Sk w={420} /><Sk w={180} h={40} /></Loading>
  return (
    <>
      {factor && !enrolling && (
        <>
          <p><strong>On.</strong> Every sign-in asks for a code from your authenticator app.</p>
          <button className="btn" onClick={remove} disabled={busy}>Turn off two-factor</button>
        </>
      )}
      {!factor && !enrolling && (
        <>
          <p>Off. Add a code from an authenticator app (1Password, Google Authenticator, Authy…) to every sign-in.</p>
          <button className="btn primary" onClick={start} disabled={busy}>Set up two-factor</button>
        </>
      )}
      {enrolling && (
        <form onSubmit={verify} className="enroll">
          <img src={enrolling.qr} width={180} height={180} alt="QR code to scan with your authenticator app" />
          <div className="stack">
            <p>Scan the code with your authenticator app, then type the 6-digit code it shows.</p>
            <p className="muted small">Can’t scan? Enter this key: <code>{enrolling.secret}</code></p>
            <label className="field"><span>Code</span>
              <input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <div className="row">
              <button className="btn primary" disabled={busy || code.replace(/\s/g, '').length !== 6}>Turn on</button>
              <button type="button" className="btn" onClick={() => { setEnrolling(null); setCode('') }}>Cancel</button>
            </div>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}

function ChangePassword() {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) return setMsg({ ok: false, text: `Use at least ${MIN_PASSWORD} characters.` })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    setMsg(error ? { ok: false, text: 'Password not changed. If you signed in a while ago, sign out and back in first.' } : { ok: true, text: 'Password changed.' })
    if (!error) setPassword('')
  }

  return (
    <form onSubmit={submit} className="stack narrow">
      <label className="field"><span>New password (at least {MIN_PASSWORD} characters)</span>
        <input required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {msg && <p className={msg.ok ? 'notice' : 'error'} role="status">{msg.text}</p>}
      <button className="btn" disabled={busy}>Change password</button>
    </form>
  )
}

export function Account({ email }: { email: string }) {
  return (
    <div className="page account">
      <section className="panel">
        <h2>Account</h2>
        <p>Signed in as <strong>{email}</strong></p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
      <section className="panel">
        <h2>Two-factor authentication</h2>
        <TwoFactor />
      </section>
      <section className="panel">
        <h2>Password</h2>
        <ChangePassword />
      </section>
    </div>
  )
}
