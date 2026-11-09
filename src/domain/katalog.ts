import type {
  Begleitsymptom, Display, KopfZone, KrankheitArt, KrankheitSymptom, MassageArt, MassageRegion,
  Schmerzart, Stufe3, Stufe5, Tagesphase, AbschwellendZeit, Ursache, Wirkung,
} from './types'

export interface Option<T> { wert: T; label: string }

export const STAERKEN: { wert: Stufe3; label: string; text: string }[] = [
  { wert: 1, label: 'Leicht', text: 'Alltag normal möglich' },
  { wert: 2, label: 'Mittel', text: 'Eingeschränkt' },
  { wert: 3, label: 'Stark', text: 'Nichts geht mehr' },
]

/**
 * `von` der frühen Nacht ist 4 statt 0 Uhr: So bleibt die Episode auf dem Tag,
 * für den sie eingetragen wurde (bis 04:00 zählt sonst noch zum Vortag).
 */
export const PHASEN: { wert: Tagesphase; name: string; kurz: string; zeit: string; von: number; bis: number }[] = [
  { wert: 'nacht-frueh', name: 'Nacht', kurz: 'Nacht', zeit: 'bis 6', von: 4, bis: 6 },
  { wert: 'morgen', name: 'Morgen', kurz: 'Morgen', zeit: '6–11', von: 6, bis: 11 },
  { wert: 'mittag', name: 'Mittag', kurz: 'Mittag', zeit: '11–14', von: 11, bis: 14 },
  { wert: 'nachmittag', name: 'Nachmittag', kurz: 'Nachm.', zeit: '14–18', von: 14, bis: 18 },
  { wert: 'abend', name: 'Abend', kurz: 'Abend', zeit: '18–22', von: 18, bis: 22 },
  { wert: 'nacht-spaet', name: 'Nacht', kurz: 'Nacht', zeit: 'ab 22', von: 22, bis: 24 },
]

export const SCHMERZARTEN: Option<Schmerzart>[] = [
  { wert: 'pochend', label: 'Pochend' },
  { wert: 'drueckend', label: 'Drückend' },
  { wert: 'stechend', label: 'Stechend' },
]

export const SYMPTOME: Option<Begleitsymptom>[] = [
  { wert: 'licht', label: 'Lichtempfindlich' },
  { wert: 'laerm', label: 'Lärmempfindlich' },
  { wert: 'uebelkeit', label: 'Übelkeit' },
  { wert: 'aura', label: 'Aura / Sehstörung' },
  { wert: 'bewegung', label: 'Schlimmer bei Bewegung' },
  { wert: 'nacken', label: 'Nackenverspannung' },
]

export const URSACHEN: Option<Ursache>[] = [
  { wert: 'schlaf', label: 'Wenig geschlafen' },
  { wert: 'trinken', label: 'Zu wenig getrunken' },
  { wert: 'mahlzeit', label: 'Mahlzeit ausgelassen' },
  { wert: 'stress', label: 'Stress / Kopfarbeit' },
  { wert: 'bildschirm', label: 'Viel Bildschirm' },
  { wert: 'sport', label: 'Harte Sporteinheit' },
  { wert: 'alkohol', label: 'Alkohol' },
  { wert: 'koffein', label: 'Koffein zu viel / zu wenig' },
  { wert: 'wetter', label: 'Wetter' },
  { wert: 'sonne', label: 'Zu viel Sonne / wenig Sonnenschutz' },
  { wert: 'nacken', label: 'Nacken / Haltung' },
  { wert: 'krankheit', label: 'Krankheit' },
]

export const WIRKUNGEN: Option<Wirkung>[] = [
  { wert: 'keine', label: 'Keine' },
  { wert: 'etwas', label: 'Etwas besser' },
  { wert: 'deutlich', label: 'Deutlich besser' },
  { wert: 'schmerzfrei', label: 'Schmerzfrei' },
]

export const DISPLAY: Option<Display>[] = [
  { wert: 'keine', label: 'Keine' },
  { wert: '<15', label: '< 15 min' },
  { wert: '15-60', label: '15–60' },
  { wert: '>60', label: '> 60' },
]

export const MASSAGE_ARTEN: Option<MassageArt>[] = [
  { wert: 'professionell', label: 'Professionell' },
  { wert: 'selbst', label: 'Selbstmassage' },
  { wert: 'rolle', label: 'Faszienrolle' },
  { wert: 'pistole', label: 'Massagepistole' },
]

export const MASSAGE_REGIONEN: Option<MassageRegion>[] = [
  { wert: 'nacken', label: 'Nacken' },
  { wert: 'schultern', label: 'Schultern' },
  { wert: 'ruecken', label: 'Rücken' },
  { wert: 'beine', label: 'Beine' },
  { wert: 'ganzkoerper', label: 'Ganzkörper' },
]

