import { describe, expect, it } from 'vitest'
import { isoWoche } from '../domain/datum'
import type { GarminTag, ReportZeile } from '../domain/externe'
import type { KopfwehEpisode, TagesEintrag } from '../domain/types'
import {
  kennzahlen, kopfwehAm, neuerReport, proPeriode, staerkeAm, tageImBereich, tageszeiten, vergleich, wirksamkeit,
  zeitraum, zeitreihen, zonenHaeufigkeit,
} from './auswertung'

const tag = (datum: string, felder: Partial<TagesEintrag> = {}): TagesEintrag => ({
  datum, schemaVersion: 1, quelle: 'erfasst', updatedAt: `${datum}T21:00:00+01:00`,
  stempel: {}, episoden: [], einnahmen: [], ...felder,
})

const ep = (datum: string, felder: Partial<KopfwehEpisode> = {}): KopfwehEpisode => ({
  id: `e-${datum}`, updatedAt: `${datum}T12:00:00+01:00`, beginn: `${datum}T12:00:00+01:00`,
  zonen: [], medikamente: [], staerke: 2, ...felder,
})

const mitKopfweh = (datum: string, felder: Partial<TagesEintrag> = {}) => tag(datum, { episoden: [ep(datum)], ...felder })
const ohneKopfweh = (datum: string, felder: Partial<TagesEintrag> = {}) => tag(datum, { kopfwehStatus: 'keines', ...felder })

const VON = '2026-06-01'
const tage = (n: number) => tageImBereich(VON, new Date(2026, 5, n, 12).toISOString().slice(0, 10))
const BIS = '2026-07-30'

/** Baut Tagespaare: Am Vortag der Faktor, am Folgetag das Kopfweh. */
function alkoholPaare(paare: { alkohol: boolean; kopfweh: boolean }[]): TagesEintrag[] {
  const liste: TagesEintrag[] = []
  const alle = tageImBereich(VON, BIS)
  paare.forEach((p, i) => {
    liste.push(tag(alle[i * 2], { alkohol: { ja: p.alkohol } }))
    liste.push(p.kopfweh ? mitKopfweh(alle[i * 2 + 1]) : ohneKopfweh(alle[i * 2 + 1]))
  })
  return liste
}

const faktor = (e: TagesEintrag[], id: string, garmin = new Map<string, GarminTag>()) =>
  vergleich(e, garmin, [], VON, BIS).find((f) => f.id === id)!

const paare = (mit: [number, number], ohne: [number, number]) => [
  ...Array.from({ length: mit[0] }, (_, i) => ({ alkohol: true, kopfweh: i < mit[1] })),
  ...Array.from({ length: ohne[0] }, (_, i) => ({ alkohol: false, kopfweh: i < ohne[1] })),
]

describe('Kopfweh-Status', () => {
  it('unterscheidet ja, nein und unbekannt', () => {
    expect(kopfwehAm(mitKopfweh('2026-06-01'))).toBe(true)
    expect(kopfwehAm(tag('2026-06-01', { kopfwehStatus: 'keines' }))).toBe(false)
    expect(kopfwehAm(tag('2026-06-01', { befinden: 3 }))).toBeUndefined()
    expect(kopfwehAm(undefined)).toBeUndefined()
  })
  it('ignoriert gelöschte Episoden', () => {
    const t = tag('2026-06-01', { episoden: [ep('2026-06-01', { deletedAt: '2026-06-01T13:00:00+01:00' })] })
    expect(kopfwehAm(t)).toBeUndefined()
  })
  it('nimmt für den Tag die höchste Stärke', () => {
    const t = tag('2026-06-01', { episoden: [ep('2026-06-01', { staerke: 1 }), ep('2026-06-01', { id: 'b', staerke: 1, staerkeMax: 3 })] })
    expect(staerkeAm(t)).toBe(3)
  })
})

