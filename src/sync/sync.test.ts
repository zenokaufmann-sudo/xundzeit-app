import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { Krankheit, TagesEintrag } from '../domain/types'
import { gitSha, SyncFehler } from './github'
import { mergeTag, serialisiereTag } from './merge'
import { synchronisiere, syncWennMoeglich, speichereKonfig } from './sync'

const K = { token: 't', repo: 'ich/daten' }

const tag = (datum: string, felder: Partial<TagesEintrag> = {}): TagesEintrag => ({
  datum, schemaVersion: 1, quelle: 'erfasst', updatedAt: `${datum}T08:00:00+01:00`,
  stempel: {}, episoden: [], einnahmen: [], ...felder,
})

class FakeGitHub {
  dateien = new Map<string, string>()
  commits = 0
  status = 200
  blobs = new Map<string, string>()

  patchFehler = 0
  ohneNoStore = 0
  wartend: { path: string; content: string }[] = []

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    if (init?.cache !== 'no-store') this.ohneNoStore += 1
    if (this.status !== 200) return new Response('{}', { status: this.status })
    if (url.endsWith('git/refs/heads/main') && this.patchFehler > 0) {
      this.patchFehler -= 1
      return new Response('{"message":"Update is not a fast forward"}', { status: 422 })
    }
    const pfad = url.replace('https://api.github.com/repos/ich/daten/', '')
    const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 })
    if (pfad === 'git/trees/main?recursive=1') {
      const tree = await Promise.all([...this.dateien].map(async ([path, inhalt]) => {
        const sha = await gitSha(inhalt)
        this.blobs.set(sha, inhalt)
        return { path, type: 'blob', sha }
      }))
      return json({ tree })
    }
    if (pfad.startsWith('git/blobs/')) {
      const inhalt = this.blobs.get(pfad.slice(10))!
      const bytes = new TextEncoder().encode(inhalt)
      return json({ content: btoa(String.fromCharCode(...bytes)) })
    }
    if (pfad === 'git/ref/heads/main') return json({ object: { sha: 'c1' } })
    if (pfad === 'git/commits/c1') return json({ tree: { sha: 'b1' } })
    if (pfad === 'git/trees' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { tree: { path: string; content: string }[] }
      this.wartend = body.tree
      return json({ sha: 'b2' })
    }
    if (pfad === 'git/commits') return json({ sha: 'c2' })
    if (pfad === 'git/refs/heads/main') {
      for (const e of this.wartend) this.dateien.set(e.path, e.content)
      this.commits += 1
      return json({})
    }
    throw new Error(`Unerwartet: ${pfad}`)
  }
}

let gh: FakeGitHub

beforeEach(async () => {
  await Promise.all([db.tage.clear(), db.krankheiten.clear(), db.garmin.clear(), db.reports.clear(), db.settings.clear()])
  gh = new FakeGitHub()
  globalThis.fetch = ((url: string, init?: RequestInit) => gh.fetch(url, init)) as typeof fetch
})

