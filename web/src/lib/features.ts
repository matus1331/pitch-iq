/**
 * Duels are switched off in production until they are finished. The dev server (localhost) always has them;
 * a production build gets them with VITE_DUELS=on.
 */
export const DUELS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DUELS === 'on'
