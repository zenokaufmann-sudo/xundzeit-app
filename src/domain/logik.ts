import { addTage, isoDatum, isoLokal, logischerTag, parseDatum, wocheVon } from './datum'
import type { GarminTag } from './externe'
import { PHASEN } from './katalog'
import type {
  Datum, Display, KopfwehEpisode, KopfZone, Krankheit, MedikamentEinnahme, TagesEintrag, TagesFelder, Tagesphase, Stufe5,
} from './types'

export const aktiveEpisoden = (t?: TagesEintrag): KopfwehEpisode[] =>
  t?.episoden.filter((e) => !e.deletedAt) ?? []

/** Zählt ein Tag als erfasst? Blosse Wetter- oder Mond-Daten reichen nicht. */
export function istErfasst(t?: TagesEintrag): boolean {
  if (!t) return false
  return Boolean(
    t.kopfwehStatus || t.nacht || t.koffein || t.alkohol || t.suessgetraenke ||
    t.massage || t.kopfBelastung || t.koerperBelastung || t.befinden,
  )
}

export function seiteAusZonen(zonen: KopfZone[]): 'links' | 'rechts' | 'beidseitig' | undefined {
  if (zonen.length === 0) return undefined
  const links = zonen.some((z) => z.endsWith('-l'))
  const rechts = zonen.some((z) => z.endsWith('-r'))
  if (links && !rechts) return 'links'
  if (rechts && !links) return 'rechts'
  return 'beidseitig'
}

export type Einstufung = 'migraeneartig' | 'spannungstyp'

/** Orientiert sich grob an den ICHD-3-Merkmalen. Nur ein Hinweis, keine Diagnose. */
export function einstufung(e: KopfwehEpisode): Einstufung | undefined {
  const symptome = e.symptome ?? []
  const arten = e.schmerzart ?? []
  if (e.zonen.length === 0 && arten.length === 0 && symptome.length === 0) return undefined
  if (arten.length === 0 && symptome.length === 0) return undefined

  const seite = seiteAusZonen(e.zonen)
  const merkmale = [
    seite === 'links' || seite === 'rechts',
    arten.includes('pochend'),
    (e.staerkeMax ?? e.staerke ?? 0) >= 2,
    symptome.includes('bewegung'),
  ].filter(Boolean).length

  const begleitend =
    symptome.includes('uebelkeit') ||
    (symptome.includes('licht') && symptome.includes('laerm'))

  if (symptome.includes('aura') || (merkmale >= 2 && begleitend)) return 'migraeneartig'
  return 'spannungstyp'
}

const tagAusZeit = (zeit: string) => logischerTag(new Date(zeit))

export function schmerzmittelTage(
  eintraege: TagesEintrag[],
  jetzt: Date,
): { monat: number; letzte30: number } {
  const heute = logischerTag(jetzt)
  const monat = heute.slice(0, 7)
  const start30 = addTage(heute, -29)
  const tage = new Set<Datum>()
  for (const t of eintraege) {
    for (const e of aktiveEpisoden(t)) {
      for (const m of e.medikamente) tage.add(tagAusZeit(m.zeit))
    }
  }
  const liste = [...tage]
  return {
    monat: liste.filter((d) => d.startsWith(monat)).length,
    letzte30: liste.filter((d) => d >= start30 && d <= heute).length,
  }
}

export type HinweisStufe = 'keiner' | 'dezent' | 'deutlich'

export function uebergebrauchStufe(z: { monat: number; letzte30: number }): HinweisStufe {
  const max = Math.max(z.monat, z.letzte30)
  if (max >= 15) return 'deutlich'
  if (max >= 10) return 'dezent'
  return 'keiner'
}

/** Aufeinanderfolgende Tage mit abschwellendem Spray, bis heute oder gestern. */
export function abschwellendAmStueck(eintraege: TagesEintrag[], jetzt: Date): number {
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const mitSpray = (d: Datum) =>
    nachDatum.get(d)?.einnahmen.some((x) => x.typ === 'abschwellend' && !x.deletedAt) ?? false
  let tag = logischerTag(jetzt)
  if (!mitSpray(tag)) tag = addTage(tag, -1)
  let n = 0
  while (mitSpray(tag)) {
    n += 1
    tag = addTage(tag, -1)
  }
  return n
}

