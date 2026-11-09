import { ZONEN_NAMEN } from '../domain/katalog'
import { seiteAusZonen } from '../domain/logik'
import type { KopfZone, Stufe3 } from '../domain/types'

interface Bereich {
  zone: KopfZone
  /** Sichtbare Fläche, wird auf die Kopfform zugeschnitten. */
  form: string
  /** Tap-Fläche, mindestens 44×44 pt und unabhängig von der Kopfform. */
  tap: [number, number, number, number]
}

const KOPF_VORNE =
  'M100 8C142 8 172 38 176 84C178 104 176 120 172 136C170 156 162 180 148 204C136 226 118 244 100 244C82 244 64 226 52 204C38 180 30 156 28 136C24 120 22 104 24 84C28 38 58 8 100 8Z'

// Die rechte Kopfhälfte erscheint von vorne links (Blick auf das Gesicht).
const VORNE: Bereich[] = [
  { zone: 'scheitel', form: 'M0 0H200V62Q100 38 0 62Z', tap: [24, 0, 152, 54] },
  { zone: 'stirn-r', form: 'M0 62Q40 52 80 50L70 99Q34 102 0 112Z', tap: [8, 54, 62, 52] },
  { zone: 'stirn-m', form: 'M80 50Q100 49 120 50L130 99Q100 96 70 99Z', tap: [70, 54, 60, 52] },
  { zone: 'stirn-l', form: 'M120 50Q160 52 200 62V112Q166 102 130 99Z', tap: [130, 54, 62, 52] },
  { zone: 'schlaefe-r', form: 'M0 112Q26 104 52 101V155Q26 156 0 158Z', tap: [0, 106, 50, 50] },
  { zone: 'auge-r', form: 'M52 101Q76 98 100 97V151Q76 152 52 155Z', tap: [50, 106, 50, 50] },
  { zone: 'auge-l', form: 'M100 97Q124 98 148 101V155Q124 152 100 151Z', tap: [100, 106, 50, 50] },
  { zone: 'schlaefe-l', form: 'M148 101Q174 104 200 112V158Q174 156 148 155Z', tap: [150, 106, 50, 50] },
]

const KOPF_HINTEN =
  'M75 4C110 4 134 32 136 72C137 96 128 116 114 128C106 135 102 142 103 152C104 164 118 172 146 180V190H4V180C32 172 46 164 47 152C48 142 44 135 36 128C22 116 13 96 14 72C16 32 40 4 75 4Z'

// Von hinten liegt die linke Kopfhälfte auch links.
const HINTEN: Bereich[] = [
  { zone: 'scheitel', form: 'M0 0H150V50Q75 34 0 50Z', tap: [14, 0, 122, 46] },
  { zone: 'hinterkopf-l', form: 'M0 50Q38 42 75 42V132H0Z', tap: [0, 46, 75, 86] },
  { zone: 'hinterkopf-r', form: 'M75 42Q112 42 150 50V132H75Z', tap: [75, 46, 75, 86] },
  { zone: 'nacken-l', form: 'M30 132H75V172H42Q34 170 30 164Z', tap: [0, 132, 75, 56] },
  { zone: 'nacken-r', form: 'M75 132H120V164Q116 170 108 172H75Z', tap: [75, 132, 75, 56] },
]

function Ansicht({ id, breite, hoehe, kopf, bereiche, zonen, stufe, onZone, zeichnung, seiten, titel }: {
  id: string
  breite: number
  hoehe: number
  kopf: string
  bereiche: Bereich[]
  zonen: KopfZone[]
  stufe: Stufe3
  onZone: (z: KopfZone) => void
  zeichnung?: React.ReactNode
  seiten: [string, string]
  titel: string
}) {
  return (
    <figure className="kopfkarte__ansicht" style={{ width: breite }}>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} width={breite} height={hoehe} role="group" aria-label={titel}>
        <defs>
          <clipPath id={`kopf-${id}`}><path d={kopf} /></clipPath>
        </defs>
        <g clipPath={`url(#kopf-${id})`}>
          <path d={kopf} className="kopf__grund" />
          {bereiche.map((b) => (
            <path
              key={b.zone}
              d={b.form}
              className={`kopf__zone ${zonen.includes(b.zone) ? `kopf__zone--aktiv s${stufe}` : ''}`}
            />
          ))}
        </g>
        <path d={kopf} className="kopf__umriss" />
        {zeichnung}
        {bereiche.map((b) => (
          <rect
            key={b.zone}
            x={b.tap[0]}
            y={b.tap[1]}
            width={b.tap[2]}
            height={b.tap[3]}
            className="kopf__tap"
            role="button"
            tabIndex={0}
            aria-label={ZONEN_NAMEN[b.zone]}
            aria-pressed={zonen.includes(b.zone)}
            data-zone={b.zone}
            onClick={() => onZone(b.zone)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onZone(b.zone)
              }
            }}
          />
        ))}
      </svg>
      <figcaption>
        <span>{seiten[0]}</span>
        <span>{titel}</span>
        <span>{seiten[1]}</span>
      </figcaption>
    </figure>
  )
}

