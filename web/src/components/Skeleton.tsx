/** Grey placeholders in the shape of the cards that are loading, instead of a "Načítavam…" line. */
export function CardsSkeleton({ count = 3, height = 'h-32' }: { count?: number; height?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Načítavam">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${height} animate-pulse rounded-xl bg-white/20 motion-reduce:animate-none`} />
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 px-3 pt-6">
      <div className="h-10 w-40 animate-pulse rounded-lg bg-white/20 motion-reduce:animate-none" />
      <CardsSkeleton />
    </div>
  )
}
