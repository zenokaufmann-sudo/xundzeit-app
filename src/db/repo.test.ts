import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  aendereEinstellungen, aendereEpisode, aendereKrankheit, aendereTag, bestaetige, beendeEpisode, einnahmeMitStandard,
  ladeEinstellungen, neueKrankheit,
  loescheEpisode, nachtragenWieUeblich, neueEpisode, setzeKeinKopfweh, setzeKortison, setzeAbschwellend, wieGestern,
} from './repo'

beforeEach(async () => {
  await db.tage.clear()
  await db.settings.clear()
  await db.krankheiten.clear()
})

const jetzt = new Date(2026, 10, 8, 14)

describe('Tage', () => {
  it('setzt Stempel pro Bereich', async () => {
    await aendereTag('2026-11-08', { befinden: 4 })
    const t = await db.tage.get('2026-11-08')
    expect(t?.stempel.befinden).toBeDefined()
    expect(t?.stempel.koffein).toBeUndefined()
  })
  it('überschreibt beim Bestätigen keine eigenen Angaben', async () => {
    await aendereTag('2026-11-08', { kopfBelastung: 5 })
    await bestaetige('2026-11-08', { kopfBelastung: 2, koffein: { ja: false } })
    const t = await db.tage.get('2026-11-08')
    expect(t?.kopfBelastung).toBe(5)
    expect(t?.koffein).toEqual({ ja: false })
  })
  it('«Wie gestern» übernimmt ohne Alkohol und ohne Kopfweh-Status', async () => {
    await aendereTag('2026-11-07', {
      koffein: { ja: true, portionen: 1 }, alkohol: { ja: true, getraenke: 2 }, kopfwehStatus: 'keines',
    })
    await wieGestern('2026-11-08')
    const t = await db.tage.get('2026-11-08')
    expect(t?.koffein?.portionen).toBe(1)
    expect(t?.alkohol).toBeUndefined()
    expect(t?.kopfwehStatus).toBeUndefined()
    expect(t?.quelle).toBe('wie-gestern')
  })
  it('markiert Nachgetragenes', async () => {
    await nachtragenWieUeblich('2026-11-06', { kopfBelastung: 3 })
    const t = await db.tage.get('2026-11-06')
    expect(t?.quelle).toBe('nachgetragen-wie-ueblich')
    expect(t?.kopfwehStatus).toBe('keines')
  })
})

describe('Episoden', () => {
  it('setzt beim Erfassen den Status und hebt «kein Kopfweh» auf', async () => {
    await setzeKeinKopfweh('2026-11-08', true)
    await neueEpisode({ zonen: ['stirn-l'] }, jetzt)
    expect((await db.tage.get('2026-11-08'))?.kopfwehStatus).toBe('hatte')
  })
  it('entfernt den Status, wenn die letzte Episode gelöscht wird', async () => {
    const id = await neueEpisode({}, jetzt)
    await loescheEpisode(id)
    const t = await db.tage.get('2026-11-08')
    expect(t?.kopfwehStatus).toBeUndefined()
    expect(t?.episoden[0].deletedAt).toBeDefined()
  })
  it('zieht um, wenn der Beginn auf einen anderen Tag wechselt', async () => {
    const id = await neueEpisode({}, jetzt)
    await aendereEpisode(id, (e) => { e.beginn = '2026-11-07T20:00:00+01:00' })
    expect((await db.tage.get('2026-11-08'))?.episoden).toHaveLength(0)
    expect((await db.tage.get('2026-11-07'))?.episoden).toHaveLength(1)
    expect((await db.tage.get('2026-11-07'))?.kopfwehStatus).toBe('hatte')
  })
  it('beendet eine Episode', async () => {
    const id = await neueEpisode({}, jetzt)
    await beendeEpisode(id, new Date(2026, 10, 8, 16))
    expect((await db.tage.get('2026-11-08'))?.episoden[0].ende).toContain('T16:00')
  })
  it('nimmt in einer neuen Episode immer den Standard, auch nach anderem Medikament', async () => {
    await neueEpisode({
      medikamente: [{ id: 'm', name: 'Ibuprofen', dosisMg: 600, zeit: '2026-11-07T09:00:00+01:00' }],
      beginn: '2026-11-07T09:00:00+01:00',
    })
    const b = await neueEpisode({}, jetzt)
    const einnahme = await einnahmeMitStandard(b, jetzt)
    expect(einnahme.name).toBe('Paracetamol')
    expect(einnahme.dosisMg).toBe(500)
  })
  it('wiederholt innerhalb einer Episode das letzte Medikament', async () => {
    const id = await neueEpisode({
      medikamente: [{ id: 'm', name: 'Ibuprofen', dosisMg: 600, zeit: '2026-11-08T13:00:00+01:00' }],
    }, jetzt)
    const einnahme = await einnahmeMitStandard(id, jetzt)
    expect(einnahme.name).toBe('Ibuprofen')
    expect(einnahme.dosisMg).toBe(600)
  })
})

