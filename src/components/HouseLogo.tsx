type Props = {
  className?: string
  title?: string
}

export default function HouseLogo({ className = '', title }: Props) {
  const [failed, setFailed] = useState(false)
  return <span className={`house-logo${className ? ` ${className}` : ''}`} aria-hidden={title ? undefined : true}>
    {!failed ? <img src={BRAND_LOGO_URL} alt={title || ''} onError={() => setFailed(true)} /> : <svg viewBox="0 0 48 48" role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M8.5 22.5 24 9l15.5 13.5" />
      <path d="M12.5 20.2V39h23V20.2" />
      <path d="M20 39V27h8v12" />
      <path d="M32.5 12.4V8.5h4v7.4" />
    </svg>}
  </span>
}
import { useState } from 'react'
import { BRAND_LOGO_URL } from '../lib/api'
