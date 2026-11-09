import { useRef, useState } from 'react'
import { aendereEpisode, loescheEpisode, neueEpisode } from '../db/repo'
import {
  ausEingabe, dauerMinuten, formatDatum, formatDauer, formatZeit, isoLokal, logischerTag, parseDatum,
  tageszeit, zuEingabe,
} from '../domain/datum'
import {
  PHASEN, SCHMERZARTEN, STAERKEN, SYMPTOME, URSACHEN, WIRKUNGEN, type MedikamentDef,
} from '../domain/katalog'
import {
  aktiveEpisoden, einstufung, phasenText, schmerzmittelTage, seiteAusZonen, uebergebrauchStufe, zeitenAusPhasen,
} from '../domain/logik'
import type { Datum, KopfwehEpisode, MedikamentEinnahme, Stufe3, TagesEintrag, Tagesphase } from '../domain/types'
import { Chip, EineAuswahl, Frage, JaNein, MehrereAuswahl } from '../ui/bausteine'
import { KopfKarte } from '../ui/KopfKarte'
import { useEinstellungen } from '../ui/einstellungen'
import { Zeitleiste } from '../ui/Zeitleiste'

const PHASEN_OPTIONEN = PHASEN.map((p) => ({
  wert: p.wert, aria: `${p.name}, ${p.zeit} Uhr`, kurz: p.kurz, zeit: p.zeit,
}))

export interface Erfassung {
  id?: string
  datum?: Datum
  zurueck: 'heute' | 'kopfweh' | 'verlauf' | 'analyse' | 'einstellungen'
}

interface Props {
  eintraege: TagesEintrag[]
  jetzt: Date
  erfassung: Erfassung | null
  onOeffnen: (e: Erfassung) => void
  onSchliessen: () => void
}

function Uebergebrauch({ eintraege, jetzt }: { eintraege: TagesEintrag[]; jetzt: Date }) {
  const zaehler = schmerzmittelTage(eintraege, jetzt)
  const stufe = uebergebrauchStufe(zaehler)
  if (stufe === 'keiner') return null
  const text = `Schmerzmittel an ${zaehler.monat} Tagen in diesem Monat, an ${zaehler.letzte30} in den letzten 30 Tagen.`
  return stufe === 'deutlich' ? (
    <p className="hinweis hinweis--deutlich">
      <strong>{text}</strong> Ab 15 Tagen pro Monat können einfache Schmerzmittel selbst Kopfweh auslösen. Schau das bitte ärztlich an.
    </p>
  ) : (
    <p className="hinweis">{text} Behalte das im Auge.</p>
  )
}

function Einnahme({ m, def, onAendern, onEntfernen, jetzt }: {
  m: MedikamentEinnahme
  def?: MedikamentDef
  onAendern: (fn: (x: MedikamentEinnahme) => void) => void
  onEntfernen: () => void
  jetzt: Date
}) {
  const reif = dauerMinuten(m.zeit, jetzt) >= 120
  return (
    <div className="einnahme">
      <div className="einnahme__kopf">
        <strong>{m.name}</strong>
        <input
          type="datetime-local"
          aria-label={`Einnahmezeit ${m.name}`}
          value={zuEingabe(m.zeit)}
          onChange={(e) => e.target.value && onAendern((x) => { x.zeit = ausEingabe(e.target.value) })}
        />
        <button className="textknopf" aria-label={`${m.name} entfernen`} onClick={onEntfernen}>Entfernen</button>
      </div>
      {def && (
        <EineAuswahl
          optionen={def.dosen.map((d) => ({ wert: d, label: `${d} mg` }))}
          wert={m.dosisMg}
          onWahl={(d) => onAendern((x) => { x.dosisMg = d })}
        />
      )}
      {(reif || m.wirkung) && (
        <Frage titel="Wirkung nach ca. 2 h">
          <EineAuswahl optionen={WIRKUNGEN} wert={m.wirkung} onWahl={(w) => onAendern((x) => { x.wirkung = w })} />
        </Frage>
      )}
    </div>
  )
}

