import { useRef, useState } from 'react'
import {
  aendereEpisode, aendereKrankheit, aendereNacht, aendereTag, bestaetige,
  nachtragenWieUeblich, setzeKeinKopfweh, setzeKortison, setzeAbschwellend, wieGestern,
} from '../db/repo'
import {
  addTage, checkinArt, formatDatum, formatZeit, logischerTag, wochentag,
} from '../domain/datum'
import {
  BEFINDEN, DISPLAY, KOERPER_BELASTUNG, KRANKHEIT_ARTEN, ABSCHWELLEND_ZEITEN,
  KOPF_BELASTUNG, MASSAGE_ARTEN, MASSAGE_REGIONEN, SCHLAF, SCHWEREGRADE, STAERKEN, WASSER, WIRKUNGEN,
} from '../domain/katalog'
import {
  abendStatus, abschwellendAmStueck, aktiveEpisoden, erkenntnis, fehlenderTag, krankheitAm, morgenStatus, offeneWirkung,
  phasenText, spraysAktiv, vorschlaege,
  wieUeblich, wocheErfasst, type Vorschlaege,
} from '../domain/logik'
import type { GarminTag } from '../domain/externe'
import type { Datum, Krankheit, TagesEintrag, TagesFelder } from '../domain/types'
import {
  Chip, EineAuswahl, Frage, Haken, JaNein, MehrereAuswahl, Skala, Stepper,
} from '../ui/bausteine'
import { useEinstellungen } from '../ui/einstellungen'
import { useToast } from '../ui/toast'
import { useWischen } from '../ui/wischen'
import { Wochenring } from '../ui/Wochenring'
import { Zeitleiste } from '../ui/Zeitleiste'

interface Props {
  eintraege: TagesEintrag[]
  jetzt: Date
  /** Gewählter vergangener Tag, null zeigt heute. */
  auswahl: Datum | null
  onAuswahl: (datum: Datum | null) => void
  onKopfweh: (datum: Datum, id?: string) => void
  krankheiten: Krankheit[]
  garmin: Map<Datum, GarminTag>
  onKrankheit: (datum: Datum, id?: string) => void
}

function OptionaleZeit({ label, wert, onWert }: {
  label: string; wert?: string; onWert: (w?: string) => void
}) {
  const [offen, setOffen] = useState(false)
  if (!wert && !offen) {
    return <button className="textknopf" onClick={() => setOffen(true)}>{label} ergänzen</button>
  }
  return (
    <label className="feld feld--inline">
      <span>{label}</span>
      <input type="time" value={wert ?? ''} onChange={(e) => onWert(e.target.value || undefined)} />
    </label>
  )
}

function Notiz({ datum, tag }: { datum: Datum; tag?: TagesEintrag }) {
  const [offen, setOffen] = useState(false)
  if (!tag?.notiz && !offen) {
    return <button className="textknopf" onClick={() => setOffen(true)}>Notiz ergänzen</button>
  }
  return (
    <label className="feld">
      <span>Notiz</span>
      <textarea
        rows={2}
        defaultValue={tag?.notiz}
        onBlur={(e) => {
          const notiz = e.target.value.trim() || undefined
          if (notiz !== tag?.notiz) void aendereTag(datum, { notiz })
        }}
      />
    </label>
  )
}

function KopfwehFrage({ datum, tag, onKopfweh, rueckblick }: {
  datum: Datum; tag?: TagesEintrag; onKopfweh: Props['onKopfweh']; rueckblick?: boolean
}) {
  const episoden = aktiveEpisoden(tag)
  if (episoden.length === 0) {
    return (
      <Frage titel={rueckblick ? 'Kopfweh an diesem Tag?' : 'Kopfweh heute?'} inline>
        <JaNein
          wert={tag?.kopfwehStatus === 'keines' ? false : undefined}
          onWahl={(ja) => {
            if (ja) onKopfweh(datum)
            else void setzeKeinKopfweh(datum, tag?.kopfwehStatus !== 'keines')
          }}
        />
      </Frage>
    )
  }
  return (
    <div className="block">
      <div className="frage__kopf"><span>{rueckblick ? 'Kopfweh an diesem Tag' : 'Kopfweh heute'}</span></div>
      {episoden.map((e) => (
        <button key={e.id} className="knopf knopf--zeile" onClick={() => onKopfweh(datum, e.id)}>
          <span className={`punkt punkt--s${e.staerke ?? 1}`} aria-hidden />
          <span>
            {phasenText(e) ?? formatZeit(e.beginn)}
            {e.staerke && `, ${STAERKEN[e.staerke - 1].label}`}
          </span>
        </button>
      ))}
      <button className="textknopf" onClick={() => onKopfweh(datum)}>Weitere Episode</button>
    </div>
  )
}

