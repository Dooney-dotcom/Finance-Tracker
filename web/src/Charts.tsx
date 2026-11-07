import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { money, moneyRound, signed } from './lib'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Clean axis ticks: 0 and 3–5 round steps up to max. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const out = []
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}

export interface Series { name: string; color: string; thin?: boolean; dashed?: boolean }
export interface Row { label: string; long: string; values: (number | null)[] }

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="legend">
      {series.map((s) => (
        <li key={s.name}><span className={'key' + (s.thin ? ' thin' : '') + (s.dashed ? ' dashed' : '')} style={s.dashed ? { color: s.color } : { background: s.color }} />{s.name}</li>
      ))}
    </ul>
  )
}

export function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="table-view">
      <summary>Show as table</summary>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  )
}

const PAD = { top: 12, right: 12, bottom: 28, left: 56 }

type Pt = readonly [number, number]
/** Monotone cubic through the points (Fritsch–Butland slopes): smooth, but never overshoots a flat or rising run. */
function monotone(p: Pt[]): string {
  const s = p.slice(1).map((q, i) => (q[1] - p[i][1]) / (q[0] - p[i][0]))
  const m = p.map((_, i) => i === 0 ? s[0] ?? 0 : i === p.length - 1 ? s[i - 1] : s[i - 1] * s[i] <= 0 ? 0 : 2 / (1 / s[i - 1] + 1 / s[i]))
  return p.reduce((acc, q, i) => {
    if (i === 0) return `M${q[0]},${q[1]}`
    const [x0, y0] = p[i - 1], t = (q[0] - x0) / 3
    return acc + `C${x0 + t},${y0 + m[i - 1] * t} ${q[0] - t},${q[1] - m[i] * t} ${q[0]},${q[1]}`
  }, '')
}

/** Lines (mode "line"), smooth lines over gradient areas (mode "area"), solid bands stacked on each other (mode "stack")
 *  or grouped columns (mode "columns") on one money axis.
 *  Line and columns show a hover readout; area reports the hovered row through onHover so the card's headline can follow it. */