// Ruhige Zeichnung wie auf einer anatomischen Tafel, mit Teilstrichen an den Zonengrenzen.
const GESICHT = (
  <g className="kopf__gesicht" aria-hidden>
    <path d="M176 108C186 104 190 116 187 130C185 144 178 150 172 146" />
    <path d="M24 108C14 104 10 116 13 130C15 144 22 150 28 146" />
    <path d="M72 232L68 256M128 232L132 256" />
    <path d="M62 122Q76 116 90 121M110 121Q124 116 138 122" />
    <path d="M66 135Q76 139 86 135M114 135Q124 139 134 135" />
    <path d="M97 142L94 176Q94 182 102 182Q106 182 108 180" />
    <path d="M86 207Q100 209 114 207" />
    <path d="M94 216Q100 218 106 216" />
    <path className="kopf__mass" d="M0 62h6M0 112h6M0 158h6M194 62h6M194 112h6M194 158h6M100 0v6M100 248v8" />
  </g>
)

const NACKEN = (
  <g className="kopf__gesicht" aria-hidden>
    <path d="M60 136Q75 142 90 136" />
    <path className="kopf__mass" d="M0 50h6M0 132h6M144 50h6M144 132h6M75 0v2" />
  </g>
)

/** Dieselbe Tafel als Auswertung: Je kräftiger die Fläche, desto häufiger tat es dort weh. */
function HeatAnsicht({ id, breite, hoehe, kopf, bereiche, zeichnung, seiten, titel, haeufigkeit, max }: {
  id: string; breite: number; hoehe: number; kopf: string; bereiche: Bereich[]; zeichnung: React.ReactNode
  seiten: [string, string]; titel: string; haeufigkeit: Partial<Record<KopfZone, number>>; max: number
}) {
  return (
    <figure className="kopfkarte__ansicht" style={{ width: breite }}>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} width={breite} height={hoehe} aria-hidden>
        <defs><clipPath id={`heat-${id}`}><path d={kopf} /></clipPath></defs>
        <g clipPath={`url(#heat-${id})`}>
          <path d={kopf} className="kopf__grund" />
          {bereiche.map((b) => {
            const n = haeufigkeit[b.zone] ?? 0
            return (
              <path
                key={b.zone}
                d={b.form}
                className={n > 0 ? 'kopf__heat' : 'kopf__zone'}
                style={n > 0 ? { fillOpacity: 0.2 + (0.8 * n) / max } : undefined}
              />
            )
          })}
        </g>
        <path d={kopf} className="kopf__umriss" />
        {zeichnung}
      </svg>
      <figcaption><span>{seiten[0]}</span><span>{titel}</span><span>{seiten[1]}</span></figcaption>
    </figure>
  )
}

export function KopfHeatmap({ haeufigkeit }: { haeufigkeit: Partial<Record<KopfZone, number>> }) {
  const eintraege = (Object.entries(haeufigkeit) as [KopfZone, number][]).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...eintraege.map(([, n]) => n))
  return (
    <div className="kopfkarte">
      <div className="kopfkarte__ansichten">
        <HeatAnsicht id="vorne" breite={200} hoehe={256} kopf={KOPF_VORNE} bereiche={VORNE} zeichnung={GESICHT} seiten={['R', 'L']} titel="Vorne" haeufigkeit={haeufigkeit} max={max} />
        <HeatAnsicht id="hinten" breite={150} hoehe={190} kopf={KOPF_HINTEN} bereiche={HINTEN} zeichnung={NACKEN} seiten={['L', 'R']} titel="Hinten" haeufigkeit={haeufigkeit} max={max} />
      </div>
      <p className="leise">{eintraege.slice(0, 4).map(([z, n]) => `${ZONEN_NAMEN[z]} ${n}×`).join(', ')}</p>
    </div>
  )
}

const SEITE_TEXT = { links: 'Einseitig links', rechts: 'Einseitig rechts', beidseitig: 'Beidseitig' }

export function KopfKarte({ zonen, stufe, onWechsel }: {
  zonen: KopfZone[]; stufe?: Stufe3; onWechsel: (z: KopfZone[]) => void
}) {
  const umschalten = (z: KopfZone) =>
    onWechsel(zonen.includes(z) ? zonen.filter((x) => x !== z) : [...zonen, z])
  const seite = seiteAusZonen(zonen)
  const s = stufe ?? 2

  return (
    <div className="kopfkarte">
      <div className="kopfkarte__ansichten">
        <Ansicht id="vorne" breite={200} hoehe={256} kopf={KOPF_VORNE} bereiche={VORNE} zonen={zonen} stufe={s} onZone={umschalten} zeichnung={GESICHT} seiten={['R', 'L']} titel="Vorne" />
        <Ansicht id="hinten" breite={150} hoehe={190} kopf={KOPF_HINTEN} bereiche={HINTEN} zonen={zonen} stufe={s} onZone={umschalten} zeichnung={NACKEN} seiten={['L', 'R']} titel="Hinten" />
      </div>
      <p className="kopfkarte__status" aria-live="polite">
        {zonen.length === 0
          ? 'Wo tut es weh? Mehrere Stellen möglich.'
          : `${SEITE_TEXT[seite!]}: ${zonen.map((z) => ZONEN_NAMEN[z]).join(', ')}`}
      </p>
    </div>
  )
}
