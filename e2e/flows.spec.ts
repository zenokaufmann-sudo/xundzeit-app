import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { TagesEintrag } from '../src/domain/types'

const AUSGABE = 'e2e-ergebnis'
mkdirSync(AUSGABE, { recursive: true })

const MORGEN = new Date(2026, 10, 12, 8, 0)
const ABEND = new Date(2026, 10, 12, 21, 30)

interface Messung { flow: string; taps: number; budgetTaps: number; schaetzungS: number; budgetS: number }
const messungen: Messung[] = []

// Modell: 1 s Orientierung, dann 1,5 s pro Tap (lesen, zielen, tippen).
const schaetzung = (taps: number) => 1 + taps * 1.5

const tag = (datum: string, felder: Partial<TagesEintrag> = {}): TagesEintrag => ({
  datum, schemaVersion: 1, quelle: 'erfasst', updatedAt: `${datum}T21:00:00+01:00`,
  stempel: {}, episoden: [], einnahmen: [], ...felder,
})

const typischerTag = (datum: string) =>
  tag(datum, {
    kopfwehStatus: 'keines',
    nacht: { schlafSubjektiv: 4, display: 'keine' },
    alkohol: { ja: false },
    koffein: { ja: true, portionen: 1, letzte: 'vor12' },
    suessgetraenke: { ja: false },
    massage: { ja: false },
    kopfBelastung: 3,
    koerperBelastung: { stufe: 3 },
    befinden: 4,
  })

const VERLAUF = ['2026-11-09', '2026-11-10', '2026-11-11'].map(typischerTag)

const SPRAY_GESTERN = tag('2026-11-11', {
  einnahmen: [{
    id: 's0', typ: 'kortison', name: 'Kortison-Nasenspray', zeit: '2026-11-11T08:00:00+01:00', slot: 'morgens', stoesse: 1,
  }],
})

async function starten(page: Page, jetzt: Date, seed: TagesEintrag[] = [], installiert = true, app?: unknown) {
  await page.clock.setFixedTime(jetzt)
  await page.addInitScript((inst) => {
    if (inst) Object.defineProperty(navigator, 'standalone', { value: true })
    ;(window as unknown as { __taps: number }).__taps = 0
    window.addEventListener('click', () => {
      ;(window as unknown as { __taps: number }).__taps += 1
    }, true)
  }, installiert)
  await page.goto('./')
  if (seed.length > 0) {
    await page.evaluate(async ([s, einstellungen]) => {
      await (window as unknown as { __db: { tage: { bulkPut: (x: unknown[]) => Promise<void> } } }).__db.tage.bulkPut(s)
      if (einstellungen) await (window as unknown as { __db: { settings: { put: (x: unknown) => Promise<void> } } }).__db.settings.put({ key: 'app', wert: einstellungen })
    }, [seed, app] as const)
    await page.reload()
  }
  await page.locator('.seite').first().waitFor()
}

// Nie echte Netzwerkanfragen aus den Tests.
test.beforeEach(async ({ page }) => {
  await page.route(/open-meteo\.com|api\.github\.com/, (r) => r.fulfill({ json: {} }))
})

const taps = (page: Page) => page.evaluate(() => (window as unknown as { __taps: number }).__taps)

const leseTag = (page: Page, datum: string) =>
  page.evaluate((d) => (window as unknown as {
    __db: { tage: { get: (k: string) => Promise<TagesEintrag | undefined> } }
  }).__db.tage.get(d), datum)

function messen(flow: string, anzahl: number, budgetTaps: number, budgetS: number) {
  const schaetzungS = schaetzung(anzahl)
  messungen.push({ flow, taps: anzahl, budgetTaps, schaetzungS, budgetS })
  expect(anzahl, `${flow}: Taps`).toBeLessThanOrEqual(budgetTaps)
  expect(schaetzungS, `${flow}: Sekunden`).toBeLessThanOrEqual(budgetS)
}

const knopf = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const frage = (page: Page, titel: string) => page.locator('.frage', { hasText: titel })
const inFrage = (page: Page, titel: string, name: string) =>
  frage(page, titel).getByRole('button', { name, exact: true })

async function pruefeTapZiele(page: Page, bereich: string) {
  const zuKlein = await page.evaluate(() => {
    const elemente = [...document.querySelectorAll('button, [role="button"], input')]
    return elemente.flatMap((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return []
      return r.width < 44 || r.height < 44
        ? [`${el.getAttribute('aria-label') ?? el.textContent}: ${Math.round(r.width)}×${Math.round(r.height)}`]
        : []
    })
  })
  expect(zuKlein, `Tap-Ziele in ${bereich}`).toEqual([])
}

