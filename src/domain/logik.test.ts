import { describe, expect, it } from 'vitest'
import { addTage, checkinArt, logischerTag, tageszeit, wocheVon } from './datum'
import {
  abendStatus, abschwellendAmStueck, einstufung, erkenntnis, fehlenderTag, krankheitAm, morgenStatus, offeneWirkung,
  spraysAktiv,
  phasenText, schmerzmittelTage, seiteAusZonen, sprayTag, uebergebrauchStufe, vorschlaege, wieUeblich, zeitenAusPhasen,
} from './logik'
import type { KopfwehEpisode, Krankheit, TagesEintrag } from './types'

const tag = (datum: string, felder: Partial<TagesEintrag> = {}): TagesEintrag => ({
  datum, schemaVersion: 1, quelle: 'erfasst', updatedAt: '', stempel: {}, episoden: [], einnahmen: [], ...felder,
})
const ep = (felder: Partial<KopfwehEpisode> = {}): KopfwehEpisode => ({
  id: 'x', updatedAt: '', beginn: '2026-11-08T10:00:00+01:00', zonen: [], medikamente: [], ...felder,
})
const mitMedikament = (datum: string) =>
  tag(datum, {
    episoden: [ep({ medikamente: [{ id: datum, name: 'Ibuprofen', zeit: `${datum}T10:00:00+01:00` }] })],
  })

