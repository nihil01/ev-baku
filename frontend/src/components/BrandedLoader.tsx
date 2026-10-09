import HouseLogo from './HouseLogo'
import './BrandedLoader.css'

type Props = {
  label?: string
  detail?: string
  compact?: boolean
  className?: string
}

export default function BrandedLoader({ label, detail, compact = false, className = '' }: Props) {
  return <div className={`brand-loader${compact ? ' brand-loader--compact' : ''}${className ? ` ${className}` : ''}`} role="status" aria-live="polite">
    <span className="brand-loader__mark">
      <i className="brand-loader__orbit" />
      <HouseLogo className="brand-loader__logo" />
      <i className="brand-loader__spark brand-loader__spark--one" />
      <i className="brand-loader__spark brand-loader__spark--two" />
    </span>
    {label && <strong>{label}</strong>}
    {detail && <small>{detail}</small>}
  </div>
}