test('Morgen ohne Vorgeschichte', async ({ page }) => {
  await starten(page, MORGEN)
  await expect(page.locator('.stand__teil[aria-current="true"]')).toContainText('Morgen')
  await page.screenshot({ path: `${AUSGABE}/heute-morgen.png` })
  await knopf(page, 'Wie hast du geschlafen?: Gut').tap()
  await inFrage(page, 'Display', 'Keine').tap()
  await inFrage(page, 'Alkohol gestern', 'Nein').tap()
  await expect(page.getByText('Morgen erfasst.')).toBeVisible()
  messen('Morgen, ohne Vorschläge', await taps(page), 5, 10)

  const t = await leseTag(page, '2026-11-12')
  expect(t?.nacht).toEqual({ schlafSubjektiv: 4, display: 'keine' })
  expect((await leseTag(page, '2026-11-11'))?.alkohol).toEqual({ ja: false })
})

test('Zeigt den Stand pro Check-in und für den Tag', async ({ page }) => {
  await starten(page, MORGEN)
  const morgen = page.locator('.stand__teil', { hasText: 'Morgen' })
  const abend = page.locator('.stand__teil', { hasText: 'Abend' })

  await expect(morgen).toContainText('0/3')
  await expect(abend).toContainText('0/7')
  await page.screenshot({ path: `${AUSGABE}/stand-leer.png` })

  await knopf(page, 'Wie hast du geschlafen?: Gut').tap()
  await expect(morgen).toContainText('1/3')
  await inFrage(page, 'Display', 'Keine').tap()
  await inFrage(page, 'Alkohol gestern', 'Nein').tap()
  await expect(abend).toContainText('0/7')
  await expect(morgen).toHaveAttribute('aria-label', 'Morgen: komplett')

  await abend.tap()
  await expect(abend).toHaveAttribute('aria-current', 'true')
  await inFrage(page, 'Koffein', 'Nein').tap()
  await inFrage(page, 'Süssgetränke', 'Nein').tap()
  await inFrage(page, 'Massage', 'Nein').tap()
  await knopf(page, 'Kopf-Belastung: Normal').tap()
  await knopf(page, 'Körper-Belastung: Moderat').tap()
  await knopf(page, 'Befinden insgesamt: Gut').tap()
  await expect(abend).toContainText('6/7')
  await inFrage(page, 'Kopfweh heute?', 'Nein').tap()
  await expect(abend).toHaveAttribute('aria-label', 'Abend: komplett')
  await expect(morgen).toHaveAttribute('aria-label', 'Morgen: komplett')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${AUSGABE}/stand-komplett.png` })
})

test('Morgen mit Vorschlägen', async ({ page }) => {
  await starten(page, MORGEN, VERLAUF)
  await pruefeTapZiele(page, 'Heute Morgen')
  await knopf(page, 'Stimmt so').tap()
  await knopf(page, 'Wie hast du geschlafen?: Okay').tap()
  await expect(page.getByText('Morgen erfasst.')).toBeVisible()
  messen('Morgen, mit «Stimmt so»', await taps(page), 5, 10)
})

test('Vorschlag wird erst mit «Stimmt so» gespeichert', async ({ page }) => {
  await starten(page, ABEND, VERLAUF)
  await expect(page.locator('.chip--vorschlag').first()).toBeVisible()
  expect((await leseTag(page, '2026-11-12'))?.koffein).toBeUndefined()
  await page.screenshot({ path: `${AUSGABE}/heute-abend-vorschlaege.png` })
  await pruefeTapZiele(page, 'Heute Abend')
  await knopf(page, 'Stimmt so').tap()
  await expect(page.locator('.chip--vorschlag')).toHaveCount(0)
  expect((await leseTag(page, '2026-11-12'))?.koffein?.portionen).toBe(1)
  expect((await leseTag(page, '2026-11-12'))?.befinden).toBeUndefined()
})

test('Abend ohne Vorgeschichte', async ({ page }) => {
  await starten(page, ABEND)
  await inFrage(page, 'Koffein', 'Ja').tap()
  await inFrage(page, 'Süssgetränke', 'Nein').tap()
  await inFrage(page, 'Massage', 'Nein').tap()
  await knopf(page, 'Kopf-Belastung: Normal').tap()
  await knopf(page, 'Körper-Belastung: Moderat').tap()
  await knopf(page, 'Befinden insgesamt: Gut').tap()
  await inFrage(page, 'Kopfweh heute?', 'Nein').tap()
  await expect(page.getByText('Abend erfasst.')).toBeVisible()
  await page.screenshot({ path: `${AUSGABE}/heute-abend-fertig.png` })
  messen('Abend, ohne Vorschläge', await taps(page), 12, 30)
  expect((await leseTag(page, '2026-11-12'))?.kopfwehStatus).toBe('keines')
})

test('Abend mit Vorschlägen', async ({ page }) => {
  await starten(page, ABEND, VERLAUF)
  await knopf(page, 'Stimmt so').tap()
  await knopf(page, 'Befinden insgesamt: Gut').tap()
  await inFrage(page, 'Kopfweh heute?', 'Nein').tap()
  await expect(page.getByText('Abend erfasst.')).toBeVisible()
  messen('Abend, mit «Stimmt so»', await taps(page), 12, 30)
})

test('Tag wie gestern abschliessen', async ({ page }) => {
  await starten(page, ABEND, VERLAUF)
  await knopf(page, 'Wie gestern').tap()
  await inFrage(page, 'Kopfweh heute?', 'Nein').tap()
  await expect(page.getByText('Abend erfasst.')).toBeVisible()
  messen('Wie gestern + kein Kopfweh', await taps(page), 2, 5)
  const t = await leseTag(page, '2026-11-12')
  expect(t?.quelle).toBe('wie-gestern')
  expect(t?.alkohol).toBeUndefined()
})

test('Kopfweh am Abend eintragen', async ({ page }) => {
  await starten(page, ABEND, VERLAUF)
  await inFrage(page, 'Kopfweh heute?', 'Ja').tap()
  await expect(page.getByRole('heading', { name: 'Kopfweh erfassen' })).toBeVisible()
  await knopf(page, 'Mittag, 11–14 Uhr').tap()
  await expect(knopf(page, 'Mittag, 11–14 Uhr')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-zone="schlaefe-l"]').first().tap()
  await knopf(page, 'Mittel Eingeschränkt').tap()
  await expect(knopf(page, 'Mittel Eingeschränkt')).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${AUSGABE}/kopfweh-erfassen.png` })
  await pruefeTapZiele(page, 'Kopfweh erfassen')
  await knopf(page, 'Paracetamol').tap()
  await expect(knopf(page, 'Paracetamol')).toHaveAttribute('aria-pressed', 'true')
  await knopf(page, 'Fertig').tap()
  await expect(page.getByText('Mittag, Mittel')).toBeVisible()
  await expect(page.getByText(/Kopfweh seit/)).toHaveCount(0)
  await expect(page.locator('.stand__teil', { hasText: 'Abend' })).toContainText('1/7')
  messen('Kopfweh: Ja, Wann, Ort, Stärke, Medikament', await taps(page), 6, 15)
  await page.screenshot({ path: `${AUSGABE}/kopfweh-eingetragen.png` })

  const t = await leseTag(page, '2026-11-12')
  expect(t?.kopfwehStatus).toBe('hatte')
  expect(t?.episoden).toHaveLength(1)
  expect(t?.episoden[0].phasen).toEqual(['mittag'])
  expect(t?.episoden[0].beginn).toContain('T11:00')
  expect(t?.episoden[0].ende).toContain('T14:00')
  expect(t?.episoden[0].laeuft).toBeUndefined()
  expect(t?.episoden[0].zonen).toEqual(['schlaefe-l'])
  expect(t?.episoden[0].staerke).toBe(2)
  expect(t?.episoden[0].medikamente[0]).toMatchObject({ name: 'Paracetamol', dosisMg: 500 })
})

