'use client'

import { createContext, useContext } from 'react'

import { type DisplayLabels, defaultDisplayLabels } from '@/constants/display-labels'

interface DisplayLabelsContextValue {
  labels: DisplayLabels
}

const DisplayLabelsContext = createContext<DisplayLabelsContextValue | null>(null)
const labels = { ...defaultDisplayLabels }

export const DisplayLabelsProvider = ({ children }: { children: React.ReactNode }) => (
  <DisplayLabelsContext.Provider value={{ labels }}>{children}</DisplayLabelsContext.Provider>
)

export const useDisplayLabels = () => {
  const context = useContext(DisplayLabelsContext)

  if (!context) {
    throw new Error('useDisplayLabels must be used within DisplayLabelsProvider')
  }

  return context
}