describe('Kortison-Spray', () => {
  const aktive = async () =>
    (await db.tage.get('2026-11-08'))?.einnahmen.filter((e) => !e.deletedAt) ?? []

  it('führt morgens und abends getrennt', async () => {
    await setzeKortison('2026-11-08', 'morgens', 1, jetzt)
    await setzeKortison('2026-11-08', 'abends', 2, jetzt)
    const e = await aktive()
    expect(e.map((x) => [x.slot, x.stoesse, x.name])).toEqual([
      ['morgens', 1, 'Kortison-Nasenspray'],
      ['abends', 2, 'Kortison-Nasenspray'],
    ])
  })
  it('ändert die Sprühstösse, ohne eine zweite Einnahme anzulegen', async () => {
    await setzeKortison('2026-11-08', 'morgens', 1, jetzt)
    await setzeKortison('2026-11-08', 'morgens', 2, jetzt)
    expect((await aktive()).map((x) => x.stoesse)).toEqual([2])
  })
  it('entfernt die Einnahme als gelöscht markiert', async () => {
    await setzeKortison('2026-11-08', 'morgens', 1, jetzt)
    await setzeKortison('2026-11-08', 'morgens', undefined, jetzt)
    expect(await aktive()).toHaveLength(0)
    expect((await db.tage.get('2026-11-08'))?.einnahmen[0].deletedAt).toBeDefined()
  })
})

describe('Einstellungen', () => {
  it('liefert Standardwerte und übernimmt Änderungen', async () => {
    expect((await ladeEinstellungen()).wasser).toBe(false)
    await aendereEinstellungen({ wasser: true })
    await aendereEinstellungen({ kortisonName: 'Neu' })
    const e = await ladeEinstellungen()
    expect(e.wasser).toBe(true)
    expect(e.kortisonName).toBe('Neu')
    expect(e.medikamente[0].name).toBe('Paracetamol')
  })
  it('nimmt das erste Medikament der Liste als Standard', async () => {
    await aendereEinstellungen({ medikamente: [{ name: 'Aspirin', dosen: [500], standard: 500 }] })
    const id = await neueEpisode({}, jetzt)
    expect((await einnahmeMitStandard(id, jetzt)).name).toBe('Aspirin')
  })
})

describe('Krankheit', () => {
  it('legt an und ändert', async () => {
    const id = await neueKrankheit({ beginn: '2026-11-05' })
    await aendereKrankheit(id, (k) => { k.art = 'erkaeltung'; k.ende = '2026-11-08' })
    expect(await db.krankheiten.get(id)).toMatchObject({ art: 'erkaeltung', ende: '2026-11-08', beginn: '2026-11-05' })
  })
})

describe('Abschwellendes Nasenspray', () => {
  const aktive = async () =>
    (await db.tage.get('2026-11-08'))?.einnahmen.filter((e) => !e.deletedAt).map((e) => e.zeitpunkt) ?? []

  it('legt pro Zeitpunkt eine Einnahme an', async () => {
    await setzeAbschwellend('2026-11-08', ['aufstehen', 'abends'], jetzt)
    expect(await aktive()).toEqual(['aufstehen', 'abends'])
  })
  it('legt beim erneuten Speichern keine Doppelten an', async () => {
    await setzeAbschwellend('2026-11-08', ['aufstehen'], jetzt)
    await setzeAbschwellend('2026-11-08', ['aufstehen', 'mittags'], jetzt)
    expect(await aktive()).toEqual(['aufstehen', 'mittags'])
  })
  it('markiert abgewählte Zeitpunkte als gelöscht', async () => {
    await setzeAbschwellend('2026-11-08', ['aufstehen', 'mittags'], jetzt)
    await setzeAbschwellend('2026-11-08', ['mittags'], jetzt)
    expect(await aktive()).toEqual(['mittags'])
    expect((await db.tage.get('2026-11-08'))?.einnahmen).toHaveLength(2)
  })
})
