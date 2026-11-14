import { useEffect } from 'react'
import { CLUB_COLORS, NEUTRAL_COLORS } from '@/lib/clubColors'

/** Paints the whole app in the player's club colours (CSS vars on <html>). */
export function ClubTheme({ shortName }: { shortName: string | undefined }) {
  useEffect(() => {
    const c = (shortName && CLUB_COLORS[shortName]) || NEUTRAL_COLORS
    const root = document.documentElement.style
    root.setProperty('--club-primary', c.primary)
    root.setProperty('--club-secondary', c.secondary)
    root.setProperty('--club-text', c.text)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.primary)
  }, [shortName])
  return null
}
