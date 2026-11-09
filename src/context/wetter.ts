import { addTage } from '../domain/datum'
import type { Datum, WetterTag } from '../domain/types'

export interface Stunden {
  time?: string[]
  pressure_msl?: (number | null)[]
  temperature_2m?: (number | null)[]
  relative_humidity_2m?: (number | null)[]
}

const runden = (x: number) => Math.round(x * 10) / 10
const mittel = (w: number[]) => w.reduce((a, b) => a + b, 0) / w.length
const zahlen = (w: (number | null | undefined)[]) => w.filter((x): x is number => typeof x === 'number')

/**
 * Tageswerte aus den Stundenwerten. `delta24h` ist die Änderung von der letzten Stunde
 * des Vortags zur letzten Stunde des Tages, negativ heisst Druckabfall.
 */
export function wetterAusStunden(s: Stunden, datum: Datum, ort: string, vorlaeufig = false): WetterTag | undefined {
  if (!s.time || !s.pressure_msl) return undefined
  const druckNachZeit = new Map(s.time.map((t, i) => [t, s.pressure_msl![i]]))
  const indizes = s.time.flatMap((t, i) => (t.startsWith(datum) ? [i] : []))
  const druck = indizes.map((i) => s.pressure_msl![i])
  const vorhanden = zahlen(druck)
  if (vorhanden.length < 20) return undefined

  const letzte = indizes.map((i) => s.time![i]).reverse().find((t) => typeof druckNachZeit.get(t) === 'number')!
  const vortag = druckNachZeit.get(`${addTage(datum, -1)}${letzte.slice(10)}`)
  if (typeof vortag !== 'number') return undefined

  let maxDelta3h = 0
  for (let i = 0; i + 3 < druck.length; i += 1) {
    const a = druck[i]
    const b = druck[i + 3]
    if (typeof a === 'number' && typeof b === 'number' && Math.abs(b - a) > Math.abs(maxDelta3h)) maxDelta3h = b - a
  }

  const temp = zahlen(indizes.map((i) => s.temperature_2m?.[i]))
  const feuchte = zahlen(indizes.map((i) => s.relative_humidity_2m?.[i]))
  const tag: WetterTag = {
    druckMittel: runden(mittel(vorhanden)),
    druckMin: runden(Math.min(...vorhanden)),
    druckMax: runden(Math.max(...vorhanden)),
    delta24h: runden((druckNachZeit.get(letzte) as number) - vortag),
    maxDelta3h: runden(maxDelta3h),
    tempMittel: temp.length ? runden(mittel(temp)) : 0,
    feuchte: feuchte.length ? Math.round(mittel(feuchte)) : 0,
    ort,
  }
  if (vorlaeufig) tag.vorlaeufig = true
  return tag
}

const FELDER = 'pressure_msl,temperature_2m,relative_humidity_2m'

export async function holeStunden(host: string, pfad: string, lat: number, lon: number, von: Datum, bis: Datum): Promise<Stunden> {
  const url = `https://${host}/v1/${pfad}?latitude=${lat}&longitude=${lon}&hourly=${FELDER}&timezone=Europe%2FZurich&start_date=${von}&end_date=${bis}`
  const antwort = await fetch(url)
  if (!antwort.ok) throw new Error(`Open-Meteo ${antwort.status}`)
  const json = (await antwort.json()) as { hourly?: Stunden }
  return json.hourly ?? {}
}

export interface OrtTreffer { name: string; lat: number; lon: number }

export async function sucheOrt(name: string): Promise<OrtTreffer[]> {
  const antwort = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=4&language=de&format=json`)
  if (!antwort.ok) return []
  const json = (await antwort.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] }
  return (json.results ?? []).map((r) => ({
    name: [r.name, r.admin1 ?? r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }))
}
