import { useRef, type MouseEvent, type PointerEvent } from 'react'

const MINDESTWEG = 64
const EIGENE_GESTE = '.zeitleiste, input, textarea, select'

/** Waagrechtes Wischen: -1 heisst der Finger ging nach rechts (zurück), 1 nach links (vor). */
export function useWischen(onWisch: (schritt: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const klickSperren = useRef(false)

  return {
    onPointerDown(e: PointerEvent) {
      if (!e.isPrimary) return
      klickSperren.current = false
      start.current = (e.target as Element).closest(EIGENE_GESTE) ? null : { x: e.clientX, y: e.clientY }
    },
    onPointerUp(e: PointerEvent) {
      const s = start.current
      start.current = null
      if (!s || !e.isPrimary) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) < MINDESTWEG || Math.abs(dx) < 2 * Math.abs(dy)) return
      klickSperren.current = true
      onWisch(dx > 0 ? -1 : 1)
    },
    onPointerCancel() {
      start.current = null
    },
    // Eine Wischbewegung, die auf einem Knopf beginnt, darf ihn nicht auslösen.
    onClickCapture(e: MouseEvent) {
      if (!klickSperren.current) return
      klickSperren.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
