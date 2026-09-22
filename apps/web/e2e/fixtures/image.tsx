import type { ImgHTMLAttributes } from 'react'

export default function Image({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} src={src} alt={alt ?? ''} />
}
