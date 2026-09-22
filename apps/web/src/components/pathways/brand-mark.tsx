import Image from 'next/image'

import { cn } from '@/lib/utils'

const PATHWAYS_MARK_SOURCE = '/brand/pathways-mark.png'
const PATHWAYS_MARK_SIZE = 32

export const BrandMark = ({
  className,
  priority = false,
}: {
  className?: string
  priority?: boolean
}) => (
  <Image
    alt=""
    aria-hidden="true"
    className={cn('h-8 w-8 shrink-0 object-contain', className)}
    height={PATHWAYS_MARK_SIZE}
    priority={priority}
    src={PATHWAYS_MARK_SOURCE}
    width={PATHWAYS_MARK_SIZE}
  />
)

export { PATHWAYS_MARK_SIZE, PATHWAYS_MARK_SOURCE }
