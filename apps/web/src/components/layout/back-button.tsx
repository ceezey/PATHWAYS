'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'

/** Goes back one step in browser history, falling back to the given route on a fresh tab. */
export const BackButton = ({ fallbackHref }: { fallbackHref: string }) => {
  const router = useRouter()
  return (
    <Button
      className="gap-2 self-start"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallbackHref))}
      size="sm"
      type="button"
      variant="outline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </Button>
  )
}
