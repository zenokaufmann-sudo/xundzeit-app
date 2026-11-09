import Dexie, { type EntityTable } from 'dexie'
import type { GarminZeile, ReportZeile } from '../domain/externe'
import type { Krankheit, TagesEintrag } from '../domain/types'

export interface Einstellung { key: string; wert: unknown }

export class XundzeitDb extends Dexie {
  tage!: EntityTable<TagesEintrag, 'datum'>
  settings!: EntityTable<Einstellung, 'key'>
  krankheiten!: EntityTable<Krankheit, 'id'>
  garmin!: EntityTable<GarminZeile, 'datum'>
  reports!: EntityTable<ReportZeile, 'woche'>

  constructor() {
    super('xundzeit')
    this.version(1).stores({
      tage: 'datum',
      settings: 'key',
    })
    this.version(2).stores({
      krankheiten: 'id',
    })
    this.version(3).stores({
      garmin: 'datum',
      reports: 'woche',
    })
  }
}

export const db = new XundzeitDb()
