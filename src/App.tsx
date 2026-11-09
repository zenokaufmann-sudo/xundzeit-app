import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { beendeEpisode, einnahmeMitStandard, ladeEinstellungen } from './db/repo'
import { dauerMinuten, formatDauer, formatZeit } from './domain/datum'
import { STAERKEN } from './domain/katalog'
import type { Datum } from './domain/types'
import { laufendeEpisode } from './domain/logik'
import { neuerReport } from './analysis/auswertung'
import { Analyse } from './screens/Analyse'
import { Heute } from './screens/Heute'
import { Kopfweh, type Erfassung } from './screens/Kopfweh'
import { Einstellungen } from './screens/Einstellungen'
import { KrankheitMaske, type KrankheitOeffnen } from './screens/Krankheit'
import { Verlauf } from './screens/Verlauf'
import { InstallHinweis, imSafariTab } from './screens/InstallHinweis'
import { useHintergrund } from './sync/hintergrund'
import { Icon, type IconName } from './ui/Icon'
import { EinstellungenContext } from './ui/einstellungen'
import { ToastContext, type Toast } from './ui/toast'

type Tab = 'heute' | 'kopfweh' | 'verlauf' | 'analyse' | 'einstellungen'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'heute', label: 'Heute', icon: 'heute' },
  { id: 'kopfweh', label: 'Kopfweh', icon: 'kopf' },
  { id: 'verlauf', label: 'Verlauf', icon: 'verlauf' },
  { id: 'analyse', label: 'Analyse', icon: 'analyse' },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'einstellungen' },
]

function tabAusUrl(): Tab {
  const wert = new URLSearchParams(location.search).get('tab')
  return TABS.some((t) => t.id === wert) ? (wert as Tab) : 'heute'
}

function useJetzt(): Date {
  const [jetzt, setJetzt] = useState(() => new Date())
  useEffect(() => {
    const auffrischen = () => setJetzt(new Date())
    const timer = setInterval(auffrischen, 60000)
    document.addEventListener('visibilitychange', auffrischen)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', auffrischen)
    }
  }, [])
  return jetzt
}

