import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { fmtDate, today } from './lib'

/* Branded replacements for the browser's date, month and colour pickers, whose popups can't be styled.
   Built on the Popover API: top layer, light dismiss and Escape come from the browser. */

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function Icon({ name }: { name: 'calendar' | 'left' | 'right' | 'check' | 'dashboard' | 'records' | 'wealth' }) {
  const d = {
    calendar: 'M3 6h14M6 2.5v3M14 2.5v3M3.75 4h12.5v12.5H3.75z', left: 'M12 4 6 10l6 6', right: 'm8 4 6 6-6 6', check: 'm4.5 10.5 3.5 3.5 7.5-8',
    dashboard: 'M4 16.5v-6M10 16.5v-13M16 16.5v-9', records: 'M7.5 5H17M7.5 10H17M7.5 15H17M3.5 5h.01M3.5 10h.01M3.5 15h.01', wealth: 'm3 14.5 4.5-4.5 3 3L17 6.5M12.5 6.5H17V11',
  }[name]
  return <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

/** Places a popover under its trigger, kept inside the viewport. */
function usePopover(anchor: RefObject<HTMLElement | null>) {
  const pop = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = pop.current
    if (!el) return
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === 'open'
      setOpen(isOpen)
      if (!isOpen || !anchor.current) return
      const r = anchor.current.getBoundingClientRect()
      const w = el.offsetWidth, h = el.offsetHeight
      el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`
      el.style.top = `${r.bottom + 6 + h > window.innerHeight && r.top - 6 - h > 0 ? r.top - 6 - h : r.bottom + 6}px`
    }
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [anchor])
  return { pop, open, show: () => pop.current?.showPopover(), hide: () => pop.current?.hidePopover() }
}

function Trigger({ id, label, children, anchor, onClick }: { id: string; label: string; children: ReactNode; anchor: RefObject<HTMLButtonElement | null>; onClick: () => void }) {
  return (
    <div className="field">
      <span id={id}>{label}</span>
      <button type="button" ref={anchor} className="picker-trigger" aria-labelledby={`${id} ${id}-v`} aria-haspopup="dialog" onClick={onClick}>
        <span id={`${id}-v`}>{children}</span><Icon name="calendar" />
      </button>
    </div>
  )
}

/** Date field: shows "Mon 2 Nov 2026"; opens a Monday-first month grid. Arrow keys move, Enter picks. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const { pop, open, show, hide } = usePopover(anchor)
  const [view, setView] = useState(() => ({ y: +value.slice(0, 4), m: +value.slice(5, 7) - 1 }))
  const [focus, setFocus] = useState(value)
  const grid = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus()
  }, [open, focus, view])

  function openAt() {
    setView({ y: +value.slice(0, 4), m: +value.slice(5, 7) - 1 })
    setFocus(value)
    show()
  }
  function moveTo(next: string) {
    setFocus(next)
    setView({ y: +next.slice(0, 4), m: +next.slice(5, 7) - 1 })
  }
  function onKey(e: KeyboardEvent) {
    const d = new Date(focus + 'T12:00:00')
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step) d.setDate(d.getDate() + step)
    else if (e.key === 'PageUp') d.setMonth(d.getMonth() - 1)
    else if (e.key === 'PageDown') d.setMonth(d.getMonth() + 1)
    else return
    e.preventDefault()
    moveTo(iso(d.getFullYear(), d.getMonth(), d.getDate()))
  }
  function pick(day: string) { onChange(day); hide(); anchor.current?.focus() }

  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(view.y, view.m, 1 - lead + i)
    return { iso: iso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === view.m }
  })
  const shiftMonth = (by: number) => { const d = new Date(view.y, view.m + by, 1); setView({ y: d.getFullYear(), m: d.getMonth() }) }
  const now = today()

  return (
    <>
      <Trigger id={id} label={label} anchor={anchor} onClick={openAt}>
        {fmtDate(value, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </Trigger>
      <div ref={pop} popover="auto" className="pop calendar" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
        <div className="pop-head">
          <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Icon name="left" /></button>
          <strong aria-live="polite">{fmtDate(iso(view.y, view.m, 1), { month: 'long', year: 'numeric' })}</strong>
          <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><Icon name="right" /></button>
        </div>
        <div className="cal-grid" role="grid" ref={grid} onKeyDown={onKey}>
          <div role="row" className="cal-row">{WEEKDAYS.map((w) => <span key={w} role="columnheader" className="cal-wd">{w}</span>)}</div>
          {Array.from({ length: 6 }, (_, r) => (
            <div role="row" className="cal-row" key={r}>
              {days.slice(r * 7, r * 7 + 7).map((d) => (
                <button type="button" role="gridcell" key={d.iso} data-day={d.iso} tabIndex={d.iso === focus ? 0 : -1}
                  aria-selected={d.iso === value} aria-current={d.iso === now ? 'date' : undefined}
                  aria-label={fmtDate(d.iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  className={'cal-day' + (d.inMonth ? '' : ' out')} onClick={() => pick(d.iso)}>{d.day}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="pop-foot"><button type="button" className="link" onClick={() => pick(now)}>Today</button></div>
      </div>
    </>
  )
}

/** Month field (YYYY-MM): a year header over a 3×4 grid of months. */
export function MonthField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const { pop, show, hide } = usePopover(anchor)
  const [year, setYear] = useState(+value.slice(0, 4))
  const pick = (m: number) => { onChange(`${year}-${pad(m + 1)}`); hide(); anchor.current?.focus() }
  return (
    <>
      <Trigger id={id} label={label} anchor={anchor} onClick={() => { setYear(+value.slice(0, 4)); show() }}>
        {fmtDate(value + '-01', { month: 'long', year: 'numeric' })}
      </Trigger>
      <div ref={pop} popover="auto" className="pop months" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
        <div className="pop-head">
          <button type="button" aria-label="Previous year" onClick={() => setYear(year - 1)}><Icon name="left" /></button>
          <strong aria-live="polite">{year}</strong>
          <button type="button" aria-label="Next year" onClick={() => setYear(year + 1)}><Icon name="right" /></button>
        </div>
        <div className="month-grid">
          {Array.from({ length: 12 }, (_, m) => (
            <button type="button" key={m} aria-pressed={value === `${year}-${pad(m + 1)}`} onClick={() => pick(m)}>
              {fmtDate(iso(year, m, 1), { month: 'short' })}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** Colour swatch that opens a palette plus a hex field. Value is lowercase #rrggbb. */
export function ColorField({ label, value, palette, onChange }: { label: string; value: string; palette: string[]; onChange: (v: string) => void }) {
  const hexId = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const { pop, hide } = usePopover(anchor)
  const [hex, setHex] = useState(value)
  const choose = (c: string) => { onChange(c); hide(); anchor.current?.focus() }
  return (
    <>
      <button type="button" ref={anchor} className="swatch-btn" aria-label={label} aria-haspopup="dialog" style={{ background: value }}
        onClick={() => { setHex(value); pop.current?.showPopover() }} />
      <div ref={pop} popover="auto" className="pop palette" role="dialog" aria-label={label}>
        <div className="swatches">
          {palette.map((c) => (
            <button type="button" key={c} aria-label={c} aria-pressed={c === value} style={{ background: c }} onClick={() => choose(c)} />
          ))}
        </div>
        <form className="hex-row" onSubmit={(e) => { e.preventDefault(); const c = hex.trim().toLowerCase(); if (/^#[0-9a-f]{6}$/.test(c)) choose(c) }}>
          <span className="key big" style={{ background: /^#[0-9a-f]{6}$/i.test(hex) ? hex : value }} />
          <label className="sr-only" htmlFor={hexId}>Hex colour</label>
          <input id={hexId} value={hex} maxLength={7} spellCheck={false} onChange={(e) => setHex(e.target.value)} />
          <button className="btn">Use</button>
        </form>
      </div>
    </>
  )
}

/** A grey placeholder in the shape of the content it stands in for. Purely visual: wrap a view's skeleton in <Loading>. */
export function Sk({ shape = 'line', w, h, className = '' }: { shape?: 'line' | 'block' | 'circle'; w?: number | string; h?: number | string; className?: string }) {
  return <span className={`sk-${shape} ${className}`} style={{ width: w, height: h }} aria-hidden="true" />
}

/** The busy region around a skeleton, named for screen readers. */
export function Loading({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={className} aria-busy="true"><span className="sr-only">Loading {label}</span>{children}</div>
}

/** A panel's title row followed by `lines` text lines; covers most panels while they load. */
export function SkPanel({ className = '', lines = 3, children }: { className?: string; lines?: number; children?: ReactNode }) {
  return (
    <section className={'panel sk-panel ' + className}>
      <Sk w="40%" h="1.25rem" />
      {children}
      {Array.from({ length: lines }, (_, i) => <Sk key={i} w={`${90 - i * 15}%`} />)}
    </section>
  )
}
