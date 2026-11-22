# Môj klub: zostava a všetky tipy (dizajn)

Schválené v rozhovore 22. 11. 2026. Mení klubovú súťaž z [PitchIQ dizajnu](2026-11-14-pl-tipovacka-design.md).

## Prečo
Hráčom sa nepáči náhodná šestica tipov. Často dostanú ponuku, z ktorej by si sami nič nevybrali
(napr. „Hráč dá 2 góly“ a k tomu ďalších päť nezmyslov). Chceme:
1. tipy zachovať, ale ukázať **všetky naraz** a nechať hráča vybrať si sám,
2. pridať **fantasy zostavu**: 5 hráčov vlastného klubu, ktorí zbierajú IQ podľa oficiálnych FPL bodov.

## Ciele
- Pred každým zápasom svojho klubu hráč postaví zostavu (povinná časť) a voliteľne vyberie až 3 tipy.
- Body za zostavu sú presne FPL body hráča za ten zápas: **1 FPL bod = 1 IQ** (aj záporné).
- Hráč vidí podklady na výber (káder so štatistikami) a po zápase rozpis, za čo jeho hráči body dostali.
- Pravidlá bodovania (plus aj mínus) sú vysvetlené v „Ako hrať“.

## Mimo rozsahu
- Kapitán, náhradníci, automatické striedanie, rozpočet/ceny hráčov, prestupy, stamina, povinná rotácia.
- Duel o Môj klub (ostáva vypnutý).
- Vlastný bodovací systém. Body iba preberáme z FPL.

## Čo by bolo zlyhanie (aj keby to technicky fungovalo)
- Niekto príde o body len preto, že nestihol otvoriť appku (preto sa zostava prenáša).
- Hráč nevie, prečo má hráč −1 alebo prečo dostal 9 bodov.
- Tipy sú zas neprehľadné, len dlhý zoznam namiesto šiestich zlých.

## Pravidlá

### Zostava
- 5 miest: **GK** (brankár), **DEF** (obranca), **MID** (stredopoliar), **FWD** (útočník), **Voľný** (ľubovoľný hráč z poľa,
  teda DEF/MID/FWD). FPL `element_type`: 1 GK, 2 DEF, 3 MID, 4 FWD.
- Len hráči vlastného klubu (`players.team_id = club_team_id`), každý najviac raz.
- **Nedá sa vybrať** hráč so stavom `i` (zranený), `s` (suspendovaný), `u` (nedostupný), `n` (nie je v kádri).
  Stav `d` (otázny) sa vybrať dá, ale UI ukáže varovanie a `chance_next`.
- Zostava je **na zápas** (pri dvojkole teda dve zostavy). Meniť sa dá do výkopu, potom je zamknutá (rovnako ako tipy).
- Zostava môže byť **neúplná**. Prázdne miesto dá 0.
- **Prenos:** kópia sa robí až **pri výkope** (keď sa zostava zamyká): ak hráč na začatý zápas zostavu nemá, sync
  mu ju vytvorí kópiou jeho zostavy z posledného už začatého zápasu klubu. Dovtedy UI v kroku 1 len predvyplní
  návrh z poslednej zostavy („Prevzaté z minulého zápasu“), kým ho hráč neuloží. Zmeny sa tak prenášajú vždy
  a v dvojkole sa kopíruje postupne. Zámerne prázdna zostava sa pri výkope tiež doplní (moje rozhodnutie, zriedkavé). Hráčov, ktorí sú v tej chvíli nevybrateľní alebo už nie sú v klube,
  vynechá (miesto ostane prázdne). Hráč s pôvodne platnou voľbou, ktorý sa zraní neskôr, v zostave ostáva
  a dostane 0, ak nenastúpi. UI ho zvýrazní.
- **Odložený zápas** (rovnako ako dnes pri tipoch): zostava dostane 0 a je finálna.

