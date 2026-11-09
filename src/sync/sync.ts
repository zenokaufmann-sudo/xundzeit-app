import { db } from '../db/db'
import { isoLokal } from '../domain/datum'
import type { GarminTag, WochenReport } from '../domain/externe'
import type { Krankheit, TagesEintrag } from '../domain/types'
import { baum, blob, commit, gitSha, SyncFehler, type SyncKonfig } from './github'
import { mergeKrankheit, mergeTag, serialisiere, serialisiereTag } from './merge'

export const STANDARD_REPO = 'zenokaufmann-sudo/xundzeit-daten'

export interface SyncStatus { zuletzt?: string; fehler?: string; laeuft?: boolean }

export async function ladeKonfig(): Promise<SyncKonfig | undefined> {
  const k = (await db.settings.get('sync'))?.wert as Partial<SyncKonfig> | undefined
  return k?.token ? { token: k.token, repo: k.repo || STANDARD_REPO } : undefined
}

export async function speichereKonfig(k: Partial<SyncKonfig>) {
  const alt = (await db.settings.get('sync'))?.wert as Partial<SyncKonfig> | undefined
  await db.settings.put({ key: 'sync', wert: { ...alt, ...k } })
}

const setzeStatus = (s: SyncStatus) => db.settings.put({ key: 'syncStatus', wert: s })

const leseJson = <T,>(text: string): T | undefined => {
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined // Eine kaputte Datei darf den Sync nicht blockieren.
  }
}

export interface SyncErgebnis { geholt: number; gesendet: number }

export async function synchronisiere(k: SyncKonfig): Promise<SyncErgebnis> {
  const entfernt = await baum(k)
  const senden: { pfad: string; inhalt: string }[] = []
  let geholt = 0

  // Tageseinträge
  const lokaleTage = new Map((await db.tage.toArray()).map((t) => [t.datum, t]))
  const entfernteTage = [...entfernt.keys()].flatMap((p) => /^entries\/(\d{4}-\d{2}-\d{2})\.json$/.exec(p)?.[1] ?? [])
  for (const datum of new Set([...lokaleTage.keys(), ...entfernteTage])) {
    const pfad = `entries/${datum}.json`
    const sha = entfernt.get(pfad)
    const lokal = lokaleTage.get(datum)
    if (lokal && sha === (await gitSha(serialisiereTag(lokal)))) continue

    const remote = sha ? leseJson<TagesEintrag>(await blob(k, sha)) : undefined
    if (sha && !remote) continue
    // Innerhalb der Transaktion erneut lesen, damit eine Eingabe während des Syncs nicht verloren geht.
    const ziel = await db.transaction('rw', db.tage, async () => {
      const aktuell = await db.tage.get(datum)
      const merged = aktuell && remote ? mergeTag(aktuell, remote) : (aktuell ?? remote)!
      if (!aktuell || serialisiereTag(aktuell) !== serialisiereTag(merged)) {
        await db.tage.put(merged)
        if (remote) geholt += 1
      }
      return merged
    })
    const inhalt = serialisiereTag(ziel)
    if ((await gitSha(inhalt)) !== sha) senden.push({ pfad, inhalt })
  }

  // Krankheiten
  const lokaleKrankheiten = new Map((await db.krankheiten.toArray()).map((x) => [x.id, x]))
  const entfernteKrankheiten = [...entfernt.keys()].flatMap((p) => /^krankheiten\/(.+)\.json$/.exec(p)?.[1] ?? [])
  for (const id of new Set([...lokaleKrankheiten.keys(), ...entfernteKrankheiten])) {
    const pfad = `krankheiten/${id}.json`
    const sha = entfernt.get(pfad)
    const lokal = lokaleKrankheiten.get(id)
    if (lokal && sha === (await gitSha(serialisiere(lokal)))) continue

    const remote = sha ? leseJson<Krankheit>(await blob(k, sha)) : undefined
    if (sha && !remote) continue
    const ziel = await db.transaction('rw', db.krankheiten, async () => {
      const aktuell = await db.krankheiten.get(id)
      const merged = aktuell && remote ? mergeKrankheit(aktuell, remote) : (aktuell ?? remote)!
      if (!aktuell || serialisiere(aktuell) !== serialisiere(merged)) {
        await db.krankheiten.put(merged)
        if (remote) geholt += 1
      }
      return merged
    })
    const inhalt = serialisiere(ziel)
    if ((await gitSha(inhalt)) !== sha) senden.push({ pfad, inhalt })
  }

  // Garmin und Reports werden nur gelesen.
  for (const [pfad, sha] of entfernt) {
    const garmin = /^garmin\/(\d{4}-\d{2}-\d{2})\.json$/.exec(pfad)?.[1]
    if (garmin && (await db.garmin.get(garmin))?.sha !== sha) {
      const daten = leseJson<GarminTag>(await blob(k, sha))
      if (daten) await db.garmin.put({ datum: garmin, sha, daten })
    }
    const woche = /^reports\/(\d{4}-W\d{2})\.json$/.exec(pfad)?.[1]
    if (woche && (await db.reports.get(woche))?.sha !== sha) {
      const daten = leseJson<WochenReport>(await blob(k, sha))
      if (daten) await db.reports.put({ woche, sha, daten })
    }
  }

  if (senden.length > 0) {
    await commit(k, senden, `Xundzeit-Sync: ${senden.length} ${senden.length === 1 ? 'Datei' : 'Dateien'}`)
  }
  return { geholt, gesendet: senden.length }
}

/** Führt den Sync aus, wenn ein Token hinterlegt ist, und hält den Status fest. */
export async function syncWennMoeglich(): Promise<void> {
  const k = await ladeKonfig()
  if (!k) return
  const alt = (await db.settings.get('syncStatus'))?.wert as SyncStatus | undefined
  await setzeStatus({ ...alt, laeuft: true })
  try {
    await synchronisiere(k).catch((e: unknown) => {
      // Hat ein anderes Gerät gleichzeitig geschrieben, genügt ein neuer Durchlauf.
      if (e instanceof SyncFehler && e.status === 422) return synchronisiere(k)
      throw e
    })
    await setzeStatus({ zuletzt: isoLokal(new Date()) })
  } catch (e) {
    await setzeStatus({ zuletzt: alt?.zuletzt, fehler: e instanceof SyncFehler ? e.message : 'Sync fehlgeschlagen' })
  }
}