test('Tageszeiten per Ziehen als Bereich wählen', async ({ page }) => {
  await starten(page, ABEND)
  await knopf(page, 'Kopfweh erfassen').tap()
  const box = async (name: string) => (await knopf(page, name).boundingBox())!
  const von = await box('Morgen, 6–11 Uhr')
  const bis = await box('Nachmittag, 14–18 Uhr')
  await page.mouse.move(von.x + von.width / 2, von.y + von.height / 2)
  await page.mouse.down()
  await page.mouse.move(bis.x + bis.width / 2, bis.y + bis.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(knopf(page, 'Mittag, 11–14 Uhr')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await leseTag(page, '2026-11-12'))?.episoden[0]?.phasen)
    .toEqual(['morgen', 'mittag', 'nachmittag'])

  await knopf(page, 'Abend, 18–22 Uhr').tap()
  await expect.poll(async () => (await leseTag(page, '2026-11-12'))?.episoden[0]?.phasen)
    .toEqual(['morgen', 'mittag', 'nachmittag', 'abend'])
})

test('Als laufend markierte Episode bleibt oben fixiert', async ({ page }) => {
  await starten(page, ABEND, [
    ...VERLAUF,
    tag('2026-11-12', {
      kopfwehStatus: 'hatte',
      episoden: [{ id: 'e1', updatedAt: '', beginn: '2026-11-12T20:00:00+01:00', zonen: [], staerke: 2, medikamente: [], laeuft: true }],
    }),
  ])
  await expect(page.getByText(/Kopfweh seit/)).toBeVisible()
  const vorher = await taps(page)
  await knopf(page, 'Medikament genommen').tap()
  await expect.poll(async () => (await leseTag(page, '2026-11-12'))?.episoden[0].medikamente.length).toBe(1)
  await knopf(page, 'Kopfweh vorbei').tap()
  await expect(page.getByText(/Kopfweh seit/)).toHaveCount(0)
  messen('Laufende Episode: Medikament + vorbei', (await taps(page)) - vorher, 2, 5)
})

test('Nasenspray bleibt eingeklappt, bis er gebraucht wird', async ({ page }) => {
  await starten(page, ABEND)
  await expect(page.locator('section[aria-label="Abschwellendes Nasenspray"]')).toHaveCount(0)
  await knopf(page, 'Nasenspray erfassen').tap()
  await expect(page.locator('section[aria-label="Abschwellendes Nasenspray"]')).toBeVisible()
})

const leseKrankheiten = (page: Page) =>
  page.evaluate(() => (window as unknown as { __db: { krankheiten: { toArray: () => Promise<Record<string, unknown>[]> } } }).__db.krankheiten.toArray())