describe('Auslöser-Vergleich', () => {
  it('rechnet das Risiko aus den Raten mit und ohne Faktor', () => {
    const f = faktor(alkoholPaare(paare([6, 3], [20, 5])), 'alkohol-vorabend')
    expect(f).toMatchObject({ nMit: 6, kMit: 3, nOhne: 20, kOhne: 5, status: 'ok' })
    expect(f.risiko).toBeCloseTo((3 / 6) / (5 / 20))
  })
  it('wertet Alkohol für den Folgetag aus, nicht für denselben Tag', () => {
    const e = [tag('2026-06-02', { alkohol: { ja: true }, kopfwehStatus: 'keines' }), mitKopfweh('2026-06-03')]
    const f = faktor(e, 'alkohol-vorabend')
    expect(f).toMatchObject({ nMit: 1, kMit: 1, nOhne: 0 })
  })
  it('meldet unter 5 Tagen pro Gruppe zu wenig Daten und kein Risiko', () => {
    const f = faktor(alkoholPaare(paare([4, 4], [20, 1])), 'alkohol-vorabend')
    expect(f.status).toBe('zu-wenig')
    expect(f.risiko).toBeNull()
  })
  it('liefert ab genau 5 Tagen pro Gruppe ein Risiko', () => {
    expect(faktor(alkoholPaare(paare([5, 2], [5, 1])), 'alkohol-vorabend').status).toBe('ok')
  })
  it('zählt Tage ohne Faktor-Angabe nicht als «ohne»', () => {
    const e = [...alkoholPaare(paare([5, 2], [5, 1])), mitKopfweh('2026-07-25'), ohneKopfweh('2026-07-27')]
    expect(faktor(e, 'alkohol-vorabend')).toMatchObject({ nMit: 5, nOhne: 5 })
  })
  it('zählt Tage ohne Kopfweh-Angabe nicht mit', () => {
    const e = alkoholPaare(paare([5, 2], [5, 1]))
    e.push(tag('2026-07-25', { alkohol: { ja: true } }), tag('2026-07-26', { befinden: 3 }))
    expect(faktor(e, 'alkohol-vorabend').nMit).toBe(5)
  })
  it('lässt mit «wie üblich» nachgetragene Tage aus dem Vergleich', () => {
    const e = alkoholPaare(paare([5, 2], [5, 1]))
    e.push(tag('2026-07-25', { alkohol: { ja: true } }), ohneKopfweh('2026-07-26', { quelle: 'nachgetragen-wie-ueblich' }))
    expect(faktor(e, 'alkohol-vorabend').nMit).toBe(5)
  })
  it('gibt ohne Kopfweh in der Vergleichsgruppe kein unendliches Risiko aus', () => {
    const f = faktor(alkoholPaare(paare([6, 3], [6, 0])), 'alkohol-vorabend')
    expect(f).toMatchObject({ status: 'nur-mit', risiko: null })
  })
  it('kennzeichnet kleine Stichproben als unsicher und klare Unterschiede nicht', () => {
    expect(faktor(alkoholPaare(paare([5, 2], [5, 1])), 'alkohol-vorabend').unsicher).toBe(true)
    const e = alkoholPaare(paare([12, 10], [18, 2]))
    expect(faktor(e, 'alkohol-vorabend').unsicher).toBe(false)
  })
  it('wertet Luftdruck streng über 5 hPa und ohne vorläufige Werte', () => {
    const w = { druckMittel: 1, druckMin: 1, druckMax: 1, maxDelta3h: 0, tempMittel: 0, feuchte: 0, ort: 'x' }
    const f = faktor([
      ohneKopfweh('2026-06-01', { kontext: { wetter: { ...w, delta24h: -5 } } }),
      mitKopfweh('2026-06-02', { kontext: { wetter: { ...w, delta24h: -5.1 } } }),
      mitKopfweh('2026-06-03', { kontext: { wetter: { ...w, delta24h: -9, vorlaeufig: true } } }),
    ], 'druckabfall')
    expect(f).toMatchObject({ nMit: 1, nOhne: 1 })
  })
  it('nimmt den Schlaf aus Garmin vom selben Tag', () => {
    const g = new Map<string, GarminTag>([['2026-06-02', { datum: '2026-06-02', schemaVersion: 1, schlaf: { dauerMin: 300 } }]])
    expect(faktor([mitKopfweh('2026-06-02')], 'schlaf-kurz', g)).toMatchObject({ nMit: 1, kMit: 1 })
  })
  it('schätzt den Sporttag aus Garmin, wenn keine Angabe da ist', () => {
    const g = new Map<string, GarminTag>([['2026-06-01', {
      datum: '2026-06-01', schemaVersion: 1, aktivitaeten: [{ sportart: 'Velo', dauerMin: 400, trainingsbelastung: 500 }],
    }]])
    expect(faktor([mitKopfweh('2026-06-02')], 'sport-vortag', g)).toMatchObject({ nMit: 1 })
  })
  it('erkennt Koffeinentzug nur mit Angaben an beiden Tagen', () => {
    const e = [
      tag('2026-06-01', { koffein: { ja: true } }),
      mitKopfweh('2026-06-02', { koffein: { ja: false } }),
      mitKopfweh('2026-06-04', { koffein: { ja: false } }),
    ]
    expect(faktor(e, 'koffein-entzug')).toMatchObject({ nMit: 1, nOhne: 0 })
  })
  it('sortiert Aussagekräftiges vor «zu wenig Daten»', () => {
    const liste = vergleich(alkoholPaare(paare([6, 3], [20, 5])), new Map(), [], VON, BIS)
    expect(liste[liste.length - 1].status).toBe('zu-wenig')
    expect(liste.findIndex((f) => f.id === 'alkohol-vorabend')).toBeLessThan(liste.findIndex((f) => f.status === 'zu-wenig'))
  })
})

