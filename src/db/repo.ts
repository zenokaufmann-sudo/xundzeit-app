import { db } from './db'
import { addTage, isoLokal, logischerTag } from '../domain/datum'
import {
  ABSCHWELLEND_NAME, KORTISON_NAME, MEDIKAMENTE, STANDARD_EINSTELLUNGEN, type Einstellungen,
} from '../domain/katalog'
import { aktiveEpisoden, WIE_GESTERN_FELDER } from '../domain/logik'
import type {
  Datum, KopfwehEpisode, Krankheit, MedikamentEinnahme, Nacht, Quelle,
  TagesEintrag, TagesFeld, TagesFelder, AbschwellendZeit,
} from '../domain/types'

const leer = (datum: Datum, jetzt: string, quelle: Quelle = 'erfasst'): TagesEintrag => ({
  datum, schemaVersion: 1, quelle, updatedAt: jetzt, stempel: {}, episoden: [], einnahmen: [],
})

async function aendern(datum: Datum, fn: (t: TagesEintrag, jetzt: string) => void, quelle?: Quelle) {
  await db.transaction('rw', db.tage, async () => {
    const jetzt = isoLokal(new Date())
    const t = (await db.tage.get(datum)) ?? leer(datum, jetzt, quelle)
    fn(t, jetzt)
    t.updatedAt = jetzt
    await db.tage.put(t)
  })
}

function setzen(t: TagesEintrag, felder: Partial<TagesFelder>, jetzt: string) {
  Object.assign(t, felder)
  for (const k of Object.keys(felder) as TagesFeld[]) t.stempel[k] = jetzt
}

export const aendereTag = (datum: Datum, felder: Partial<TagesFelder>) =>
  aendern(datum, (t, jetzt) => setzen(t, felder, jetzt))

export const aendereNacht = (datum: Datum, teil: Partial<Nacht>) =>
  aendern(datum, (t, jetzt) => setzen(t, { nacht: { ...t.nacht, ...teil } }, jetzt))

/** Füllt nur Felder, die noch leer sind. */
export const bestaetige = (datum: Datum, felder: Partial<TagesFelder>) =>
  aendern(datum, (t, jetzt) => {
    const nurLeere = Object.fromEntries(
      Object.entries(felder).filter(([k, v]) => v !== undefined && t[k as TagesFeld] === undefined),
    ) as Partial<TagesFelder>
    setzen(t, nurLeere, jetzt)
  })

export async function wieGestern(datum: Datum): Promise<number> {
  const gestern = await db.tage.get(addTage(datum, -1))
  if (!gestern) return 0
  let uebernommen = 0
  await aendern(datum, (t, jetzt) => {
    for (const feld of WIE_GESTERN_FELDER) {
      const wert = gestern[feld]
      if (wert !== undefined && t[feld] === undefined) {
        setzen(t, { [feld]: wert }, jetzt)
        uebernommen += 1
      }
    }
  }, 'wie-gestern')
  return uebernommen
}

export const setzeKeinKopfweh = (datum: Datum, keines: boolean) =>
  aendern(datum, (t, jetzt) => {
    if (aktiveEpisoden(t).length > 0) return
    setzen(t, { kopfwehStatus: keines ? 'keines' : undefined }, jetzt)
  })

export const nachtragenWieUeblich = (datum: Datum, felder: Partial<TagesFelder>) =>
  aendern(datum, (t, jetzt) => {
    t.quelle = 'nachgetragen-wie-ueblich'
    setzen(t, { ...felder, kopfwehStatus: 'keines' }, jetzt)
  }, 'nachgetragen-wie-ueblich')

function statusAbleiten(t: TagesEintrag, jetzt: string) {
  if (aktiveEpisoden(t).length > 0) setzen(t, { kopfwehStatus: 'hatte' }, jetzt)
  else if (t.kopfwehStatus === 'hatte') setzen(t, { kopfwehStatus: undefined }, jetzt)
}

export async function neueEpisode(teil: Partial<KopfwehEpisode>, jetzt = new Date()): Promise<string> {
  const beginn = teil.beginn ?? isoLokal(jetzt)
  const episode: KopfwehEpisode = {
    id: crypto.randomUUID(), updatedAt: isoLokal(jetzt), zonen: [], medikamente: [], ...teil, beginn,
  }
  await aendern(logischerTag(new Date(beginn)), (t, stempel) => {
    t.episoden.push(episode)
    statusAbleiten(t, stempel)
  })
  return episode.id
}

async function findeTagMitEpisode(id: string) {
  return db.tage.filter((t) => t.episoden.some((e) => e.id === id)).first()
}

