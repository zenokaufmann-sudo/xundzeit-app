import { useEffect, useRef } from 'react'
import { aktualisiereKontext } from '../context/kontext'
import { syncWennMoeglich } from './sync'

let laufend: Promise<void> | null = null
let nochmal = false

/** Immer nur ein Durchlauf gleichzeitig; Anfragen währenddessen führen zu genau einem weiteren. */
export function laufen(): Promise<void> {
  if (laufend) {
    nochmal = true
    return laufend
  }
  laufend = (async () => {
    do {
      nochmal = false
      if (!navigator.onLine) break
      await aktualisiereKontext().catch(() => undefined)
      await syncWennMoeglich()
    } while (nochmal)
  })().finally(() => {
    laufend = null
  })
  return laufend
}

const WARTEZEIT_MS = 5000

/** Sync beim Öffnen, beim Zurückkehren, sobald Netz da ist und kurz nach jeder Änderung. */
export function useHintergrund(...aenderungen: unknown[]) {
  useEffect(() => {
    void laufen()
    const sichtbar = () => {
      if (document.visibilityState === 'visible') void laufen()
    }
    const online = () => void laufen()
    document.addEventListener('visibilitychange', sichtbar)
    window.addEventListener('online', online)
    return () => {
      document.removeEventListener('visibilitychange', sichtbar)
      window.removeEventListener('online', online)
    }
  }, [])

  const ersterLauf = useRef(true)
  useEffect(() => {
    if (aenderungen.some((a) => a === undefined)) return
    if (ersterLauf.current) {
      ersterLauf.current = false
      return
    }
    const timer = setTimeout(() => void laufen(), WARTEZEIT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, aenderungen)
}