describe('Kennzahlen', () => {
  const e = [
    mitKopfweh('2026-06-01', { episoden: [ep('2026-06-01', { staerke: 1, medikamente: [{ id: 'm', name: 'Paracetamol', zeit: '2026-06-01T13:00:00+01:00' }] })] }),
    mitKopfweh('2026-06-02', { episoden: [ep('2026-06-02', { staerke: 3 })] }),
    ...tage(7).slice(2).map((d) => ohneKopfweh(d)),
    tag('2026-06-08', { befinden: 3 }),
  ]
  it('rechnet nur mit Tagen, die eine Kopfweh-Angabe haben', () => {
    const k = kennzahlen(e, VON, '2026-06-30')
    expect(k).toMatchObject({ beobachtet: 7, kopfwehTage: 2, staerkeMittel: 2, medikamentenTage: 1 })
    expect(k.proWoche).toBeCloseTo(2)
  })
  it('rechnet unter 7 Tagen nicht hoch', () => {
    expect(kennzahlen(e, VON, '2026-06-03').proWoche).toBeNull()
  })
})

describe('Perioden', () => {
  it('gruppiert kurze Zeiträume nach Kalenderwoche', () => {
    const p = proPeriode([mitKopfweh('2026-11-02'), ohneKopfweh('2026-11-09')], '2026-11-02', '2026-11-15')
    expect(p.art).toBe('woche')
    expect(p.perioden.map((x) => [x.label, x.kopfweh, x.beobachtet])).toEqual([['45', 1, 1], ['46', 0, 1]])
  })
  it('gruppiert lange Zeiträume nach Monat', () => {
    expect(proPeriode([], '2026-01-01', '2026-06-30').art).toBe('monat')
  })
  it('kennt die ISO-Woche am Jahreswechsel', () => {
    expect(isoWoche('2027-01-01')).toEqual({ jahr: 2026, woche: 53 })
    expect(isoWoche('2026-11-09')).toEqual({ jahr: 2026, woche: 46 })
  })
})

