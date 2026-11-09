import type { Datum, Zeitpunkt } from './types'

const zweistellig = (n: number) => String(n).padStart(2, '0')

export function isoDatum(d: Date): Datum {
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`
}

/** ISO 8601 mit lokalem Offset, z.B. 2026-11-08T14:10:00+01:00 */
export function isoLokal(d: Date): Zeitpunkt {
  const offset = -d.getTimezoneOffset()
  const vorzeichen = offset >= 0 ? '+' : '-'
  const betrag = Math.abs(offset)
  return (
    `${isoDatum(d)}T${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}:${zweistellig(d.getSeconds())}` +
    `${vorzeichen}${zweistellig(Math.floor(betrag / 60))}:${zweistellig(betrag % 60)}`
  )
}

export function parseDatum(datum: Datum): Date {
  const [j, m, t] = datum.split('-').map(Number)
  return new Date(j, m - 1, t, 12)
}

export function addTage(datum: Datum, n: number): Datum {
  const d = parseDatum(datum)
  d.setDate(d.getDate() + n)
  return isoDatum(d)
}

/** Bis 04:00 zählt noch zum Vortag. */
export function logischerTag(jetzt: Date = new Date()): Datum {
  const d = new Date(jetzt)
  if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return isoDatum(d)
}

export function checkinArt(jetzt: Date = new Date()): 'morgen' | 'abend' {
  const h = jetzt.getHours()
  return h >= 4 && h < 15 ? 'morgen' : 'abend'
}

export function formatDatum(datum: Datum): string {
  const [j, m, t] = datum.split('-')
  return `${t}.${m}.${j}`
}

export function formatZeit(zeit: Zeitpunkt): string {
  const d = new Date(zeit)
  return `${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

export function wochentag(datum: Datum): string {
  return WOCHENTAGE[parseDatum(datum).getDay()]
}

/** Die sieben Daten der Woche (Montag bis Sonntag), die `datum` enthält. */
export function wocheVon(datum: Datum): Datum[] {
  const tag = parseDatum(datum).getDay()
  const montag = addTage(datum, -((tag + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addTage(montag, i))
}

/** Kalenderwoche nach ISO 8601: Massgebend ist der Donnerstag der Woche. */
export function isoWoche(datum: Datum): { jahr: number; woche: number } {
  const donnerstag = parseDatum(wocheVon(datum)[3])
  const jahr = donnerstag.getFullYear()
  const tagImJahr = Math.round((donnerstag.getTime() - new Date(jahr, 0, 1, 12).getTime()) / 86400000)
  return { jahr, woche: Math.floor(tagImJahr / 7) + 1 }
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/** Aus «2026-11» wird «November 2026». */
export function monatName(monat: string): string {
  const [j, m] = monat.split('-').map(Number)
  return `${MONATE[m - 1]} ${j}`
}

export function addMonat(monat: string, n: number): string {
  const [j, m] = monat.split('-').map(Number)
  const d = new Date(j, m - 1 + n, 1)
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}`
}

export type Tageszeit = 'Morgen' | 'Nachmittag' | 'Abend' | 'Nacht'

export function tageszeit(zeit: Zeitpunkt): Tageszeit {
  const h = new Date(zeit).getHours()
  if (h >= 5 && h < 12) return 'Morgen'
  if (h >= 12 && h < 17) return 'Nachmittag'
  if (h >= 17 && h < 22) return 'Abend'
  return 'Nacht'
}

export function dauerMinuten(beginn: Zeitpunkt, ende: Zeitpunkt | Date): number {
  const bis = ende instanceof Date ? ende.getTime() : new Date(ende).getTime()
  return Math.max(0, Math.round((bis - new Date(beginn).getTime()) / 60000))
}

export function formatDauer(minuten: number): string {
  if (minuten < 60) return `${minuten} min`
  const h = Math.floor(minuten / 60)
  const m = minuten % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Wert für <input type="datetime-local">. */
export function zuEingabe(zeit: Zeitpunkt): string {
  return isoLokal(new Date(zeit)).slice(0, 16)
}

export function ausEingabe(wert: string): Zeitpunkt {
  return isoLokal(new Date(wert))
}
