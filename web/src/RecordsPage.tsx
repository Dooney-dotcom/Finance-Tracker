import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Lists } from './lib'
import { RecordsList } from './Records'
import { Import } from './Import'
import { Categories, Methods } from './Lists'

const SUBS = [['', 'Records'], ['categories', 'Categories'], ['methods', 'Payment methods'], ['import', 'Import']] as const

export function RecordsPage({ sub }: { sub: string }) {
  const [lists, setLists] = useState<Lists | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api<Lists>('/api/lists').then(setLists).catch((e) => setError(e instanceof ApiError ? e.message : 'Couldn’t load your categories.'))
  }, [])
  useEffect(load, [load])

  return (
    <div className="page records-page">
      <nav className="subtabs" aria-label="Records sections">
        {SUBS.map(([id, label]) => (
          <a key={id} href={`#/records${id ? '/' + id : ''}`} aria-current={sub === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      {error && <div className="banner" role="alert"><p>{error}</p><button className="btn" onClick={() => { setError(''); load() }}>Retry</button></div>}
      {!lists && !error && <div className="sk"><div className="sk-block" /></div>}
      {lists && sub === '' && <RecordsList lists={lists} onListsChanged={load} />}
      {lists && sub === 'categories' && <Categories lists={lists} onChange={load} />}
      {lists && sub === 'methods' && <Methods lists={lists} onChange={load} />}
      {lists && sub === 'import' && <Import lists={lists} onDone={load} />}
    </div>
  )
}
