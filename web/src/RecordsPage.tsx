import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Lists } from './lib'
import { RecordsList, RecordsSkeleton } from './Records'
import { Import } from './Import'
import { Categories, ListsSkeleton, Methods } from './Lists'
import { Loading, Sk } from './Controls'

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
      {!lists && !error && (sub === 'categories' ? <ListsSkeleton label="categories" panels={2} />
        : sub === 'methods' ? <ListsSkeleton label="payment methods" />
        : sub === 'import' ? <Loading label="import"><Sk shape="block" className="card" h={240} /></Loading>
        : <><div className="filter-bar"><Sk w={220} h="2.25rem" /></div><Sk h="2.75rem" /><p className="tally"><Sk w={260} /></p><RecordsSkeleton /></>)}
      {lists && sub === '' && <RecordsList lists={lists} onListsChanged={load} />}
      {lists && sub === 'categories' && <Categories lists={lists} onChange={load} />}
      {lists && sub === 'methods' && <Methods lists={lists} onChange={load} />}
      {lists && sub === 'import' && <Import lists={lists} onDone={load} />}
    </div>
  )
}
