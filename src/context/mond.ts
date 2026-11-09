import { parseDatum } from '../domain/datum'
import type { Datum, MondTag } from '../domain/types'

const J2000 = Date.UTC(2000, 0, 1, 12)
const TAG_MS = 86400000
const GRAD = Math.PI / 180
/** Der Mond holt pro Tag rund 12,2 Grad auf die Sonne auf: etwa ein Tag vor und nach Neu- und Vollmond. */
const FENSTER = 12.19 / 360

const sin = (grad: number) => Math.sin(grad * GRAD)

/** Winkel zwischen Mond und Sonne in Grad, aus den Hauptgliedern der Mond- und Sonnentheorie (Meeus). */
function elongation(tage: number): number {
  const sonneAnomalie = 357.5291 + 0.98560028 * tage
  const sonne = 280.459 + 0.98564736 * tage + 1.915 * sin(sonneAnomalie) + 0.02 * sin(2 * sonneAnomalie)

  const mondMittel = 218.316 + 13.176396 * tage
  const mondAnomalie = 134.963 + 13.064993 * tage
  const abstand = 297.85 + 12.190749 * tage
  const breite = 93.272 + 13.22935 * tage
  const mond =
    mondMittel +
    6.289 * sin(mondAnomalie) +
    1.274 * sin(2 * abstand - mondAnomalie) +
    0.658 * sin(2 * abstand) +
    0.214 * sin(2 * mondAnomalie) -
    0.186 * sin(sonneAnomalie) -
    0.114 * sin(2 * breite)

  return (((mond - sonne) % 360) + 360) % 360
}

/** Mondphase am Mittag des Tages. */
export function mondAm(datum: Datum): MondTag {
  const phase = elongation((parseDatum(datum).getTime() - J2000) / TAG_MS) / 360
  const beleuchtung = (1 - Math.cos(2 * Math.PI * phase)) / 2
  let kategorie: MondTag['kategorie']
  if (phase < FENSTER || phase > 1 - FENSTER) kategorie = 'neumond'
  else if (Math.abs(phase - 0.5) < FENSTER) kategorie = 'vollmond'
  else kategorie = phase < 0.5 ? 'zunehmend' : 'abnehmend'
  return {
    phase: Math.round(phase * 1000) / 1000,
    beleuchtung: Math.round(beleuchtung * 100),
    kategorie,
  }
}
