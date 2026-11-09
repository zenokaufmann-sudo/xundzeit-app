import type { Datum, Zeitpunkt } from './types'

/** Format von `garmin/YYYY-MM-DD.json`, siehe schema.md. */
export interface GarminTag {
  datum: Datum
  schemaVersion: 1
  erstelltAm?: Zeitpunkt
  beispiel?: boolean
  schlaf?: { dauerMin?: number; score?: number }
  hrv?: { nachtMittelMs?: number; status?: string }
  ruhepuls?: number
  stress?: { durchschnitt?: number }
  bodyBattery?: { hoch?: number; tief?: number }
  aktivitaeten?: {
    sportart: string
    dauerMin: number
    distanzKm?: number
    trainingsbelastung?: number
  }[]
}

export type Einschaetzung = 'zu-wenig-daten' | 'schwach' | 'moderat' | 'deutlich'

/** Format von `reports/YYYY-Www.json`, siehe schema.md. */
export interface WochenReport {
  woche: string
  schemaVersion: 1
  erstelltAm: Zeitpunkt
  beispiel?: boolean
  zeitraum: { von: Datum; bis: Datum }
  erfassteTage: number
  kernaussagen: string[]
  zeitreihen: {
    id: string
    titel: string
    einheit?: string
    punkte: { datum: Datum; wert: number | null }[]
  }[]
  korrelationen: {
    faktor: string
    titel: string
    risiko: number | null
    nMit: number
    nOhne: number
    einschaetzung: Einschaetzung
    kommentar?: string
  }[]
}

export interface GarminZeile { datum: Datum; sha: string; daten: GarminTag }
export interface ReportZeile { woche: string; sha: string; daten: WochenReport }
