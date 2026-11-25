/** Heading of a round page: the round, my IQ in it, and the switch between the current and the next round. */
export function RoundHeader({ eyebrow, gw, total, options, nameOf, onPick }: {
  eyebrow?: string
  gw: number | undefined
  total: number
  options: number[]
  nameOf: (gw: number) => string
  onPick: (gw: number) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-sm font-semibold">{eyebrow}</p>}
        <h1 className="font-heading text-4xl leading-none">{gw ? nameOf(gw) : 'Kolo'}</h1>
        <p>Tvoje IQ v tomto kole: <b>{total}</b></p>
      </div>
      {options.length > 1 && (
        <div className="flex gap-1 rounded-lg bg-black/20 p-1 text-sm">
          {options.map((o) => (
            <button key={o} onClick={() => onPick(o)} aria-pressed={o === gw}
              className={`rounded-md px-3 py-1 font-semibold ${o === gw ? 'bg-white text-neutral-900' : ''}`}>
              {nameOf(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