function AlkoholFrage({ datum, wert, vorschlag, titel }: {
  datum: Datum; wert: TagesFelder['alkohol']; vorschlag?: TagesFelder['alkohol']; titel: string
}) {
  return (
    <div className="block">
      <Frage titel={titel} inline>
        <JaNein
          wert={wert?.ja}
          vorschlag={vorschlag?.ja}
          onWahl={(ja) => aendereTag(datum, {
            alkohol: ja ? { ja: true, getraenke: wert?.getraenke ?? 1, zeitpunkt: wert?.zeitpunkt ?? 'abend' } : { ja: false },
          })}
        />
      </Frage>
      {wert?.ja && (
        <div className="details">
          <Stepper wert={wert.getraenke ?? 1} einheit="Standardgetränke" onWert={(getraenke) => aendereTag(datum, { alkohol: { ...wert, getraenke } })} />
          <EineAuswahl
            optionen={[{ wert: 'bis18', label: 'Bis 18 Uhr' }, { wert: 'abend', label: 'Abend' }, { wert: 'spaet', label: 'Spät' }] as const satisfies { wert: 'bis18' | 'abend' | 'spaet'; label: string }[]}
            wert={wert.zeitpunkt}
            onWahl={(zeitpunkt) => aendereTag(datum, { alkohol: { ...wert, zeitpunkt } })}
          />
        </div>
      )}
    </div>
  )
}

export function MorgenCheckin({ datum, tag, vortag, v, alkoholFragen, rueckblick }: {
  datum: Datum; tag?: TagesEintrag; vortag?: TagesEintrag; v: Vorschlaege; alkoholFragen: boolean; rueckblick?: boolean
}) {
  return (
    <>
      <Skala titel="Wie hast du geschlafen?" labels={SCHLAF} wert={tag?.nacht?.schlafSubjektiv} onWahl={(schlafSubjektiv) => aendereNacht(datum, { schlafSubjektiv })} />
      <Frage titel="Display in der letzten Stunde vor dem Schlafen">
        <EineAuswahl optionen={DISPLAY} wert={tag?.nacht?.display} vorschlag={v.display} onWahl={(display) => aendereNacht(datum, { display })} />
      </Frage>
      {alkoholFragen && (
        <AlkoholFrage datum={addTage(datum, -1)} wert={vortag?.alkohol} vorschlag={v.alkohol} titel={rueckblick ? 'Alkohol am Vorabend?' : 'Alkohol gestern Abend?'} />
      )}
    </>
  )
}