function ErfassungsMaske({ eintraege, jetzt, startId, startDatum, onSchliessen }: {
  eintraege: TagesEintrag[]; jetzt: Date; startId?: string; startDatum: Datum; onSchliessen: () => void
}) {
  const { medikamente: medikamentListe } = useEinstellungen()
  const [id, setId] = useState(startId)
  const [details, setDetails] = useState(Boolean(startId))
  const idRef = useRef(startId)
  const anlegen = useRef<Promise<string> | null>(null)

  const episode = eintraege.flatMap((t) => t.episoden).find((e) => e.id === id)

  const aendere = async (fn: (e: KopfwehEpisode) => void) => {
    if (!idRef.current) {
      anlegen.current ??= neueEpisode(
        startDatum === logischerTag(new Date()) ? {} : { beginn: isoLokal(parseDatum(startDatum)) },
      )
      idRef.current = await anlegen.current
      setId(idRef.current)
    }
    await aendereEpisode(idRef.current, fn)
  }

  const setzePhasen = (phasen: Tagesphase[]) => {
    const tag = episode ? logischerTag(new Date(episode.beginn)) : startDatum
    return aendere((e) => {
      e.phasen = phasen
      if (phasen.length > 0) Object.assign(e, zeitenAusPhasen(tag, phasen))
    })
  }

  const waehleMedikament = (def: MedikamentDef) => {
    if (episode?.medikamente.some((m) => m.name === def.name)) return
    void aendere((e) => {
      e.keinMedikament = false
      e.medikamente.push({
        id: crypto.randomUUID(),
        name: def.name,
        dosisMg: def.standard,
        zeit: isoLokal(new Date()),
      })
    })
  }

  const aendereEinnahme = (mid: string, fn: (m: MedikamentEinnahme) => void) =>
    aendere((e) => {
      const m = e.medikamente.find((x) => x.id === mid)
      if (m) fn(m)
    })

  const medikamente = episode?.medikamente ?? []
  const stufung = episode ? einstufung(episode) : undefined

  return (
    <>
      <main className="seite">
        <h1>{startId ? 'Episode bearbeiten' : 'Kopfweh erfassen'}</h1>

        <Frage titel="Wann?">
          <Zeitleiste label="Tageszeit" optionen={PHASEN_OPTIONEN} werte={episode?.phasen ?? []} onWechsel={setzePhasen} />
        </Frage>

        <KopfKarte
          zonen={episode?.zonen ?? []}
          stufe={episode?.staerke}
          onWechsel={(zonen) => aendere((e) => { e.zonen = zonen })}
        />

        <div className="staerken" role="group" aria-label="Stärke">
          {STAERKEN.map((s) => (
            <button
              key={s.wert}
              type="button"
              className={`staerke ${episode?.staerke === s.wert ? `staerke--aktiv s${s.wert}` : ''}`}
              aria-pressed={episode?.staerke === s.wert}
              onClick={() => aendere((e) => { e.staerke = s.wert as Stufe3 })}
            >
              <strong>{s.label}</strong>
              <small>{s.text}</small>
            </button>
          ))}
        </div>

        <Frage titel="Medikament">
          <div className="chips">
            <Chip
              aktiv={episode?.keinMedikament}
              onClick={() => aendere((e) => { e.keinMedikament = true; e.medikamente = [] })}
            >
              Keines
            </Chip>
            {medikamentListe.map((def) => (
              <Chip key={def.name} aktiv={medikamente.some((m) => m.name === def.name)} onClick={() => waehleMedikament(def)}>
                {def.name}
              </Chip>
            ))}
          </div>
        </Frage>

        {medikamente.map((m) => (
          <Einnahme
            key={m.id}
            m={m}
            jetzt={jetzt}
            def={medikamentListe.find((d) => d.name === m.name)}
            onAendern={(fn) => aendereEinnahme(m.id, fn)}
            onEntfernen={() => aendere((e) => { e.medikamente = e.medikamente.filter((x) => x.id !== m.id) })}
          />
        ))}
        {medikamente.length > 0 && (
          <button
            className="textknopf"
            onClick={() => {
              const letzte = medikamente[medikamente.length - 1]
              void aendere((e) => {
                e.medikamente.push({ ...letzte, id: crypto.randomUUID(), zeit: isoLokal(new Date()), wirkung: undefined })
              })
            }}
          >
            Weitere Einnahme
          </button>
        )}

        <Uebergebrauch eintraege={eintraege} jetzt={jetzt} />

        <button className="textknopf" aria-expanded={details} onClick={() => setDetails(!details)}>
          {details ? 'Details ausblenden' : 'Details ergänzen'}
        </button>

        {details && (
          <div className="stapel">
            <label className="feld">
              <span>Genauer Beginn{episode && !episode.phasen?.length && ` (${tageszeit(episode.beginn)})`}</span>
              <input
                type="datetime-local"
                value={zuEingabe(episode?.beginn ?? isoLokal(jetzt))}
                onChange={(e) => e.target.value && aendere((x) => { x.beginn = ausEingabe(e.target.value) })}
              />
            </label>

            <div className="feld">
              <span>
                Genaues Ende
                {episode?.ende && !episode.phasen?.length && ` (Dauer ${formatDauer(dauerMinuten(episode.beginn, episode.ende))})`}
              </span>
              <input
                type="datetime-local"
                aria-label="Genaues Ende"
                value={episode?.ende ? zuEingabe(episode.ende) : ''}
                onChange={(e) => {
                  const wert = e.target.value
                  void aendere((x) => {
                    x.ende = wert ? ausEingabe(wert) : undefined
                    if (wert) x.laeuft = false
                  })
                }}
              />
              <button
                className="textknopf"
                onClick={() => aendere((x) => {
                  x.laeuft = !x.laeuft
                  if (x.laeuft) x.ende = undefined
                })}
              >
                {episode?.laeuft ? 'Läuft nicht mehr' : 'Läuft gerade noch'}
              </button>
            </div>

            <Frage titel="Mit Kopfweh erwacht?" inline>
              <JaNein wert={episode?.erwachtMit} onWahl={(w) => aendere((e) => { e.erwachtMit = w })} />
            </Frage>

            <Frage titel="Maximale Stärke (falls anders)">
              <EineAuswahl
                optionen={STAERKEN.map((s) => ({ wert: s.wert, label: s.label }))}
                wert={episode?.staerkeMax}
                onWahl={(w) => aendere((e) => { e.staerkeMax = e.staerkeMax === w ? undefined : w })}
              />
            </Frage>

            <Frage titel="Schmerzart">
              <MehrereAuswahl optionen={SCHMERZARTEN} werte={episode?.schmerzart ?? []} onWechsel={(w) => aendere((e) => { e.schmerzart = w })} />
            </Frage>

            <Frage titel="Begleitsymptome">
              <MehrereAuswahl optionen={SYMPTOME} werte={episode?.symptome ?? []} onWechsel={(w) => aendere((e) => { e.symptome = w })} />
            </Frage>

            {stufung && (
              <p className="hinweis">
                Eher {stufung === 'migraeneartig' ? 'migräneartig' : 'Spannungstyp'}. Das ist ein Hinweis aus deinen Angaben, keine Diagnose.
              </p>
            )}

            <Frage titel="Vermutete Ursache">
              <MehrereAuswahl optionen={URSACHEN} werte={episode?.ursachen ?? []} onWechsel={(w) => aendere((e) => { e.ursachen = w })} />
            </Frage>

            <label className="feld">
              <span>Notiz zur Ursache</span>
              <textarea
                rows={2}
                defaultValue={episode?.ursacheText}
                onBlur={(e) => {
                  const text = e.target.value.trim()
                  if (text || episode?.ursacheText) void aendere((x) => { x.ursacheText = text || undefined })
                }}
              />
            </label>

            {episode && (
              <button
                className="textknopf textknopf--warnung"
                onClick={async () => {
                  await loescheEpisode(episode.id)
                  onSchliessen()
                }}
              >
                Episode löschen
              </button>
            )}
          </div>
        )}
      </main>

      <div className="dock">
        <div className="reihe">
          <button className="knopf knopf--primaer" onClick={onSchliessen}>Fertig</button>
        </div>
      </div>
    </>
  )
}

