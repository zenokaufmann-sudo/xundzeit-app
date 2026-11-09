import { useRef, useState } from 'react'
import { aendereKrankheit, neueKrankheit } from '../db/repo'
import { KRANKHEIT_ARTEN, KRANKHEIT_SYMPTOME, SCHWEREGRADE } from '../domain/katalog'
import type { Datum, Krankheit } from '../domain/types'
import { EineAuswahl, Frage, JaNein, MehrereAuswahl, Stepper } from '../ui/bausteine'

export interface KrankheitOeffnen { id?: string; datum: Datum }

export function KrankheitMaske({ krankheiten, startId, startDatum, onSchliessen }: {
  krankheiten: Krankheit[]; startId?: string; startDatum: Datum; onSchliessen: () => void
}) {
  const [id, setId] = useState(startId)
  const idRef = useRef(startId)
  const anlegen = useRef<Promise<string> | null>(null)
  const krankheit = krankheiten.find((k) => k.id === id)

  const aendere = async (fn: (k: Krankheit) => void) => {
    if (!idRef.current) {
      anlegen.current ??= neueKrankheit({ beginn: startDatum })
      idRef.current = await anlegen.current
      setId(idRef.current)
    }
    await aendereKrankheit(idRef.current, fn)
  }

  return (
    <>
      <main className="seite">
        <h1>{startId ? 'Krankheit bearbeiten' : 'Krankheit erfassen'}</h1>

        <Frage titel="Art">
          <EineAuswahl optionen={KRANKHEIT_ARTEN} wert={krankheit?.art} onWahl={(art) => aendere((k) => { k.art = art })} />
        </Frage>

        {krankheit?.art === 'sonstiges' && (
          <label className="feld">
            <span>Was genau?</span>
            <input
              type="text"
              defaultValue={krankheit.artText}
              onBlur={(e) => {
                const text = e.target.value.trim() || undefined
                void aendere((k) => { k.artText = text })
              }}
            />
          </label>
        )}

        <Frage titel="Symptome">
          <MehrereAuswahl optionen={KRANKHEIT_SYMPTOME} werte={krankheit?.symptome ?? []} onWechsel={(s) => aendere((k) => { k.symptome = s })} />
        </Frage>

        <Frage titel="Schweregrad">
          <EineAuswahl
            optionen={SCHWEREGRADE}
            wert={krankheit?.schweregrad}
            onWahl={(w) => aendere((k) => { k.schweregrad = k.schweregrad === w ? undefined : w })}
          />
        </Frage>

        <Frage titel="Sportpause" inline>
          <JaNein wert={krankheit?.sportpause} onWahl={(w) => aendere((k) => { k.sportpause = w })} />
        </Frage>

        {krankheit?.temperatur === undefined ? (
          <button className="textknopf" onClick={() => aendere((k) => { k.temperatur = 37.5 })}>Temperatur ergänzen</button>
        ) : (
          <div className="block">
            <div className="frage__kopf"><span>Temperatur</span></div>
            <div className="reihe reihe--text">
              <Stepper wert={krankheit.temperatur} min={34} max={42} schritt={0.1} dezimalen={1} einheit="°C" onWert={(t) => aendere((k) => { k.temperatur = t })} />
              <button className="textknopf" onClick={() => aendere((k) => { k.temperatur = undefined })}>Entfernen</button>
            </div>
          </div>
        )}

        <label className="feld">
          <span>Beginn</span>
          <input
            type="date"
            value={krankheit?.beginn ?? startDatum}
            onChange={(e) => e.target.value && aendere((k) => { k.beginn = e.target.value })}
          />
        </label>

        <label className="feld">
          <span>Ende (leer heisst: läuft noch)</span>
          <input
            type="date"
            value={krankheit?.ende ?? ''}
            onChange={(e) => {
              const wert = e.target.value || undefined
              void aendere((k) => { k.ende = wert })
            }}
          />
        </label>

        {krankheit && (
          <button
            className="textknopf textknopf--warnung"
            onClick={async () => {
              await aendereKrankheit(krankheit.id, (k) => { k.deletedAt = new Date().toISOString() })
              onSchliessen()
            }}
          >
            Krankheit löschen
          </button>
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
