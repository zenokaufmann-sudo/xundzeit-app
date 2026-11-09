import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { Reihe } from '../analysis/auswertung'
import { formatDatum, parseDatum, wochentag } from '../domain/datum'
import { STAERKEN } from '../domain/katalog'
import type { Datum } from '../domain/types'

const HOEHE = 40
const RAND = 4

function useBreite() {
  const ref = useRef<HTMLDivElement>(null)
  const [breite, setBreite] = useState(358)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const messen = () => setBreite(el.clientWidth || 358)
    messen()
    const beobachter = new ResizeObserver(messen)
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [])
  return [ref, breite] as const
}

const zahl = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(1))

function wertText(r: Reihe, w: number | null): string {
  if (w === null) return 'nicht erfasst'
  if (r.id === 'kopfweh') return w === 0 ? 'Keines' : STAERKEN[Math.min(3, Math.round(w)) - 1].label
  return `${zahl(w)}${r.einheit ? ` ${r.einheit}` : ''}`
}

function Linie({ r, tage, breite, index, kopfweh }: {
  r: Reihe; tage: Datum[]; breite: number; index: number | null; kopfweh?: Reihe
}) {
  const n = tage.length
  const spalte = breite / n
  const x = (i: number) => (i + 0.5) * spalte
  const vorhanden = r.werte.filter((w): w is number => w !== null)
  let [min, max] = r.skala ?? [Math.min(...vorhanden), Math.max(...vorhanden)]
  if (min === max) {
    min -= 1
    max += 1
  }
  const y = (w: number) => RAND + (HOEHE - 2 * RAND) * (1 - (w - min) / (max - min))

  // Lücken bleiben Lücken: Nicht erfasste Tage werden nie überbrückt.
  const stuecke: [number, number][][] = []
  let aktuell: [number, number][] = []
  r.werte.forEach((w, i) => {
    if (w === null) {
      if (aktuell.length) stuecke.push(aktuell)
      aktuell = []
    } else aktuell.push([x(i), y(w)])
  })
  if (aktuell.length) stuecke.push(aktuell)

  const gewaehlt = index === null ? null : r.werte[index]
  return (
    <svg width={breite} height={HOEHE} aria-hidden>
      {kopfweh?.werte.map((w, i) => w !== null && w > 0 && (
        <rect key={i} className="reihe__band" x={i * spalte} width={Math.max(spalte, 2)} y={0} height={HOEHE} />
      ))}
      <line className="reihe__grund" x1={0} x2={breite} y1={HOEHE - 0.5} y2={HOEHE - 0.5} />
      {stuecke.map((s, i) => s.length === 1
        ? <circle key={i} className="reihe__punkt" cx={s[0][0]} cy={s[0][1]} r={2} />
        : <polyline key={i} className="reihe__linie" points={s.map((p) => p.join(',')).join(' ')} />)}
      {index !== null && <line className="reihe__marke" x1={x(index)} x2={x(index)} y1={0} y2={HOEHE} />}
      {index !== null && gewaehlt !== null && <circle className="reihe__wahl" cx={x(index)} cy={y(gewaehlt)} r={4} />}
    </svg>
  )
}

function Saeulen({ r, tage, breite, index }: { r: Reihe; tage: Datum[]; breite: number; index: number | null }) {
  const spalte = breite / tage.length
  return (
    <svg width={breite} height={HOEHE} aria-hidden>
      <line className="reihe__grund" x1={0} x2={breite} y1={HOEHE - 0.5} y2={HOEHE - 0.5} />
      {r.werte.map((w, i) => {
        if (w === null || w <= 0) return null
        const stufe = Math.min(3, Math.round(w))
        const hoehe = ((HOEHE - RAND) * stufe) / 3
        const b = Math.max(2, Math.min(8, spalte - 2))
        return <rect key={i} className={`reihe__stufe s${stufe}`} x={(i + 0.5) * spalte - b / 2} y={HOEHE - hoehe} width={b} height={hoehe} rx={Math.min(2, b / 2)} />
      })}
      {index !== null && <line className="reihe__marke" x1={(index + 0.5) * spalte} x2={(index + 0.5) * spalte} y1={0} y2={HOEHE} />}
    </svg>
  )
}

