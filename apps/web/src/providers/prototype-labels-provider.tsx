'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  type PrototypeLabels,
  defaultPrototypeLabels,
  mergePrototypeLabels,
} from '@/constants/prototype-labels'

export const PROTOTYPE_LABELS_STORAGE_KEY = 'pathways.prototypeLabels'

interface PrototypeLabelsContextValue {
  labels: PrototypeLabels
  hydrated: boolean
  saveLabels: (labels: PrototypeLabels) => void
  resetLabels: () => void
}

const PrototypeLabelsContext = createContext<PrototypeLabelsContextValue | null>(null)

const storeLabels = (labels: PrototypeLabels) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PROTOTYPE_LABELS_STORAGE_KEY, JSON.stringify(labels))
  }
}

export const PrototypeLabelsProvider = ({ children }: { children: React.ReactNode }) => {
  const [labels, setLabels] = useState<PrototypeLabels>({ ...defaultPrototypeLabels })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(PROTOTYPE_LABELS_STORAGE_KEY)

    if (stored) {
      try {
        setLabels(mergePrototypeLabels(JSON.parse(stored)))
      } catch {
        setLabels({ ...defaultPrototypeLabels })
      }
    }

    setHydrated(true)
  }, [])

  const saveLabels = useCallback((nextLabels: PrototypeLabels) => {
    const normalizedLabels = mergePrototypeLabels(nextLabels)
    setLabels(normalizedLabels)
    storeLabels(normalizedLabels)
  }, [])

  const resetLabels = useCallback(() => {
    const defaultLabels: PrototypeLabels = { ...defaultPrototypeLabels }
    setLabels(defaultLabels)

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PROTOTYPE_LABELS_STORAGE_KEY)
    }
  }, [])

  const value = useMemo(
    () => ({ labels, hydrated, saveLabels, resetLabels }),
    [hydrated, labels, resetLabels, saveLabels],
  )

  return <PrototypeLabelsContext.Provider value={value}>{children}</PrototypeLabelsContext.Provider>
}

export const usePrototypeLabels = () => {
  const context = useContext(PrototypeLabelsContext)

  if (!context) {
    throw new Error('usePrototypeLabels must be used within PrototypeLabelsProvider')
  }

  return context
}