/** Felder, die «Wie gestern» übernimmt. Alkohol bleibt draussen, er wird am Folgemorgen gefragt. */
export const WIE_GESTERN_FELDER = [
  'nacht', 'koffein', 'suessgetraenke', 'wasser', 'massage',
  'kopfBelastung', 'koerperBelastung', 'befinden',
] as const satisfies readonly (keyof TagesFelder)[]

function haeufigster<T>(werte: T[]): T | undefined {
  const zaehler = new Map<string, { wert: T; n: number }>()
  for (const w of werte) {
    const key = JSON.stringify(w)
    const eintrag = zaehler.get(key)
    if (eintrag) eintrag.n += 1
    else zaehler.set(key, { wert: w, n: 1 })
  }
  let best: { wert: T; n: number } | undefined
  for (const e of zaehler.values()) if (!best || e.n > best.n) best = e
  return best?.wert
}

function letzteTage(eintraege: TagesEintrag[], datum: Datum, anzahl: number): TagesEintrag[] {
  const start = addTage(datum, -anzahl)
  return eintraege
    .filter((t) => t.datum >= start && t.datum < datum)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1))
}

export interface Vorschlaege {
  display?: Display
  alkohol?: TagesFelder['alkohol']
  koffein?: TagesFelder['koffein']
  suessgetraenke?: TagesFelder['suessgetraenke']
  massage?: TagesFelder['massage']
  kopfBelastung?: TagesFelder['kopfBelastung']
  koerperBelastung?: TagesFelder['koerperBelastung']
  wasser?: TagesFelder['wasser']
}

/**
 * Vortag, sonst häufigster Wert der letzten 14 Tage.
 * Subjektive Werte (Schlaf, Befinden) werden bewusst nie vorgeschlagen, sie sollen echte Angaben bleiben.
 * Beim Alkohol wird nur ein «Nein» vorgeschlagen.
 */
export function garminVorschlag(g?: GarminTag): TagesFelder['koerperBelastung'] {
  if (!g?.aktivitaeten) return undefined
  const a = g.aktivitaeten
  const last = a.reduce((s, x) => s + (x.trainingsbelastung ?? 0), 0)
  const dauer = a.reduce((s, x) => s + x.dauerMin, 0)
  const stufeNach = (wert: number, grenzen: [number, number, number]): Stufe5 =>
    wert < grenzen[0] ? 2 : wert < grenzen[1] ? 3 : wert < grenzen[2] ? 4 : 5
  const stufe: Stufe5 = a.length === 0 ? 1 : last > 0 ? stufeNach(last, [75, 200, 400]) : stufeNach(dauer, [45, 120, 210])
  return { stufe, vorschlagGarmin: stufe }
}

export function vorschlaege(eintraege: TagesEintrag[], datum: Datum, garmin?: GarminTag): Vorschlaege {
  const vorige = letzteTage(eintraege, datum, 14)
  const gestern = vorige.find((t) => t.datum === addTage(datum, -1))
  const typisch = <T,>(wert: (t: TagesEintrag) => T | undefined): T | undefined => {
    const vomVortag = gestern ? wert(gestern) : undefined
    if (vomVortag !== undefined) return vomVortag
    return haeufigster(vorige.map(wert).filter((w): w is T => w !== undefined))
  }
  const alkohol = haeufigster(
    vorige.map((t) => t.alkohol).filter((a): a is NonNullable<typeof a> => a !== undefined),
  )
  return {
    display: typisch((t) => t.nacht?.display),
    alkohol: alkohol?.ja === false ? { ja: false } : undefined,
    koffein: typisch((t) => t.koffein),
    suessgetraenke: typisch((t) => t.suessgetraenke),
    massage: typisch((t) => (t.massage?.ja === false ? t.massage : undefined)),
    kopfBelastung: typisch((t) => t.kopfBelastung),
    koerperBelastung: garminVorschlag(garmin) ?? typisch((t) => t.koerperBelastung),
    wasser: typisch((t) => t.wasser),
  }
}

