import { useEffect, useMemo, useState } from 'react'
import {
  kennzahlen, kopfwehAm, MINDEST_TAGE, neuerReport, proPeriode, staerkeAm, tageszeiten, vergleich, wirksamkeit,
  zeitraum, zeitreihen, zonenHaeufigkeit, type FaktorErgebnis, type Reihe, type ZeitraumId,
} from '../analysis/auswertung'
import beispielReport from '../../daten-vorlage/beispiele/reports/2026-W45.json'
import { db } from '../db/db'
import { addMonat, formatDatum, logischerTag, monatName, wochentag } from '../domain/datum'
import type { GarminTag, ReportZeile, WochenReport } from '../domain/externe'
import { KOERPER_BELASTUNG, STAERKEN } from '../domain/katalog'
import { garminVorschlag, istErfasst, schmerzmittelTage, uebergebrauchStufe } from '../domain/logik'
import type { Datum, Krankheit, TagesEintrag } from '../domain/types'
import { EineAuswahl } from '../ui/bausteine'
import { RisikoListe, SaeulenReihe, Zeitreihen, type RisikoZeile } from '../ui/Diagramme'
import { KopfHeatmap } from '../ui/KopfKarte'

const BEISPIEL = beispielReport as unknown as WochenReport

const ZEITRAEUME: { wert: ZeitraumId; label: string }[] = [
  { wert: '30', label: '30 Tage' },
  { wert: '90', label: '90 Tage' },
  { wert: 'alle', label: 'Alles' },
]