test('Krankheit erfassen und beenden', async ({ page }) => {
  await starten(page, ABEND)
  await knopf(page, 'Krankheit erfassen').tap()
  await knopf(page, 'Erkältung').tap()
  await knopf(page, 'Schnupfen').tap()
  await knopf(page, 'Verstopfte Nasennebenhöhlen').tap()
  await knopf(page, 'Verstopfte Stirnhöhlen').tap()
  await knopf(page, 'Temperatur ergänzen').tap()
  await knopf(page, 'Mehr').tap()
  await expect.poll(async () => (await leseKrankheiten(page))[0]?.temperatur).toBe(37.6)
  await pruefeTapZiele(page, 'Krankheit erfassen')
  await page.screenshot({ path: `${AUSGABE}/krankheit.png` })
  await knopf(page, 'Fertig').tap()

  await expect(page.getByText('seit 12.11.2026')).toBeVisible()
  await expect(page.locator('section[aria-label="Abschwellendes Nasenspray"]')).toBeVisible()
  await knopf(page, 'Beendet').tap()
  await expect.poll(async () => (await leseKrankheiten(page))[0]?.ende).toBe('2026-11-12')
  expect((await leseKrankheiten(page))[0]).toMatchObject({ art: 'erkaeltung', symptome: ['schnupfen', 'nebenhoehlen', 'stirnhoehlen'], beginn: '2026-11-12' })
})

test('Laufende Krankheit wird am Folgetag weitergeführt', async ({ page }) => {
  await page.clock.setFixedTime(ABEND)
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  await page.goto('./')
  await page.evaluate(async () => {
    await (window as unknown as { __db: { krankheiten: { put: (x: unknown) => Promise<void> } } }).__db.krankheiten.put({
      id: 'k1', updatedAt: '', symptome: [], art: 'grippe', beginn: '2026-11-09',
    })
  })
  await page.reload()
  await expect(page.getByText('seit 09.11.2026')).toBeVisible()
  await expect(knopf(page, 'Krankheit erfassen')).toHaveCount(0)
})

test('Verlauf zeigt den Monat und bearbeitet rückwirkend', async ({ page }) => {
  await starten(page, ABEND, [
    ...VERLAUF,
    tag('2026-11-08', {
      kopfwehStatus: 'hatte',
      episoden: [{ id: 'e', updatedAt: '', beginn: '2026-11-08T11:00:00+01:00', zonen: [], staerke: 3, medikamente: [] }],
    }),
  ])
  await knopf(page, 'Verlauf').tap()
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: /08\.11\.2026: Kopfweh Stark/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /10\.11\.2026: erfasst/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /20\.11\.2026/ })).toBeDisabled()
  await pruefeTapZiele(page, 'Verlauf')
  await page.screenshot({ path: `${AUSGABE}/verlauf.png` })

  await page.getByRole('button', { name: /10\.11\.2026/ }).tap()
  await expect(page.getByRole('heading', { name: 'Dienstag' })).toBeVisible()
  await knopf(page, 'Befinden insgesamt: Schlecht').tap()
  await expect.poll(async () => (await leseTag(page, '2026-11-10'))?.befinden).toBe(1)
  await pruefeTapZiele(page, 'Tag bearbeiten')
  await page.screenshot({ path: `${AUSGABE}/tag-bearbeiten.png` })

  await inFrage(page, 'Kopfweh an diesem Tag?', 'Ja').tap()
  await knopf(page, 'Abend, 18–22 Uhr').tap()
  await expect.poll(async () => (await leseTag(page, '2026-11-10'))?.episoden.length).toBe(1)
  expect((await leseTag(page, '2026-11-10'))?.episoden[0].beginn).toContain('2026-11-10T18:00')
  await knopf(page, 'Fertig').tap()
  await expect(page.getByRole('heading', { name: 'Dienstag' })).toBeVisible()

  await knopf(page, 'Zurück zum Kalender').tap()
  await knopf(page, 'Voriger Monat').tap()
  await expect(page.getByRole('heading', { name: 'Oktober 2026' })).toBeVisible()
})

test('Einstellungen steuern Medikamente und Wasser', async ({ page }) => {
  await starten(page, ABEND)
  await knopf(page, 'Einstellungen').tap()
  await page.getByLabel('Name').fill('Aspirin')
  await page.getByLabel('Dosen in mg, mit Komma getrennt').fill('500, 1000')
  await knopf(page, 'Hinzufügen').tap()
  await knopf(page, 'Aspirin als Standard').tap()
  await knopf(page, 'Aspirin Standarddosis 1000 mg').tap()
  await inFrage(page, 'Wasser im Abend-Check-in', 'Ja').tap()
  await expect(inFrage(page, 'Wasser im Abend-Check-in', 'Ja')).toHaveAttribute('aria-pressed', 'true')
  await pruefeTapZiele(page, 'Einstellungen')
  await page.screenshot({ path: `${AUSGABE}/einstellungen.png` })

  await knopf(page, 'Heute').tap()
  await expect(page.locator('.stand__teil', { hasText: 'Abend' })).toContainText('0/8')
  await inFrage(page, 'Wasser', 'Viel').tap()
  await expect(page.locator('.stand__teil', { hasText: 'Abend' })).toContainText('1/8')

  await knopf(page, 'Kopfweh erfassen').tap()
  await knopf(page, 'Aspirin').tap()
  await expect.poll(async () => (await leseTag(page, '2026-11-12'))?.episoden[0]?.medikamente[0]).toMatchObject({ name: 'Aspirin', dosisMg: 1000 })
})