export function TimeChart({ rows, series, mode, height = 260, label, xEvery = 1, endLabel = true, onHover, refLine }:
  { rows: Row[]; series: Series[]; mode: 'line' | 'area' | 'stack' | 'columns'; height?: number; label: string; xEvery?: number; endLabel?: boolean;
    onHover?: (i: number | null) => void; refLine?: { value: number; label: string; color: string } }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHoverState] = useState<number | null>(null)
  const setHover = (i: number | null) => { setHoverState(i); onHover?.(i) }
  const gid = 'g' + useId().replace(/\W/g, '')
  const max = Math.max(0, refLine?.value ?? 0, ...rows.flatMap((r) => mode === 'stack' ? [r.values.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0)] : r.values.map((v) => v ?? 0)))
  const ys = ticks(max)
  const top = ys[ys.length - 1]
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const band = rows.length ? plotW / rows.length : 0
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH

  const pick = (clientX: number, el: SVGSVGElement) => {
    const i = Math.floor((clientX - el.getBoundingClientRect().left - PAD.left) / band)
    setHover(i >= 0 && i < rows.length ? i : null)
  }

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)}>
          {ys.map((t) => (
            <g key={t}>
              {mode !== 'columns' && <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="grid" />}
              <text x={PAD.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{moneyRound(t)}</text>
            </g>
          ))}
          {refLine && <line x1={PAD.left} x2={width - PAD.right} y1={y(refLine.value)} y2={y(refLine.value)} stroke={refLine.color} strokeWidth={1.5} strokeDasharray="6 4" />}
          {rows.map((r, i) => (i % xEvery === 0 || i === rows.length - 1) && (
            <text key={i} x={x(i)} y={height - 8} className="tick" textAnchor="middle">{r.label}</text>
          ))}
          {hover !== null && (mode === 'area' || mode === 'stack') && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="cursor" />}
          {hover !== null && mode === 'line' && <rect x={PAD.left + band * hover} y={PAD.top} width={band} height={plotH} className="hover-band" />}
          {mode === 'columns' && rows.map((r, i) => {
            // Pills on full-height tracks; the hovered day's tracks get an outline.
            const n = series.length
            const w = Math.max(4, Math.min(40, (band - 12) / n - 4))
            return r.values.map((v, s) => {
              const bx = x(i) - (n * (w + 4) - 4) / 2 + s * (w + 4)
              const h = v ? Math.max(w, (v / top) * plotH) : 0
              return (
                <g key={`${i}-${s}`}>
                  <rect x={bx} y={PAD.top} width={w} height={plotH} rx={w / 2} className={'track' + (hover === i ? ' on' : '')} />
                  {h > 0 && <rect x={bx} y={PAD.top + plotH - h} width={w} height={h} rx={w / 2} fill={series[s].color} />}
                </g>
              )
            })
          })}
          {mode === 'stack' && <Bands rows={rows} series={series} x={x} y={y} />}
          {(mode === 'line' || mode === 'area') && series.map((s, si) => {
            const pts = rows.map((r, i) => (r.values[si] == null ? null : [x(i), y(r.values[si]!)] as const))
            const lastIdx = pts.map((p) => !!p).lastIndexOf(true)
            // Each unbroken run of values is drawn on its own, so a gap stays a gap.
            const runs = pts.reduce<Pt[][]>((acc, p, i) => (p ? (pts[i - 1] ? acc[acc.length - 1].push(p) : acc.push([p]), acc) : acc), [])
            const d = runs.map((r) => mode === 'area' ? monotone(r) : r.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('')).join('')
            const fill = mode === 'area' && !s.dashed
            return (
              <g key={s.name}>
                {fill && (
                  <>
                    <defs>
                      <linearGradient id={gid + si} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor={s.color} stopOpacity={s.thin ? 0.14 : 0.28} />
                        <stop offset="1" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    {runs.map((r, ri) => (
                      <path key={ri} fill={`url(#${gid + si})`}
                        d={monotone(r) + `L${r[r.length - 1][0]},${PAD.top + plotH}L${r[0][0]},${PAD.top + plotH}Z`} />
                    ))}
                  </>
                )}
                <path d={d} fill="none" stroke={s.color} strokeWidth={s.thin ? 1.5 : 2.5} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
                {endLabel && lastIdx >= 0 && !s.thin && !s.dashed && (
                  <circle cx={pts[lastIdx]![0]} cy={pts[lastIdx]![1]} r={4.5} fill={s.color} className="ring" />
                )}
              </g>
            )
          })}
          {(mode === 'line' || mode === 'area') && hover !== null && series.map((s, si) => {
            const v = rows[hover].values[si]
            return v == null ? null : <circle key={s.name} cx={x(hover)} cy={y(v)} r={4.5} fill={s.color} className="ring" />
          })}
          {/* after the series, so its paper halo masks any line crossing it */}
          {refLine && <text x={width - PAD.right} y={y(refLine.value) - 6} textAnchor="end" className="tick" style={{ fill: refLine.color }}>{refLine.label}</text>}
        </svg>
      )}
      {hover !== null && !onHover && (
        <div className="readout" style={{ left: Math.min(Math.max(x(hover), 90), width - 90) }} aria-hidden="true">
          <strong>{rows[hover].long}</strong>
          {series.map((s, si) => rows[hover].values[si] != null && (
            <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{money(rows[hover].values[si]!)}</b></span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Each series as a band on top of the ones before it. A row with no values at all is a gap. */
function Bands({ rows, series, x, y }: { rows: Row[]; series: Series[]; x: (i: number) => number; y: (v: number) => number }) {
  const present = rows.map((r) => r.values.some((v) => v != null))
  const runs = present.reduce<number[][]>((acc, p, i) => (p ? (present[i - 1] ? acc[acc.length - 1].push(i) : acc.push([i]), acc) : acc), [])
  const cum = (si: number, i: number) => rows[i].values.slice(0, si + 1).reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0)
  return (
    <>
      {series.map((s, si) => runs.map((run) => {
        const top = run.map((i) => `${x(i)},${y(cum(si, i))}`)
        const bottom = run.map((i) => `${x(i)},${y(si ? cum(si - 1, i) : 0)}`).reverse()
        return <polygon key={s.name + run[0]} points={[...top, ...bottom].join(' ')} fill={s.color} stroke="var(--paper)" strokeWidth={1} strokeLinejoin="round" />
      }))}
    </>
  )
}

export interface Part { name: string; color: string; value: number }

/** Columns that stack their positive parts up from zero and their negative parts down from it. */
export function ChangeBars({ rows, label, height = 240 }: { rows: { label: string; long: string; parts: Part[] }[]; label: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const up = Math.max(0, ...rows.map((r) => r.parts.reduce((a, p) => a + Math.max(0, p.value), 0)))
  const down = Math.max(0, ...rows.map((r) => r.parts.reduce((a, p) => a + Math.max(0, -p.value), 0)))
  const step = ticks(Math.max(up, down))
  const unit = step[1] - step[0]
  const hi = Math.ceil(up / unit) * unit || unit, lo = Math.ceil(down / unit) * unit
  const ys = Array.from({ length: Math.round((hi + lo) / unit) + 1 }, (_, i) => -lo + i * unit)
  const plotW = Math.max(0, width - PAD.left - PAD.right), plotH = height - PAD.top - PAD.bottom
  const band = rows.length ? plotW / rows.length : 0
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + ((hi - v) / (hi + lo)) * plotH
  const w = Math.max(6, Math.min(28, band * 0.5))
  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}
          onPointerMove={(e) => { const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left) / band); setHover(i >= 0 && i < rows.length ? i : null) }}
          onPointerLeave={() => setHover(null)}>
          {ys.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : 'grid'} />
              <text x={PAD.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{moneyRound(t)}</text>
            </g>
          ))}
          {hover !== null && <rect x={PAD.left + band * hover} y={PAD.top} width={band} height={plotH} className="hover-band" />}
          {rows.map((r, i) => {
            let pos = 0, neg = 0
            return (
              <g key={i}>
                <text x={x(i)} y={height - 8} className="tick" textAnchor="middle">{r.label}</text>
                {r.parts.map((p) => {
                  if (!p.value) return null
                  const from = p.value > 0 ? pos : neg
                  const to = from + p.value
                  if (p.value > 0) pos = to; else neg = to
                  return <rect key={p.name} x={x(i) - w / 2} width={w} y={y(Math.max(from, to))} height={Math.max(1, Math.abs(y(from) - y(to)))} fill={p.color} />
                })}
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && rows[hover].parts.length > 0 && (
        <div className="readout" style={{ left: Math.min(Math.max(x(hover), 90), width - 90) }} aria-hidden="true">
          <strong>{rows[hover].long}</strong>
          {rows[hover].parts.map((p) => <span key={p.name}><i style={{ background: p.color }} />{p.name} <b>{signed(p.value)}</b></span>)}
        </div>
      )}
    </div>
  )
}

export interface Seg { key: string; label: string; amount: number; color: string }

/** Part-to-whole ring, ≤ 6 segments, 2px surface gaps between them. */
export function Donut({ segs, total, size = 196, centre }: { segs: Seg[]; total: number; size?: number; centre: ReactNode }) {
  const r = size / 2 - 14, c = 2 * Math.PI * r
  const gap = segs.length > 1 ? 2 : 0
  let at = 0
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth={24} />
        {total > 0 && segs.map((s) => {
          const len = (s.amount / total) * c
          const el = (
            <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={24}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-at} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          )
          at += len
          return el
        })}
      </svg>
      <div className="donut-centre">{centre}</div>
    </div>
  )
}

