const AZERBAIJANI_MOBILE_PREFIXES = new Set(['10', '50', '51', '55', '60', '70', '77', '99'])

export function azPhoneNationalDigits(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('00994')) digits = digits.slice(5)
  else if (digits.startsWith('994')) digits = digits.slice(3)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, 9)
}

export function normalizeAzPhone(value: string): string {
  const digits = azPhoneNationalDigits(value)
  return digits ? `+994${digits}` : ''
}

export function formatAzPhone(value: string): string {
  const digits = azPhoneNationalDigits(value)
  const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean)
  return `+994${groups.length ? ` ${groups.join(' ')}` : ' '}`
}

export function isValidAzPhone(value: string): boolean {
  const digits = azPhoneNationalDigits(value)
  return digits.length === 9 && AZERBAIJANI_MOBILE_PREFIXES.has(digits.slice(0, 2))
}

export function isValidEmail(value: string): boolean {
  const email = value.trim()
  if (email.length < 3 || email.length > 254 || /\s/.test(email)) return false
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || local.length > 64 || !domain || domain.length > 253) return false
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  const labels = domain.split('.')
  return labels.length >= 2 && labels.every((label) => (
    label.length > 0
    && label.length <= 63
    && !label.startsWith('-')
    && !label.endsWith('-')
    && /^[a-z\d-]+$/i.test(label)
  ))
}
