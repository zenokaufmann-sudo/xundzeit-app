import { describe, expect, it } from 'vitest'
import { mondAm } from './mond'
import { wetterAusStunden, type Stunden } from './wetter'
import { garminVorschlag } from '../domain/logik'

function stunden(werte: Record<string, number[]>): Stunden {
  const time: string[] = []
  const pressure_msl: number[] = []
  for (const [datum, liste] of Object.entries(werte)) {
    liste.forEach((p, h) => {
      time.push(`${datum}T${String(h).padStart(2, '0')}:00`)
      pressure_msl.push(p)
    })
  }
  return { time, pressure_msl, temperature_2m: time.map(() => 10), relative_humidity_2m: time.map(() => 80) }
}

describe('Wetter', () => {
  const vortag = Array(24).fill(1020) as number[]
  const tag = Array.from({ length: 24 }, (_, h) => 1020 - h * 0.5)

  it('berechnet Mittel, Min, Max und Änderungen', () => {
    const w = wetterAusStunden(stunden({ '2026-11-07': vortag, '2026-11-08': tag }), '2026-11-08', 'Musterort')!
    expect(w.druckMax).toBe(1020)
    expect(w.druckMin).toBe(1008.5)
    expect(w.delta24h).toBe(-11.5)
    expect(w.maxDelta3h).toBe(-1.5)
    expect(w.tempMittel).toBe(10)
    expect(w.feuchte).toBe(80)
    expect(w.ort).toBe('Musterort')
    expect(w.vorlaeufig).toBeUndefined()
  })
  it('liefert nichts ohne Vortag oder bei zu wenig Stunden', () => {
    expect(wetterAusStunden(stunden({ '2026-11-08': tag }), '2026-11-08', 'x')).toBeUndefined()
    expect(wetterAusStunden(stunden({ '2026-11-07': vortag, '2026-11-08': tag.slice(0, 10) }), '2026-11-08', 'x')).toBeUndefined()
    expect(wetterAusStunden({}, '2026-11-08', 'x')).toBeUndefined()
  })
  it('markiert den heutigen Tag als vorläufig', () => {
    expect(wetterAusStunden(stunden({ '2026-11-07': vortag, '2026-11-08': tag }), '2026-11-08', 'x', true)?.vorlaeufig).toBe(true)
  })
})

describe('Mondphase', () => {
  it('erkennt bekannte Neumonde', () => {
    for (const d of ['2026-11-09', '2024-04-08']) {
      expect(mondAm(d).kategorie, d).toBe('neumond')
      expect(mondAm(d).beleuchtung, d).toBeLessThan(4)
    }
  })
  it('erkennt bekannte Vollmonde', () => {
    for (const d of ['2026-11-24', '2025-01-13']) {
      expect(mondAm(d).kategorie, d).toBe('vollmond')
      expect(mondAm(d).beleuchtung, d).toBeGreaterThan(96)
    }
  })
  it('unterscheidet zunehmend und abnehmend', () => {
    expect(mondAm('2026-11-16').kategorie).toBe('zunehmend')
    expect(mondAm('2026-12-01').kategorie).toBe('abnehmend')
  })
})

describe('Körper-Belastung aus Garmin', () => {
  const g = (aktivitaeten: { sportart: string; dauerMin: number; trainingsbelastung?: number }[]) =>
    ({ datum: '2026-11-08', schemaVersion: 1 as const, aktivitaeten })

  it('ist ein Recovery Day ohne Aktivität', () => {
    expect(garminVorschlag(g([]))?.stufe).toBe(1)
  })
  it('stuft nach Trainingsbelastung ein', () => {
    expect(garminVorschlag(g([{ sportart: 'run', dauerMin: 30, trainingsbelastung: 40 }]))?.stufe).toBe(2)
    expect(garminVorschlag(g([{ sportart: 'bike', dauerMin: 60, trainingsbelastung: 120 }]))?.stufe).toBe(3)
    expect(garminVorschlag(g([{ sportart: 'bike', dauerMin: 120, trainingsbelastung: 250 }]))?.stufe).toBe(4)
    expect(garminVorschlag(g([{ sportart: 'bike', dauerMin: 420, trainingsbelastung: 480 }]))?.stufe).toBe(5)
  })
  it('nimmt ohne Belastungswert die Dauer', () => {
    expect(garminVorschlag(g([{ sportart: 'yoga', dauerMin: 20 }]))?.stufe).toBe(2)
    expect(garminVorschlag(g([{ sportart: 'bike', dauerMin: 240 }]))?.stufe).toBe(5)
  })
  it('liefert ohne Garmin-Daten nichts', () => {
    expect(garminVorschlag(undefined)).toBeUndefined()
  })
})
