import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { sucheOrt, type OrtTreffer } from '../context/wetter'
import { db } from '../db/db'
import { aendereEinstellungen } from '../db/repo'
import type { MedikamentDef } from '../domain/katalog'
import { Chip, Frage, JaNein } from '../ui/bausteine'
import { useEinstellungen } from '../ui/einstellungen'
import { formatDatum, formatZeit, logischerTag } from '../domain/datum'
import { laufen } from '../sync/hintergrund'
import { speichereKonfig, STANDARD_REPO, type SyncStatus } from '../sync/sync'
import { erzeugeCsv, teileDateien } from '../export/csv'

function OrtBereich() {
  const { ort, reise } = useEinstellungen()
  const [suche, setSuche] = useState('')
  const [treffer, setTreffer] = useState<OrtTreffer[] | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const heute = logischerTag()
  return (
    <section className="protokoll" aria-label="Wohnort">
      <p className="abschnitt">Wohnort für das Wetter</p>
      {ort
        ? <div className="frage__kopf"><span>{ort.name}</span></div>
        : <p className="hinweis">Noch kein Wohnort gewählt. Ohne ihn gibt es keine Wetterdaten</p>}
      <div className="block">
        <label className="feld">
          <span>{ort ? 'Anderen Ort suchen' : 'Ort suchen'}</span>
          <input type="text" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </label>
        <button
          className="knopf"
          disabled={suche.trim().length < 2}
          onClick={async () => setTreffer(await sucheOrt(suche.trim()).catch(() => []))}
        >
          Suchen
        </button>
        {treffer?.length === 0 && <p className="leise">Nichts gefunden</p>}
        {treffer && treffer.length > 0 && (
          <div className="chips">
            {treffer.map((t) => (
              <Chip
                key={`${t.lat},${t.lon}`}
                onClick={async () => {
                  await aendereEinstellungen({ ort: t })
                  setTreffer(null)
                  setSuche('')
                }}
              >
                {t.name}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <div className="block">
        <button
          className="knopf"
          onClick={() => {
            setHinweis(null)
            navigator.geolocation.getCurrentPosition(
              async (p) => {
                await aendereEinstellungen({ reise: { datum: heute, lat: p.coords.latitude, lon: p.coords.longitude } })
                setHinweis('Standort für heute übernommen')
              },
              () => setHinweis('Standort nicht verfügbar'),
            )
          }}
        >
          Heute unterwegs: Standort verwenden
        </button>
        {(hinweis || reise?.datum === heute) && <p className="leise">{hinweis ?? 'Standort für heute übernommen'}</p>}
      </div>
    </section>
  )
}

function SyncBereich() {
  const konfig = useLiveQuery(() => db.settings.get('sync'))
  const status = useLiveQuery(() => db.settings.get('syncStatus'))
  const [token, setToken] = useState('')
  const k = konfig?.wert as { token?: string; repo?: string } | undefined
  const s = status?.wert as SyncStatus | undefined
  const verbunden = Boolean(k?.token)

  let text = 'Noch nicht verbunden'
  if (verbunden) {
    if (s?.laeuft) text = 'Synchronisiert gerade'
    else if (s?.fehler) text = s.fehler
    else if (s?.zuletzt) text = `Zuletzt ${formatDatum(s.zuletzt.slice(0, 10))}, ${formatZeit(s.zuletzt)}`
    else text = 'Verbunden, noch nicht synchronisiert'
  }

  return (
    <section className="protokoll" aria-label="GitHub-Sync">
      <p className="abschnitt">GitHub-Sync</p>
      <p className={s?.fehler ? 'hinweis' : 'leise'} role="status">{text}</p>
      <div className="block">
        <label className="feld">
          <span>{verbunden ? 'Neuer Token' : 'Token'}</span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <button
          className="knopf"
          disabled={token.trim().length === 0}
          onClick={async () => {
            await speichereKonfig({ token: token.trim() })
            setToken('')
            await laufen()
          }}
        >
          Token speichern
        </button>
      </div>
      {k?.token !== undefined && (
        <NameFeld label="Daten-Repo" wert={k.repo || STANDARD_REPO} onWert={(repo) => speichereKonfig({ repo })} />
      )}
      {verbunden && <button className="knopf" onClick={() => laufen()}>Jetzt synchronisieren</button>}
    </section>
  )
}

function ExportBereich() {
  // Vorab geladen: iOS öffnet das Teilen-Menü nur direkt aus dem Tap heraus.
  const eintraege = useLiveQuery(() => db.tage.toArray())
  const krankheiten = useLiveQuery(() => db.krankheiten.toArray())
  const garminZeilen = useLiveQuery(() => db.garmin.toArray())
  const heute = logischerTag()
  const erster = eintraege?.map((t) => t.datum).sort()[0] ?? heute
  const [von, setVon] = useState<string | null>(null)
  const [bis, setBis] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const ab = von ?? erster
  const bisTag = bis ?? heute
  const bereit = eintraege && krankheiten && garminZeilen && ab <= bisTag

  return (
    <section className="protokoll" aria-label="CSV-Export">
      <p className="abschnitt">CSV-Export</p>
      <div className="reihe">
        <label className="feld"><span>Von</span><input type="date" value={ab} max={bisTag} onChange={(e) => setVon(e.target.value || null)} /></label>
        <label className="feld"><span>Bis</span><input type="date" value={bisTag} max={heute} onChange={(e) => setBis(e.target.value || null)} /></label>
      </div>
      <div className="block">
        <button
          className="knopf"
          disabled={!bereit}
          onClick={async () => {
            if (!bereit) return
            setMeldung(null)
            const krank = krankheiten.filter((k) => !k.deletedAt)
            const garmin = new Map(garminZeilen.map((g) => [g.datum, g.daten]))
            const ergebnis = await teileDateien(erzeugeCsv(eintraege, garmin, krank, ab, bisTag))
            if (ergebnis === 'geladen') setMeldung('Drei Dateien heruntergeladen')
          }}
        >
          Exportieren
        </button>
        {meldung && <p className="leise" role="status">{meldung}</p>}
        <p className="leise">tage.csv, kopfweh.csv und einnahmen.csv</p>
      </div>
    </section>
  )
}

function NameFeld({ label, wert, onWert }: { label: string; wert: string; onWert: (w: string) => void }) {
  return (
    <label className="feld">
      <span>{label}</span>
      <input
        type="text"
        defaultValue={wert}
        onBlur={(e) => {
          const text = e.target.value.trim()
          if (text && text !== wert) onWert(text)
        }}
      />
    </label>
  )
}

export function Einstellungen() {
  const einstellungen = useEinstellungen()
  const liste = einstellungen.medikamente
  const [name, setName] = useState('')
  const [dosen, setDosen] = useState('')

  const speichere = (medikamente: MedikamentDef[]) => aendereEinstellungen({ medikamente })
  const aendere = (index: number, teil: Partial<MedikamentDef>) =>
    speichere(liste.map((m, i) => (i === index ? { ...m, ...teil } : m)))

  const werte = dosen.split(/[,;\s]+/).map(Number).filter((d) => Number.isFinite(d) && d > 0)
  const kannHinzufuegen = name.trim().length > 0 && !liste.some((m) => m.name === name.trim())

  return (
    <main className="seite">
      <h1>Einstellungen</h1>

      <section className="protokoll" aria-label="Medikamente">
        <p className="abschnitt">Medikamente</p>
        {liste.map((m, i) => (
          <div key={m.name} className="block">
            <div className="frage__kopf">
              <span>{m.name}</span>
              {i === 0 && <span className="frage__wert">Standard</span>}
            </div>
            {m.dosen.length > 0 && (
              <div className="chips">
                {m.dosen.map((d) => (
                  <Chip key={d} aktiv={m.standard === d} label={`${m.name} Standarddosis ${d} mg`} onClick={() => aendere(i, { standard: d })}>
                    {d} mg
                  </Chip>
                ))}
              </div>
            )}
            <div className="reihe reihe--text">
              {i > 0 && (
                <button className="textknopf" aria-label={`${m.name} als Standard`} onClick={() => speichere([m, ...liste.filter((_, x) => x !== i)])}>
                  Als Standard
                </button>
              )}
              <button className="textknopf textknopf--warnung" aria-label={`${m.name} entfernen`} onClick={() => speichere(liste.filter((_, x) => x !== i))}>
                Entfernen
              </button>
            </div>
          </div>
        ))}

        <div className="block">
          <label className="feld">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="feld">
            <span>Dosen in mg, mit Komma getrennt</span>
            <input type="text" inputMode="numeric" value={dosen} onChange={(e) => setDosen(e.target.value)} />
          </label>
          <button
            className="knopf"
            disabled={!kannHinzufuegen}
            onClick={async () => {
              await speichere([...liste, { name: name.trim(), dosen: werte, standard: werte[0] }])
              setName('')
              setDosen('')
            }}
          >
            Hinzufügen
          </button>
        </div>
      </section>

      <section className="protokoll" aria-label="Nasensprays">
        <p className="abschnitt">Nasensprays</p>
        <NameFeld label="Abschwellend" wert={einstellungen.abschwellendName} onWert={(abschwellendName) => aendereEinstellungen({ abschwellendName })} />
        <NameFeld label="Kortison" wert={einstellungen.kortisonName} onWert={(kortisonName) => aendereEinstellungen({ kortisonName })} />
      </section>

      <section className="protokoll" aria-label="Erfassung">
        <p className="abschnitt">Erfassung</p>
        <Frage titel="Wasser im Abend-Check-in" inline>
          <JaNein wert={einstellungen.wasser} onWahl={(wasser) => aendereEinstellungen({ wasser })} />
        </Frage>
      </section>

      <OrtBereich />
      <ExportBereich />

      <SyncBereich />

          </main>
  )
}
