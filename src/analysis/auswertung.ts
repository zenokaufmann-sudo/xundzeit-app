import { mondAm } from '../context/mond'
import { addTage, isoWoche, logischerTag, wocheVon } from '../domain/datum'
import type { GarminTag, ReportZeile } from '../domain/externe'
import { PHASEN } from '../domain/katalog'
import { aktiveEpisoden, garminVorschlag, istErfasst, krankheitAm } from '../domain/logik'
import type { Datum, KopfwehEpisode, KopfZone, Krankheit, TagesEintrag, Tagesphase, Wirkung } from '../domain/types'

export const MINDEST_TAGE = 5

export type ZeitraumId = '30' | '90' | 'alle'

export function zeitraum(id: ZeitraumId, eintraege: TagesEintrag[], heute: Datum): { von: Datum; bis: Datum } {
  if (id !== 'alle') return { von: addTage(heute, -(Number(id) - 1)), bis: heute }
  const erster = eintraege
    .filter((t) => kopfwehAm(t) !== undefined || istErfasst(t))
    .map((t) => t.datum)
    .sort()[0]
  return { von: erster ?? heute, bis: heute }
}

export function tageImBereich(von: Datum, bis: Datum): Datum[] {
  const tage: Datum[] = []
  for (let d = von; d <= bis; d = addTage(d, 1)) tage.push(d)
  return tage
}

/** `undefined` heisst unbekannt: Solche Tage zählen in keiner Rate mit. */
export function kopfwehAm(t?: TagesEintrag): boolean | undefined {
  if (aktiveEpisoden(t).length > 0 || t?.kopfwehStatus === 'hatte') return true
  return t?.kopfwehStatus === 'keines' ? false : undefined
}

export function staerkeAm(t?: TagesEintrag): number | null {
  const k = kopfwehAm(t)
  if (k === undefined) return null
  if (!k) return 0
  return Math.max(1, ...aktiveEpisoden(t).map((e) => e.staerkeMax ?? e.staerke ?? 1))
}

const imBereich = (eintraege: TagesEintrag[], von: Datum, bis: Datum) =>
  eintraege.filter((t) => t.datum >= von && t.datum <= bis)

export interface Kennzahlen {
  beobachtet: number
  kopfwehTage: number
  /** Hochgerechnet auf die Tage mit Angabe. Erst ab 7 solchen Tagen. */
  proWoche: number | null
  proMonat: number | null
  staerkeMittel: number | null
  medikamentenTage: number
}

export function kennzahlen(eintraege: TagesEintrag[], von: Datum, bis: Datum): Kennzahlen {
  const tage = imBereich(eintraege, von, bis)
  const beobachtet = tage.filter((t) => kopfwehAm(t) !== undefined).length
  const kopfwehTage = tage.filter((t) => kopfwehAm(t)).length
  const rate = beobachtet >= 7 ? kopfwehTage / beobachtet : null
  const staerken = tage.flatMap(aktiveEpisoden).flatMap((e) => e.staerkeMax ?? e.staerke ?? [])
  const medTage = new Set(
    tage.flatMap(aktiveEpisoden).flatMap((e) => e.medikamente).map((m) => logischerTag(new Date(m.zeit))),
  )
  return {
    beobachtet,
    kopfwehTage,
    proWoche: rate === null ? null : rate * 7,
    proMonat: rate === null ? null : rate * 30.44,
    staerkeMittel: staerken.length > 0 ? staerken.reduce((a, b) => a + b, 0) / staerken.length : null,
    medikamentenTage: [...medTage].filter((d) => d >= von && d <= bis).length,
  }
}

export interface Periode { key: string; label: string; kopfweh: number; beobachtet: number }

const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** Bis 14 Wochen pro Woche, sonst pro Monat, damit die Säulen auf dem iPhone lesbar bleiben. */
export function proPeriode(eintraege: TagesEintrag[], von: Datum, bis: Datum): { art: 'woche' | 'monat'; perioden: Periode[] } {
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const tage = tageImBereich(von, bis)
  const art = tage.length <= 98 ? 'woche' : 'monat'
  const perioden = new Map<string, Periode>()
  for (const d of tage) {
    const key = art === 'woche' ? wocheVon(d)[0] : d.slice(0, 7)
    const p = perioden.get(key) ?? {
      key,
      label: art === 'woche' ? String(isoWoche(d).woche) : MONATE_KURZ[Number(d.slice(5, 7)) - 1],
      kopfweh: 0,
      beobachtet: 0,
    }
    const k = kopfwehAm(nachDatum.get(d))
    if (k !== undefined) p.beobachtet += 1
    if (k) p.kopfweh += 1
    perioden.set(key, p)
  }
  return { art, perioden: [...perioden.values()] }
}

