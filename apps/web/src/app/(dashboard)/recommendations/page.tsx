'use client'

import { useEffect } from 'react'

export default function RecommendationsPage() {
  useEffect(() => {
    window.location.replace('/alerts')
  }, [])

  return <output>Opening Rule-Based Alerts…</output>
}