export const KOPF_BELASTUNG: Record<Stufe5, string> = {
  1: 'Sehr gemütlich', 2: 'Locker', 3: 'Normal', 4: 'Streng', 5: 'Ultra streng',
}
export const KOERPER_BELASTUNG: Record<Stufe5, string> = {
  1: 'Recovery Day', 2: 'Leicht aktiv', 3: 'Moderat', 4: 'Hart', 5: 'Sehr viel Sport',
}
export const BEFINDEN: Record<Stufe5, string> = {
  1: 'Schlecht', 2: 'Mässig', 3: 'Okay', 4: 'Gut', 5: 'Sehr gut',
}
export const SCHLAF: Record<Stufe5, string> = {
  1: 'Sehr schlecht', 2: 'Schlecht', 3: 'Okay', 4: 'Gut', 5: 'Sehr gut',
}

export const ZONEN_NAMEN: Record<KopfZone, string> = {
  'stirn-l': 'Stirn links', 'stirn-m': 'Stirn Mitte', 'stirn-r': 'Stirn rechts',
  'schlaefe-l': 'Schläfe links', 'schlaefe-r': 'Schläfe rechts',
  'auge-l': 'Hinter dem Auge links', 'auge-r': 'Hinter dem Auge rechts',
  scheitel: 'Scheitel',
  'hinterkopf-l': 'Hinterkopf links', 'hinterkopf-r': 'Hinterkopf rechts',
  'nacken-l': 'Nacken links', 'nacken-r': 'Nacken rechts',
}

export interface MedikamentDef { name: string; dosen: number[]; standard: number }

/** Das erste Medikament ist der Standard. */
export const MEDIKAMENTE: MedikamentDef[] = [
  { name: 'Paracetamol', dosen: [500, 1000], standard: 500 },
  { name: 'Ibuprofen', dosen: [200, 400, 600], standard: 400 },
]

export const ABSCHWELLEND_NAME = 'Abschwellendes Nasenspray'
export const ABSCHWELLEND_ZEITEN: { wert: AbschwellendZeit; aria: string; kurz: string }[] = [
  { wert: 'aufstehen', aria: 'Nach dem Aufstehen', kurz: 'Nach dem Aufstehen' },
  { wert: 'mittags', aria: 'Mittags', kurz: 'Mittags' },
  { wert: 'nachmittags', aria: 'Nachmittags', kurz: 'Nachm.' },
  { wert: 'abends', aria: 'Abends', kurz: 'Abends' },
  { wert: 'schlafen', aria: 'Vor dem Schlafengehen', kurz: 'Vor dem Schlafen' },
]
export const KORTISON_NAME = 'Kortison-Nasenspray'

export const WASSER: Option<'wenig' | 'normal' | 'viel'>[] = [
  { wert: 'wenig', label: 'Wenig' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'viel', label: 'Viel' },
]

export const KRANKHEIT_ARTEN: Option<KrankheitArt>[] = [
  { wert: 'erkaeltung', label: 'Erkältung' },
  { wert: 'grippe', label: 'Grippe / Fieber' },
  { wert: 'magen-darm', label: 'Magen-Darm' },
  { wert: 'covid', label: 'Covid' },
  { wert: 'verletzung', label: 'Verletzung' },
  { wert: 'sonstiges', label: 'Sonstiges' },
]

export const KRANKHEIT_SYMPTOME: Option<KrankheitSymptom>[] = [
  { wert: 'fieber', label: 'Fieber' },
  { wert: 'halsweh', label: 'Halsweh' },
  { wert: 'schnupfen', label: 'Schnupfen' },
  { wert: 'verstopft', label: 'Verstopfte Nase' },
  { wert: 'nebenhoehlen', label: 'Verstopfte Nasennebenhöhlen' },
  { wert: 'stirnhoehlen', label: 'Verstopfte Stirnhöhlen' },
  { wert: 'husten', label: 'Husten' },
  { wert: 'gliederschmerzen', label: 'Gliederschmerzen' },
  { wert: 'muedigkeit', label: 'Müdigkeit' },
  { wert: 'kopfweh', label: 'Kopfweh' },
]

export const SCHWEREGRADE: Option<Stufe3>[] = [
  { wert: 1, label: 'Leicht' },
  { wert: 2, label: 'Mittel' },
  { wert: 3, label: 'Schwer' },
]

export interface Einstellungen {
  /** Das erste Medikament ist der Standard. */
  medikamente: MedikamentDef[]
  abschwellendName: string
  kortisonName: string
  wasser: boolean
  /** Ohne Wohnort wird kein Wetter geholt. Fehlende Tage kommen nach, sobald er gesetzt ist. */
  ort?: { name: string; lat: number; lon: number }
  /** Abweichender Standort für einen einzelnen Tag, z.B. auf Reisen. */
  reise?: { datum: string; lat: number; lon: number }
}

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  medikamente: MEDIKAMENTE,
  abschwellendName: ABSCHWELLEND_NAME,
  kortisonName: KORTISON_NAME,
  wasser: false,
}