/** Werte für «wie üblich» beim Nachtragen: nur häufigste Werte, keine erfundenen Befindlichkeiten. */
export function wieUeblich(eintraege: TagesEintrag[], datum: Datum): Partial<TagesFelder> {
  const vorige = letzteTage(eintraege, datum, 14)
  const typisch = <T,>(wert: (t: TagesEintrag) => T | undefined) =>
    haeufigster(vorige.map(wert).filter((w): w is T => w !== undefined))
  const felder: Partial<TagesFelder> = {
    koffein: typisch((t) => t.koffein),
    suessgetraenke: typisch((t) => t.suessgetraenke),
    massage: typisch((t) => t.massage),
    kopfBelastung: typisch((t) => t.kopfBelastung),
    koerperBelastung: typisch((t) => t.koerperBelastung),
    wasser: typisch((t) => t.wasser),
  }
  return Object.fromEntries(
    Object.entries(felder).filter(([, wert]) => wert !== undefined),
  ) as Partial<TagesFelder>
}

/** Jüngster fehlender Tag der letzten 7, frühestens ab dem ersten Eintrag. */
export function fehlenderTag(eintraege: TagesEintrag[], jetzt: Date): Datum | undefined {
  const erfasst = eintraege.filter(istErfasst).map((t) => t.datum).sort()
  if (erfasst.length === 0) return undefined
  const erster = erfasst[0]
  const heute = logischerTag(jetzt)
  const vorhanden = new Set(erfasst)
  for (let i = 1; i <= 7; i += 1) {
    const tag = addTage(heute, -i)
    if (tag < erster) return undefined
    if (!vorhanden.has(tag)) return tag
  }
  return undefined
}

export function laufendeEpisode(eintraege: TagesEintrag[]): KopfwehEpisode | undefined {
  return eintraege
    .flatMap(aktiveEpisoden)
    .filter((e) => e.laeuft)
    .sort((a, b) => (a.beginn < b.beginn ? 1 : -1))[0]
}

export interface OffeneWirkung { episode: KopfwehEpisode; einnahme: MedikamentEinnahme }

/** Einnahmen, die mindestens 2 h und höchstens 48 h zurückliegen und noch keine Wirkung haben. */
export function offeneWirkung(eintraege: TagesEintrag[], jetzt: Date): OffeneWirkung | undefined {
  const t = jetzt.getTime()
  for (const episode of eintraege.flatMap(aktiveEpisoden)) {
    for (const einnahme of episode.medikamente) {
      const alter = (t - new Date(einnahme.zeit).getTime()) / 3600000
      if (!einnahme.wirkung && alter >= 2 && alter <= 48) return { episode, einnahme }
    }
  }
  return undefined
}

export function wocheErfasst(eintraege: TagesEintrag[], datum: Datum): { tag: Datum; erfasst: boolean }[] {
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  return wocheVon(datum).map((tag) => ({ tag, erfasst: istErfasst(nachDatum.get(tag)) }))
}

/** Ungefährer Beginn und ungefähres Ende aus den gewählten Tageszeiten. */
export function zeitenAusPhasen(datum: Datum, phasen: Tagesphase[]): { beginn: string; ende: string } {
  const gewaehlt = PHASEN.filter((p) => phasen.includes(p.wert))
  const um = (stunde: number) => {
    const d = parseDatum(datum)
    d.setHours(stunde, 0, 0, 0)
    return isoLokal(d)
  }
  return { beginn: um(gewaehlt[0].von), ende: um(gewaehlt[gewaehlt.length - 1].bis) }
}

export function phasenText(e: KopfwehEpisode): string | undefined {
  if (!e.phasen?.length) return undefined
  return PHASEN.filter((p) => e.phasen?.includes(p.wert)).map((p) => p.name).join(', ')
}

export interface CheckinStatus {
  offen: string[]
  beantwortet: number
  total: number
  komplett: boolean
}

function statusAus(punkte: [string, unknown][]): CheckinStatus {
  const offen = punkte.filter(([, wert]) => wert === undefined).map(([name]) => name)
  return {
    offen,
    beantwortet: punkte.length - offen.length,
    total: punkte.length,
    komplett: offen.length === 0,
  }
}

/** Nur gespeicherte Angaben zählen, offene Vorschläge nicht. */
export const morgenStatus = (tag?: TagesEintrag, vortag?: TagesEintrag): CheckinStatus =>
  statusAus([
    ['Schlaf', tag?.nacht?.schlafSubjektiv],
    ['Display', tag?.nacht?.display],
    ['Alkohol gestern', vortag?.alkohol],
  ])