### Body za zostavu
- Body hráča = FPL `total_points` za daný zápas. Hráč, ktorý v zápase nemá štatistiky (nehral), má 0.
- Rozpis po zápase = FPL `explain` (identifikátor, hodnota, body) za ten zápas.
- Ako dnes: body sa prepočítavajú pri `finished_provisional` a sú finálne pri `finished`.

### Tipy
- Ponuka = **všetky tipy z katalógu**, okrem tých, ktoré nesedia na dvojkolo, keď klub v kole hrá dvakrát.
- Stále max **3 tipy na zápas**, rovnaké body a vyhodnotenie ako dnes.
- Tipy sa v UI zobrazia v **kategóriách**:
  - Góly: `player_goal`, `player_brace`, `player_assist`, `player_ga`, `team_goals_exact`, `team_scorers_count`, `team_sub_goal`
  - Karty: `player_yellow`, `team_yellows_exact`, `team_red`
  - Obrana: `team_conceded_exact`, `team_clean_sheet`, `team_saves_over`, `player_top_tackles`
  - Výkon: `player_top_bonus`, `player_full90`, `player_super_sub`, `player_top_xg`, `team_xg_over`
  - Zvláštnosti zápasu: `match_penalty_fail`, `match_own_goal`

### Kam sa body počítajú
- Body zostavy sa pripočítajú ku **klubovej tabuľke** (`leaderboard_club`) a k **celkovému IQ** (`iq_total`, teda aj
  k levelu). V klubovej tabuľke a vo výsledkoch zápasu sú vidieť zvlášť: „Zostava“ a „Tipy“.
- Body zostavy môžu byť záporné, takže IQ môže klesnúť. **Level sa počíta z najvyššieho dosiahnutého IQ** (`peak`,
  ako už robia duely), takže nikdy neklesne. Text v Profile („nikdy neklesne“) treba upraviť: IQ klesnúť môže, level nie.
- **Krivka levelov sa prepočíta** (rozhodnutie 22. 11.): level 50 = výborná sezóna vrátane zostavy, približne 55 IQ
  za kolo (dnes 31). Návrh: všetky prahy v `level.ts` vynásobiť 1,75 a zaokrúhliť (level 50 ≈ 2090 IQ). Komentár a testy
  v `level.ts` upraviť. Doterajším hráčom sa level prepočíta, môžu jednorazovo klesnúť o pár levelov. Je to vedomé.

## Postup (zvolený prístup)

Zvažované:
1. **Nová tabuľka `club_lineups`, body ukladá sync** – **zvolené**. Sedí na existujúci vzor `points` / `is_final`
   ako pri tipoch, výsledky sa po zápase nemenia pod rukami a nemieša sa to s tipmi.
2. Zostava ako riadky v `club_tips` – zamietnuté: bije sa to s limitom 3 tipov a s kontrolou ponuky.
3. Body nikde neukladať, počítať ich pri zobrazení z `player_match_stats` – zamietnuté: body by sa menili spätne
   a nesedelo by to s doterajšími výsledkami kola.

### Databáza (nová migrácia)
- `club_lineups (user_id, fixture_id, slot, player_id, points int, is_final bool)`, PK `(user_id, fixture_id, slot)`,
  `slot in ('gk','def','mid','fwd','flex')`, unikát `(user_id, fixture_id, player_id)`.
- Trigger `club_lineups_guard` (vzor ako `club_tips_guard`): zápas vlastného klubu, pred výkopom, zápas nie je
  odložený, hráč je z klubu, pozícia sedí na slot, stav hráča nie je `i/s/u/n`. Klient nemôže nastaviť
  `points`/`is_final`. Mazanie aj zmena sú povolené do výkopu.
- RLS: čítanie vlastných kedykoľvek a cudzích po výkope (rovnako ako `club_tips`), zápis iba vlastných.
- `leaderboard_club` a `iq_total` pripočítajú body zo `club_lineups`.
- `club_tip_offers`: zrušiť `check (cardinality(tip_keys) = 6)`. Tabuľka ostáva ako „čo sa dá na tento zápas tipnúť“,
  takže `club_tips_guard` aj rušenie ponuky pri odložení zápasu ostávajú bez zmeny.
