export interface ClubColors {
  primary: string
  secondary: string
  text: string
}

// Keyed by FPL short_name. 2026/27 squad of clubs.
export const CLUB_COLORS: Record<string, ClubColors> = {
  ARS: { primary: '#db0007', secondary: '#063672', text: '#ffffff' },
  AVL: { primary: '#670e36', secondary: '#95bfe5', text: '#ffffff' },
  BOU: { primary: '#b50e12', secondary: '#000000', text: '#ffffff' },
  BRE: { primary: '#c8102e', secondary: '#fbb800', text: '#ffffff' },
  BHA: { primary: '#0057b8', secondary: '#ffcd00', text: '#ffffff' },
  CHE: { primary: '#034694', secondary: '#dba111', text: '#ffffff' },
  COV: { primary: '#0b6fb3', secondary: '#002244', text: '#ffffff' },
  CRY: { primary: '#1b458f', secondary: '#c4122e', text: '#ffffff' },
  EVE: { primary: '#003399', secondary: '#ffffff', text: '#ffffff' },
  FUL: { primary: '#000000', secondary: '#cc0000', text: '#ffffff' },
  HUL: { primary: '#f5a12d', secondary: '#000000', text: '#000000' },
  IPS: { primary: '#0044aa', secondary: '#de2c37', text: '#ffffff' },
  LEE: { primary: '#1d428a', secondary: '#ffcd00', text: '#ffffff' },
  LIV: { primary: '#c8102e', secondary: '#00b2a9', text: '#ffffff' },
  MCI: { primary: '#6cabdd', secondary: '#1c2c5b', text: '#0b1630' },
  MUN: { primary: '#da291c', secondary: '#fbe122', text: '#ffffff' },
  NEW: { primary: '#241f20', secondary: '#41b6e6', text: '#ffffff' },
  NFO: { primary: '#dd0000', secondary: '#ffffff', text: '#ffffff' },
  TOT: { primary: '#132257', secondary: '#ffffff', text: '#ffffff' },
  SUN: { primary: '#d4001f', secondary: '#000000', text: '#ffffff' },
  // Clubs that may come up in other seasons
  WHU: { primary: '#7a263a', secondary: '#1bb1e7', text: '#ffffff' },
  WOL: { primary: '#fdb913', secondary: '#231f20', text: '#231f20' },
  BUR: { primary: '#6c1d45', secondary: '#99d6ea', text: '#ffffff' },
}

// Before a club is chosen: PitchIQ navy with the logo green.
export const NEUTRAL_COLORS: ClubColors = { primary: '#0b1628', secondary: '#3ddc6e', text: '#ffffff' }

export const badgeUrl = (code: number) =>
  `https://resources.premierleague.com/premierleague/badges/100/t${code}.png` // the unsized set has white-only variants (e.g. Liverpool)

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