test('Wetter und Mond werden automatisch ergänzt', async ({ page }) => {
  await page.route(/api\.open-meteo\.com/, (r) => {
    const time: string[] = []
    for (const d of ['2026-11-10', '2026-11-11', '2026-11-12']) {
      for (let h = 0; h < 24; h += 1) time.push(`${d}T${String(h).padStart(2, '0')}:00`)
    }
    const pressure_msl = time.map((_, i) => 1030 - i * 0.25)
    return r.fulfill({ json: { hourly: { time, pressure_msl, temperature_2m: time.map(() => 8), relative_humidity_2m: time.map(() => 70) } } })
  })
  await starten(page, ABEND, [typischerTag('2026-11-11')], true, { ort: { name: 'Musterort', lat: 47, lon: 8 } })
  await expect.poll(async () => (await leseTag(page, '2026-11-11'))?.kontext?.wetter?.delta24h).toBe(-6)
  const t = await leseTag(page, '2026-11-11')
  expect(t?.kontext?.wetter?.ort).toBe('Musterort')
  expect(t?.kontext?.mond?.kategorie).toBeDefined()
  expect(t?.updatedAt).toBe('2026-11-11T21:00:00+01:00')
})

test('Sync über die Einstellungen', async ({ page }) => {
  const anfragen: { url: string; methode: string; koerper?: string; auth?: string }[] = []
  await page.route(/api\.github\.com/, (r) => {
    const q = r.request()
    anfragen.push({ url: q.url(), methode: q.method(), koerper: q.postData() ?? undefined, auth: q.headers().authorization })
    if (q.url().includes('git/trees/main')) return r.fulfill({ json: { tree: [] } })
    if (q.url().includes('git/ref/heads/main')) return r.fulfill({ json: { object: { sha: 'c1' } } })
    if (q.url().includes('git/commits/c1')) return r.fulfill({ json: { tree: { sha: 'b1' } } })
    return r.fulfill({ json: { sha: 'neu' } })
  })
  await starten(page, ABEND, [typischerTag('2026-11-11')])
  await knopf(page, 'Einstellungen').tap()
  await expect(page.getByText('Noch nicht verbunden')).toBeVisible()
  await pruefeTapZiele(page, 'Einstellungen Sync')
  await page.getByLabel('Token', { exact: true }).fill('testwert')
  await knopf(page, 'Token speichern').tap()
  await expect(page.getByText(/^Zuletzt 12\.11\.2026, 21:30/)).toBeVisible()
  await page.locator('section[aria-label="GitHub-Sync"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${AUSGABE}/einstellungen-sync.png` })

  const baum = anfragen.find((a) => a.url.endsWith('/git/trees') && a.methode === 'POST')
  expect(baum?.koerper).toContain('entries/2026-11-11.json')
  expect(baum?.auth).toBe('Bearer testwert')
  expect(anfragen.some((a) => a.url.includes('zenokaufmann-sudo/xundzeit-daten'))).toBe(true)
  expect(anfragen.some((a) => a.methode === 'PATCH' && a.url.includes('git/refs/heads/main'))).toBe(true)
})

test('Sync meldet einen ungültigen Token', async ({ page }) => {
  await page.route(/api\.github\.com/, (r) => r.fulfill({ status: 401, json: {} }))
  await starten(page, ABEND)
  await knopf(page, 'Einstellungen').tap()
  await page.getByLabel('Token', { exact: true }).fill('falsch')
  await knopf(page, 'Token speichern').tap()
  await expect(page.getByText('Token abgelaufen oder ungültig')).toBeVisible()
})

test('Vorne und hinten teilen sich den Scheitel', async ({ page }) => {
  await starten(page, ABEND)
  await knopf(page, 'Kopfweh erfassen').tap()
  await page.locator('[data-zone="scheitel"]').first().tap()
  await expect(page.locator('.kopf__zone--aktiv')).toHaveCount(2)
  await page.locator('[data-zone="scheitel"]').nth(1).tap()
  await expect(page.locator('.kopf__zone--aktiv')).toHaveCount(0)
})

test('Abschwellend nach Zeitpunkt', async ({ page }) => {
  await starten(page, ABEND, [SPRAY_GESTERN])
  const zeiten = async () =>
    (await leseTag(page, '2026-11-12'))?.einnahmen.filter((e) => !e.deletedAt).map((e) => e.zeitpunkt)

  await knopf(page, 'Nach dem Aufstehen').tap()
  await expect(knopf(page, 'Nach dem Aufstehen')).toHaveAttribute('aria-pressed', 'true')
  messen('Abschwellendes Nasenspray', await taps(page), 1, 3)

  await knopf(page, 'Abends').tap()
  await expect.poll(zeiten).toEqual(['aufstehen', 'abends'])

  const reihenfolge = await page.locator('main section[aria-label]').evaluateAll((s) => s.map((x) => x.getAttribute('aria-label')))
  expect(reihenfolge.slice(-2)).toEqual(['Abschwellendes Nasenspray', 'Kortison-Nasenspray'])
  await pruefeTapZiele(page, 'Abschwellendes Nasenspray')
  await page.locator('section[aria-label="Kortison-Nasenspray"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${AUSGABE}/nasensprays.png` })

  await knopf(page, 'Nach dem Aufstehen').tap()
  await expect.poll(zeiten).toEqual(['abends'])
})

test('Kortison-Nasenspray mit einem Tap', async ({ page }) => {
  await starten(page, MORGEN, [SPRAY_GESTERN])
  await knopf(page, 'Morgens 2 Sprühstösse').tap()
  await expect(knopf(page, 'Morgens 2 Sprühstösse')).toHaveAttribute('aria-pressed', 'true')
  messen('Kortison-Nasenspray', await taps(page), 1, 3)
  await expect(page.locator('section[aria-label="Kortison-Nasenspray"]')).not.toContainText('08:00')
  await pruefeTapZiele(page, 'Kortison-Spray')
  await page.locator('section[aria-label="Kortison-Nasenspray"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${AUSGABE}/kortison-spray.png` })

  const einnahmen = (await leseTag(page, '2026-11-12'))?.einnahmen
  expect(einnahmen?.[0]).toMatchObject({ typ: 'kortison', name: 'Kortison-Nasenspray', stoesse: 2, slot: 'morgens' })

  await knopf(page, 'Morgens 2 Sprühstösse').tap()
  await expect(knopf(page, 'Morgens 2 Sprühstösse')).toHaveAttribute('aria-pressed', 'false')
})

test('Verpasster Tag mit einem Tap', async ({ page }) => {
  await starten(page, ABEND, VERLAUF.slice(0, 2))
  await expect(page.getByText('Gestern fehlt.')).toBeVisible()
  await page.screenshot({ path: `${AUSGABE}/gestern-fehlt.png` })
  await knopf(page, 'Wie üblich').tap()
  await expect(page.getByText('Gestern fehlt.')).toHaveCount(0)
  messen('Gestern nachtragen', await taps(page), 1, 3)
  const t = await leseTag(page, '2026-11-11')
  expect(t?.quelle).toBe('nachgetragen-wie-ueblich')
  expect(t?.kopfwehStatus).toBe('keines')
  expect(t?.befinden).toBeUndefined()
})

test('Wirkung wird nach 2 h nachgefragt', async ({ page }) => {
  await starten(page, ABEND, [
    tag('2026-11-12', {
      kopfwehStatus: 'hatte',
      episoden: [{
        id: 'e1', updatedAt: '', beginn: '2026-11-12T17:00:00+01:00', ende: '2026-11-12T20:00:00+01:00',
        zonen: ['stirn-m'], staerke: 1,
        medikamente: [{ id: 'm1', name: 'Paracetamol', dosisMg: 1000, zeit: '2026-11-12T17:10:00+01:00' }],
      }],
    }),
  ])
  await expect(page.getByText('Wie hat es gewirkt?')).toBeVisible()
  await knopf(page, 'Deutlich besser').tap()
  await expect(page.getByText('Wie hat es gewirkt?')).toHaveCount(0)
})

test('Safari-Tab zeigt den Installationshinweis', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('Zum Home-Bildschirm', { exact: false })).toBeVisible()
  await page.screenshot({ path: `${AUSGABE}/install-hinweis.png` })
})

test('?tab= öffnet den richtigen Tab', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  await page.goto('./?tab=kopfweh')
  await expect(page.getByRole('heading', { name: 'Kopfweh' })).toBeVisible()
})

