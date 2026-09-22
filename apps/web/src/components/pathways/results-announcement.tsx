'use client'

import { useEffect, useState } from 'react'

import { StatusMessage } from './status-message'

export const ResultsAnnouncement = ({
  message,
  settleKey,
  settleMilliseconds = 300,
}: {
  message: string
  settleKey: string
  settleMilliseconds?: number
}) => {
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    void settleKey
    setAnnouncement('')
    const timer = window.setTimeout(() => setAnnouncement(message), settleMilliseconds)

    return () => window.clearTimeout(timer)
  }, [message, settleKey, settleMilliseconds])

  return <StatusMessage label="Filtered results">{announcement}</StatusMessage>
}
