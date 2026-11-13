import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api, SESSION_EXPIRED, supabase } from './lib'
import { MfaChallenge, SetPassword, SignIn } from './Auth'
import { Account } from './Account'
import { Icon, Loading, Sk } from './Controls'
import { Dashboard } from './Dashboard'
import { RecordsPage } from './RecordsPage'
import { Calendar } from './Calendar'
import { WealthPage } from './Wealth.tsx'

type Gate = 'loading' | 'signed-out' | 'mfa' | 'set-password' | 'in'

const TABS = [['dashboard', 'Dashboard'], ['records', 'Records'], ['calendar', 'Calendar'], ['wealth', 'Wealth']] as const

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

/** Reads and clears auth parameters Supabase puts in the URL (invite/recovery links, OAuth errors). */
function takeUrlParams() {
  const q = new URLSearchParams(window.location.search)
  const out = { tokenHash: q.get('token_hash'), type: q.get('type'), error: q.get('error_description') }
  if (out.tokenHash || out.error) history.replaceState(null, '', window.location.pathname + window.location.hash)
  return out
}

const IDLE_MS = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES || 30) * 60_000
const LAST_ACTIVE = 'ft:last-active'

/**
 * Activity pings the API at most once a minute; that's what keeps the session alive,
 * since the API enforces the same timeout. After IDLE_MS without input, expires the
 * session. Last activity is shared through localStorage so an idle tab can't sign
 * out a busy one.
 */
function useIdleTimeout(on: boolean) {
  useEffect(() => {
    if (!on) return
    let last = 0
    const active = () => {
      if (Date.now() - last < 60_000) return
      last = Date.now()
      try { localStorage.setItem(LAST_ACTIVE, String(last)) } catch { /* this tab only */ }
      api('/api/session', { method: 'POST' }).catch(() => { /* a 401 already fired SESSION_EXPIRED */ })
    }
    const shared = () => { try { return Number(localStorage.getItem(LAST_ACTIVE)) || 0 } catch { return 0 } }
    const check = setInterval(() => {
      if (Date.now() - Math.max(last, shared()) > IDLE_MS) window.dispatchEvent(new Event(SESSION_EXPIRED))
    }, 15_000)
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, active, { capture: true, passive: true }))
    active()
    return () => { clearInterval(check); events.forEach((e) => window.removeEventListener(e, active, { capture: true })) }
  }, [on])
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [gate, setGate] = useState<Gate>('loading')
  const [invite, setInvite] = useState(false)
  const [urlError, setUrlError] = useState<string>()
  const route = useRoute()

  async function decide(s: Session | null) {
    setSession(s)
    if (!s) return setGate('signed-out')
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setGate(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'mfa' : 'in')
  }

  useEffect(() => {
    const { tokenHash, type, error } = takeUrlParams()
    if (error) setUrlError(error.includes('Signups not allowed') || error.includes('not allowed')
      ? 'That Google account hasn’t been invited. Ask the owner for an invite.' : 'Sign-in didn’t complete. Try again.')

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') { setSession(s); setGate('set-password'); return }
      // Defer: calling Supabase inside this callback can deadlock its auth lock.
      setTimeout(() => decide(s), 0)
    })

    if (tokenHash && (type === 'invite' || type === 'recovery')) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ data, error }) => {
        if (error || !data.session) { setUrlError('That link has expired or was already used. Ask for a new one.'); setGate('signed-out') }
        else { setSession(data.session); setInvite(type === 'invite'); setGate('set-password') }
      })
    }
    // Local scope: revokes this session's refresh token, leaves other devices signed in.
    const expire = () => { setUrlError('Your session expired after a period of inactivity. Sign in again.'); supabase.auth.signOut({ scope: 'local' }) }
    window.addEventListener(SESSION_EXPIRED, expire)
    return () => { sub.subscription.unsubscribe(); window.removeEventListener(SESSION_EXPIRED, expire) }
  }, [])
  useIdleTimeout(gate === 'in')

  // Session not known yet: the shell's frame, so signed-in users see the app take shape rather than a blank page.
  if (gate === 'loading') return (
    <Loading label="Finance Tracker" className="shell boot">
      <header className="topbar"><span className="brand">Finance Tracker</span><Sk w={360} h={48} className="tabs" /></header>
      <div className="page"><Sk shape="block" className="card" h={480} /></div>
    </Loading>
  )
  if (gate === 'signed-out') return <SignIn initialError={urlError} />
  if (gate === 'mfa') return <MfaChallenge onDone={() => decide(session)} />
  if (gate === 'set-password') return <SetPassword invite={invite} onDone={() => { setInvite(false); decide(session) }} />

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/dashboard">Finance Tracker</a>
        <nav className="tabs" aria-label="Main">
          {TABS.map(([id, label]) => (
            <a key={id} href={`#/${id}`} aria-current={route.split('/')[0] === id ? 'page' : undefined}><Icon name={id} /><span>{label}</span></a>
          ))}
        </nav>
        <a className="account-link" href="#/account" aria-current={route === 'account' ? 'page' : undefined}>Account</a>
      </header>
      {route === 'dashboard' && <Dashboard />}
      {route === 'account' && <Account email={session?.user.email ?? ''} />}
      {route.split('/')[0] === 'records' && <RecordsPage sub={route.split('/')[1] ?? ''} />}
      {route === 'calendar' && <Calendar />}
      {route.split('/')[0] === 'wealth' && <WealthPage sub={route.split('/')[1] ?? ''} />}
    </div>
  )
}
