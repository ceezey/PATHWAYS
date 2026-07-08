import type { ReactNode } from 'react'

import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export const SidePanel = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) => (
  <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
    <SheetHeader>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
    <div className="mt-6">{children}</div>
  </SheetContent>
)
