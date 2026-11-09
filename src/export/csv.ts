import { kopfwehAm, staerkeAm } from '../analysis/auswertung'
import type { GarminTag } from '../domain/externe'
import { aktiveEpisoden, einstufung, krankheitAm, seiteAusZonen, sprayTag } from '../domain/logik'
import type { Datum, Krankheit, TagesEintrag } from '../domain/types'

type Zelle = string | number | boolean | undefined | null
type Zeile = Record<string, Zelle>

const zelle = (w: Zelle): string => {
  if (w === undefined || w === null) return ''
  if (typeof w === 'boolean') return w ? 'ja' : 'nein'
  const text = String(w)
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Semikolon und BOM, damit Excel CH die Datei und die Umlaute richtig liest. */
function csv(spalten: string[], zeilen: Zeile[]): string {
  const koerper = zeilen.map((z) => spalten.map((s) => zelle(z[s])).join(';'))
  return `﻿${[spalten.join(';'), ...koerper].join('\r\n')}\r\n`
}

const liste = (werte?: string[]) => (werte?.length ? werte.join(', ') : undefined)

const SPALTEN_TAGE = [
  'datum', 'quelle', 'kopfweh', 'episoden', 'staerke_max',
  'schlaf_subjektiv', 'display_vor_schlaf', 'licht_aus',
  'koffein', 'koffein_portionen', 'koffein_letzte', 'koffein_zeit',
  'alkohol', 'alkohol_getraenke', 'alkohol_zeitpunkt',
  'suessgetraenke', 'suessgetraenke_anzahl', 'wasser',
  'massage', 'massage_art', 'massage_regionen',
  'kopf_belastung', 'koerper_belastung', 'koerper_vorschlag_garmin', 'befinden',
  'krankheit', 'abschwellend_anzahl', 'kortison_morgens', 'kortison_abends', 'notiz',
  'druck_mittel_hpa', 'druck_min_hpa', 'druck_max_hpa', 'druck_delta_24h', 'druck_max_delta_3h',
  'temperatur_c', 'feuchte_prozent', 'wetter_ort', 'wetter_vorlaeufig',
  'mond_kategorie', 'mond_phase', 'mond_beleuchtung_prozent',
  'garmin_schlaf_min', 'garmin_schlaf_score', 'garmin_hrv_ms', 'garmin_hrv_status', 'garmin_ruhepuls',
  'garmin_stress', 'garmin_body_battery_hoch', 'garmin_body_battery_tief',
  'garmin_aktivitaeten', 'garmin_aktivitaet_min', 'garmin_trainingsbelastung',
]

function zeileTag(datum: Datum, t: TagesEintrag | undefined, g: GarminTag | undefined, krankheiten: Krankheit[]): Zeile {
  const spray = sprayTag(t)
  const w = t?.kontext?.wetter
  const m = t?.kontext?.mond
  const krank = krankheitAm(krankheiten, datum)
  const a = g?.aktivitaeten
  return {
    datum,
    quelle: t?.quelle,
    kopfweh: kopfwehAm(t),
    episoden: t ? aktiveEpisoden(t).length : undefined,
    staerke_max: staerkeAm(t) || undefined,
    schlaf_subjektiv: t?.nacht?.schlafSubjektiv,
    display_vor_schlaf: t?.nacht?.display,
    licht_aus: t?.nacht?.lichtAus,
    koffein: t?.koffein?.ja,
    koffein_portionen: t?.koffein?.portionen,
    koffein_letzte: t?.koffein?.letzte,
    koffein_zeit: t?.koffein?.zeit,
    alkohol: t?.alkohol?.ja,
    alkohol_getraenke: t?.alkohol?.getraenke,
    alkohol_zeitpunkt: t?.alkohol?.zeitpunkt,
    suessgetraenke: t?.suessgetraenke?.ja,
    suessgetraenke_anzahl: t?.suessgetraenke?.anzahl,
    wasser: t?.wasser,
    massage: t?.massage?.ja,
    massage_art: t?.massage?.art,
    massage_regionen: liste(t?.massage?.regionen),
    kopf_belastung: t?.kopfBelastung,
    koerper_belastung: t?.koerperBelastung?.stufe,
    koerper_vorschlag_garmin: t?.koerperBelastung?.vorschlagGarmin,
    befinden: t?.befinden,
    krankheit: krank ? (krank.artText || krank.art || 'ja') : undefined,
    abschwellend_anzahl: spray.abschwellend,
    kortison_morgens: spray.kortisonMorgens,
    kortison_abends: spray.kortisonAbends,
    notiz: t?.notiz,
    druck_mittel_hpa: w?.druckMittel,
    druck_min_hpa: w?.druckMin,
    druck_max_hpa: w?.druckMax,
    druck_delta_24h: w?.delta24h,
    druck_max_delta_3h: w?.maxDelta3h,
    temperatur_c: w?.tempMittel,
    feuchte_prozent: w?.feuchte,
    wetter_ort: w?.ort,
    wetter_vorlaeufig: w ? Boolean(w.vorlaeufig) : undefined,
    mond_kategorie: m?.kategorie,
    mond_phase: m?.phase,
    mond_beleuchtung_prozent: m?.beleuchtung,
    garmin_schlaf_min: g?.schlaf?.dauerMin,
    garmin_schlaf_score: g?.schlaf?.score,
    garmin_hrv_ms: g?.hrv?.nachtMittelMs,
    garmin_hrv_status: g?.hrv?.status,
    garmin_ruhepuls: g?.ruhepuls,
    garmin_stress: g?.stress?.durchschnitt,
    garmin_body_battery_hoch: g?.bodyBattery?.hoch,
    garmin_body_battery_tief: g?.bodyBattery?.tief,
    garmin_aktivitaeten: a ? liste(a.map((x) => x.sportart)) ?? '' : undefined,
    garmin_aktivitaet_min: a ? a.reduce((s, x) => s + x.dauerMin, 0) : undefined,
    garmin_trainingsbelastung: a ? a.reduce((s, x) => s + (x.trainingsbelastung ?? 0), 0) : undefined,
  }
}

const SPALTEN_KOPFWEH = [
  'id', 'datum', 'beginn', 'ende', 'tageszeiten', 'laeuft', 'erwacht_mit', 'staerke', 'staerke_max',
  'zonen', 'seite', 'schmerzart', 'symptome', 'einstufung_hinweis',
  'kein_medikament', 'medikament_einnahmen', 'ursachen', 'ursache_text',
]

const SPALTEN_EINNAHMEN = [
  'id', 'datum', 'art', 'name', 'dosis_mg', 'zeit', 'wirkung', 'tageszeit', 'stoesse_pro_nasenloch', 'erfasst_um', 'episode_id',
]

export interface Datei { name: string; inhalt: string }

export function erzeugeCsv(
  eintraege: TagesEintrag[],
  garmin: Map<Datum, GarminTag>,
  krankheiten: Krankheit[],
  von: Datum,
  bis: Datum,
): Datei[] {
  const imBereich = (d: Datum) => d >= von && d <= bis
  const nachDatum = new Map(eintraege.map((t) => [t.datum, t]))
  const echteGarmin = [...garmin.values()].filter((g) => !g.beispiel)
  const garminNach = new Map(echteGarmin.map((g) => [g.datum, g]))
  const daten = [...new Set([...nachDatum.keys(), ...garminNach.keys()])].filter(imBereich).sort()
  const tage = daten.map((d) => nachDatum.get(d)).filter((t): t is TagesEintrag => t !== undefined)

  const kopfweh: Zeile[] = tage.flatMap((t) =>
    aktiveEpisoden(t).map((e) => ({
      id: e.id,
      datum: t.datum,
      beginn: e.beginn,
      ende: e.ende,
      tageszeiten: liste(e.phasen),
      laeuft: e.laeuft,
      erwacht_mit: e.erwachtMit,
      staerke: e.staerke,
      staerke_max: e.staerkeMax,
      zonen: liste(e.zonen),
      seite: seiteAusZonen(e.zonen),
      schmerzart: liste(e.schmerzart),
      symptome: liste(e.symptome),
      einstufung_hinweis: einstufung(e),
      kein_medikament: e.keinMedikament,
      medikament_einnahmen: e.medikamente.length,
      ursachen: liste(e.ursachen),
      ursache_text: e.ursacheText,
    })),
  )

  const einnahmen: Zeile[] = tage.flatMap((t) => [
    ...aktiveEpisoden(t).flatMap((e) =>
      e.medikamente.map((m): Zeile => ({
        id: m.id, datum: t.datum, art: 'schmerzmittel', name: m.name, dosis_mg: m.dosisMg, zeit: m.zeit, wirkung: m.wirkung, episode_id: e.id,
      })),
    ),
    // Bei Sprays ist die Tageszeit massgebend. Der Moment des Eintragens kann Stunden später sein.
    ...t.einnahmen.filter((s) => !s.deletedAt).map((s): Zeile => ({
      id: s.id, datum: t.datum, art: s.typ, name: s.name, tageszeit: s.slot ?? s.zeitpunkt, stoesse_pro_nasenloch: s.stoesse, erfasst_um: s.zeit,
    })),
  ])

  return [
    { name: 'tage.csv', inhalt: csv(SPALTEN_TAGE, daten.map((d) => zeileTag(d, nachDatum.get(d), garminNach.get(d), krankheiten))) },
    { name: 'kopfweh.csv', inhalt: csv(SPALTEN_KOPFWEH, kopfweh) },
    { name: 'einnahmen.csv', inhalt: csv(SPALTEN_EINNAHMEN, einnahmen) },
  ]
}

export type ExportErgebnis = 'geteilt' | 'abgebrochen' | 'geladen'

/** Öffnet das Teilen-Menü. Muss direkt aus dem Tap heraus laufen, sonst lehnt iOS ab. */
export async function teileDateien(dateien: Datei[]): Promise<ExportErgebnis> {
  const files = dateien.map((d) => new File([d.inhalt], d.name, { type: 'text/csv' }))
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files })
      return 'geteilt'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'abgebrochen'
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  return 'geladen'
}