export function AbendCheckin({ datum, tag, v, onKopfweh, rueckblick }: {
  datum: Datum; tag?: TagesEintrag; v: Vorschlaege; onKopfweh: Props['onKopfweh']; rueckblick?: boolean
}) {
  const { wasser: mitWasser } = useEinstellungen()
  const [alkoholOffen, setAlkoholOffen] = useState(false)
  const koffein = tag?.koffein
  const suess = tag?.suessgetraenke
  const massage = tag?.massage
  return (
    <>
      <KopfwehFrage datum={datum} tag={tag} onKopfweh={onKopfweh} rueckblick={rueckblick} />

      <div className="block">
        <Frage titel="Koffein" inline>
          <JaNein
            wert={koffein?.ja}
            vorschlag={v.koffein?.ja}
            onWahl={(ja) => aendereTag(datum, {
              koffein: ja
                ? { ja: true, portionen: koffein?.portionen ?? v.koffein?.portionen ?? 1, letzte: koffein?.letzte ?? v.koffein?.letzte ?? 'vor12' }
                : { ja: false },
            })}
          />
        </Frage>
        {koffein?.ja && (
          <div className="details">
            <Stepper wert={koffein.portionen ?? 1} einheit="Portionen" onWert={(portionen) => aendereTag(datum, { koffein: { ...koffein, portionen } })} />
            <EineAuswahl
              optionen={[{ wert: 'vor12', label: 'Letzte vor 12' }, { wert: 'nach12', label: 'Nach 12' }] as { wert: 'vor12' | 'nach12'; label: string }[]}
              wert={koffein.letzte}
              onWahl={(letzte) => aendereTag(datum, { koffein: { ...koffein, letzte } })}
            />
            <OptionaleZeit label="Genaue Uhrzeit" wert={koffein.zeit} onWert={(zeit) => aendereTag(datum, { koffein: { ...koffein, zeit } })} />
          </div>
        )}
      </div>

      <div className="block">
        <Frage titel="Süssgetränke" inline>
          <JaNein
            wert={suess?.ja}
            vorschlag={v.suessgetraenke?.ja}
            onWahl={(ja) => aendereTag(datum, { suessgetraenke: ja ? { ja: true, anzahl: suess?.anzahl ?? v.suessgetraenke?.anzahl ?? 1 } : { ja: false } })}
          />
        </Frage>
        {suess?.ja && (
          <div className="details">
            <Stepper wert={suess.anzahl ?? 1} einheit="Gläser/Dosen" onWert={(anzahl) => aendereTag(datum, { suessgetraenke: { ...suess, anzahl } })} />
          </div>
        )}
      </div>

      <div className="block">
        <Frage titel="Massage" inline>
          <JaNein
            wert={massage?.ja}
            vorschlag={v.massage?.ja}
            onWahl={(ja) => aendereTag(datum, { massage: ja ? { ja: true, art: massage?.art, regionen: massage?.regionen } : { ja: false } })}
          />
        </Frage>
        {massage?.ja && (
          <div className="details">
            <EineAuswahl optionen={MASSAGE_ARTEN} wert={massage.art} onWahl={(art) => aendereTag(datum, { massage: { ...massage, art } })} />
            <MehrereAuswahl optionen={MASSAGE_REGIONEN} werte={massage.regionen ?? []} onWechsel={(regionen) => aendereTag(datum, { massage: { ...massage, regionen } })} />
          </div>
        )}
      </div>

      <Skala titel="Kopf-Belastung" labels={KOPF_BELASTUNG} wert={tag?.kopfBelastung} vorschlag={v.kopfBelastung} onWahl={(kopfBelastung) => aendereTag(datum, { kopfBelastung })} />
      <Skala
        titel="Körper-Belastung"
        labels={KOERPER_BELASTUNG}
        wert={tag?.koerperBelastung?.stufe}
        vorschlag={v.koerperBelastung?.stufe}
        onWahl={(stufe) => aendereTag(datum, {
          koerperBelastung: { ...tag?.koerperBelastung, ...(v.koerperBelastung?.vorschlagGarmin ? { vorschlagGarmin: v.koerperBelastung.vorschlagGarmin } : {}), stufe },
        })}
      />
      <Skala titel="Befinden insgesamt" labels={BEFINDEN} wert={tag?.befinden} onWahl={(befinden) => aendereTag(datum, { befinden })} />

      {mitWasser && (
        <Frage titel="Wasser">
          <EineAuswahl optionen={WASSER} wert={tag?.wasser} vorschlag={v.wasser} onWahl={(wasser) => aendereTag(datum, { wasser })} />
        </Frage>
      )}

      {tag?.alkohol || alkoholOffen || rueckblick ? (
        <AlkoholFrage datum={datum} wert={tag?.alkohol} titel={rueckblick ? 'Alkohol an diesem Tag' : 'Alkohol heute'} />
      ) : (
        <button className="textknopf" onClick={() => setAlkoholOffen(true)}>Alkohol schon jetzt erfassen</button>
      )}

      <Notiz datum={datum} tag={tag} />
    </>
  )
}

function AbschwellendSpray({ datum, tag }: { datum: Datum; tag?: TagesEintrag }) {
  const { abschwellendName } = useEinstellungen()
  const zeiten = tag?.einnahmen.flatMap((e) =>
    e.typ === 'abschwellend' && !e.deletedAt && e.zeitpunkt ? [e.zeitpunkt] : [],
  ) ?? []
  return (
    <section className="block" aria-label={abschwellendName}>
      <h2>{abschwellendName}</h2>
      <Zeitleiste
        label={`${abschwellendName} Zeitpunkte`}
        optionen={ABSCHWELLEND_ZEITEN}
        werte={zeiten}
        onWechsel={(w) => setzeAbschwellend(datum, w, new Date(), abschwellendName)}
      />
    </section>
  )
}