const NODE = 10, GAP = 6, TOP = 28, LINE = 16

/** Sources → one hub → sinks. Node heights share one money scale; ribbons take the colour of their outer end. */
export function Sankey({ sources, sinks, hub, label }: { sources: Seg[]; sinks: Seg[]; hub: string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hot, setHot] = useState<string | null>(null)
  const total = Math.max(sources.reduce((a, s) => a + s.amount, 0), sinks.reduce((a, s) => a + s.amount, 0)) || 1
  const n = Math.max(sources.length, sinks.length)
  const height = Math.max(240, n * 30) + TOP
  const k = (height - TOP - GAP * (n - 1)) / total
  const labelW = Math.min(180, width * 0.3)
  const chars = Math.floor(labelW / 7.5)
  const xs = { src: labelW, hub: width / 2 - NODE / 2, sink: width - labelW - NODE }
  const hubH = total * k, hubY = TOP + (height - TOP - hubH) / 2

  type Node = Seg & { id: string; y: number; h: number; hubAt: number; ly: number }
  const column = (segs: Seg[], side: 'src' | 'sink'): Node[] => {
    const span = segs.reduce((a, s) => a + s.amount * k, 0) + GAP * (segs.length - 1)
    let y = TOP + (height - TOP - span) / 2, at = hubY
    const nodes = segs.map((s) => {
      const h = s.amount * k
      const node = { ...s, id: side + ':' + s.key, y, h, hubAt: at, ly: y + h / 2 }
      y += h + GAP; at += h
      return node
    })
    // Small neighbours would stack their labels on top of each other: push each one below the last.
    for (let i = 1; i < nodes.length; i++) nodes[i].ly = Math.max(nodes[i].ly, nodes[i - 1].ly + LINE)
    return nodes
  }
  const left = column(sources, 'src'), right = column(sinks, 'sink')

  const ribbon = (x0: number, a0: number, x1: number, b0: number, h: number) => {
    const xm = (x0 + x1) / 2
    return `M${x0},${a0}C${xm},${a0} ${xm},${b0} ${x1},${b0}V${b0 + h}C${xm},${b0 + h} ${xm},${a0 + h} ${x0},${a0 + h}Z`
  }
  const dim = (id: string) => (hot && hot !== id ? 0.12 : 1)
  const short = (t: string) => (t.length > chars ? t.slice(0, chars - 1) + '…' : t)
  const focus = [...left, ...right].find((x) => x.id === hot)

  return (
    <div className="chart sankey" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerLeave={() => setHot(null)}>
          <text x={xs.hub + NODE / 2} y={hubY - 10} textAnchor="middle" className="label">{hub} <tspan className="v">{money(total)}</tspan></text>
          {[...left, ...right].map((x) => {
            const src = x.id.startsWith('src')
            return (
              <g key={x.id} onPointerEnter={() => setHot(x.id)}>
                <path opacity={0.35 * dim(x.id)} fill={x.color}
                  d={src ? ribbon(xs.src + NODE, x.y, xs.hub, x.hubAt, x.h) : ribbon(xs.hub + NODE, x.hubAt, xs.sink, x.y, x.h)} />
                <rect x={src ? xs.src : xs.sink} y={x.y} width={NODE} height={Math.max(2, x.h)} rx={NODE / 2} fill={x.color} opacity={dim(x.id)} />
                <text x={src ? xs.src - 8 : xs.sink + NODE + 8} y={x.ly} dominantBaseline="middle" textAnchor={src ? 'end' : 'start'}
                  className="label" opacity={dim(x.id)}>
                  {short(x.label)} <tspan className="v">{src ? money(x.amount) : Math.round((x.amount / total) * 100) + '%'}</tspan>
                </text>
              </g>
            )
          })}
          <rect x={xs.hub} y={hubY} width={NODE} height={hubH} rx={NODE / 2} fill="var(--ink)" />
        </svg>
      )}
      {focus && (
        <div className="readout" style={{ left: Math.min(Math.max(width / 2, 90), width - 90), top: Math.max(0, focus.y - 56) }} aria-hidden="true">
          <strong>{focus.label}</strong>
          <span><i style={{ background: focus.color }} />{Math.round((focus.amount / total) * 100)}% <b>{money(focus.amount)}</b></span>
        </div>
      )}
    </div>
  )
}