interface Tageslage {
  datum: Datum
  t: TagesEintrag
  /** Vortag. Mit «wie üblich» nachgetragene Werte sind geschätzt und bleiben draussen. */
  v?: TagesEintrag
  g?: GarminTag
  gv?: GarminTag
  krank: boolean
  hrvTief?: number
  stressHoch?: number
}

interface FaktorDef { id: string; titel: string; wert: (l: Tageslage) => boolean | undefined }

const ab = (wert: number | undefined, grenze: number) => (wert === undefined ? undefined : wert >= grenze)

const FAKTOREN: FaktorDef[] = [
  { id: 'alkohol-vorabend', titel: 'Alkohol am Vorabend', wert: (l) => l.v?.alkohol?.ja },
  {
    id: 'schlaf-kurz',
    titel: 'Schlaf unter 6.5 h',
    wert: (l) => (l.g?.schlaf?.dauerMin === undefined ? undefined : l.g.schlaf.dauerMin < 390),
  },
  {
    id: 'schlaf-schlecht',
    titel: 'Schlecht geschlafen (eigene Angabe)',
    wert: (l) => (l.t.nacht?.schlafSubjektiv === undefined ? undefined : l.t.nacht.schlafSubjektiv <= 2),
  },
  {
    id: 'bildschirm',
    titel: 'Bildschirm vor dem Schlafen, ab 15 min',
    wert: (l) => {
      const d = l.t.nacht?.display
      return d === undefined ? undefined : d === '15-60' || d === '>60'
    },
  },
  {
    id: 'sport-vortag',
    titel: 'Harter Sporttag am Vortag',
    wert: (l) => ab(l.v?.koerperBelastung?.stufe ?? garminVorschlag(l.gv)?.stufe, 4),
  },
  { id: 'kopf-vortag', titel: 'Strenger Kopftag am Vortag', wert: (l) => ab(l.v?.kopfBelastung, 4) },
  {
    id: 'koffein-spaet',
    titel: 'Koffein nach 12 Uhr am Vortag',
    wert: (l) => {
      const k = l.v?.koffein
      if (!k) return undefined
      if (!k.ja) return false
      return k.letzte === undefined ? undefined : k.letzte === 'nach12'
    },
  },
  {
    id: 'koffein-entzug',
    titel: 'Kein Koffein nach Koffein am Vortag',
    wert: (l) => (l.v?.koffein && l.t.koffein ? l.v.koffein.ja && !l.t.koffein.ja : undefined),
  },
  {
    id: 'koffein-viel',
    titel: 'Koffein ab 3 Portionen',
    wert: (l) => {
      const k = l.t.koffein
      if (!k) return undefined
      if (!k.ja) return false
      return ab(k.portionen, 3)
    },
  },
  {
    id: 'druckabfall',
    titel: 'Luftdruckabfall über 5 hPa in 24 h',
    wert: (l) => {
      const w = l.t.kontext?.wetter
      return !w || w.vorlaeufig ? undefined : w.delta24h < -5
    },
  },
  { id: 'vollmond', titel: 'Vollmond', wert: (l) => mondAm(l.datum).kategorie === 'vollmond' },
  { id: 'neumond', titel: 'Neumond', wert: (l) => mondAm(l.datum).kategorie === 'neumond' },
  {
    id: 'hrv-tief',
    titel: 'Tiefe HRV (tiefstes Viertel)',
    wert: (l) => {
      const hrv = l.g?.hrv?.nachtMittelMs
      return hrv === undefined || l.hrvTief === undefined ? undefined : hrv < l.hrvTief
    },
  },
  {
    // Vortag, weil Kopfweh am selben Tag selbst den Stresswert hebt.
    id: 'stress-vortag',
    titel: 'Hoher Stress am Vortag (höchstes Viertel)',
    wert: (l) => {
      const s = l.gv?.stress?.durchschnitt
      return s === undefined || l.stressHoch === undefined ? undefined : s > l.stressHoch
    },
  },
  { id: 'krankheit', titel: 'Krankheit', wert: (l) => l.krank },
]

