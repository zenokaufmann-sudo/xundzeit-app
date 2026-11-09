import type { Krankheit, TagesEintrag, TagesFeld, TagesFelder } from '../domain/types'

const zeit = (s?: string) => (s ? Date.parse(s) : 0)

const BEREICHE: TagesFeld[] = [
  'kopfwehStatus', 'nacht', 'koffein', 'alkohol', 'suessgetraenke', 'wasser',
  'massage', 'kopfBelastung', 'koerperBelastung', 'befinden', 'notiz',
]

/** Episoden: Die jüngere gewinnt. Gelöschte bleiben als Grabstein erhalten. */
function mergeNachZeit<T extends { id: string; updatedAt: string }>(a: T[], b: T[]): T[] {
  const erg = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const vorhanden = erg.get(x.id)
    if (!vorhanden || zeit(x.updatedAt) > zeit(vorhanden.updatedAt)) erg.set(x.id, x)
  }
  return [...erg.values()]
}

/** Einnahmen haben keinen Zeitstempel: Eine Löschung setzt sich immer durch. */
function mergeEinnahmen(a: TagesEintrag['einnahmen'], b: TagesEintrag['einnahmen']) {
  const erg = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const vorhanden = erg.get(x.id)
    if (!vorhanden || (x.deletedAt && !vorhanden.deletedAt)) erg.set(x.id, x)
  }
  return [...erg.values()]
}

function mergeKontext(l: TagesFelder['kontext'], r: TagesFelder['kontext']): TagesFelder['kontext'] {
  if (!l || !r) return l ?? r
  const lw = l.wetter
  const rw = r.wetter
  const wetter = !lw || !rw ? lw ?? rw : lw.vorlaeufig && !rw.vorlaeufig ? rw : lw
  return { wetter, mond: l.mond ?? r.mond }
}

/** Pro Bereich gewinnt der jüngere Eintrag, pro Episode ebenso. */
export function mergeTag(l: TagesEintrag, r: TagesEintrag): TagesEintrag {
  const neuerer = zeit(r.updatedAt) > zeit(l.updatedAt) ? r : l
  const erg: TagesEintrag = {
    datum: l.datum,
    schemaVersion: 1,
    quelle: neuerer.quelle,
    updatedAt: neuerer.updatedAt,
    stempel: {},
    episoden: mergeNachZeit(l.episoden, r.episoden),
    einnahmen: mergeEinnahmen(l.einnahmen, r.einnahmen),
  }
  const ziel = erg as unknown as Record<string, unknown>
  for (const feld of BEREICHE) {
    const quelle = zeit(r.stempel[feld]) > zeit(l.stempel[feld]) ? r : l
    if (quelle[feld] !== undefined) ziel[feld] = quelle[feld]
    if (quelle.stempel[feld]) erg.stempel[feld] = quelle.stempel[feld]
  }
  const kontext = mergeKontext(l.kontext, r.kontext)
  if (kontext) erg.kontext = kontext
  return erg
}

export const mergeKrankheit = (l: Krankheit, r: Krankheit): Krankheit =>
  zeit(r.updatedAt) > zeit(l.updatedAt) ? r : l

function sortiert(wert: unknown): unknown {
  if (Array.isArray(wert)) return wert.map(sortiert)
  if (wert && typeof wert === 'object') {
    return Object.fromEntries(
      Object.entries(wert as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, sortiert(v)]),
    )
  }
  return wert
}

const nachId = <T extends { id: string }>(liste: T[]) =>
  [...liste].sort((a, b) => (a.id < b.id ? -1 : 1))

/** Immer gleicher Text für gleiche Daten, damit Vergleiche über den Git-Hash stimmen. */
export function serialisiereTag(t: TagesEintrag): string {
  return `${JSON.stringify(sortiert({ ...t, episoden: nachId(t.episoden), einnahmen: nachId(t.einnahmen) }), null, 2)}\n`
}

export const serialisiere = (wert: unknown): string => `${JSON.stringify(sortiert(wert), null, 2)}\n`
