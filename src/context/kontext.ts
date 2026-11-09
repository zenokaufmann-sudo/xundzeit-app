import { db } from '../db/db'
import { ladeEinstellungen, setzeKontext } from '../db/repo'
import { addTage, isoDatum } from '../domain/datum'
import { aktiveEpisoden, istErfasst } from '../domain/logik'
import type { Datum, TagesEintrag } from '../domain/types'
import { mondAm } from './mond'
import { holeStunden, wetterAusStunden } from './wetter'

/** Bis so weit zurück liefert die Forecast-API, ältere Tage kommen aus dem Archiv. */
const FORECAST_TAGE = 85
const VORLAEUFIG_ABSTAND_MS = 3 * 3600000
let letzterVorlaeufigerAbruf = 0

const relevant = (t: TagesEintrag) => istErfasst(t) || aktiveEpisoden(t).length > 0

/** Ergänzt Mondphase und Wetter bei allen Tagen, denen sie noch fehlen. */
export async function aktualisiereKontext(jetzt = new Date()): Promise<void> {
  const heute = isoDatum(jetzt)
  const einstellungen = await ladeEinstellungen()
  const tage = (await db.tage.toArray()).filter(relevant)

  for (const t of tage) {
    if (!t.kontext?.mond) await setzeKontext(t.datum, { mond: mondAm(t.datum) })
  }

  const heuteErneuern = jetzt.getTime() - letzterVorlaeufigerAbruf > VORLAEUFIG_ABSTAND_MS
  const fehlend = tage.filter((t) => {
    if (t.datum > heute) return false
    const w = t.kontext?.wetter
    if (!w) return true
    if (!w.vorlaeufig) return false
    return t.datum !== heute || heuteErneuern
  }).map((t) => t.datum)
  if (fehlend.length === 0) return
  if (fehlend.includes(heute)) letzterVorlaeufigerAbruf = jetzt.getTime()

  const { ort, reise } = einstellungen
  const reiseTag = reise && fehlend.includes(reise.datum) ? reise : undefined
  const zuhause = fehlend.filter((d) => d !== reiseTag?.datum)
  const grenze = addTage(heute, -FORECAST_TAGE)

  const hole = async (daten: Datum[], lat: number, lon: number, name: string, host: string, pfad: string) => {
    if (daten.length === 0) return
    const sortiert = [...daten].sort()
    const stunden = await holeStunden(host, pfad, lat, lon, addTage(sortiert[0], -1), sortiert[sortiert.length - 1])
    for (const d of sortiert) {
      const wetter = wetterAusStunden(stunden, d, name, d >= heute)
      if (wetter) await setzeKontext(d, { wetter })
    }
  }

  if (ort) {
    await hole(zuhause.filter((d) => d >= grenze), ort.lat, ort.lon, ort.name, 'api.open-meteo.com', 'forecast')
    await hole(zuhause.filter((d) => d < grenze), ort.lat, ort.lon, ort.name, 'archive-api.open-meteo.com', 'archive')
  }
  if (reiseTag) {
    await hole([reiseTag.datum], reiseTag.lat, reiseTag.lon, 'Aktueller Standort', 'api.open-meteo.com', 'forecast')
  }
}
