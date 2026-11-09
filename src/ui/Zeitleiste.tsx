import { useRef, useState, type PointerEvent } from 'react'

export interface ZeitOption<T extends string> {
  wert: T
  aria: string
  kurz: string
  zeit?: string
}

/** Tippen wählt einzelne Abschnitte, Ziehen über die Leiste wählt einen Bereich. */
export function Zeitleiste<T extends string>({ optionen, werte, onWechsel, label }: {
  optionen: ZeitOption<T>[]; werte: T[]; onWechsel: (w: T[]) => void; label: string
}) {
  const leiste = useRef<HTMLDivElement>(null)
  const zug = useRef<{ start: number; gezogen: boolean } | null>(null)
  const klickIgnorieren = useRef(false)
  const [vorschau, setVorschau] = useState<T[] | null>(null)

  const sortiert = (w: T[]) => optionen.map((o) => o.wert).filter((x) => w.includes(x))
  const index = (x: number) => {
    const r = leiste.current!.getBoundingClientRect()
    return Math.min(optionen.length - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * optionen.length)))
  }
  const bereich = (a: number, b: number) =>
    optionen.slice(Math.min(a, b), Math.max(a, b) + 1).map((o) => o.wert)

  const start = (e: PointerEvent) => {
    zug.current = { start: index(e.clientX), gezogen: false }
    klickIgnorieren.current = false
  }
  const ziehen = (e: PointerEvent) => {
    if (!zug.current) return
    const i = index(e.clientX)
    if (i !== zug.current.start || zug.current.gezogen) {
      zug.current.gezogen = true
      setVorschau(bereich(zug.current.start, i))
    }
  }
  const ende = (e: PointerEvent) => {
    if (zug.current?.gezogen) {
      onWechsel(bereich(zug.current.start, index(e.clientX)))
      klickIgnorieren.current = true
    }
    zug.current = null
    setVorschau(null)
  }
  const abbrechen = () => {
    zug.current = null
    setVorschau(null)
  }

  const aktiv = vorschau ?? werte

  return (
    <div
      ref={leiste}
      className="zeitleiste"
      style={{ gridTemplateColumns: `repeat(${optionen.length}, 1fr)` }}
      role="group"
      aria-label={label}
      onPointerDown={start}
      onPointerMove={ziehen}
      onPointerUp={ende}
      onPointerCancel={abbrechen}
    >
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          aria-label={o.aria}
          aria-pressed={aktiv.includes(o.wert)}
          onClick={() => {
            if (klickIgnorieren.current) return
            onWechsel(sortiert(werte.includes(o.wert) ? werte.filter((w) => w !== o.wert) : [...werte, o.wert]))
          }}
        >
          <span>{o.kurz}</span>
          {o.zeit && <small>{o.zeit}</small>}
        </button>
      ))}
    </div>
  )
}