export function Kopfweh({ eintraege, jetzt, erfassung, onOeffnen, onSchliessen }: Props) {
  if (erfassung) {
    return (
      <ErfassungsMaske
        key={erfassung.id ?? 'neu'}
        eintraege={eintraege}
        jetzt={jetzt}
        startId={erfassung.id}
        startDatum={erfassung.datum ?? logischerTag(jetzt)}
        onSchliessen={onSchliessen}
      />
    )
  }

  const episoden = eintraege
    .flatMap(aktiveEpisoden)
    .sort((a, b) => (a.beginn < b.beginn ? 1 : -1))

  return (
    <>
      <main className="seite">
        <h1>Kopfweh</h1>
        <Uebergebrauch eintraege={eintraege} jetzt={jetzt} />
        {episoden.length === 0 ? (
          <p className="leise">Noch keine Episoden erfasst</p>
        ) : (
          <ul className="liste">
            {episoden.map((e) => {
              const seite = seiteAusZonen(e.zonen)
              return (
                <li key={e.id}>
                  <button className="zeile" onClick={() => onOeffnen({ id: e.id, zurueck: 'kopfweh' })}>
                    <span className={`punkt punkt--s${e.staerke ?? 1}`} aria-hidden />
                    <span className="zeile__text">
                      <strong>{formatDatum(e.beginn.slice(0, 10))}{e.phasen?.length ? '' : `, ${formatZeit(e.beginn)}`}</strong>
                      <small>
                        {e.laeuft ? 'Läuft noch' : phasenText(e) ?? (e.ende ? formatDauer(dauerMinuten(e.beginn, e.ende)) : 'Zeit offen')}
                        {e.staerke && ` · ${STAERKEN[e.staerke - 1].label}`}
                        {seite && ` · ${seite}`}
                        {e.medikamente.length > 0 && ` · ${[...new Set(e.medikamente.map((m) => m.name))].join(', ')}`}
                      </small>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
      <div className="dock">
        <div className="reihe">
          <button className="knopf knopf--primaer" onClick={() => onOeffnen({ zurueck: 'kopfweh' })}>Kopfweh erfassen</button>
        </div>
      </div>
    </>
  )
}
