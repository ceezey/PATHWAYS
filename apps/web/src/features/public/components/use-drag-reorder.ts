import { type DragEvent, useState } from 'react'

// Drag-to-reorder for a list of keys: the dragged key lands at the drop target's index.
export const useDragReorder = <K extends string>(
  keys: K[],
  disabled: boolean,
  onMove: (key: K, to: number) => void,
) => {
  const [dragging, setDragging] = useState<K | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const from = dragging === null ? -1 : keys.indexOf(dragging)
  const reset = () => {
    setDragging(null)
    setOver(null)
  }
  // Moving down lands after the target, moving up lands before it; null when the drop changes nothing.
  const landing = (index: number) =>
    from < 0 || over !== index || from === index ? null : from < index ? 'after' : 'before'
  const itemProps = (key: K, index: number) => ({
    draggable: !disabled,
    onDragStart: () => setDragging(key),
    onDragOver: (event: DragEvent) => {
      if (disabled) return
      event.preventDefault()
      if (over !== index) setOver(index)
    },
    onDrop: () => {
      if (!disabled && dragging !== null) onMove(dragging, index)
      reset()
    },
    onDragEnd: reset,
  })
  return { dragging, itemProps, landing }
}