/** Alle Reihen auf derselben Zeitachse, Kopfweh-Tage laufen als Band durch jede Reihe. */
export function Zeitreihen({ tage, reihen }: { tage: Datum[]; reihen: Reihe[] }) {
  const [ref, breite] = useBreite()
  const [index, setIndex] = useState<number | null>(null)
  const n = tage.length
  const mitDaten = reihen.filter((r) => r.werte.some((w) => w !== null))
  const ohneDaten = reihen.filter((r) => r.werte.every((w) => w === null))
  const kopfweh = reihen.find((r) => r.id === 'kopfweh')

  const waehlen = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setIndex(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - box.left) / box.width) * n))))
  }
  const letzter = (r: Reihe) => [...r.werte].reverse().find((w) => w !== null) ?? null
  const langer = n > 100
  const striche = tage.flatMap((d, i) => {
    const istStrich = langer ? d.endsWith('-01') : parseDatum(d).getDay() === 1
    return istStrich ? [(i + 0.5) * (breite / n)] : []
  })

  if (mitDaten.length === 0) return <p className="leise">Noch keine Werte in diesem Zeitraum</p>

  return (
    <div className="zeitreihen" ref={ref}>
      <p className="zeitreihen__stand" aria-live="polite">
        {index === null ? 'Letzte Werte. Antippen zeigt einen einzelnen Tag' : `${wochentag(tage[index])}, ${formatDatum(tage[index])}`}
      </p>
      <div
        className="zeitreihen__flaeche"
        onPointerDown={(e) => waehlen(e)}
        onPointerMove={(e) => { if (e.buttons > 0 || e.pointerType === 'touch') waehlen(e) }}
      >
        {mitDaten.map((r) => (
          <div className="spur" key={r.id}>
            <div className="reihe__kopf">
              <span>{r.titel}</span>
              <span className="reihe__wert">{wertText(r, index === null ? letzter(r) : r.werte[index])}</span>
            </div>
            {r.id === 'kopfweh'
              ? <Saeulen r={r} tage={tage} breite={breite} index={index} />
              : <Linie r={r} tage={tage} breite={breite} index={index} kopfweh={kopfweh} />}
          </div>
        ))}
        <svg className="zeitreihen__massstab" width={breite} height={8} aria-hidden>
          {striche.map((x) => <line key={x} x1={x} x2={x} y1={0} y2={6} />)}
        </svg>
      </div>
      <div className="zeitreihen__achse"><span>{formatDatum(tage[0]).slice(0, 5)}</span><span>{formatDatum(tage[n - 1]).slice(0, 5)}</span></div>
      {ohneDaten.length > 0 && <p className="leise">Noch keine Werte: {ohneDaten.map((r) => r.titel).join(', ')}</p>}
    </div>
  )
}

export interface RisikoZeile {
  id: string
  titel: string
  risiko: number | null
  zuWenig: boolean
  unsicher?: boolean
  wertText: string
  detail: string
}

// Logarithmisch: ×2 und ×0.5 sind gleich weit von ×1 entfernt. Die Achse reicht von ×0.25 bis ×4.
const lage = (r: number) => 50 + (Math.max(-2, Math.min(2, Math.log2(Math.max(r, 0.25)))) / 2) * 50

function RisikoBalken({ risiko, unsicher }: { risiko: number; unsicher?: boolean }) {
  const p = lage(risiko)
  return (
    <div className="risiko__achse" aria-hidden>
      <i style={{ left: '25%' }} /><i className="risiko__eins" style={{ left: '50%' }} /><i style={{ left: '75%' }} />
      <b
        className={`${risiko >= 1 ? 'risiko__balken--hoch' : 'risiko__balken--tief'} ${unsicher ? 'risiko__balken--unsicher' : ''}`}
        style={{ left: `${Math.min(p, 50)}%`, width: `${Math.max(Math.abs(p - 50), 1)}%` }}
      />
    </div>
  )
}

export function RisikoListe({ zeilen }: { zeilen: RisikoZeile[] }) {
  const aussagekraeftig = zeilen.filter((z) => !z.zuWenig)
  const zuWenig = zeilen.filter((z) => z.zuWenig)
  return (
    <div className="risiken">
      {aussagekraeftig.length > 0 && (
        <div className="risiko__skala" aria-hidden>
          <span style={{ left: '25%' }}>×0.5</span><span style={{ left: '50%' }}>×1</span><span style={{ left: '75%' }}>×2</span>
        </div>
      )}
      {aussagekraeftig.map((z) => (
        <div className="risiko" key={z.id} data-faktor={z.id}>
          <div className="risiko__kopf"><span>{z.titel}</span><strong>{z.wertText}</strong></div>
          {z.risiko !== null && <RisikoBalken risiko={z.risiko} unsicher={z.unsicher} />}
          <small>{z.detail}</small>
        </div>
      ))}
      {zuWenig.length > 0 && (
        <details className="zuwenig" open={aussagekraeftig.length === 0}>
          <summary>Zu wenig Daten ({zuWenig.length})</summary>
          <ul>
            {zuWenig.map((z) => <li key={z.id} data-faktor={z.id}><span>{z.titel}</span><small>{z.detail}</small></li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

export function SaeulenReihe({ spalten }: { spalten: { key: string; label: ReactNode; wert: number | null; aria: string }[] }) {
  const max = Math.max(1, ...spalten.map((s) => s.wert ?? 0))
  return (
    <div className="saeulen" style={{ gridTemplateColumns: `repeat(${spalten.length}, 1fr)` }}>
      {spalten.map((s) => (
        <div className="saeule" key={s.key} role="img" aria-label={s.aria}>
          <span className="saeule__wert">{s.wert === null ? '–' : s.wert > 0 ? s.wert : ''}</span>
          <span className="saeule__flaeche">
            {s.wert !== null && s.wert > 0 && <i style={{ height: `${(s.wert / max) * 100}%` }} />}
          </span>
          <span className="saeule__label">{s.label}</span>
        </div>
      ))}
    </div>
  )
}
