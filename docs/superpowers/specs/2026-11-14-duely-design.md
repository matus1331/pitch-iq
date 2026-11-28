# Duely — dizajn

Schválené v rozhovore 14. 11. 2026, prepracované 22. 11. 2026 (Rešpekt, zápasové duely).
Doplnok k [PitchIQ dizajnu](2026-11-14-pl-tipovacka-design.md).

## Prečo
Hráči chcú osobnú rivalitu: vyzvať kamoša a staviť na to, kto tipuje lepšie. Duely majú vlastnú menu,
aby nemiešali IQ z tipovania (Kolo, Môj klub) a level.

## Mena: Rešpekt (R)
- Každý hráč začína so **100 R**. Za každé kolo od 12. kola, ktoré je celé odohrané a hráč v ňom natipoval
  **všetky zápasy**, dostane **+5 R**. K tomu sa pripočítajú výsledky odohraných duelov.
- IQ a level sa počítajú **len z tipov**, duely ich nemenia. Level teda nikdy neklesne.
- **Stávka:** 5, 10 alebo 20 R. **Minimum:** obaja hráči musia mať aspoň 10 voľného R.
  Voľné R = R mínus stávky prijatých duelov a vlastných odoslaných výziev (prijaté, nezodpovedané výzvy R neviažu).
- Prevod starých duelov nebol potrebný, žiadny duel sa pred zmenou neodohral.

## Duel o celé kolo
- Porovná IQ, ktoré obaja získajú v kole za **tipy zápasov**. Kolo = najbližšie, v ktorom ešte nezačal žiadny zápas.
- Najviac 2 otvorené duely o kolo na hráča, s tým istým súperom jeden.
- Výzvu treba prijať do výkopu prvého zápasu kola, inak prepadne. Vyzývateľ môže čakajúcu výzvu zrušiť.
- Vyhodnotenie, keď sú všetky zápasy kola `finished`: víťaz +stávka, porazený −stávka, remíza 0.
  **Bonus za odvahu:** vyhrá hráč s nižším levelom (pred kolom), dostane navyše polovicu stávky (nadol).
- **Duel o Môj klub je vypnutý** (v UI „pripravujeme“, server ho odmietne). Kód aj stĺpec `category = 'club'` ostávajú
  na neskoršie prerobenie.

## Duel o zápas
Prepracované 28. 11. 2026: obaja tipujú naslepo, nikto nie je nútený hrať na opačnú stranu.

1. **A vyzve B** na jeden zápas, ktorý ešte nezačal, zvolí stávku a svoj tip: **1, 1X, X, X2 alebo 2**.
2. **B prijme so svojím tipom** z tých istých piatich (nezávisle od svojho tipu na zápas, ten sa nezamyká), alebo odmietne.
3. Tip súpera nikto nevidí do výkopu (RLS na `duel_picks`). Rovnaký tip je povolený.
4. Výzvu treba prijať do výkopu, inak prepadne. Prijatý duel sa už zrušiť nedá.

**Výplata** (nulový súčet, S = stávka, ½S zaokrúhlené nadol):

| Situácia | víťaz | porazený |
|---|---|---|
| Trafil len jeden, jednoduchý tip (1/X/2) | +S | −S |
| Trafil len jeden, dvojtip (1X/X2) | +½S | −½S |
| Trafili obaja alebo nikto (aj rovnaký tip) | 0 | 0 |

- **Limit:** 3 zápasové duely na hráča a kolo (čakajúce, prijaté, odohrané),
  s tým istým súperom na jeden zápas len raz (zrušená výzva, ktorú B nevidel, sa nepočíta).
- **Utajenie:** zápasové duely vidia do výkopu len ich dvaja hráči, potom sú verejné aj s tipmi.
- Odložený zápas duel zruší bez zmeny R. Bonus za odvahu sa pri zápasových dueloch neuplatňuje.

## Ako (rozhodnutia buildera)
- Tabuľka `duels` (`category` 'individual' | 'club' | 'match', `fixture_id`), tipy zápasových duelov v `duel_picks`
  (vidíš svoj, súperov až po výkope). Zapisuje sa len cez RPC: `challenge_duel`, `challenge_match_duel` (s tipom),
  `respond_duel` (pri zápase s tipom), `cancel_duel` (zrušenie čakajúcej výzvy). Rešpekt všetkých vráti `respect_board()`.
- Prepadnutie a vyhodnotenie robí `sync` (každých 10 min). Výplatu zápasového duelu počíta
  `_shared/duel.ts`. Opravy FPL po vyhodnotení sa do duelu už nepremietnu.
