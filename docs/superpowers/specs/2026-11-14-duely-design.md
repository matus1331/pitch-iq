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
1. **A vyzve B** na jeden zápas, ktorý ešte nezačal, a zvolí stávku.
2. **B prijme so svojím tipom** na ten zápas (bez tipu prijať nemôže). Strana B = výsledok jeho tipu:
   2:1 → **1**, 1:1 → **X**, 0:2 → **2**. Presné skóre sa nikde neukáže. Po prijatí môže B meniť skóre,
   ale nie víťaza (`TIP_DUEL_LOCKED`), ani tip zmazať.
3. **A uvidí len stranu B** a vyberie si jednu z dvoch ostávajúcich strán alebo dvojtip bez strany B
   (B má 1 → A môže X, 2, X2), alebo duel **odmietne**.
4. **Odmietnutie po prijatí** (aj keď A nestihne vybrať do výkopu) sa hráčovi A počíta medzi jeho 3 zápasové duely
   v kole a na ten istý zápas už toho hráča nevyzve. Na iný zápas áno.
5. Výzvu treba prijať a stranu vybrať do výkopu zápasu.

**Výplata** (nulový súčet, S = stávka, ½S zaokrúhlené nadol):

| Situácia | A | B |
|---|---|---|
| Padla strana B | −S | +S |
| Padla jednoduchá strana A | +S | −S |
| Padol dvojtip A | +½S | −½S |
| Padol tretí výsledok (nikto) | 0 | 0 |

- **Limit:** 3 zápasové duely na hráča a kolo (čakajúce, prijaté, odohrané a vlastné odmietnutia po prijatí),
  s tým istým súperom na jeden zápas len raz (zrušená výzva, ktorú B nevidel, sa nepočíta).
- **Utajenie:** zápasové duely vidia do výkopu len ich dvaja hráči, potom sú verejné.
- Odložený zápas duel zruší bez zmeny R. Bonus za odvahu sa pri zápasových dueloch neuplatňuje.

## Ako (rozhodnutia buildera)
- Tabuľka `duels` (`category` 'individual' | 'club' | 'match', `fixture_id`, `opponent_pick`, `challenger_pick`,
  stav `withdrawn`), zapisuje sa len cez RPC: `challenge_duel`, `challenge_match_duel`, `respond_duel`, `pick_duel`,
  `cancel_duel` (zrušenie čakajúcej výzvy alebo odmietnutie po prijatí). Rešpekt všetkých vráti `respect_board()`.
- Prepadnutie, odmietnutie pri výkope a vyhodnotenie robí `sync` (každých 10 min). Výplatu zápasového duelu počíta
  `_shared/duel.ts`. Opravy FPL po vyhodnotení sa do duelu už nepremietnu.