function quantil(werte: (number | undefined)[], anteil: number): number | undefined {
  const sortiert = werte.filter((w): w is number => w !== undefined).sort((a, b) => a - b)
  return sortiert.length < 8 ? undefined : sortiert[Math.floor((sortiert.length - 1) * anteil)]
}

export type FaktorStatus = 'ok' | 'zu-wenig' | 'nur-mit' | 'kein-kopfweh'

export interface FaktorErgebnis {
  id: string
  titel: string
  nMit: number
  nOhne: number
  kMit: number
  kOhne: number
  risiko: number | null
  status: FaktorStatus
  /** Das 95-%-Intervall des Risikos schliesst «kein Unterschied» noch ein. */
  unsicher: boolean
}

function bewerte(def: FaktorDef, tage: Tageslage[]): FaktorErgebnis {
  let nMit = 0, nOhne = 0, kMit = 0, kOhne = 0
  for (const l of tage) {
    const f = def.wert(l)
    if (f === undefined) continue
    const k = kopfwehAm(l.t) === true
    if (f) {
      nMit += 1
      if (k) kMit += 1
    } else {
      nOhne += 1
      if (k) kOhne += 1
    }
  }
  const basis = { id: def.id, titel: def.titel, nMit, nOhne, kMit, kOhne }
  if (nMit < MINDEST_TAGE || nOhne < MINDEST_TAGE) return { ...basis, risiko: null, status: 'zu-wenig', unsicher: true }
  if (kMit === 0 && kOhne === 0) return { ...basis, risiko: null, status: 'kein-kopfweh', unsicher: true }
  if (kOhne === 0) return { ...basis, risiko: null, status: 'nur-mit', unsicher: true }

  const risiko = (kMit / nMit) / (kOhne / nOhne)
  let unsicher = true
  if (kMit > 0) {
    const fehler = 1.96 * Math.sqrt(1 / kMit - 1 / nMit + 1 / kOhne - 1 / nOhne)
    unsicher = Math.exp(Math.log(risiko) - fehler) <= 1 && Math.exp(Math.log(risiko) + fehler) >= 1
  }
  return { ...basis, risiko, status: 'ok', unsicher }
}

/** Kopfweh-Rate an Tagen mit und ohne Faktor. Verglichen werden nur Tage, an denen beides bekannt ist. */
export function vergleich(
  eintraege: TagesEintrag[],
  garmin: Map<Datum, GarminTag>,
  krankheiten: Krankheit[],
  von: Datum,
  bis: Datum,
): FaktorErgebnis[] {
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const echt = (t?: TagesEintrag) => (t?.quelle === 'nachgetragen-wie-ueblich' ? undefined : t)
  const garminImBereich = tageImBereich(addTage(von, -1), bis).flatMap((d) => garmin.get(d) ?? [])
  const hrvTief = quantil(garminImBereich.map((g) => g.hrv?.nachtMittelMs), 0.25)
  const stressHoch = quantil(garminImBereich.map((g) => g.stress?.durchschnitt), 0.75)

  const tage = tageImBereich(von, bis).flatMap((datum): Tageslage[] => {
    const t = echt(nachDatum.get(datum))
    if (!t || kopfwehAm(t) === undefined) return []
    const vortag = addTage(datum, -1)
    return [{
      datum, t,
      v: echt(nachDatum.get(vortag)),
      g: garmin.get(datum),
      gv: garmin.get(vortag),
      krank: krankheitAm(krankheiten, datum) !== undefined,
      hrvTief,
      stressHoch,
    }]
  })

  const rang = (e: FaktorErgebnis) => (e.status === 'zu-wenig' ? 2 : e.status === 'kein-kopfweh' ? 1 : 0)
  return FAKTOREN.map((f) => bewerte(f, tage)).sort((a, b) =>
    rang(a) - rang(b) ||
    (b.status === 'nur-mit' ? Infinity : b.risiko ?? 0) - (a.status === 'nur-mit' ? Infinity : a.risiko ?? 0) ||
    Math.min(b.nMit, b.nOhne) - Math.min(a.nMit, a.nOhne),
  )
}

export interface Wirksamkeit {
  name: string
  einnahmen: number
  mitWirkung: number
  gut: number
  verteilung: Record<Wirkung, number>
}

