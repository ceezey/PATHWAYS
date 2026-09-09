'use client'
import { useSyncExternalStore } from 'react'
import { getDemoState, getServerDemoState, subscribeDemo } from './store'
export const useDemoState = () =>
  useSyncExternalStore(subscribeDemo, getDemoState, getServerDemoState)
