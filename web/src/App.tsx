import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib'
import { MfaChallenge, SetPassword, SignIn } from './Auth'
import { Account } from './Account'
import { Icon } from './Controls'
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
    return () => sub.subscription.unsubscribe()
  }, [])

  if (gate === 'loading') return <div className="boot" aria-busy="true" />
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