- `players`: pridať sezónne štatistiky z bootstrapu pre tabuľku kádra: `total_points`, `form`, `minutes`,
  `goals_scored`, `assists`.

### Sync
- Krok 1: ukladať nové sezónne stĺpce hráčov.
- Krok 3: do `player_match_stats.stats` pridať `total_points` a `breakdown`. Pri jednom zápase v kole `total_points`
  z `el.stats`, pri dvojkole súčet bodov z `explain` záznamu toho zápasu. `breakdown` vždy z `explain` záznamu zápasu.
- Krok 4: namiesto losovania zapísať ponuku so **všetkými** vhodnými kľúčmi (`eligibleKeys(isDoubleGw)` nahradí
  `drawOffer`), a to aj prepísaním už vylosovaných ponúk na zápasy, ktoré ešte nezačali. Prenos zostáv: pre každý už začatý,
  nevyhodnotený zápas a každého vlastníka klubu bez zostavy skopírovať zostavu z jeho posledného začatého zápasu
  (priamy zápis zo syncu, mimo triggra, ktorý zamyká po výkope).
- Krok 5: odložený zápas → `club_lineups` body 0, finálne.
- Krok 6: pri vyhodnotení zápasu nastaviť body zostáv z `stats.total_points`.
- Pripomienka kola (`notify.ts`): ak má hráč v zostave nevybrateľného alebo otázneho hráča, pridať vetu
  „V zostave máš zraneného hráča.“

### Web
- **Môj klub → zápas**: postup v troch krokoch s indikátorom ①②③, kroky sa dajú preklikať späť:
  1. **Zostava** (povinná): 5 políčok na ihrisku. Klik na políčko otvorí zoznam hráčov danej pozície so štatistikami
     (FPL body v sezóne, forma, minúty, góly, asistencie, stav). Nevybrateľní sú zašednutí s dôvodom.
  2. **Tipy** (nepovinné): kategórie, max 3, tlačidlo „Preskočiť“.
  3. **Zhrnutie**: zostava a tipy, pri každom „Upraviť“.
  Pri návrate na zápas, ktorý už má zostavu, sa otvorí rovno zhrnutie.
- Po zápase: body každého hráča zo zostavy s rozpisom („Gól +5 · Asistencia +3 · Žltá karta −1“) a súčty Zostava / Tipy.
- **Káder** (nová časť Môjho klubu): tabuľka hráčov klubu so stĺpcami z kroku 1 a navyše „Pre teba“ = súčet IQ, ktoré
  hráč priniesol v tvojich zostavách. Radenie podľa stĺpca.
- **Ako hrať**: nová sekcia „Zostava“ s pravidlami a tabuľkou FPL bodov (podľa pozície: minúty, gól, asistencia,
  čisté konto, inkasované góly, zákroky, chytená penalta, obranné príspevky, bonus; mínus: vlastný gól, žltá, červená,
  nepremenená penalta, inkasované góly). Znenie podľa aktuálnych pravidiel FPL Scoring.
- Text v hlavičke Môjho klubu nahradiť (už nejde o losovanú šesticu).

## Na rozhodnutí staviteľa
- Presné slovenské popisy identifikátorov z `explain`. Neznámy identifikátor zobraziť surovo.
- Vzhľad ihriska a tabuľky kádra (v štýle existujúcich kariet), mobil je prvoradý.
- Či je „Káder“ podstránka (`/klub/kader`) alebo sekcia pod zápasmi.

## Moje rozhodnutia (nepotvrdené výslovne)
- Brankár je samostatné miesto, piate miesto je voľné z poľa. Bez náhradníkov.
- Prenos zostavy na ďalší zápas.
- „Koľko bodov hráč získal“ = sezónne FPL body plus stĺpec „Pre teba“.
- Bez feature flagu, ide to rovno všetkým.
