import { createContext, useContext } from 'react'
import { STANDARD_EINSTELLUNGEN, type Einstellungen } from '../domain/katalog'

export const EinstellungenContext = createContext<Einstellungen>(STANDARD_EINSTELLUNGEN)
export const useEinstellungen = () => useContext(EinstellungenContext)
