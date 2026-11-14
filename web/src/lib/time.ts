const days = (n: number) => `${n} ${n === 1 ? 'deň' : n < 5 ? 'dni' : 'dní'}`

/** Time until something, as short Slovak text: "2 dni 4 h", "3 h 20 min", "42 min". */
export function timeLeft(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'menej ako minútu'
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  if (d > 0) return h > 0 && d < 5 ? `${days(d)} ${h} h` : days(d)
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`
  return `${m} min`
}
