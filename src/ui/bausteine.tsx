import type { ReactNode } from 'react'
import type { Option } from '../domain/katalog'
import type { Stufe5 } from '../domain/types'

const klassen = (...k: (string | false | undefined)[]) => k.filter(Boolean).join(' ')

interface ChipProps {
  aktiv?: boolean
  vorschlag?: boolean
  onClick: () => void
  children: ReactNode
  label?: string
}

export function Chip({ aktiv, vorschlag, onClick, children, label }: ChipProps) {
  return (
    <button
      type="button"
      className={klassen('chip', aktiv && 'chip--aktiv', !aktiv && vorschlag && 'chip--vorschlag')}
      aria-pressed={Boolean(aktiv)}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function EineAuswahl<T>({ optionen, wert, vorschlag, onWahl }: {
  optionen: Option<T>[]; wert?: T; vorschlag?: T; onWahl: (w: T) => void
}) {
  return (
    <div className="chips">
      {optionen.map((o) => (
        <Chip key={String(o.wert)} aktiv={wert === o.wert} vorschlag={wert === undefined && vorschlag === o.wert} onClick={() => onWahl(o.wert)}>
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

export function MehrereAuswahl<T>({ optionen, werte, onWechsel }: {
  optionen: Option<T>[]; werte: T[]; onWechsel: (w: T[]) => void
}) {
  return (
    <div className="chips">
      {optionen.map((o) => (
        <Chip
          key={String(o.wert)}
          aktiv={werte.includes(o.wert)}
          onClick={() =>
            onWechsel(werte.includes(o.wert) ? werte.filter((w) => w !== o.wert) : [...werte, o.wert])
          }
        >
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

export function JaNein({ wert, vorschlag, onWahl }: {
  wert?: boolean; vorschlag?: boolean; onWahl: (w: boolean) => void
}) {
  return (
    <div className="janein">
      <Chip aktiv={wert === false} vorschlag={wert === undefined && vorschlag === false} onClick={() => onWahl(false)}>Nein</Chip>
      <Chip aktiv={wert === true} vorschlag={wert === undefined && vorschlag === true} onClick={() => onWahl(true)}>Ja</Chip>
    </div>
  )
}

export function Stepper({ wert, min = 1, max = 20, schritt = 1, dezimalen = 0, onWert, einheit }: {
  wert: number; min?: number; max?: number; schritt?: number; dezimalen?: number; onWert: (w: number) => void; einheit: string
}) {
  const runden = (w: number) => Number(w.toFixed(dezimalen))
  return (
    <div className="stepper">
      <button type="button" aria-label="Weniger" disabled={wert <= min} onClick={() => onWert(runden(wert - schritt))}>−</button>
      <output>{wert.toFixed(dezimalen)} <small>{einheit}</small></output>
      <button type="button" aria-label="Mehr" disabled={wert >= max} onClick={() => onWert(runden(wert + schritt))}>+</button>
    </div>
  )
}

const STUFEN: Stufe5[] = [1, 2, 3, 4, 5]

export function Skala({ titel, labels, wert, vorschlag, onWahl }: {
  titel: string; labels: Record<Stufe5, string>; wert?: Stufe5; vorschlag?: Stufe5; onWahl: (w: Stufe5) => void
}) {
  const aktuell = wert ?? vorschlag
  return (
    <div className="frage">
      <div className="frage__kopf">
        <span>{titel}</span>
        {aktuell && <span className={klassen('frage__wert', !wert && 'frage__wert--vorschlag')}>{labels[aktuell]}</span>}
      </div>
      <div className="skala" role="group" aria-label={titel}>
        {STUFEN.map((s) => (
          <Chip key={s} aktiv={wert === s} vorschlag={!wert && vorschlag === s} label={`${titel}: ${labels[s]}`} onClick={() => onWahl(s)}>
            {s}
          </Chip>
        ))}
      </div>
      <div className="skala__enden" aria-hidden>
        <span>{labels[1]}</span>
        <span>{labels[5]}</span>
      </div>
    </div>
  )
}

export function Frage({ titel, children, inline }: { titel: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={klassen('frage', inline && 'frage--inline')}>
      <div className="frage__kopf"><span>{titel}</span></div>
      {children}
    </div>
  )
}

export function Haken() {
  return (
    <svg className="haken" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}
