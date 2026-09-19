import type { ReactNode, Ref, WheelEventHandler } from 'react'

import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export const SidePanel = ({
  title,
  description,
  children,
  containedScroll = false,
  onOverlayWheel,
  scrollRef,
}: {
  title: string
  description: string
  children: ReactNode
  containedScroll?: boolean
  onOverlayWheel?: WheelEventHandler<HTMLDivElement>
  scrollRef?: Ref<HTMLDivElement>
}) => (
  <SheetContent
    className={
      containedScroll
        ? 'flex h-dvh max-h-dvh w-full flex-col overflow-hidden sm:max-w-xl'
        : 'w-full overflow-y-auto sm:max-w-xl'
    }
    overlayProps={onOverlayWheel ? { onWheel: onOverlayWheel } : undefined}
  >
    <SheetHeader>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
    <div
      className={containedScroll ? 'mt-6 min-h-0 flex-1 overflow-y-auto pr-1' : 'mt-6'}
      data-side-panel-scroll={containedScroll ? 'true' : undefined}
      ref={scrollRef}
    >
      {children}
    </div>
  </SheetContent>
)