describe('Git-Hash', () => {
  it('entspricht dem Hash von Git', async () => {
    expect(await gitSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })
})

describe('Zusammenführen', () => {
  it('nimmt pro Bereich den jüngeren Wert', () => {
    const l = tag('2026-11-08', { befinden: 2, koffein: { ja: false }, stempel: { befinden: '2026-11-08T10:00:00+01:00', koffein: '2026-11-08T22:00:00+01:00' } })
    const r = tag('2026-11-08', { befinden: 5, koffein: { ja: true }, stempel: { befinden: '2026-11-08T20:00:00+01:00', koffein: '2026-11-08T09:00:00+01:00' } })
    const m = mergeTag(l, r)
    expect(m.befinden).toBe(5)
    expect(m.koffein).toEqual({ ja: false })
  })
  it('vergleicht Zeiten mit Zeitzone richtig', () => {
    const l = tag('2026-11-08', { befinden: 1, stempel: { befinden: '2026-11-08T12:00:00+02:00' } })
    const r = tag('2026-11-08', { befinden: 5, stempel: { befinden: '2026-11-08T11:30:00+01:00' } })
    expect(mergeTag(l, r).befinden).toBe(5)
  })
  it('übernimmt auch das Leeren eines Feldes, wenn es jünger ist', () => {
    const l = tag('2026-11-08', { kopfwehStatus: 'keines', stempel: { kopfwehStatus: '2026-11-08T10:00:00+01:00' } })
    const r = tag('2026-11-08', { stempel: { kopfwehStatus: '2026-11-08T11:00:00+01:00' } })
    expect(mergeTag(l, r).kopfwehStatus).toBeUndefined()
  })
  it('führt Episoden einzeln zusammen und behält Löschungen', () => {
    const ep = (id: string, updatedAt: string, deletedAt?: string) =>
      ({ id, updatedAt, beginn: '2026-11-08T10:00:00+01:00', zonen: [], medikamente: [], deletedAt })
    const l = tag('2026-11-08', { episoden: [ep('a', '2026-11-08T10:00:00+01:00'), ep('b', '2026-11-08T10:00:00+01:00')] })
    const r = tag('2026-11-08', { episoden: [ep('a', '2026-11-08T12:00:00+01:00', '2026-11-08T12:00:00+01:00'), ep('c', '2026-11-08T09:00:00+01:00')] })
    const m = mergeTag(l, r)
    expect(m.episoden.map((e) => e.id).sort()).toEqual(['a', 'b', 'c'])
    expect(m.episoden.find((e) => e.id === 'a')?.deletedAt).toBeDefined()
  })
  it('zieht endgültiges Wetter dem vorläufigen vor', () => {
    const w = { druckMittel: 1, druckMin: 1, druckMax: 1, delta24h: 0, maxDelta3h: 0, tempMittel: 0, feuchte: 0, ort: 'x' }
    const l = tag('2026-11-08', { kontext: { wetter: { ...w, vorlaeufig: true } } })
    const r = tag('2026-11-08', { kontext: { wetter: { ...w, druckMittel: 2 } } })
    expect(mergeTag(l, r).kontext?.wetter?.druckMittel).toBe(2)
  })
  it('serialisiert unabhängig von der Reihenfolge gleich', () => {
    const a = tag('2026-11-08', { befinden: 3, koffein: { ja: false } })
    const b = { ...tag('2026-11-08'), koffein: { ja: false }, befinden: 3 } as TagesEintrag
    expect(serialisiereTag(a)).toBe(serialisiereTag(b))
  })
})

describe('Sync', () => {
  it('sendet neue Einträge als einen Commit', async () => {
    await db.tage.bulkPut([tag('2026-11-07', { befinden: 3 }), tag('2026-11-08', { befinden: 4 })])
    const e = await synchronisiere(K)
    expect(e.gesendet).toBe(2)
    expect(gh.commits).toBe(1)
    expect(gh.dateien.has('entries/2026-11-08.json')).toBe(true)
  })
  it('macht beim zweiten Lauf nichts mehr', async () => {
    await db.tage.put(tag('2026-11-08', { befinden: 4 }))
    await synchronisiere(K)
    const e = await synchronisiere(K)
    expect(e).toEqual({ geholt: 0, gesendet: 0 })
    expect(gh.commits).toBe(1)
  })
  it('holt Einträge eines anderen Geräts', async () => {
    gh.dateien.set('entries/2026-11-05.json', serialisiereTag(tag('2026-11-05', { befinden: 5 })))
    const e = await synchronisiere(K)
    expect(e.geholt).toBe(1)
    expect((await db.tage.get('2026-11-05'))?.befinden).toBe(5)
    expect(gh.commits).toBe(0)
  })
  it('führt Konflikte zusammen und sendet das Ergebnis', async () => {
    await db.tage.put(tag('2026-11-08', { befinden: 2, stempel: { befinden: '2026-11-08T21:00:00+01:00' } }))
    gh.dateien.set('entries/2026-11-08.json', serialisiereTag(tag('2026-11-08', { koffein: { ja: true }, stempel: { koffein: '2026-11-08T20:00:00+01:00' } })))
    await synchronisiere(K)
    const lokal = await db.tage.get('2026-11-08')
    expect(lokal).toMatchObject({ befinden: 2, koffein: { ja: true } })
    expect(gh.dateien.get('entries/2026-11-08.json')).toBe(serialisiereTag(lokal!))
    expect((await synchronisiere(K)).gesendet).toBe(0)
  })
  it('überspielt Krankheiten', async () => {
    const k: Krankheit = { id: 'k1', updatedAt: '2026-11-08T10:00:00+01:00', symptome: [], beginn: '2026-11-07' }
    await db.krankheiten.put(k)
    await synchronisiere(K)
    expect(gh.dateien.has('krankheiten/k1.json')).toBe(true)
  })
  it('liest Garmin und Reports, ohne sie zu verändern', async () => {
    gh.dateien.set('garmin/2026-11-07.json', JSON.stringify({ datum: '2026-11-07', schemaVersion: 1, ruhepuls: 48 }))
    gh.dateien.set('reports/2026-W45.json', JSON.stringify({ woche: '2026-W45', schemaVersion: 1 }))
    await synchronisiere(K)
    expect((await db.garmin.get('2026-11-07'))?.daten.ruhepuls).toBe(48)
    expect((await db.reports.get('2026-W45'))?.daten.woche).toBe('2026-W45')
    expect(gh.commits).toBe(0)
  })
  it('lässt sich von einer kaputten Datei nicht aufhalten', async () => {
    gh.dateien.set('entries/2026-11-01.json', '{kaputt')
    await db.tage.put(tag('2026-11-08', { befinden: 4 }))
    expect((await synchronisiere(K)).gesendet).toBe(1)
  })
  it('meldet einen ungültigen Token verständlich', async () => {
    gh.status = 401
    await expect(synchronisiere(K)).rejects.toThrow(SyncFehler)
    await speichereKonfig({ token: 'x', repo: 'ich/daten' })
    await syncWennMoeglich()
    const s = (await db.settings.get('syncStatus'))?.wert as { fehler?: string }
    expect(s.fehler).toContain('Token')
  })
  it('umgeht bei jeder Anfrage den Browser-Zwischenspeicher', async () => {
    await db.tage.put(tag('2026-11-08', { befinden: 4 }))
    await synchronisiere(K)
    expect(gh.ohneNoStore).toBe(0)
  })
  it('versucht es nach einem Schreibkonflikt erneut', async () => {
    gh.patchFehler = 1
    await db.tage.put(tag('2026-11-08', { befinden: 4 }))
    await speichereKonfig(K)
    await syncWennMoeglich()
    const s = (await db.settings.get('syncStatus'))?.wert as { fehler?: string; zuletzt?: string }
    expect(s.fehler).toBeUndefined()
    expect(s.zuletzt).toBeDefined()
    expect(gh.commits).toBe(1)
  })
  it('meldet einen bleibenden Schreibkonflikt verständlich', async () => {
    gh.patchFehler = 2
    await db.tage.put(tag('2026-11-08', { befinden: 4 }))
    await speichereKonfig(K)
    await syncWennMoeglich()
    const s = (await db.settings.get('syncStatus'))?.wert as { fehler?: string }
    expect(s.fehler).toContain('nächste Sync')
  })
  it('läuft ohne Token gar nicht', async () => {
    gh.status = 500
    await syncWennMoeglich()
    expect(await db.settings.get('syncStatus')).toBeUndefined()
  })
})