export function wirksamkeit(eintraege: TagesEintrag[], von: Datum, bis: Datum): Wirksamkeit[] {
  const zeilen = new Map<string, Wirksamkeit>()
  for (const m of imBereich(eintraege, von, bis).flatMap(aktiveEpisoden).flatMap((e) => e.medikamente)) {
    const z = zeilen.get(m.name) ?? {
      name: m.name, einnahmen: 0, mitWirkung: 0, gut: 0,
      verteilung: { keine: 0, etwas: 0, deutlich: 0, schmerzfrei: 0 },
    }
    z.einnahmen += 1
    if (m.wirkung) {
      z.mitWirkung += 1
      z.verteilung[m.wirkung] += 1
      if (m.wirkung === 'deutlich' || m.wirkung === 'schmerzfrei') z.gut += 1
    }
    zeilen.set(m.name, z)
  }
  return [...zeilen.values()].sort((a, b) => b.einnahmen - a.einnahmen)
}

function beginnPhase(e: KopfwehEpisode): Tagesphase {
  const gewaehlt = PHASEN.find((p) => e.phasen?.includes(p.wert))
  if (gewaehlt) return gewaehlt.wert
  const stunde = new Date(e.beginn).getHours()
  return stunde < 6 ? 'nacht-frueh' : PHASEN.find((p) => stunde >= p.von && stunde < p.bis)!.wert
}

export function tageszeiten(eintraege: TagesEintrag[], von: Datum, bis: Datum): { phase: (typeof PHASEN)[number]; anzahl: number }[] {
  const episoden = imBereich(eintraege, von, bis).flatMap(aktiveEpisoden)
  return PHASEN.map((phase) => ({
    phase,
    anzahl: episoden.filter((e) => beginnPhase(e) === phase.wert).length,
  }))
}

export function zonenHaeufigkeit(eintraege: TagesEintrag[], von: Datum, bis: Datum): Partial<Record<KopfZone, number>> {
  const zaehler: Partial<Record<KopfZone, number>> = {}
  for (const z of imBereich(eintraege, von, bis).flatMap(aktiveEpisoden).flatMap((e) => e.zonen)) {
    zaehler[z] = (zaehler[z] ?? 0) + 1
  }
  return zaehler
}

export interface Reihe {
  id: string
  titel: string
  einheit?: string
  /** Fester Wertebereich, z.B. 1 bis 5 bei Skalen. */
  skala?: [number, number]
  werte: (number | null)[]
}

export function zeitreihen(
  eintraege: TagesEintrag[],
  garmin: Map<Datum, GarminTag>,
  von: Datum,
  bis: Datum,
): { tage: Datum[]; reihen: Reihe[] } {
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const tage = tageImBereich(von, bis)
  const reihe = (id: string, titel: string, wert: (d: Datum) => number | undefined | null, extra: Partial<Reihe> = {}): Reihe => ({
    id, titel, ...extra, werte: tage.map((d) => wert(d) ?? null),
  })
  const SKALA: Partial<Reihe> = { skala: [1, 5], einheit: 'von 5' }
  const stunden = (min?: number) => (min === undefined ? undefined : Math.round(min / 6) / 10)
  return {
    tage,
    reihen: [
      reihe('kopfweh', 'Kopfweh', (d) => staerkeAm(nachDatum.get(d))),
      reihe('schlaf', 'Schlaf', (d) => stunden(garmin.get(d)?.schlaf?.dauerMin), { einheit: 'h' }),
      reihe('hrv', 'HRV', (d) => garmin.get(d)?.hrv?.nachtMittelMs, { einheit: 'ms' }),
      reihe('stress', 'Stress', (d) => garmin.get(d)?.stress?.durchschnitt),
      reihe('kopfBelastung', 'Kopf-Belastung', (d) => nachDatum.get(d)?.kopfBelastung, SKALA),
      reihe('koerperBelastung', 'Körper-Belastung', (d) => nachDatum.get(d)?.koerperBelastung?.stufe, SKALA),
      reihe('befinden', 'Befinden', (d) => nachDatum.get(d)?.befinden, SKALA),
    ],
  }
}

/** Woche des neuesten echten Reports, falls er noch nicht angesehen wurde. */
export function neuerReport(reports: ReportZeile[], gesehen: string | null): string | undefined {
  const neuester = reports.filter((r) => !r.daten.beispiel).map((r) => r.woche).sort().at(-1)
  return neuester && neuester !== gesehen ? neuester : undefined
}
