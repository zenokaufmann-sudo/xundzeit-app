import type { Datum } from '../domain/types'

const R = 19
const UMFANG = 2 * Math.PI * R
const LUECKE = 3
const SEGMENT = UMFANG / 7 - LUECKE

export function Wochenring({ woche }: { woche: { tag: Datum; erfasst: boolean }[] }) {
  const anzahl = woche.filter((w) => w.erfasst).length
  return (
    <div className="ring" role="img" aria-label={`Diese Woche ${anzahl} von 7 Tagen erfasst`}>
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden>
        {woche.map((w, i) => (
          <circle
            key={w.tag}
            cx="24"
            cy="24"
            r={R}
            fill="none"
            strokeWidth="4"
            className={w.erfasst ? 'ring__voll' : 'ring__leer'}
            strokeDasharray={`${SEGMENT} ${UMFANG - SEGMENT}`}
            strokeDashoffset={-(i * (UMFANG / 7)) - LUECKE / 2}
            transform="rotate(-90 24 24)"
          />
        ))}
      </svg>
      <span aria-hidden>{anzahl}/7</span>
    </div>
  )
}
