export function formatEUR(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}€ ${abs}`
}
