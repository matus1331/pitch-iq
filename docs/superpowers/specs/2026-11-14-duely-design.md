# Duely — dizajn

Schválené v rozhovore 14. 11. 2026. Doplnok k [PitchIQ dizajnu](2026-11-14-pl-tipovacka-design.md).

## Prečo
Hráči chcú osobnú rivalitu: vyzvať kamoša a stavať IQ na to, kto bude v kole lepší tipér.
Duel nepridáva nové tipy, len zvyšuje stávku na tipy, ktoré sa zadávajú aj tak.

## Pravidlá
- **Čo sa porovnáva:** IQ, ktoré obaja získajú v jednom kole (tipy na výsledky + klubové tipy).
- **Kolo duelu:** najbližšie kolo, v ktorom ešte nezačal žiadny zápas.
- **Stávka:** 5, 10 alebo 20 IQ. Súčet stávok všetkých otvorených duelov hráča (čakajúce aj prijaté)
  nesmie presiahnuť jeho aktuálne IQ — vyzývateľovi sa kontroluje pri výzve, súperovi pri prijatí.
- **Limity:** najviac 2 otvorené duely na kolo na hráča, s tým istým súperom v kole len jeden.
- **Priebeh:** výzva → súper prijme alebo odmietne do výkopu prvého zápasu kola, inak prepadne.
  Vyzývateľ môže čakajúcu výzvu zrušiť.
- **Vyhodnotenie:** keď sú všetky zápasy kola skončené (`finished`). Víťaz +stávka, porazený −stávka,
  remíza 0. **Bonus za odvahu:** ak vyhrá hráč s nižším levelom (level pred kolom duelu), dostane navyše
  polovicu stávky (zaokrúhlené nadol); bonus sa nikomu neberie.
- **Level nikdy neklesne:** level sa počíta z najvyššieho IQ, aké hráč kedy mal. IQ môže prehrou klesnúť.
- **Tabuľky:** hlavné tabuľky ostávajú len z tipov. Pribudne tabuľka „Duely“ (čistý zisk z duelov).
  IQ z duelov sa započítava do celkového IQ a levelu na profile.
- **Profil:** bilancia duelov (výhry–remízy–prehry), najdlhšia séria výhier.

## Ako (rozhodnutia buildera)
- Tabuľka `duels`, zapisuje sa len cez RPC `challenge_duel`, `respond_duel`, `cancel_duel` (security definer).
  Čítať môže každý prihlásený — duely sú verejné.
- Prepadnutie a vyhodnotenie robí `sync` (každých 10 min). Opravy FPL po vyhodnotení duelu sa do duelu
  už nepremietnu.
- Výpočet levelu a vrcholu IQ je zdieľaný (`_shared/level.ts`), aby web aj `sync` počítali rovnako.
