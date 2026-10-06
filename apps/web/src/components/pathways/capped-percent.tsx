import { cappedPercentParts } from '@/lib/percent'

/** A capped percent whose overrun note reads as small muted text beside the value. */
export const CappedPercent = ({
  value,
  overLabel,
}: { value: number | string; overLabel: string }) => {
  const parts = cappedPercentParts(value, overLabel)
  return (
    <>
      {parts.value}
      {parts.over ? (
        <>
          {' '}
          <span className="whitespace-nowrap text-xs font-normal tracking-normal text-muted-foreground">
            ({parts.over})
          </span>
        </>
      ) : null}
    </>
  )
}
