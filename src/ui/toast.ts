import { createContext, useContext } from 'react'

export interface Toast {
  text: string
  rueckgaengig?: () => void
}

export const ToastContext = createContext<(t: Toast) => void>(() => {})
export const useToast = () => useContext(ToastContext)