const KORTISON_ZEILEN = [
  { slot: 'morgens', titel: 'Morgens' },
  { slot: 'abends', titel: 'Abends' },
] as const

function KortisonSpray({ datum, tag }: { datum: Datum; tag?: TagesEintrag }) {
  const { kortisonName } = useEinstellungen()
  return (
    <section className="block" aria-label={kortisonName}>
      <div>
        <h2>{kortisonName}</h2>
        <p className="leise">Sprühstösse pro Nasenloch</p>
      </div>
      {KORTISON_ZEILEN.map(({ slot, titel }) => {
        const einnahme = tag?.einnahmen.find((e) => e.typ === 'kortison' && e.slot === slot && !e.deletedAt)
        return (
          <Frage key={slot} titel={titel} inline>
            <div className="janein">
              {([1, 2] as const).map((n) => (
                <Chip
                  key={n}
                  aktiv={einnahme?.stoesse === n}
                  label={`${titel} ${n} ${n === 1 ? 'Sprühstoss' : 'Sprühstösse'}`}
                  onClick={() => setzeKortison(datum, slot, einnahme?.stoesse === n ? undefined : n, new Date(), kortisonName)}
                >
                  {n}
                </Chip>
              ))}
            </div>
          </Frage>
        )
      })}
    </section>
  )
}

function KrankheitZeile({ k, datum, onKrankheit }: {
  k: Krankheit; datum: Datum; onKrankheit: Props['onKrankheit']
}) {
  const art = k.art === 'sonstiges' && k.artText
    ? k.artText
    : KRANKHEIT_ARTEN.find((a) => a.wert === k.art)?.label ?? 'Krankheit'
  const grad = k.schweregrad && SCHWEREGRADE[k.schweregrad - 1].label
  return (
    <div className="frage frage--inline">
      <button className="zeile zeile--flach" onClick={() => onKrankheit(datum, k.id)}>
        <span className="zeile__text">
          <strong>{art}</strong>
          <small>seit {formatDatum(k.beginn)}{grad && `, ${grad}`}{k.ende && ', beendet'}</small>
        </span>
      </button>
      {!k.ende && (
        <button className="knopf" onClick={() => aendereKrankheit(k.id, (x) => { x.ende = datum })}>Beendet</button>
      )}
    </div>
  )
}

/** Krankheit und Nasensprays: nur eingeblendet, wenn sie gerade eine Rolle spielen. */
export function ZusatzBereich({ datum, tag, eintraege, krankheiten, onKrankheit, rueckblick }: {
  datum: Datum
  tag?: TagesEintrag
  eintraege: TagesEintrag[]
  krankheiten: Krankheit[]
  onKrankheit: Props['onKrankheit']
  rueckblick?: boolean
}) {
  const [sprayOffen, setSprayOffen] = useState(false)
  const krankheit = krankheitAm(krankheiten, datum)
  const zeigeSpray = rueckblick || sprayOffen || spraysAktiv(eintraege, datum, krankheiten)
  return (
    <>
      {krankheit && (
        <div className="protokoll">
          <p className="abschnitt">Krankheit</p>
          <KrankheitZeile k={krankheit} datum={datum} onKrankheit={onKrankheit} />
        </div>
      )}
      {zeigeSpray && (
        <div className="protokoll">
          <p className="abschnitt">Nasenspray</p>
          <AbschwellendSpray datum={datum} tag={tag} />
          <KortisonSpray datum={datum} tag={tag} />
        </div>
      )}
      {(!krankheit || !zeigeSpray) && (
        <div className="reihe reihe--text">
          {!krankheit && <button className="textknopf" onClick={() => onKrankheit(datum)}>Krankheit erfassen</button>}
          {!zeigeSpray && <button className="textknopf" onClick={() => setSprayOffen(true)}>Nasenspray erfassen</button>}
        </div>
      )}
    </>
  )
}

