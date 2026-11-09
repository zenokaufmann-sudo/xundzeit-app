export type Datum = string // YYYY-MM-DD
export type Zeitpunkt = string // ISO 8601 mit lokalem Offset
export type Quelle = 'erfasst' | 'wie-gestern' | 'nachgetragen-wie-ueblich'
export type Stufe3 = 1 | 2 | 3
export type Stufe5 = 1 | 2 | 3 | 4 | 5

export type KopfZone =
  | 'stirn-l' | 'stirn-m' | 'stirn-r'
  | 'schlaefe-l' | 'schlaefe-r'
  | 'auge-l' | 'auge-r'
  | 'scheitel'
  | 'hinterkopf-l' | 'hinterkopf-r'
  | 'nacken-l' | 'nacken-r'

export type Tagesphase = 'nacht-frueh' | 'morgen' | 'mittag' | 'nachmittag' | 'abend' | 'nacht-spaet'
export type AbschwellendZeit = 'aufstehen' | 'mittags' | 'nachmittags' | 'abends' | 'schlafen'
export type Schmerzart = 'pochend' | 'drueckend' | 'stechend'
export type Begleitsymptom = 'licht' | 'laerm' | 'uebelkeit' | 'aura' | 'bewegung' | 'nacken'
export type Ursache =
  | 'schlaf' | 'trinken' | 'mahlzeit' | 'stress' | 'bildschirm' | 'sport'
  | 'alkohol' | 'koffein' | 'wetter' | 'sonne' | 'nacken' | 'krankheit'
export type Wirkung = 'keine' | 'etwas' | 'deutlich' | 'schmerzfrei'
export type MassageArt = 'professionell' | 'selbst' | 'rolle' | 'pistole'
export type MassageRegion = 'nacken' | 'schultern' | 'ruecken' | 'beine' | 'ganzkoerper'
export type Display = 'keine' | '<15' | '15-60' | '>60'

export interface MedikamentEinnahme {
  id: string
  name: string
  dosisMg?: number
  zeit: Zeitpunkt
  wirkung?: Wirkung
}

export interface KopfwehEpisode {
  id: string
  updatedAt: Zeitpunkt
  deletedAt?: Zeitpunkt
  beginn: Zeitpunkt
  ende?: Zeitpunkt
  /** Gewählte Tageszeiten. Beginn und Ende sind dann nur ungefähr. */
  phasen?: Tagesphase[]
  /** Nur gesetzt, wenn das Kopfweh ausdrücklich als laufend markiert wurde. */
  laeuft?: boolean
  erwachtMit?: boolean
  zonen: KopfZone[]
  staerke?: Stufe3
  staerkeMax?: Stufe3
  schmerzart?: Schmerzart[]
  symptome?: Begleitsymptom[]
  keinMedikament?: boolean
  medikamente: MedikamentEinnahme[]
  ursachen?: Ursache[]
  ursacheText?: string
}

export interface SprayEinnahme {
  id: string
  typ: 'abschwellend' | 'kortison'
  name: string
  zeit: Zeitpunkt
  stoesse?: 1 | 2 // pro Nasenloch
  slot?: 'morgens' | 'abends' // nur bei Kortison; massgebend, `zeit` ist nur der Moment des Eintragens
  zeitpunkt?: AbschwellendZeit // nur bei Abschwellend; massgebend, `zeit` ist nur der Moment des Eintragens
  deletedAt?: Zeitpunkt
}

export interface Nacht {
  schlafSubjektiv?: Stufe5
  display?: Display
}

export interface TagesFelder {
  kopfwehStatus?: 'keines' | 'hatte'
  nacht?: Nacht
  koffein?: { ja: boolean; portionen?: number; letzte?: 'vor12' | 'nach12'; zeit?: string }
  alkohol?: { ja: boolean; getraenke?: number; zeitpunkt?: 'bis18' | 'abend' | 'spaet' }
  suessgetraenke?: { ja: boolean; anzahl?: number }
  wasser?: 'wenig' | 'normal' | 'viel'
  massage?: { ja: boolean; art?: MassageArt; regionen?: MassageRegion[] }
  kopfBelastung?: Stufe5
  koerperBelastung?: { stufe: Stufe5; vorschlagGarmin?: Stufe5 }
  befinden?: Stufe5
  notiz?: string
  kontext?: { wetter?: WetterTag; mond?: MondTag }
}

export type TagesFeld = keyof TagesFelder

export interface TagesEintrag extends TagesFelder {
  datum: Datum
  schemaVersion: 1
  quelle: Quelle
  updatedAt: Zeitpunkt
  /** Zeitstempel pro Bereich, damit der Sync bereichsweise zusammenführen kann. */
  stempel: Partial<Record<TagesFeld, Zeitpunkt>>
  episoden: KopfwehEpisode[]
  einnahmen: SprayEinnahme[]
}

export type KrankheitArt = 'erkaeltung' | 'grippe' | 'magen-darm' | 'covid' | 'verletzung' | 'sonstiges'
export type KrankheitSymptom =
  | 'fieber' | 'halsweh' | 'schnupfen' | 'verstopft' | 'nebenhoehlen' | 'stirnhoehlen' | 'husten' | 'gliederschmerzen' | 'muedigkeit' | 'kopfweh'

/** Episode über mehrere Tage. Sie gilt für alle Tage von `beginn` bis `ende`, ohne `ende` läuft sie noch. */
export interface Krankheit {
  id: string
  updatedAt: Zeitpunkt
  deletedAt?: Zeitpunkt
  art?: KrankheitArt
  artText?: string
  symptome: KrankheitSymptom[]
  temperatur?: number
  schweregrad?: Stufe3
  sportpause?: boolean
  beginn: Datum
  ende?: Datum
}

export interface WetterTag {
  druckMittel: number
  druckMin: number
  druckMax: number
  delta24h: number
  maxDelta3h: number
  tempMittel: number
  feuchte: number
  ort: string
  /** Beruht noch auf der Prognose und wird später ersetzt. */
  vorlaeufig?: boolean
}

export interface MondTag {
  phase: number
  beleuchtung: number
  kategorie: 'neumond' | 'zunehmend' | 'vollmond' | 'abnehmend'
}
