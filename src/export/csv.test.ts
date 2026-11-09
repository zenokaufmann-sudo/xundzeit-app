import { describe, expect, it } from 'vitest'
import type { GarminTag } from '../domain/externe'
import type { TagesEintrag } from '../domain/types'
import { erzeugeCsv } from './csv'

const tag = (datum: string, felder: Partial<TagesEintrag> = {}): TagesEintrag => ({
  datum, schemaVersion: 1, quelle: 'erfasst', updatedAt: `${datum}T21:00:00+01:00`,
  stempel: {}, episoden: [], einnahmen: [], ...felder,
})

const lies = (inhalt: string) => {
  const [kopf, ...zeilen] = inhalt.replace('﻿', '').trim().split('\r\n')
  const spalten = kopf.split(';')
  return zeilen.map((z) => Object.fromEntries(z.split(';').map((w, i) => [spalten[i], w])))
}

const export_ = (e: TagesEintrag[], g = new Map<string, GarminTag>()) => {
  const [tage, kopfweh, einnahmen] = erzeugeCsv(e, g, [], '2026-11-01', '2026-11-30')
  return { tage, kopfweh, einnahmen }
}

describe('CSV-Format', () => {
  it('heisst richtig und beginnt mit BOM', () => {
    const { tage, kopfweh, einnahmen } = export_([])
    expect([tage.name, kopfweh.name, einnahmen.name]).toEqual(['tage.csv', 'kopfweh.csv', 'einnahmen.csv'])
    expect(tage.inhalt.startsWith('﻿datum;quelle;')).toBe(true)
    expect(tage.inhalt.endsWith('\r\n')).toBe(true)
  })
  it('setzt Semikolon, Anführungszeichen und Zeilenumbrüche korrekt in Anführungszeichen', () => {
    const { tage } = export_([tag('2026-11-02', { notiz: 'Föhn; "stark"\nmüde' })])
    expect(tage.inhalt).toContain('"Föhn; ""stark""\nmüde"')
  })
  it('lässt unbekannte Werte leer und schreibt nie 0 oder nein dafür', () => {
    const z = lies(export_([tag('2026-11-02', { befinden: 3 })]).tage.inhalt)[0]
    expect(z.alkohol).toBe('')
    expect(z.kopfweh).toBe('')
    expect(z.koffein_portionen).toBe('')
  })
  it('hält den Zeitraum ein, inklusive der Grenzen', () => {
    const e = ['2026-10-31', '2026-11-01', '2026-11-30', '2026-12-01'].map((d) => tag(d))
    expect(lies(export_(e).tage.inhalt).map((z) => z.datum)).toEqual(['2026-11-01', '2026-11-30'])
  })
})

describe('Tage', () => {
  it('enthält Tagesfelder, Wetter, Mond und Garmin in einer Zeile', () => {
    const t = tag('2026-11-02', {
      kopfwehStatus: 'keines',
      alkohol: { ja: true, getraenke: 2 },
      kontext: {
        wetter: { druckMittel: 1020.5, druckMin: 1018, druckMax: 1022, delta24h: -6.2, maxDelta3h: -2, tempMittel: 8, feuchte: 80, ort: 'Musterort' },
        mond: { phase: 0.5, beleuchtung: 100, kategorie: 'vollmond' },
      },
    })
    const g = new Map<string, GarminTag>([['2026-11-02', {
      datum: '2026-11-02', schemaVersion: 1, ruhepuls: 48, aktivitaeten: [{ sportart: 'Velo', dauerMin: 90, trainingsbelastung: 120 }],
    }]])
    expect(lies(export_([t], g).tage.inhalt)[0]).toMatchObject({
      kopfweh: 'nein', alkohol: 'ja', alkohol_getraenke: '2', druck_delta_24h: '-6.2', wetter_ort: 'Musterort',
      mond_kategorie: 'vollmond', garmin_ruhepuls: '48', garmin_aktivitaeten: 'Velo', garmin_trainingsbelastung: '120',
    })
  })
  it('wendet die Spray-Regel an: leer ohne Check-in, 0 nach begonnenem Check-in', () => {
    const [leer, begonnen] = lies(export_([
      tag('2026-11-02', { kopfwehStatus: 'keines' }),
      tag('2026-11-03', { befinden: 3 }),
    ]).tage.inhalt)
    expect(leer.kortison_abends).toBe('')
    expect(begonnen.kortison_abends).toBe('0')
    expect(begonnen.kortison_morgens).toBe('')
    expect(begonnen.abschwellend_anzahl).toBe('0')
  })
  it('nimmt nie Garmin-Beispieldaten auf', () => {
    const g = new Map<string, GarminTag>([['2026-11-02', { datum: '2026-11-02', schemaVersion: 1, beispiel: true, ruhepuls: 48 }]])
    expect(lies(export_([], g).tage.inhalt)).toEqual([])
  })
})

describe('Kopfweh und Einnahmen', () => {
  const e = tag('2026-11-02', {
    episoden: [
      {
        id: 'e1', updatedAt: 'x', beginn: '2026-11-02T10:00:00+01:00', zonen: ['stirn-l', 'schlaefe-l'], staerke: 2,
        medikamente: [{ id: 'm1', name: 'Paracetamol', dosisMg: 500, zeit: '2026-11-02T10:30:00+01:00', wirkung: 'deutlich' }],
      },
      { id: 'weg', updatedAt: 'x', beginn: '2026-11-02T12:00:00+01:00', zonen: [], medikamente: [{ id: 'm2', name: 'Ibuprofen', zeit: 'x' }], deletedAt: 'y' },
    ],
    einnahmen: [
      { id: 's1', typ: 'kortison', name: 'Kortison-Nasenspray', zeit: '2026-11-02T19:00:00+01:00', slot: 'morgens', stoesse: 2 },
      { id: 's2', typ: 'abschwellend', name: 'Abschwellendes Nasenspray', zeit: '2026-11-02T20:00:00+01:00', deletedAt: 'y' },
    ],
  })
  it('schreibt eine Zeile pro Episode, ohne gelöschte', () => {
    const z = lies(export_([e]).kopfweh.inhalt)
    expect(z).toHaveLength(1)
    expect(z[0]).toMatchObject({ id: 'e1', zonen: 'stirn-l, schlaefe-l', seite: 'links', medikament_einnahmen: '1' })
  })
  it('schreibt Medikamente und Sprays, und bei Sprays die Tageszeit statt der Eintragezeit', () => {
    const z = lies(export_([e]).einnahmen.inhalt)
    expect(z.map((x) => x.id)).toEqual(['m1', 's1'])
    expect(z[0]).toMatchObject({ art: 'schmerzmittel', dosis_mg: '500', wirkung: 'deutlich', episode_id: 'e1' })
    expect(z[1]).toMatchObject({ art: 'kortison', zeit: '', tageszeit: 'morgens', stoesse_pro_nasenloch: '2' })
  })
})