export async function aendereEpisode(id: string, fn: (e: KopfwehEpisode) => void) {
  await db.transaction('rw', db.tage, async () => {
    const t = await findeTagMitEpisode(id)
    if (!t) return
    const episode = t.episoden.find((e) => e.id === id)!
    const jetzt = isoLokal(new Date())
    fn(episode)
    episode.updatedAt = jetzt

    const zielDatum = logischerTag(new Date(episode.beginn))
    if (zielDatum !== t.datum) {
      t.episoden = t.episoden.filter((e) => e.id !== id)
      const ziel = (await db.tage.get(zielDatum)) ?? leer(zielDatum, jetzt)
      ziel.episoden.push(episode)
      statusAbleiten(ziel, jetzt)
      ziel.updatedAt = jetzt
      await db.tage.put(ziel)
    }
    statusAbleiten(t, jetzt)
    t.updatedAt = jetzt
    await db.tage.put(t)
  })
}

export const loescheEpisode = (id: string) =>
  aendereEpisode(id, (e) => { e.deletedAt = isoLokal(new Date()) })

export const beendeEpisode = (id: string, jetzt = new Date()) =>
  aendereEpisode(id, (e) => {
    e.ende = isoLokal(jetzt)
    e.laeuft = false
  })

/** Wiederholt das letzte Medikament dieser Episode, sonst das Standardmedikament. */
export async function einnahmeMitStandard(id: string, jetzt = new Date()): Promise<MedikamentEinnahme> {
  const tag = await findeTagMitEpisode(id)
  const letzte = tag?.episoden.find((e) => e.id === id)?.medikamente.at(-1)
  const standard = (await ladeEinstellungen()).medikamente[0] ?? MEDIKAMENTE[0]
  const einnahme: MedikamentEinnahme = {
    id: crypto.randomUUID(),
    name: letzte?.name ?? standard.name,
    dosisMg: letzte ? letzte.dosisMg : standard.standard,
    zeit: isoLokal(jetzt),
  }
  await aendereEpisode(id, (e) => {
    e.medikamente.push(einnahme)
    e.keinMedikament = false
  })
  return einnahme
}

/** Gleicht die Abschwellend-Einnahmen des Tages mit den gewählten Zeitpunkten ab. */
export const setzeAbschwellend = (datum: Datum, zeiten: AbschwellendZeit[], jetzt = new Date(), name = ABSCHWELLEND_NAME) =>
  aendern(datum, (t, stempel) => {
    const aktive = t.einnahmen.filter((e) => e.typ === 'abschwellend' && !e.deletedAt && e.zeitpunkt)
    for (const e of aktive) if (!zeiten.includes(e.zeitpunkt!)) e.deletedAt = stempel
    for (const zeitpunkt of zeiten) {
      if (!aktive.some((e) => e.zeitpunkt === zeitpunkt)) {
        t.einnahmen.push({
          id: crypto.randomUUID(), typ: 'abschwellend', name, zeit: isoLokal(jetzt), zeitpunkt,
        })
      }
    }
  })

/** Setzt die Sprühstösse für morgens oder abends. Ohne `stoesse` wird die Einnahme entfernt. */
export const setzeKortison = (
  datum: Datum, slot: 'morgens' | 'abends', stoesse: 1 | 2 | undefined, jetzt = new Date(), name = KORTISON_NAME,
) =>
  aendern(datum, (t, stempel) => {
    const vorhanden = t.einnahmen.find((e) => e.typ === 'kortison' && e.slot === slot && !e.deletedAt)
    if (vorhanden) {
      if (stoesse) vorhanden.stoesse = stoesse
      else vorhanden.deletedAt = stempel
    } else if (stoesse) {
      t.einnahmen.push({
        id: crypto.randomUUID(), typ: 'kortison', name, zeit: isoLokal(jetzt), stoesse, slot,
      })
    }
  })

export async function neueKrankheit(teil: Partial<Krankheit> & { beginn: Datum }): Promise<string> {
  const id = crypto.randomUUID()
  await db.krankheiten.put({ id, updatedAt: isoLokal(new Date()), symptome: [], ...teil })
  return id
}

export async function aendereKrankheit(id: string, fn: (k: Krankheit) => void) {
  await db.transaction('rw', db.krankheiten, async () => {
    const k = await db.krankheiten.get(id)
    if (!k) return
    fn(k)
    k.updatedAt = isoLokal(new Date())
    await db.krankheiten.put(k)
  })
}

export async function ladeEinstellungen(): Promise<Einstellungen> {
  const gespeichert = (await db.settings.get('app'))?.wert as Partial<Einstellungen> | undefined
  return { ...STANDARD_EINSTELLUNGEN, ...gespeichert }
}

export async function aendereEinstellungen(teil: Partial<Einstellungen>) {
  await db.transaction('rw', db.settings, async () => {
    const gespeichert = (await db.settings.get('app'))?.wert as Partial<Einstellungen> | undefined
    await db.settings.put({ key: 'app', wert: { ...gespeichert, ...teil } })
  })
}

/** Automatische Kontextdaten zählen nicht als Änderung durch die Nutzerin oder den Nutzer. */
export async function setzeKontext(datum: Datum, teil: NonNullable<TagesFelder['kontext']>) {
  await db.transaction('rw', db.tage, async () => {
    const t = await db.tage.get(datum)
    if (t) await db.tage.update(datum, { kontext: { ...t.kontext, ...teil } })
  })
}