export function Heute({ eintraege, krankheiten, garmin, jetzt, auswahl, onAuswahl, onKopfweh, onKrankheit }: Props) {
  const [artWahl, setArtWahl] = useState<'morgen' | 'abend' | null>(null)
  const [richtung, setRichtung] = useState<-1 | 0 | 1>(0)
  const zeigeToast = useToast()
  const { abschwellendName, wasser: mitWasser } = useEinstellungen()

  const heute = logischerTag(jetzt)
  const datum = auswahl && auswahl < heute ? auswahl : heute
  const vergangen = datum !== heute

  const zeigeTag = (ziel: Datum, schritt: -1 | 0 | 1) => {
    setRichtung(schritt)
    setArtWahl(null)
    onAuswahl(ziel === heute ? null : ziel)
  }
  const wischen = useWischen((schritt) => {
    const ziel = addTage(datum, schritt)
    if (ziel <= heute) zeigeTag(ziel, schritt)
  })

  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const tag = nachDatum.get(datum)
  const vortag = nachDatum.get(addTage(datum, -1))
  const v = vorschlaege(eintraege, datum, garmin.get(datum))
  const art = artWahl ?? (vergangen ? 'abend' : checkinArt(jetzt))

  // Bleibt nach der Antwort sichtbar, damit sich die Frage nicht unter dem Finger wegbewegt.
  const gefragt = useRef(new Map<Datum, boolean>())
  if (!gefragt.current.has(datum)) gefragt.current.set(datum, vortag?.alkohol === undefined)
  const alkoholGefragt = vergangen || gefragt.current.get(datum)!

  const offenMorgen: Partial<Record<'display' | 'alkohol', unknown>> = {}
  if (!tag?.nacht?.display && v.display) offenMorgen.display = v.display
  if (alkoholGefragt && !vortag?.alkohol && v.alkohol) offenMorgen.alkohol = v.alkohol

  const offenAbend: Partial<TagesFelder> = {}
  if (!tag?.koffein && v.koffein) offenAbend.koffein = v.koffein
  if (!tag?.suessgetraenke && v.suessgetraenke) offenAbend.suessgetraenke = v.suessgetraenke
  if (!tag?.massage && v.massage) offenAbend.massage = v.massage
  if (!tag?.kopfBelastung && v.kopfBelastung) offenAbend.kopfBelastung = v.kopfBelastung
  if (!tag?.koerperBelastung && v.koerperBelastung) offenAbend.koerperBelastung = v.koerperBelastung
  if (mitWasser && !tag?.wasser && v.wasser) offenAbend.wasser = v.wasser

  const hatVorschlaege = Object.keys(art === 'morgen' ? offenMorgen : offenAbend).length > 0

  const stimmtSo = async () => {
    if (art === 'morgen') {
      if (offenMorgen.display) await aendereNacht(datum, { display: v.display })
      if (offenMorgen.alkohol) await aendereTag(addTage(datum, -1), { alkohol: v.alkohol })
    } else {
      await bestaetige(datum, offenAbend)
    }
  }

  const morgen = morgenStatus(tag, vortag)
  const abend = abendStatus(tag, mitWasser)
  const aktuell = art === 'morgen' ? morgen : abend
  const fertig = aktuell.komplett

  const segmente = [
    { id: 'morgen', titel: 'Morgen', status: morgen },
    { id: 'abend', titel: 'Abend', status: abend },
  ] as const

  const fehlt = vergangen ? undefined : fehlenderTag(eintraege, jetzt)
  const wirkung = offeneWirkung(eintraege, jetzt)
  const woche = wocheErfasst(eintraege, heute)
  const sprayTage = abschwellendAmStueck(eintraege, jetzt)
  const kannWieGestern = Boolean(vortag) && (art === 'abend' ? !fertig : !tag?.nacht)

  const fehltName = fehlt === addTage(heute, -1) ? 'Gestern' : fehlt && wochentag(fehlt)

  return (
    <>
      <main className="seite seite--heute" {...wischen}>
        <header className="kopfzeile">
          <div>
            <h1>{datum === addTage(heute, -1) ? 'Gestern' : wochentag(datum)}</h1>
            <p className="leise">{formatDatum(datum)}</p>
          </div>
          <Wochenring woche={woche} />
        </header>

        {vergangen && (
          <button className="knopf knopf--breit" onClick={() => zeigeTag(heute, 1)}>Zurück zu heute</button>
        )}

        {fehlt && fehltName && (
          <section className="karte">
            <p><strong>{fehltName} fehlt.</strong> «Wie üblich» trägt kein Kopfweh und deine üblichen Werte ein.</p>
            <div className="reihe">
              <button
                className="knopf"
                onClick={async () => {
                  await nachtragenWieUeblich(fehlt, wieUeblich(eintraege, fehlt))
                  zeigeToast({ text: `${fehltName} nachgetragen` })
                }}
              >
                Wie üblich
              </button>
              <button className="knopf" onClick={() => zeigeTag(fehlt, -1)}>Kurz ausfüllen</button>
            </div>
          </section>
        )}

        {wirkung && (
          <section className="karte">
            <p>
              <strong>Wie hat es gewirkt?</strong>{' '}
              {wirkung.einnahme.name}{wirkung.einnahme.dosisMg ? ` ${wirkung.einnahme.dosisMg} mg` : ''} um {formatZeit(wirkung.einnahme.zeit)}
            </p>
            <EineAuswahl
              optionen={WIRKUNGEN}
              onWahl={(w) => aendereEpisode(wirkung.episode.id, (e) => {
                const einnahme = e.medikamente.find((m) => m.id === wirkung.einnahme.id)
                if (einnahme) einnahme.wirkung = w
              })}
            />
          </section>
        )}

        {sprayTage > 7 && (
          <p className="hinweis">{abschwellendName} seit {sprayTage} Tagen am Stück. Bei längerer Anwendung gewöhnt sich die Nasenschleimhaut daran.</p>
        )}

        <section
          aria-label="Check-in"
          className={`checkin${richtung === -1 ? ' checkin--von-links' : richtung === 1 ? ' checkin--von-rechts' : ''}`}
          key={`${datum}-${art}`}
        >
          <div className="stand">
            <div className="stand__teile">
              {segmente.map((s) => (
                <button
                  key={s.id}
                  className={`stand__teil ${s.status.komplett ? 'stand__teil--komplett' : ''}`}
                  aria-current={art === s.id ? 'true' : undefined}
                  aria-label={`${s.titel}: ${s.status.komplett ? 'komplett' : `${s.status.beantwortet} von ${s.status.total} erfasst`}`}
                  onClick={() => { setRichtung(0); setArtWahl(s.id) }}
                >
                  <span className="stand__zeile">
                    <strong>{s.titel}</strong>
                    {s.status.komplett ? <Haken /> : <span>{s.status.beantwortet}/{s.status.total}</span>}
                  </span>
                  <span className="stand__balken" aria-hidden>
                    {Array.from({ length: s.status.total }, (_, i) => (
                      <span key={i} className={i < s.status.beantwortet ? 'voll' : undefined} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {art === 'morgen'
            ? <MorgenCheckin datum={datum} tag={tag} vortag={vortag} v={v} alkoholFragen={alkoholGefragt} rueckblick={vergangen} />
            : <AbendCheckin datum={datum} tag={tag} v={v} onKopfweh={onKopfweh} rueckblick={vergangen} />}
        </section>

        <ZusatzBereich key={datum} datum={datum} tag={tag} eintraege={eintraege} krankheiten={krankheiten} onKrankheit={onKrankheit} rueckblick={vergangen} />
      </main>

      <div className="dock">
        {fertig && (
          <div className="abschluss" role="status">
            <Haken />
            <span>
              <strong>{art === 'morgen' ? 'Morgen' : 'Abend'} erfasst.</strong>{' '}
              {erkenntnis(eintraege, jetzt)}
            </span>
          </div>
        )}
        {art === 'morgen' && (
          <div className="reihe">
            <button className="knopf" onClick={() => onKopfweh(datum)}>Kopfweh erfassen</button>
          </div>
        )}
        {((hatVorschlaege && !fertig) || kannWieGestern) && (
          <div className="reihe">
            {hatVorschlaege && !fertig && (
              <button className="knopf" onClick={stimmtSo}>Stimmt so</button>
            )}
            {kannWieGestern && (
              <button
                className="knopf"
                onClick={async () => {
                  const n = await wieGestern(datum)
                  zeigeToast({ text: n > 0 ? `${n} Werte ${vergangen ? 'vom Vortag' : 'von gestern'} übernommen` : 'Schon alles ausgefüllt' })
                }}
              >
                Wie gestern
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