describe('Datum', () => {
  it('zählt bis 04:00 zum Vortag', () => {
    expect(logischerTag(new Date(2026, 10, 8, 3, 59))).toBe('2026-11-07')
    expect(logischerTag(new Date(2026, 10, 8, 4, 0))).toBe('2026-11-08')
  })
  it('wählt den Check-in nach Uhrzeit', () => {
    expect(checkinArt(new Date(2026, 10, 8, 14, 59))).toBe('morgen')
    expect(checkinArt(new Date(2026, 10, 8, 15, 0))).toBe('abend')
    expect(checkinArt(new Date(2026, 10, 8, 2, 0))).toBe('abend')
  })
  it('rechnet über Monatsgrenzen', () => {
    expect(addTage('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('liefert die Woche von Montag bis Sonntag', () => {
    const woche = wocheVon('2026-11-08')
    expect(woche[0]).toBe('2026-11-02')
    expect(woche[6]).toBe('2026-11-08')
  })
  it('leitet die Tageszeit ab', () => {
    expect(tageszeit('2026-11-08T23:00:00+01:00')).toBe('Nacht')
    expect(tageszeit('2026-11-08T08:00:00+01:00')).toBe('Morgen')
  })
})

describe('Kopf-Karte', () => {
  it('leitet die Seite ab', () => {
    expect(seiteAusZonen(['stirn-l', 'auge-l'])).toBe('links')
    expect(seiteAusZonen(['stirn-r', 'scheitel'])).toBe('rechts')
    expect(seiteAusZonen(['stirn-l', 'nacken-r'])).toBe('beidseitig')
    expect(seiteAusZonen(['scheitel'])).toBe('beidseitig')
    expect(seiteAusZonen([])).toBeUndefined()
  })
})

describe('Einstufung', () => {
  it('erkennt migräneartige Merkmale', () => {
    expect(einstufung(ep({
      zonen: ['schlaefe-l'], staerke: 3, schmerzart: ['pochend'], symptome: ['uebelkeit'],
    }))).toBe('migraeneartig')
  })
  it('stuft Aura immer als migräneartig ein', () => {
    expect(einstufung(ep({ symptome: ['aura'] }))).toBe('migraeneartig')
  })
  it('erkennt den Spannungstyp', () => {
    expect(einstufung(ep({
      zonen: ['stirn-l', 'stirn-r'], staerke: 1, schmerzart: ['drueckend'],
    }))).toBe('spannungstyp')
  })
  it('stuft ohne Schmerzart und Symptome nicht ein', () => {
    expect(einstufung(ep({ zonen: ['stirn-l'], staerke: 2 }))).toBeUndefined()
  })
})

describe('Übergebrauch', () => {
  const jetzt = new Date(2026, 10, 20, 12)
  const tage = (anzahl: number) =>
    Array.from({ length: anzahl }, (_, i) => mitMedikament(addTage('2026-11-20', -i)))

  it('zählt Monat und 30 Tage getrennt', () => {
    const z = schmerzmittelTage(tage(25), jetzt)
    expect(z.monat).toBe(20)
    expect(z.letzte30).toBe(25)
  })
  it('zählt mehrere Einnahmen am selben Tag nur einmal', () => {
    const t = tag('2026-11-20', {
      episoden: [ep({
        medikamente: [
          { id: 'a', name: 'Ibuprofen', zeit: '2026-11-20T09:00:00+01:00' },
          { id: 'b', name: 'Paracetamol', zeit: '2026-11-20T15:00:00+01:00' },
        ],
      })],
    })
    expect(schmerzmittelTage([t], jetzt).monat).toBe(1)
  })
  it('ignoriert gelöschte Episoden', () => {
    const t = mitMedikament('2026-11-20')
    t.episoden[0].deletedAt = '2026-11-20T16:00:00+01:00'
    expect(schmerzmittelTage([t], jetzt).monat).toBe(0)
  })
  it('hat die Schwellen 10 und 15', () => {
    expect(uebergebrauchStufe({ monat: 9, letzte30: 9 })).toBe('keiner')
    expect(uebergebrauchStufe({ monat: 10, letzte30: 10 })).toBe('dezent')
    expect(uebergebrauchStufe({ monat: 5, letzte30: 15 })).toBe('deutlich')
  })
})

describe('Spray', () => {
  it('zählt aufeinanderfolgende Tage', () => {
    const eintraege = [0, 1, 2, 4].map((i) => {
      const datum = addTage('2026-11-08', -i)
      return tag(datum, { einnahmen: [{ id: datum, typ: 'abschwellend', name: 'T', zeit: '' }] })
    })
    expect(abschwellendAmStueck(eintraege, new Date(2026, 10, 8, 12))).toBe(3)
  })
})

describe('Vorschläge', () => {
  const eintraege = [
    tag('2026-11-07', { koffein: { ja: true, portionen: 2, letzte: 'vor12' }, befinden: 4, nacht: { schlafSubjektiv: 4, display: 'keine' } }),
    tag('2026-11-06', { alkohol: { ja: false }, kopfBelastung: 3 }),
    tag('2026-11-05', { alkohol: { ja: false }, kopfBelastung: 3 }),
    tag('2026-11-04', { alkohol: { ja: true, getraenke: 3 }, kopfBelastung: 5 }),
  ]
  it('nimmt den Vortag, sonst das häufigste Muster', () => {
    const v = vorschlaege(eintraege, '2026-11-08')
    expect(v.koffein?.portionen).toBe(2)
    expect(v.kopfBelastung).toBe(3)
    expect(v.display).toBe('keine')
  })
  it('schlägt nie Alkohol «Ja» vor', () => {
    const v = vorschlaege([
      tag('2026-11-07', { alkohol: { ja: true, getraenke: 2 } }),
      tag('2026-11-06', { alkohol: { ja: true, getraenke: 2 } }),
    ], '2026-11-08')
    expect(v.alkohol).toBeUndefined()
    expect(vorschlaege(eintraege, '2026-11-08').alkohol).toEqual({ ja: false })
  })
  it('schlägt subjektive Werte nie vor', () => {
    expect(vorschlaege(eintraege, '2026-11-08')).not.toHaveProperty('befinden')
    expect(wieUeblich(eintraege, '2026-11-08')).not.toHaveProperty('befinden')
  })
})

describe('Fehlende Tage', () => {
  const jetzt = new Date(2026, 10, 8, 12)
  const erfasst = (d: string) => tag(d, { kopfwehStatus: 'keines' })
  it('findet den jüngsten fehlenden Tag', () => {
    expect(fehlenderTag([erfasst('2026-11-07'), erfasst('2026-11-05')], jetzt)).toBe('2026-11-06')
  })
  it('meldet ohne Einträge nichts', () => {
    expect(fehlenderTag([], jetzt)).toBeUndefined()
  })
  it('meldet nichts vor dem ersten Eintrag', () => {
    expect(fehlenderTag([erfasst('2026-11-07')], jetzt)).toBeUndefined()
  })
})

describe('Wirkung', () => {
  it('fragt erst nach 2 h nach', () => {
    const t = tag('2026-11-08', {
      episoden: [ep({ medikamente: [{ id: 'a', name: 'I', zeit: new Date(2026, 10, 8, 10).toISOString() }] })],
    })
    expect(offeneWirkung([t], new Date(2026, 10, 8, 11, 59))).toBeUndefined()
    expect(offeneWirkung([t], new Date(2026, 10, 8, 12, 1))?.einnahme.id).toBe('a')
  })
})

describe('Nasensprays ohne Auswahl', () => {
  const kortison = (slot: 'morgens' | 'abends', stoesse: 1 | 2) =>
    ({ id: slot, typ: 'kortison' as const, name: 'M', zeit: '', slot, stoesse })

  it('bleibt unbekannt, wenn kein Check-in ausgefüllt wurde', () => {
    expect(sprayTag(tag('2026-11-08'))).toEqual({})
    expect(sprayTag(undefined)).toEqual({})
  })
  it('gilt als nicht genommen, sobald der Check-in begonnen wurde', () => {
    expect(sprayTag(tag('2026-11-08', { befinden: 4 }))).toEqual({
      abschwellend: 0, kortisonMorgens: undefined, kortisonAbends: 0,
    })
    expect(sprayTag(tag('2026-11-08', { nacht: { display: 'keine' } }))).toEqual({
      abschwellend: 0, kortisonMorgens: 0, kortisonAbends: undefined,
    })
  })
  it('zählt ein tagsüber erfasstes Kopfweh nicht als Check-in', () => {
    expect(sprayTag(tag('2026-11-08', { kopfwehStatus: 'hatte' }))).toEqual({})
  })
  it('nimmt gewählte Werte auch ohne Check-in', () => {
    const t = tag('2026-11-08', {
      einnahmen: [kortison('abends', 2), { id: 't', typ: 'abschwellend', name: 'T', zeit: '' }],
    })
    expect(sprayTag(t)).toEqual({ abschwellend: 1, kortisonMorgens: undefined, kortisonAbends: 2 })
  })
  it('ignoriert zurückgenommene Einnahmen', () => {
    const t = tag('2026-11-08', {
      befinden: 3,
      einnahmen: [{ ...kortison('abends', 1), deletedAt: 'x' }],
    })
    expect(sprayTag(t).kortisonAbends).toBe(0)
  })
})

describe('Krankheit', () => {
  const k = (beginn: string, ende?: string, deletedAt?: string): Krankheit => ({
    id: beginn, updatedAt: '', symptome: [], beginn, ende, deletedAt,
  })
  it('gilt von Beginn bis Ende', () => {
    const liste = [k('2026-11-05', '2026-11-07')]
    expect(krankheitAm(liste, '2026-11-04')).toBeUndefined()
    expect(krankheitAm(liste, '2026-11-07')?.id).toBe('2026-11-05')
    expect(krankheitAm(liste, '2026-11-08')).toBeUndefined()
  })
  it('läuft ohne Ende weiter und ignoriert Gelöschtes', () => {
    expect(krankheitAm([k('2026-11-01')], '2026-12-24')).toBeDefined()
    expect(krankheitAm([k('2026-11-01', undefined, 'x')], '2026-11-02')).toBeUndefined()
  })
  it('blendet Sprays bei Krankheit oder kürzlicher Einnahme ein', () => {
    const einnahme = { id: 'e', typ: 'kortison' as const, name: 'M', zeit: '' }
    expect(spraysAktiv([], '2026-11-08', [])).toBe(false)
    expect(spraysAktiv([], '2026-11-08', [k('2026-11-08')])).toBe(true)
    expect(spraysAktiv([tag('2026-11-06', { einnahmen: [einnahme] })], '2026-11-08', [])).toBe(true)
    expect(spraysAktiv([tag('2026-11-05', { einnahmen: [einnahme] })], '2026-11-08', [])).toBe(false)
  })
  it('zählt Wasser nur, wenn es eingeschaltet ist', () => {
    expect(abendStatus().total).toBe(7)
    expect(abendStatus(undefined, true).total).toBe(8)
  })
})

describe('Tageszeiten', () => {
  it('leitet Beginn und Ende aus dem Bereich ab', () => {
    const z = zeitenAusPhasen('2026-11-08', ['morgen', 'mittag'])
    expect(z.beginn).toContain('2026-11-08T06:00')
    expect(z.ende).toContain('2026-11-08T14:00')
  })
  it('hält die frühe Nacht auf dem eingetragenen Tag', () => {
    const z = zeitenAusPhasen('2026-11-08', ['nacht-frueh'])
    expect(logischerTag(new Date(z.beginn))).toBe('2026-11-08')
  })
  it('hält die späte Nacht auf dem eingetragenen Tag', () => {
    const z = zeitenAusPhasen('2026-11-08', ['nacht-spaet'])
    expect(logischerTag(new Date(z.beginn))).toBe('2026-11-08')
    expect(z.ende).toContain('2026-11-09T00:00')
  })
  it('nennt die Tageszeiten in zeitlicher Reihenfolge', () => {
    expect(phasenText(ep({ phasen: ['abend', 'morgen'] }))).toBe('Morgen, Abend')
    expect(phasenText(ep())).toBeUndefined()
  })
})

describe('Check-in-Status', () => {
  it('nennt beim leeren Tag alle offenen Punkte', () => {
    expect(morgenStatus().offen).toEqual(['Schlaf', 'Display', 'Alkohol gestern'])
    expect(abendStatus().total).toBe(7)
    expect(abendStatus().komplett).toBe(false)
  })
  it('wertet Alkohol am Morgen auf dem Vortag aus', () => {
    const heute = tag('2026-11-08', { nacht: { schlafSubjektiv: 4, display: 'keine' } })
    expect(morgenStatus(heute).offen).toEqual(['Alkohol gestern'])
    expect(morgenStatus(heute, tag('2026-11-07', { alkohol: { ja: false } })).komplett).toBe(true)
  })
  it('zählt «Nein» als beantwortet', () => {
    expect(abendStatus(tag('2026-11-08', { massage: { ja: false } })).beantwortet).toBe(1)
  })
  it('verlangt beim Abend eine Angabe zum Kopfweh', () => {
    const ohneKopfweh = tag('2026-11-08', {
      koffein: { ja: false }, suessgetraenke: { ja: false }, massage: { ja: false },
      kopfBelastung: 3, koerperBelastung: { stufe: 3 }, befinden: 4,
    })
    expect(abendStatus(ohneKopfweh).offen).toEqual(['Kopfweh'])
    expect(abendStatus({ ...ohneKopfweh, kopfwehStatus: 'keines' }).komplett).toBe(true)
  })
})

describe('Erkenntnis', () => {
  it('zählt Tage ohne Kopfweh', () => {
    const e = [tag('2026-11-08', { kopfwehStatus: 'keines' }), tag('2026-11-07', { kopfwehStatus: 'keines' })]
    expect(erkenntnis(e, new Date(2026, 10, 8, 20))).toBe('2 Tage ohne Kopfweh.')
  })
  it('meldet eine vollständige Woche', () => {
    const e = wocheVon('2026-11-08').map((d) => tag(d, { befinden: 3 }))
    expect(erkenntnis(e, new Date(2026, 10, 8, 20))).toContain('7/7')
  })
})
