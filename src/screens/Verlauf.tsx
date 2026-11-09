import { useState } from 'react'
import { addMonat, formatDatum, logischerTag, monatName, parseDatum, wochentag } from '../domain/datum'
import type { GarminTag } from '../domain/externe'
import { aktiveEpisoden, garminVorschlag, istErfasst } from '../domain/logik'
import { STAERKEN } from '../domain/katalog'
import type { Datum, Krankheit, TagesEintrag } from '../domain/types'
import { AbendCheckin, MorgenCheckin, ZusatzBereich } from './Heute'

interface Props {
  eintraege: TagesEintrag[]
  krankheiten: Krankheit[]
  garmin: Map<Datum, GarminTag>
  jetzt: Date
  tag: Datum | null
  onTag: (d: Datum | null) => void
  onKopfweh: (datum: Datum, id?: string) => void
  onKrankheit: (datum: Datum, id?: string) => void
}

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function staerkeDesTages(t?: TagesEintrag): number {
  return Math.max(0, ...aktiveEpisoden(t).map((e) => e.staerkeMax ?? e.staerke ?? 1))
}

function TagBearbeiten({ datum, eintraege, krankheiten, garmin, onZurueck, onKopfweh, onKrankheit }: {
  datum: Datum
  garmin?: GarminTag
  eintraege: TagesEintrag[]
  krankheiten: Krankheit[]
  onZurueck: () => void
  onKopfweh: Props['onKopfweh']
  onKrankheit: Props['onKrankheit']
}) {
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const tag = nachDatum.get(datum)
  const vortagDatum = parseDatum(datum)
  vortagDatum.setDate(vortagDatum.getDate() - 1)
  const vortag = eintraege.find((t) => parseDatum(t.datum).getTime() === vortagDatum.getTime())

  return (
    <main className="seite">
      <button className="textknopf" onClick={onZurueck}>Zurück zum Kalender</button>
      <header>
        <h1>{wochentag(datum)}</h1>
        <p className="leise leise--zahl">{formatDatum(datum)}</p>
      </header>
      {tag?.quelle === 'nachgetragen-wie-ueblich' && (
        <p className="hinweis">Mit «wie üblich» nachgetragen</p>
      )}
      <section className="checkin" aria-label="Morgen">
        <h2>Morgen</h2>
        <MorgenCheckin datum={datum} tag={tag} vortag={vortag} v={{}} alkoholFragen rueckblick />
      </section>
      <section className="checkin" aria-label="Abend">
        <h2>Abend</h2>
        <AbendCheckin datum={datum} tag={tag} v={{ koerperBelastung: garminVorschlag(garmin) }} onKopfweh={onKopfweh} rueckblick />
      </section>
      <ZusatzBereich datum={datum} tag={tag} eintraege={eintraege} krankheiten={krankheiten} onKrankheit={onKrankheit} rueckblick />
    </main>
  )
}

export function Verlauf({ eintraege, krankheiten, garmin, jetzt, tag, onTag, onKopfweh, onKrankheit }: Props) {
  const heute = logischerTag(jetzt)
  const [monat, setMonat] = useState((tag ?? heute).slice(0, 7))

  if (tag) {
    return (
      <TagBearbeiten
        key={tag}
        datum={tag}
        eintraege={eintraege}
        krankheiten={krankheiten}
        garmin={garmin.get(tag)}
        onZurueck={() => onTag(null)}
        onKopfweh={onKopfweh}
        onKrankheit={onKrankheit}
      />
    )
  }

  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const [jahr, mon] = monat.split('-').map(Number)
  const anzahlTage = new Date(jahr, mon, 0).getDate()
  const versatz = (new Date(jahr, mon - 1, 1).getDay() + 6) % 7
  const tage = Array.from({ length: anzahlTage }, (_, i) => `${monat}-${String(i + 1).padStart(2, '0')}`)

  const imMonat = tage.map((d) => nachDatum.get(d))
  const erfasst = imMonat.filter(istErfasst).length
  const mitKopfweh = imMonat.filter((t) => staerkeDesTages(t) > 0).length

  return (
    <main className="seite">
      <div className="kalender__kopf">
        <button className="knopf kalender__nav" aria-label="Voriger Monat" onClick={() => setMonat(addMonat(monat, -1))}>‹</button>
        <h1>{monatName(monat)}</h1>
        <button className="knopf kalender__nav" aria-label="Nächster Monat" disabled={monat >= heute.slice(0, 7)} onClick={() => setMonat(addMonat(monat, 1))}>›</button>
      </div>

      <div className="kalender">
        {WOCHENTAGE.map((w) => <span key={w} className="kalender__wt" aria-hidden>{w}</span>)}
        {Array.from({ length: versatz }, (_, i) => <span key={`l${i}`} aria-hidden />)}
        {tage.map((d) => {
          const eintrag = nachDatum.get(d)
          const stufe = staerkeDesTages(eintrag)
          const status = stufe > 0
            ? `Kopfweh ${STAERKEN[stufe - 1].label}`
            : istErfasst(eintrag) ? 'erfasst' : 'kein Eintrag'
          const klasse = stufe > 0 ? `kal--s${stufe}` : istErfasst(eintrag) ? 'kal--ohne' : 'kal--leer'
          return (
            <button
              key={d}
              className={`kal ${klasse} ${d === heute ? 'kal--heute' : ''}`}
              disabled={d > heute}
              aria-label={`${wochentag(d)}, ${formatDatum(d)}: ${status}`}
              onClick={() => onTag(d)}
            >
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>

      <div className="legende" aria-hidden>
        <span><i className="kal--leer" />Kein Eintrag</span>
        <span><i className="kal--ohne" />Erfasst</span>
        <span><i className="kal--s1" />Leicht</span>
        <span><i className="kal--s2" />Mittel</span>
        <span><i className="kal--s3" />Stark</span>
      </div>

      <p className="leise">
        {erfasst} {erfasst === 1 ? 'Tag' : 'Tage'} erfasst, davon {mitKopfweh} mit Kopfweh
      </p>
    </main>
  )
}