test('Dunkelmodus', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await starten(page, ABEND, VERLAUF)
  await page.screenshot({ path: `${AUSGABE}/heute-dunkel.png` })
  await knopf(page, 'Kopfweh erfassen').tap()
  await page.locator('[data-zone="stirn-l"]').first().tap()
  await knopf(page, 'Stark Nichts geht mehr').tap()
  await expect(knopf(page, 'Stark Nichts geht mehr')).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${AUSGABE}/kopfweh-dunkel.png` })
  const grund = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(grund).toBe('rgb(18, 19, 21)')
})

test('Kein horizontales Scrollen', async ({ page }) => {
  await starten(page, ABEND, VERLAUF)
  const breite = () => page.evaluate(() => document.documentElement.scrollWidth)
  expect(await breite()).toBeLessThanOrEqual(390)
  await knopf(page, 'Kopfweh erfassen').tap()
  await knopf(page, 'Details ergänzen').tap()
  await expect(knopf(page, 'Zu viel Sonne / wenig Sonnenschutz')).toBeVisible()
  expect(await breite()).toBeLessThanOrEqual(390)
})

test('Startet offline und ohne CSP-Fehler', async ({ page, context }) => {
  const fehler: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()) })
  page.on('pageerror', (e) => fehler.push(e.message))
  await page.clock.setFixedTime(ABEND)
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.dock')).toBeVisible()
  await inFrage(page, 'Kopfweh heute?', 'Nein').tap()
  await expect(inFrage(page, 'Kopfweh heute?', 'Nein')).toHaveAttribute('aria-pressed', 'true')
  await context.setOffline(false)
  expect(fehler).toEqual([])
})

test.afterAll(() => {
  const zeilen = messungen.map(
    (m) => `| ${m.flow} | ${m.taps} / ${m.budgetTaps} | ~${m.schaetzungS.toFixed(1)} s / ${m.budgetS} s |`,
  )
  const text = ['| Flow | Taps / Budget | Schätzung / Budget |', '|---|---|---|', ...zeilen].join('\n')
  writeFileSync(`${AUSGABE}/tap-budget.md`, `${text}\n`)
  console.log(`\n${text}\n`)
})

// Etappe 6: Analyse und Export

const datumVor = (tage: number) => {
  const d = new Date(2026, 10, 12, 12)
  d.setDate(d.getDate() - tage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WIRKUNGEN = ['deutlich', 'schmerzfrei', 'etwas', 'keine'] as const

/** 60 erfundene Tage: Nach Alkohol folgt oft Kopfweh, damit der Vergleich etwas zu zeigen hat. */
function analyseDaten(): TagesEintrag[] {
  return Array.from({ length: 60 }, (_, i) => {
    const datum = datumVor(59 - i)
    const alkohol = i % 5 === 0
    const nachAlkohol = i % 5 === 1
    const kopfweh = nachAlkohol ? i % 10 !== 1 || i < 30 : i % 11 === 3
    const staerke = ((i % 3) + 1) as 1 | 2 | 3
    return tag(datum, {
      nacht: { schlafSubjektiv: ((i % 5) + 1) as 1, display: i % 2 ? 'keine' : '15-60' },
      alkohol: { ja: alkohol, getraenke: alkohol ? 2 : undefined },
      koffein: { ja: true, portionen: 2, letzte: i % 3 ? 'vor12' : 'nach12' },
      kopfBelastung: ((i % 5) + 1) as 1,
      koerperBelastung: { stufe: ((i % 5) + 1) as 1 },
      befinden: kopfweh ? 2 : 4,
      kopfwehStatus: kopfweh ? undefined : 'keines',
      episoden: kopfweh ? [{
        id: `e${i}`, updatedAt: `${datum}T12:00:00+01:00`, beginn: `${datum}T${i % 2 ? '07' : '15'}:00:00+01:00`,
        phasen: [i % 2 ? 'morgen' : 'nachmittag'], staerke,
        zonen: i % 2 ? ['stirn-l', 'schlaefe-l'] : ['nacken-r', 'stirn-l'],
        medikamente: [{ id: `m${i}`, name: i % 2 ? 'Paracetamol' : 'Ibuprofen', dosisMg: 500, zeit: `${datum}T16:00:00+01:00`, wirkung: WIRKUNGEN[i % 4] }],
      }] : [],
      kontext: { wetter: { druckMittel: 1015, druckMin: 1010, druckMax: 1020, delta24h: i % 7 === 0 ? -7 : 1, maxDelta3h: -1, tempMittel: 8, feuchte: 80, ort: 'Musterort' } },
    })
  })
}

const garminDaten = () => Array.from({ length: 60 }, (_, i) => {
  const datum = datumVor(59 - i)
  return { datum, sha: `g${i}`, daten: {
    datum, schemaVersion: 1, schlaf: { dauerMin: 360 + (i % 6) * 30 }, hrv: { nachtMittelMs: 50 + (i % 9) * 3 },
    stress: { durchschnitt: 22 + (i % 7) * 4 }, ruhepuls: 48,
  } }
})

async function fuelle(page: Page, tabelle: 'garmin' | 'reports', zeilen: unknown[]) {
  await page.evaluate(async ([t, z]) => {
    await (window as unknown as { __db: Record<string, { bulkPut: (x: unknown) => Promise<void> }> }).__db[t as string].bulkPut(z)
  }, [tabelle, zeilen] as const)
}

async function zeigeAnalyse(page: Page) {
  await starten(page, ABEND, analyseDaten())
  await fuelle(page, 'garmin', garminDaten())
  await page.getByRole('button', { name: 'Analyse', exact: true }).click()
  await page.getByRole('heading', { name: 'Auslöser-Vergleich' }).waitFor()
}

const breite = (page: Page) => page.evaluate(() => {
  const s = document.querySelector('.seite')!
  return Math.max(document.documentElement.scrollWidth, s.scrollWidth)
})

test('Analyse zeigt Kennzahlen, Risiko und zu wenig Daten', async ({ page }) => {
  await zeigeAnalyse(page)
  await expect(page.locator('.kennzahl--haupt strong')).not.toHaveText('0')
  const alkohol = page.locator('[data-faktor="alkohol-vorabend"]')
  await expect(alkohol).toContainText('×')
  await expect(alkohol).toContainText('Mit:')
  await expect(page.getByText(/Zu wenig Daten \(\d+\)/)).toBeVisible()
  expect(await breite(page)).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 390, height: 3900 })
  await page.screenshot({ path: `${AUSGABE}/analyse-hell.png` })
})

test('Analyse im Dunkelmodus', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await zeigeAnalyse(page)
  await page.setViewportSize({ width: 390, height: 3900 })
  await page.screenshot({ path: `${AUSGABE}/analyse-dunkel.png` })
})

test('Zeitreihe zeigt beim Antippen den Tag', async ({ page }) => {
  await zeigeAnalyse(page)
  const flaeche = page.locator('.zeitreihen__flaeche')
  await flaeche.scrollIntoViewIfNeeded()
  const box = (await flaeche.boundingBox())!
  await page.mouse.click(box.x + box.width - 3, box.y + 20)
  await expect(page.locator('.zeitreihen__stand')).toContainText('12.11.2026')
})

test('Kalender zeigt Overlay und Tagesdetail', async ({ page }) => {
  await zeigeAnalyse(page)
  await page.getByRole('button', { name: 'Luftdruck' }).click()
  await expect(page.getByText('Strich: Druckabfall über 5 hPa in 24 h')).toBeVisible()
  await page.locator('.kal', { hasText: /^4$/ }).click()
  await expect(page.getByText(/04\.11\.2026:/).last()).toBeVisible()
})

test('Leere Analyse bricht nicht und zeigt das Beispiel klar gekennzeichnet', async ({ page }) => {
  await starten(page, ABEND)
  await page.getByRole('button', { name: 'Analyse', exact: true }).click()
  await expect(page.getByText('Noch keine Episoden in diesem Zeitraum')).toBeVisible()
  await page.getByRole('button', { name: 'Wochenreport' }).click()
  await expect(page.getByTestId('beispiel-hinweis')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Woche 45' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 1500 })
  await page.screenshot({ path: `${AUSGABE}/report-beispiel.png` })
})

test('Neuer Report zeigt ein Badge und gilt nach dem Ansehen als gesehen', async ({ page }) => {
  await starten(page, ABEND, VERLAUF)
  const report = (woche: string, von: string, bis: string) => ({
    woche, sha: woche,
    daten: { woche, schemaVersion: 1, erstelltAm: `${bis}T17:00:00+01:00`, zeitraum: { von, bis }, erfassteTage: 5, kernaussagen: [`Aussage ${woche}`], zeitreihen: [], korrelationen: [] },
  })
  await fuelle(page, 'reports', [report('2026-W44', '2026-10-26', '2026-11-01'), report('2026-W45', '2026-11-02', '2026-11-08')])
  const badge = page.locator('.tab__neu')
  await expect(badge).toBeVisible()
  await page.getByRole('button', { name: /^Analyse/ }).click()
  await expect(page.getByText('Aussage 2026-W45')).toBeVisible()
  await expect(page.getByText('Neu', { exact: true })).toBeVisible()
  await expect(badge).toBeHidden()
  await expect(page.getByTestId('beispiel-hinweis')).toBeHidden()
  await page.getByRole('button', { name: /Woche 44/ }).click()
  await expect(page.getByText('Aussage 2026-W44')).toBeVisible()
})

test('CSV-Export öffnet das Teilen-Menü mit drei Dateien', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true })
    Object.defineProperty(navigator, 'share', {
      value: async ({ files }: { files: File[] }) => {
        ;(window as unknown as { __geteilt: unknown }).__geteilt = await Promise.all(files.map(async (f) => ({
          name: f.name, typ: f.type, bytes: [...new Uint8Array(await f.arrayBuffer())].slice(0, 3), text: await f.text(),
        })))
      },
    })
  })
  await starten(page, ABEND, analyseDaten())
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await page.getByRole('button', { name: 'Exportieren' }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __geteilt?: unknown }).__geteilt))).toBe(true)
  const dateien = await page.evaluate(() => (window as unknown as { __geteilt: { name: string; typ: string; bytes: number[]; text: string }[] }).__geteilt)
  expect(dateien.map((d) => d.name)).toEqual(['tage.csv', 'kopfweh.csv', 'einnahmen.csv'])
  expect(dateien[0].typ).toBe('text/csv')
  expect(dateien[0].bytes).toEqual([0xef, 0xbb, 0xbf])
  expect(dateien[0].text.split('\r\n')[0]).toContain('datum;quelle;kopfweh')
  expect(dateien[0].text.trim().split('\r\n')).toHaveLength(61)
})

test('Ohne Wohnort wird kein Wetter geholt und die App weist darauf hin', async ({ page }) => {
  const anfragen: string[] = []
  await page.route(/open-meteo\.com/, (r) => {
    anfragen.push(r.request().url())
    return r.fulfill({ json: {} })
  })
  await starten(page, ABEND, [typischerTag('2026-11-11')])
  await expect.poll(async () => (await leseTag(page, '2026-11-11'))?.kontext?.mond).toBeDefined()
  expect(anfragen).toEqual([])
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByText('Noch kein Wohnort gewählt')).toBeVisible()
})