const tageText = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`

function risikoZeile(f: FaktorErgebnis): RisikoZeile {
  const zaehlung = `Mit: ${f.kMit} von ${f.nMit} Tagen, ohne: ${f.kOhne} von ${f.nOhne}`
  if (f.status === 'zu-wenig') {
    return { id: f.id, titel: f.titel, risiko: null, zuWenig: true, wertText: '', detail: `${tageText(f.nMit)} mit, ${tageText(f.nOhne)} ohne. Nötig sind je ${MINDEST_TAGE}` }
  }
  if (f.status === 'kein-kopfweh') {
    return { id: f.id, titel: f.titel, risiko: null, zuWenig: false, wertText: 'gleich', detail: `In beiden Gruppen kein Kopfweh (${f.nMit} und ${f.nOhne} Tage)` }
  }
  if (f.status === 'nur-mit') {
    return { id: f.id, titel: f.titel, risiko: null, zuWenig: false, wertText: 'nur mit', detail: `${zaehlung}. Noch nicht berechenbar` }
  }
  return {
    id: f.id, titel: f.titel, risiko: f.risiko, zuWenig: false, unsicher: f.unsicher,
    wertText: `×${f.risiko!.toFixed(1)}`,
    detail: f.unsicher ? `${zaehlung}. Noch unsicher` : zaehlung,
  }
}

function Uebergebrauch({ eintraege, jetzt }: { eintraege: TagesEintrag[]; jetzt: Date }) {
  const z = schmerzmittelTage(eintraege, jetzt)
  const stufe = uebergebrauchStufe(z)
  const text = `Schmerzmittel an ${tageText(z.monat)} in diesem Monat, an ${tageText(z.letzte30)} in den letzten 30 Tagen`
  if (stufe === 'keiner') return <p className="leise">{text}</p>
  return stufe === 'deutlich' ? (
    <p className="hinweis hinweis--deutlich"><strong>{text}.</strong> Ab 15 Tagen pro Monat können einfache Schmerzmittel selbst Kopfweh auslösen. Schau das bitte ärztlich an.</p>
  ) : (
    <p className="hinweis">{text}. Behalte das im Auge.</p>
  )
}

type Overlay = 'alkohol' | 'sport' | 'druck'

const OVERLAYS: { wert: Overlay; label: string; text: string }[] = [
  { wert: 'alkohol', label: 'Alkohol', text: 'Strich: Alkohol getrunken' },
  { wert: 'sport', label: 'Sport', text: 'Strich: harter Sporttag' },
  { wert: 'druck', label: 'Luftdruck', text: 'Strich: Druckabfall über 5 hPa in 24 h' },
]

function KalenderHeatmap({ eintraege, garmin, heute }: { eintraege: TagesEintrag[]; garmin: Map<Datum, GarminTag>; heute: Datum }) {
  const [monat, setMonat] = useState(heute.slice(0, 7))
  const [overlay, setOverlay] = useState<Overlay>('alkohol')
  const [gewaehlt, setGewaehlt] = useState<Datum | null>(null)
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const [jahr, mon] = monat.split('-').map(Number)
  const versatz = (new Date(jahr, mon - 1, 1).getDay() + 6) % 7
  const tage = Array.from({ length: new Date(jahr, mon, 0).getDate() }, (_, i) => `${monat}-${String(i + 1).padStart(2, '0')}`)

  const sportStufe = (d: Datum) => nachDatum.get(d)?.koerperBelastung?.stufe ?? garminVorschlag(garmin.get(d))?.stufe
  const markiert = (d: Datum) => {
    const t = nachDatum.get(d)
    if (overlay === 'alkohol') return t?.alkohol?.ja === true
    if (overlay === 'sport') return (sportStufe(d) ?? 0) >= 4
    return (t?.kontext?.wetter?.delta24h ?? 0) < -5
  }

  const detail = (d: Datum) => {
    const t = nachDatum.get(d)
    const s = staerkeAm(t)
    const teile = [s === null ? 'Kopfweh nicht erfasst' : s === 0 ? 'Kein Kopfweh' : `Kopfweh ${STAERKEN[s - 1].label.toLowerCase()}`]
    if (t?.alkohol) teile.push(t.alkohol.ja ? `Alkohol ${t.alkohol.getraenke ?? 'ja'}` : 'kein Alkohol')
    const stufe = sportStufe(d)
    if (stufe) teile.push(KOERPER_BELASTUNG[stufe])
    const w = t?.kontext?.wetter
    if (w) teile.push(`Druck ${w.delta24h > 0 ? '+' : ''}${w.delta24h.toFixed(1)} hPa`)
    return `${wochentag(d)}, ${formatDatum(d)}: ${teile.join(', ')}`
  }

  return (
    <section className="protokoll" aria-label="Kalender">
      <div className="kalender__kopf">
        <button className="knopf kalender__nav" aria-label="Voriger Monat" onClick={() => { setMonat(addMonat(monat, -1)); setGewaehlt(null) }}>‹</button>
        <h2>{monatName(monat)}</h2>
        <button className="knopf kalender__nav" aria-label="Nächster Monat" disabled={monat >= heute.slice(0, 7)} onClick={() => { setMonat(addMonat(monat, 1)); setGewaehlt(null) }}>›</button>
      </div>
      <div className="block">
        <EineAuswahl optionen={OVERLAYS} wert={overlay} onWahl={setOverlay} />
        <div className="kalender">
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => <span key={w} className="kalender__wt" aria-hidden>{w}</span>)}
          {Array.from({ length: versatz }, (_, i) => <span key={`l${i}`} aria-hidden />)}
          {tage.map((d) => {
            const t = nachDatum.get(d)
            const s = staerkeAm(t)
            const klasse = s ? `kal--s${s}` : s === 0 || istErfasst(t) ? 'kal--ohne' : 'kal--leer'
            return (
              <button
                key={d}
                className={`kal ${klasse}`}
                disabled={d > heute}
                aria-pressed={gewaehlt === d}
                aria-label={detail(d)}
                onClick={() => setGewaehlt(gewaehlt === d ? null : d)}
              >
                {Number(d.slice(8))}
                {markiert(d) && <i className="kal__marke" />}
              </button>
            )
          })}
        </div>
        <p className="leise" aria-live="polite">{gewaehlt ? detail(gewaehlt) : OVERLAYS.find((o) => o.wert === overlay)?.text}</p>
      </div>
    </section>
  )
}

function MeineDaten({ eintraege, krankheiten, garmin, jetzt }: {
  eintraege: TagesEintrag[]; krankheiten: Krankheit[]; garmin: Map<Datum, GarminTag>; jetzt: Date
}) {
  const heute = logischerTag(jetzt)
  const [id, setId] = useState<ZeitraumId>('90')
  const echteGarmin = useMemo(() => new Map([...garmin].filter(([, g]) => !g.beispiel)), [garmin])
  const { von, bis } = zeitraum(id, eintraege, heute)

  const k = kennzahlen(eintraege, von, bis)
  const perioden = proPeriode(eintraege, von, bis)
  const faktoren = useMemo(() => vergleich(eintraege, echteGarmin, krankheiten, von, bis), [eintraege, echteGarmin, krankheiten, von, bis])
  const reihen = useMemo(() => zeitreihen(eintraege, echteGarmin, von, bis), [eintraege, echteGarmin, von, bis])
  const tageszeit = tageszeiten(eintraege, von, bis)
  const zonen = zonenHaeufigkeit(eintraege, von, bis)
  const mittel = wirksamkeit(eintraege, von, bis)
  const episodenTotal = tageszeit.reduce((s, z) => s + z.anzahl, 0)

  return (
    <>
      <EineAuswahl optionen={ZEITRAEUME} wert={id} onWahl={setId} />

      <section className="stapel stapel--eng" aria-label="Kennzahlen">
        <div className="kennzahl kennzahl--haupt">
          <span>Kopfweh-Tage</span>
          <strong>{k.kopfwehTage}</strong>
          <small>
            von {tageText(k.beobachtet)} mit Angabe
            {k.proWoche !== null && `, rund ${k.proWoche.toFixed(1)} pro Woche und ${k.proMonat!.toFixed(0)} pro Monat`}
          </small>
        </div>
        <SaeulenReihe
          spalten={perioden.perioden.map((p) => ({
            key: p.key,
            label: p.label,
            wert: p.beobachtet === 0 ? null : p.kopfweh,
            aria: `${perioden.art === 'woche' ? 'Woche' : 'Monat'} ${p.label}: ${p.beobachtet === 0 ? 'nicht erfasst' : tageText(p.kopfweh)}`,
          }))}
        />
        <p className="leise leise--zahl">{perioden.art === 'woche' ? 'Tage mit Kopfweh pro Kalenderwoche' : 'Tage mit Kopfweh pro Monat'}</p>
        <div className="kennzahlen">
          <div className="kennzahl">
            <span>Ø Stärke</span>
            <strong>{k.staerkeMittel === null ? '–' : k.staerkeMittel.toFixed(1)}</strong>
            <small>von 3</small>
          </div>
          <div className="kennzahl">
            <span>Medikamenten-Tage</span>
            <strong>{k.medikamentenTage}</strong>
            <small>im Zeitraum</small>
          </div>
        </div>
        <Uebergebrauch eintraege={eintraege} jetzt={jetzt} />
      </section>

      <section className="protokoll" aria-label="Auslöser-Vergleich">
        <div>
          <h2>Auslöser-Vergleich</h2>
          <p className="leise">Wie oft Kopfweh an Tagen mit dem Faktor, verglichen mit Tagen ohne ihn. Ein Zusammenhang ist noch keine Ursache</p>
        </div>
        <RisikoListe zeilen={faktoren.map(risikoZeile)} />
      </section>

      <section className="protokoll" aria-label="Zeitreihen">
        <h2>Verlauf übereinander</h2>
        <Zeitreihen tage={reihen.tage} reihen={reihen.reihen} />
      </section>

      <KalenderHeatmap eintraege={eintraege} garmin={echteGarmin} heute={heute} />

      <section className="protokoll" aria-label="Tageszeit">
        <h2>Wann es beginnt</h2>
        {episodenTotal === 0 ? <p className="leise">Noch keine Episoden in diesem Zeitraum</p> : (
          <SaeulenReihe
            spalten={tageszeit.map((z) => ({
              key: z.phase.wert,
              label: <>{z.phase.kurz}<br />{z.phase.zeit}</>,
              wert: z.anzahl,
              aria: `${z.phase.name}, ${z.phase.zeit} Uhr: ${z.anzahl}`,
            }))}
          />
        )}
      </section>

      <section className="protokoll" aria-label="Kopf-Karte">
        <h2>Wo es weh tut</h2>
        {Object.keys(zonen).length === 0 ? <p className="leise">Noch keine Stellen erfasst</p> : <KopfHeatmap haeufigkeit={zonen} />}
      </section>

      <section className="protokoll" aria-label="Wirksamkeit">
        <h2>Was hilft</h2>
        {mittel.length === 0 ? <p className="leise">Noch keine Medikamente in diesem Zeitraum</p> : mittel.map((m) => {
          const genug = m.mitWirkung >= MINDEST_TAGE
          return (
            <div className="risiko" key={m.name}>
              <div className="risiko__kopf"><span>{m.name}</span><strong>{genug ? `${Math.round((m.gut / m.mitWirkung) * 100)} %` : ''}</strong></div>
              {genug && <div className="anteil" aria-hidden><i style={{ width: `${(m.gut / m.mitWirkung) * 100}%` }} /></div>}
              <small>
                {genug ? `Deutlich besser oder schmerzfrei: ${m.gut} von ${m.mitWirkung} Einnahmen` : `Zu wenig Daten: ${m.mitWirkung} von ${MINDEST_TAGE} nötigen Einnahmen mit Wirkung`}
              </small>
            </div>
          )
        })}
      </section>
    </>
  )
}

function reiheAusReport(z: WochenReport['zeitreihen'][number], tage: Datum[]): Reihe {
  const werte = new Map(z.punkte.map((p) => [p.datum, p.wert]))
  return { id: z.id, titel: z.titel, einheit: z.einheit, werte: tage.map((d) => werte.get(d) ?? null) }
}

function reportZeile(k: WochenReport['korrelationen'][number]): RisikoZeile {
  const zuWenig = k.risiko === null || k.einschaetzung === 'zu-wenig-daten'
  return {
    id: k.faktor,
    titel: k.titel,
    risiko: k.risiko,
    zuWenig,
    unsicher: k.einschaetzung === 'schwach',
    wertText: k.risiko === null ? '' : `×${k.risiko.toFixed(1)}`,
    detail: k.kommentar ?? `${tageText(k.nMit)} mit, ${tageText(k.nOhne)} ohne`,
  }
}

const qualitaet = (n: number) => (n >= 6 ? 'hoch' : n >= 4 ? 'mittel' : 'tief')

function ReportAnsicht({ reports, neu }: { reports: ReportZeile[]; neu?: string }) {
  const echte = reports.filter((r) => !r.daten.beispiel).map((r) => r.daten).sort((a, b) => (a.woche < b.woche ? 1 : -1))
  const liste = echte.length > 0 ? echte : [BEISPIEL]
  const [woche, setWoche] = useState(liste[0].woche)
  const r = liste.find((x) => x.woche === woche) ?? liste[0]
  const istBeispiel = echte.length === 0

  const tage = [...new Set((r.zeitreihen ?? []).flatMap((z) => z.punkte.map((p) => p.datum)))].sort()
  const reihen = (r.zeitreihen ?? []).map((z) => reiheAusReport(z, tage))
  const qualitaetText = `Report-Qualität: ${qualitaet(r.erfassteTage)}, ${r.erfassteTage}/7 Tage`

  return (
    <>
      {istBeispiel && <p className="hinweis" data-testid="beispiel-hinweis">Beispiel mit erfundenen Daten. Dein erster echter Report erscheint hier am Sonntag</p>}
      <header>
        <div className="report__titel">
          <h2>Woche {Number(r.woche.split('-W')[1])}</h2>
          {neu === r.woche && <span className="marke">Neu</span>}
        </div>
        <p className="leise leise--zahl">{formatDatum(r.zeitraum.von)} bis {formatDatum(r.zeitraum.bis)}</p>
        <p className="leise">{qualitaetText}</p>
      </header>

      <section className="protokoll" aria-label="Kernaussagen">
        <h2>Kernaussagen</h2>
        <ul className="aussagen">{(r.kernaussagen ?? []).map((a) => <li key={a}>{a}</li>)}</ul>
      </section>

      {reihen.length > 0 && (
        <section className="protokoll" aria-label="Report-Zeitreihen">
          <h2>Die Woche im Verlauf</h2>
          <Zeitreihen tage={tage} reihen={reihen} />
        </section>
      )}

      {(r.korrelationen?.length ?? 0) > 0 && (
        <section className="protokoll" aria-label="Report-Zusammenhänge">
          <h2>Zusammenhänge</h2>
          <RisikoListe zeilen={r.korrelationen.map(reportZeile)} />
        </section>
      )}

      {liste.length > 1 && (
        <section className="protokoll" aria-label="Archiv">
          <h2>Frühere Wochen</h2>
          <ul className="liste">
            {liste.map((x) => (
              <li key={x.woche}>
                <button className="zeile" aria-current={x.woche === r.woche ? 'true' : undefined} onClick={() => setWoche(x.woche)}>
                  <span className="zeile__text">
                    <strong>Woche {Number(x.woche.split('-W')[1])}</strong>
                    <small>{formatDatum(x.zeitraum.von)} bis {formatDatum(x.zeitraum.bis)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export function Analyse({ eintraege, krankheiten, garmin, reports, reportGesehen, jetzt }: {
  eintraege: TagesEintrag[]
  krankheiten: Krankheit[]
  garmin: Map<Datum, GarminTag>
  reports: ReportZeile[]
  reportGesehen: string | null
  jetzt: Date
}) {
  // Beim Öffnen festgehalten, damit «Neu» sichtbar bleibt, auch wenn der Report sofort als gesehen gilt.
  const [neu] = useState(() => neuerReport(reports, reportGesehen))
  const [ansicht, setAnsicht] = useState<'daten' | 'report'>(neu ? 'report' : 'daten')
  const offen = neuerReport(reports, reportGesehen)

  useEffect(() => {
    if (ansicht === 'report' && offen) void db.settings.put({ key: 'reportGesehen', wert: offen })
  }, [ansicht, offen])

  const erfasst = eintraege.filter((t) => kopfwehAm(t) !== undefined).length

  return (
    <main className="seite">
      <div className="kopfzeile">
        <h1>Analyse</h1>
        <span className="leise">{erfasst} {erfasst === 1 ? 'Tag' : 'Tage'} erfasst</span>
      </div>
      <div className="umschalter" role="group" aria-label="Ansicht">
        <button aria-pressed={ansicht === 'daten'} onClick={() => setAnsicht('daten')}>Meine Daten</button>
        <button aria-pressed={ansicht === 'report'} onClick={() => setAnsicht('report')}>
          Wochenreport{offen && <i className="punkt-neu" aria-label="neu" />}
        </button>
      </div>
      {ansicht === 'daten'
        ? <MeineDaten eintraege={eintraege} krankheiten={krankheiten} garmin={garmin} jetzt={jetzt} />
        : <ReportAnsicht reports={reports} neu={neu} />}
    </main>
  )
}