describe('Zeitraum', () => {
  it('beginnt bei «Alles» am ersten erfassten Tag, nicht bei reinen Wetterdaten', () => {
    const e = [tag('2026-01-01', { kontext: {} }), ohneKopfweh('2026-03-01')]
    expect(zeitraum('alle', e, '2026-04-01').von).toBe('2026-03-01')
  })
  it('zählt den heutigen Tag mit', () => {
    expect(zeitraum('30', [], '2026-11-30').von).toBe('2026-11-01')
  })
})

describe('Medikamente', () => {
  it('vergleicht pro Mittel und zählt nur Einnahmen mit Wirkung als Basis', () => {
    const m = (id: string, name: string, wirkung?: 'keine' | 'deutlich' | 'schmerzfrei') =>
      ({ id, name, zeit: '2026-06-01T13:00:00+01:00', wirkung })
    const e = [mitKopfweh('2026-06-01', {
      episoden: [ep('2026-06-01', { medikamente: [m('1', 'Paracetamol', 'deutlich'), m('2', 'Paracetamol', 'keine'), m('3', 'Paracetamol'), m('4', 'Ibuprofen', 'schmerzfrei')] })],
    })]
    expect(wirksamkeit(e, VON, BIS)).toMatchObject([
      { name: 'Paracetamol', einnahmen: 3, mitWirkung: 2, gut: 1 },
      { name: 'Ibuprofen', einnahmen: 1, mitWirkung: 1, gut: 1 },
    ])
  })
})

describe('Verteilungen', () => {
  it('nimmt die erste gewählte Tageszeit als Beginn', () => {
    const e = [mitKopfweh('2026-06-01', { episoden: [ep('2026-06-01', { phasen: ['nachmittag', 'morgen'] })] })]
    const z = tageszeiten(e, VON, BIS)
    expect(z.find((x) => x.phase.wert === 'morgen')?.anzahl).toBe(1)
    expect(z.find((x) => x.phase.wert === 'nachmittag')?.anzahl).toBe(0)
  })
  it('leitet die Tageszeit sonst aus der Uhrzeit ab', () => {
    const e = [mitKopfweh('2026-06-01', { episoden: [ep('2026-06-01', { beginn: '2026-06-01T23:00:00+02:00' })] })]
    expect(tageszeiten(e, VON, BIS).find((x) => x.phase.wert === 'nacht-spaet')?.anzahl).toBe(1)
  })
  it('zählt Kopf-Zonen', () => {
    const e = [
      mitKopfweh('2026-06-01', { episoden: [ep('2026-06-01', { zonen: ['stirn-l', 'scheitel'] })] }),
      mitKopfweh('2026-06-02', { episoden: [ep('2026-06-02', { zonen: ['stirn-l'] })] }),
    ]
    expect(zonenHaeufigkeit(e, VON, BIS)).toEqual({ 'stirn-l': 2, scheitel: 1 })
  })
})

describe('Zeitreihen', () => {
  it('lässt Lücken als null stehen und setzt keine Nullen ein', () => {
    const g = new Map<string, GarminTag>([['2026-06-01', { datum: '2026-06-01', schemaVersion: 1, schlaf: { dauerMin: 450 } }]])
    const { reihen } = zeitreihen([ohneKopfweh('2026-06-01')], g, VON, '2026-06-02')
    expect(reihen.find((r) => r.id === 'schlaf')?.werte).toEqual([7.5, null])
    expect(reihen.find((r) => r.id === 'kopfweh')?.werte).toEqual([0, null])
  })
})

describe('Report-Hinweis', () => {
  const zeile = (woche: string, beispiel?: boolean) => ({ woche, sha: 'x', daten: { woche, beispiel } }) as unknown as ReportZeile
  it('meldet einen neuen Report einmal', () => {
    expect(neuerReport([zeile('2026-W45'), zeile('2026-W46')], '2026-W45')).toBe('2026-W46')
    expect(neuerReport([zeile('2026-W46')], '2026-W46')).toBeUndefined()
  })
  it('meldet nie ein Beispiel', () => {
    expect(neuerReport([zeile('2026-W45', true)], null)).toBeUndefined()
  })
})