export const abendStatus = (tag?: TagesEintrag, mitWasser = false): CheckinStatus =>
  statusAus([
    ['Koffein', tag?.koffein],
    ['Süssgetränke', tag?.suessgetraenke],
    ['Massage', tag?.massage],
    ['Kopf-Belastung', tag?.kopfBelastung],
    ['Körper-Belastung', tag?.koerperBelastung],
    ['Befinden', tag?.befinden],
    ['Kopfweh', tag?.kopfwehStatus],
    ...(mitWasser ? ([['Wasser', tag?.wasser]] as [string, unknown][]) : []),
  ])

export const krankheitAm = (krankheiten: Krankheit[], datum: Datum): Krankheit | undefined =>
  krankheiten
    .filter((k) => !k.deletedAt && k.beginn <= datum && (!k.ende || k.ende >= datum))
    .sort((a, b) => (a.beginn < b.beginn ? 1 : -1))[0]

/** Nasensprays sind eingeblendet bei Krankheit oder wenn sie in den letzten 3 Tagen genommen wurden. */
export function spraysAktiv(eintraege: TagesEintrag[], datum: Datum, krankheiten: Krankheit[]): boolean {
  if (krankheitAm(krankheiten, datum)) return true
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  return [0, 1, 2].some((i) => nachDatum.get(addTage(datum, -i))?.einnahmen.some((e) => !e.deletedAt))
}

const morgenAusgefuellt = (t?: TagesEintrag) =>
  t?.nacht?.schlafSubjektiv !== undefined || t?.nacht?.display !== undefined

// Das Kopfweh zählt hier nicht, es kann auch tagsüber ohne Check-in erfasst werden.
const abendAusgefuellt = (t?: TagesEintrag) =>
  [t?.koffein, t?.suessgetraenke, t?.massage, t?.kopfBelastung, t?.koerperBelastung, t?.befinden]
    .some((wert) => wert !== undefined)

export interface SprayTag {
  abschwellend?: number
  kortisonMorgens?: 0 | 1 | 2
  kortisonAbends?: 0 | 1 | 2
}

/**
 * Keine Auswahl heisst «nicht genommen», sobald der Check-in begonnen wurde.
 * Wurde er gar nicht ausgefüllt, bleibt der Wert unbekannt (undefined).
 * Für Analyse, CSV und schema.md massgebend.
 */
export function sprayTag(t?: TagesEintrag): SprayTag {
  const aktiv = t?.einnahmen.filter((e) => !e.deletedAt) ?? []
  const kortison = (slot: 'morgens' | 'abends', ausgefuellt: boolean): 0 | 1 | 2 | undefined =>
    aktiv.find((e) => e.typ === 'kortison' && e.slot === slot)?.stoesse ?? (ausgefuellt ? 0 : undefined)

  const morgen = morgenAusgefuellt(t)
  const abend = abendAusgefuellt(t)
  const anzahl = aktiv.filter((e) => e.typ === 'abschwellend').length
  return {
    abschwellend: anzahl > 0 ? anzahl : morgen || abend ? 0 : undefined,
    kortisonMorgens: kortison('morgens', morgen),
    kortisonAbends: kortison('abends', abend),
  }
}

const MINDEST_N = 5

/** Eine kleine, echte Erkenntnis aus den eigenen Daten. */
export function erkenntnis(eintraege: TagesEintrag[], jetzt: Date): string | undefined {
  const heute = logischerTag(jetzt)
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))

  const woche = wocheErfasst(eintraege, heute).filter((w) => w.erfasst).length
  if (woche === 7) return 'Report-Qualität: hoch, 7/7 Tage erfasst.'

  let ohne = 0
  for (let tag = heute; nachDatum.get(tag)?.kopfwehStatus === 'keines'; tag = addTage(tag, -1)) ohne += 1
  if (ohne >= 2) return `${ohne} Tage ohne Kopfweh.`

  const mitFolgetag = eintraege.filter(
    (t) => t.alkohol && nachDatum.get(addTage(t.datum, 1))?.kopfwehStatus,
  )
  const mit = mitFolgetag.filter((t) => t.alkohol?.ja).length
  const ohneAlk = mitFolgetag.length - mit
  const fehlend = Math.max(MINDEST_N - mit, 0) + Math.max(MINDEST_N - ohneAlk, 0)
  if (fehlend > 0 && mitFolgetag.length > 0) {
    return `Noch ${fehlend} erfasste Tage, bis der Alkohol-Vergleich aussagekräftig ist.`
  }

  return woche > 0 ? `Diese Woche ${woche}/7 erfasst.` : undefined
}

export { isoDatum }