export function App() {
  const [browserOk, setBrowserOk] = useState(() => !imSafariTab())
  const [tab, setTab] = useState<Tab>(tabAusUrl)
  const [erfassung, setErfassung] = useState<Erfassung | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const jetzt = useJetzt()

  const eintraege = useLiveQuery(() => db.tage.toArray())
  const krankheitenRoh = useLiveQuery(() => db.krankheiten.toArray())
  const einstellungen = useLiveQuery(() => ladeEinstellungen())
  const garminZeilen = useLiveQuery(() => db.garmin.toArray())
  const reports = useLiveQuery(() => db.reports.toArray())
  const reportGesehen = useLiveQuery(async () => ((await db.settings.get('reportGesehen'))?.wert as string | undefined) ?? null)
  useHintergrund(eintraege, krankheitenRoh)
  const [krankheitMaske, setKrankheitMaske] = useState<KrankheitOeffnen | null>(null)
  const [verlaufTag, setVerlaufTag] = useState<Datum | null>(null)

  const zeigeToast = useCallback((t: Toast) => setToast(t), [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const waehleTab = (neu: Tab) => {
    setErfassung(null)
    setKrankheitMaske(null)
    setVerlaufTag(null)
    setTab(neu)
    history.replaceState(null, '', `?tab=${neu}`)
  }

  const oeffneErfassung = (e: Erfassung) => {
    setErfassung(e)
    setTab('kopfweh')
  }
  const schliesseErfassung = () => {
    const zurueck = erfassung?.zurueck ?? 'kopfweh'
    setErfassung(null)
    setTab(zurueck)
  }

  if (!browserOk) return <InstallHinweis onTrotzdem={() => setBrowserOk(true)} />
  if (!eintraege || !krankheitenRoh || !einstellungen || !garminZeilen || !reports || reportGesehen === undefined) return <div className="app" />
  const garmin = new Map(garminZeilen.map((g) => [g.datum, g.daten]))
  const krankheiten = krankheitenRoh.filter((k) => !k.deletedAt)

  const laufend = laufendeEpisode(eintraege)
  // Während der Erfassung ausgeblendet, sonst verschiebt der Banner die Kopf-Karte unter dem Finger.
  const zeigeLaufend = laufend && !erfassung && !krankheitMaske
  const reportNeu = neuerReport(reports, reportGesehen) !== undefined

  const oeffneKrankheit = (datum: Datum, id?: string) => setKrankheitMaske({ datum, id })

  let inhalt: ReactNode
  if (krankheitMaske) {
    inhalt = (
      <KrankheitMaske
        key={krankheitMaske.id ?? 'neu'}
        krankheiten={krankheiten}
        startId={krankheitMaske.id}
        startDatum={krankheitMaske.datum}
        onSchliessen={() => setKrankheitMaske(null)}
      />
    )
  } else if (tab === 'heute') {
    inhalt = (
      <Heute
        eintraege={eintraege}
        krankheiten={krankheiten}
        garmin={garmin}
        jetzt={jetzt}
        onKopfweh={(datum, id) => oeffneErfassung({ datum, id, zurueck: 'heute' })}
        onKrankheit={oeffneKrankheit}
      />
    )
  } else if (tab === 'kopfweh') {
    inhalt = (
      <Kopfweh
        eintraege={eintraege}
        jetzt={jetzt}
        erfassung={erfassung}
        onOeffnen={oeffneErfassung}
        onSchliessen={schliesseErfassung}
      />
    )
  } else if (tab === 'verlauf') {
    inhalt = (
      <Verlauf
        eintraege={eintraege}
        krankheiten={krankheiten}
        garmin={garmin}
        jetzt={jetzt}
        tag={verlaufTag}
        onTag={setVerlaufTag}
        onKopfweh={(datum, id) => oeffneErfassung({ datum, id, zurueck: 'verlauf' })}
        onKrankheit={oeffneKrankheit}
      />
    )
  } else if (tab === 'analyse') {
    inhalt = <Analyse eintraege={eintraege} krankheiten={krankheiten} garmin={garmin} reports={reports} reportGesehen={reportGesehen} jetzt={jetzt} />
  } else {
    inhalt = <Einstellungen />
  }

  return (
    <EinstellungenContext.Provider value={einstellungen}>
    <ToastContext.Provider value={zeigeToast}>
      <div className="app">
        {zeigeLaufend && laufend && (
          <section className="laufend" aria-label="Laufende Episode">
            <button
              className="laufend__info"
              onClick={() => oeffneErfassung({ id: laufend.id, zurueck: tab })}
            >
              <span className={`punkt punkt--s${laufend.staerke ?? 1}`} aria-hidden />
              <span>
                <strong>Kopfweh seit {formatZeit(laufend.beginn)}</strong>
                <small>
                  {formatDauer(dauerMinuten(laufend.beginn, jetzt))}
                  {laufend.staerke && ` · ${STAERKEN[laufend.staerke - 1].label}`}
                </small>
              </span>
            </button>
            <div className="laufend__aktionen">
              <button
                className="knopf"
                onClick={async () => {
                  const einnahme = await einnahmeMitStandard(laufend.id)
                  zeigeToast({ text: `${einnahme.name} ${einnahme.dosisMg ?? ''} mg um ${formatZeit(einnahme.zeit)}` })
                }}
              >
                Medikament genommen
              </button>
              <button
                className="knopf knopf--primaer"
                onClick={async () => {
                  await beendeEpisode(laufend.id)
                  zeigeToast({ text: 'Kopfweh beendet' })
                }}
              >
                Kopfweh vorbei
              </button>
            </div>
          </section>
        )}

        <div className="inhalt">{inhalt}</div>

        {toast && (
          <div className="toast" role="status">
            <span>{toast.text}</span>
            {toast.rueckgaengig && (
              <button
                className="toast__knopf"
                onClick={() => {
                  toast.rueckgaengig?.()
                  setToast(null)
                }}
              >
                Rückgängig
              </button>
            )}
          </div>
        )}

        <nav className="tabs" aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => waehleTab(t.id)}
            >
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.id === 'analyse' && reportNeu && <i className="tab__neu" aria-label="Neuer Wochenreport" />}
            </button>
          ))}
        </nav>
      </div>
    </ToastContext.Provider>
    </EinstellungenContext.Provider>
  )
}
