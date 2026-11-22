# Môj klub: zostava a všetky tipy – plán implementácie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pred zápasom svojho klubu hráč postaví 5-člennú zostavu, ktorá zbiera IQ podľa FPL bodov (1:1), a voliteľne vyberie až 3 tipy zo všetkých tipov rozdelených do kategórií.

**Architecture:** Nová tabuľka `club_lineups` s triggerom (vzor `club_tips_guard`), body zapisuje sync z FPL `total_points`. Ponuka tipov ostáva v `club_tip_offers`, ale obsahuje všetky vhodné kľúče. Čistá logika (sloty, prenos, kategórie, krivka) je v `supabase/functions/_shared`, ktorý používa aj web cez alias `@shared`.

**Tech Stack:** Postgres/Supabase (migrácie, pgTAP), Deno edge funkcia `sync`, React 19 + TanStack Query + Tailwind, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-22-moj-klub-zostava-design.md](../specs/2026-11-22-moj-klub-zostava-design.md)

## Global Constraints
- 1 FPL bod = 1 IQ, záporné body sa započítajú.
- Sloty: `gk` (pozícia 1), `def` (2), `mid` (3), `fwd` (4), `flex` (2, 3 alebo 4). Hráč najviac raz v zostave.
- Nevybrateľný stav: `i`, `s`, `u`, `n`. Stav `d` sa vybrať dá, s varovaním.
- Zostava aj tipy sa zamykajú vo výkope. Odložený zápas: zostava 0 bodov, finálna.
- Max 3 tipy na zápas, rovnaké body a vyhodnotenie ako dnes.
- Level sa počíta z najvyššieho dosiahnutého IQ (`peak`). Prahy = `Math.round(1.75 × pôvodný prah)`, level 50 = 2091 IQ.
- Všetky texty v UI sú po slovensky. Žiadny feature flag.
- Testy: `npx supabase test db`, `npm --prefix web test`, `npx deno test --config supabase/functions/deno.json --allow-net --allow-env --allow-read supabase/functions` (Deno testy potrebujú `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` z `npx supabase status`, po nich `npx supabase db reset`).

## Review Focus
1. **Dvojkolo:** klub hrá v kole dvakrát. Každý zápas má vlastnú zostavu, druhá sa pri výkope kopíruje z prvej, body z `explain` záznamu svojho zápasu (nie súčet kola). Test v úlohe 5.
2. **Hráč odíde z klubu alebo sa zraní medzi zápasmi:** prenos ho vynechá (prázdny slot), v uloženej zostave ostane a dostane 0, ak nehral. Test v úlohe 4.
3. **Hráč bez štatistík v zápase** (nebol v nominácii, `player_match_stats` nemá riadok): 0 bodov, nie chyba. Test v úlohe 5.
4. **Zmena zostavy po výkope** cez API (obídenie UI): trigger odmietne `LINEUP_LOCKED`. Test v úlohe 3.
5. **Prebiehajúce kolo pri nasadení:** už vylosované 6-tice na nezačaté zápasy sa prepíšu na všetky kľúče, existujúce tipy ostanú platné. Test v úlohe 5.

---

### Task 1: Kategórie tipov a ponuka všetkých tipov

**Files:**
- Modify: `supabase/functions/_shared/catalog.ts`
- Modify: `supabase/functions/_shared/rotation.ts` (nahradiť `drawOffer`)
- Test: `supabase/functions/_shared/rotation.test.ts`

**Interfaces:**
- Produces: `TipDef.category: TipCategory`; `type TipCategory = 'goals' | 'cards' | 'defence' | 'performance' | 'match'`; `CATEGORIES: { key: TipCategory; label: string }[]` v poradí Góly, Karty, Obrana, Výkon, Zvláštnosti zápasu; `eligibleKeys(isDoubleGw: boolean): string[]` (poradie ako v `CATALOG`).

- [ ] **Step 1: Prepísať `rotation.test.ts`** (testy `drawOffer` zmazať):
```ts
Deno.test('eligibleKeys returns the whole catalog in a single round', () =>
  assertEquals(eligibleKeys(false), CATALOG.map((t) => t.key)))
Deno.test('eligibleKeys drops double-gameweek-unsafe tips', () => {
  const keys = eligibleKeys(true)
  assertEquals(keys.includes('player_super_sub'), false)
  assertEquals(keys.includes('team_xg_over'), false)
  assertEquals(keys.includes('player_goal'), true)
})
Deno.test('every tip has a known category', () =>
  assertEquals(CATALOG.every((t) => CATEGORIES.some((c) => c.key === t.category)), true))
```
- [ ] **Step 2: Spustiť** `npx deno test supabase/functions/_shared/rotation.test.ts` → FAIL (eligibleKeys neexistuje).
- [ ] **Step 3: Implementovať.** Kategórie presne podľa spec sekcie „Tipy“: goals = `player_goal, player_brace, player_assist, player_ga, team_goals_exact, team_scorers_count, team_sub_goal`; cards = `player_yellow, team_yellows_exact, team_red`; defence = `team_conceded_exact, team_clean_sheet, team_saves_over, player_top_tackles`; performance = `player_top_bonus, player_full90, player_super_sub, player_top_xg, team_xg_over`; match = `match_penalty_fail, match_own_goal`. `eligibleKeys` = `CATALOG.filter(t => !(isDoubleGw && t.excludedInDoubleGw)).map(t => t.key)`.
- [ ] **Step 4: Spustiť** test → PASS.
- [ ] **Step 5: Commit** `git commit -m "Club tips: categories and the whole catalog on offer"`

### Task 2: Prepočítaná krivka levelov a level z peaku na webe

**Files:**
- Modify: `supabase/functions/_shared/level.ts` (prah, komentár)
- Modify: `web/src/lib/standings.ts` (`iqSummary` vráti aj `peak`)
- Modify: `web/src/pages/Profile.tsx`, `web/src/components/Shell.tsx`, `web/src/components/Duels.tsx` (`levelFor(s.peak)`)
- Test: `web/src/lib/level.test.ts`, `web/src/lib/standings.test.ts`

**Interfaces:**
- Produces: `iqSummary(...)` navyše `peak: number` = `iqTotals([...individual, ...club] riadky hráča, []).peak`.

- [ ] **Step 1: Upraviť testy v `level.test.ts`** na nové prahy: `levelFor(0)` → `{level:1, needed:18}`; `levelFor(17)` → `{level:1, progress:17, needed:18}`; `levelFor(18)` → level 2; `levelFor(74)` → level 4, `levelFor(75)` → level 5 Scout; `levelFor(194)` → 10 Analyst; `levelFor(511)` → 20; `levelFor(709)` → 25 Pundit; `levelFor(2023)` → 49 Hall of Famer; `levelFor(2090)` → 49; `levelFor(2091)` → 50 Legend, `needed: null`.
- [ ] **Step 2: Test v `standings.test.ts`:** hráč s klubovým riadkom kola 2 `points: -6` po kole 1 s 20 → `iqSummary(...).total === 14`, `.peak === 20`.
- [ ] **Step 3: Spustiť** `npm --prefix web test` → FAIL.
- [ ] **Step 4: Implementovať.** `threshold = (level) => Math.round(1.75 * base(level))`, kde `base` je doterajší vzorec. Komentár: level 50 ≈ 55 IQ za kolo vrátane zostavy. V Profile nahradiť komentár „never drops“ textom, že IQ môže klesnúť po záporných bodoch zostavy, level nie. Shell, Profile a Duels volajú `levelFor(s.peak)`.
- [ ] **Step 5: Spustiť** web testy aj `npx deno test supabase/functions/_shared` → PASS.
- [ ] **Step 6: Commit** `git commit -m "Levels: retuned curve for lineup points, level from peak IQ"`

### Task 3: Migrácia `0015_club_lineups.sql`

**Files:**
- Create: `supabase/migrations/0015_club_lineups.sql`
- Test: `supabase/tests/lineups.test.sql` (pgTAP, vzor `rules.test.sql`)

**Interfaces:**
- Produces: tabuľka `club_lineups(user_id uuid → profiles on delete cascade, fixture_id int → fixtures, slot text, player_id int → players, points int, is_final bool default false)`, PK `(user_id, fixture_id, slot)`, unique `(user_id, fixture_id, player_id)`, `check (slot in ('gk','def','mid','fwd','flex'))`. Chyby: `LINEUP_WRONG_FIXTURE`, `LINEUP_LOCKED`, `LINEUP_WRONG_PLAYER`, `LINEUP_WRONG_SLOT`, `LINEUP_PLAYER_OUT`. `players` nové stĺpce `total_points int, form numeric, minutes int, goals_scored int, assists int` (nullable). `leaderboard_club` vracia navyše `lineup_points int` (stĺpec `points` = tipy + zostava). `iq_total` pripočíta zostavy.

- [ ] **Step 1: Napísať `lineups.test.sql`** (seed ako v `rules.test.sql`: klub 9011, zápasy open/locked/postponed, hráči 9011: GK pos 1 status `a`, DEF pos 2 `a`, MID pos 3 `i`, FWD pos 4 `d`, hráč iného klubu). Ako hráč A:
  - `lives_ok` insert `gk` s brankárom na open zápas.
  - `throws_ok` `def` slot s brankárom → `LINEUP_WRONG_SLOT`; `flex` s brankárom → `LINEUP_WRONG_SLOT`.
  - `throws_ok` zranený MID → `LINEUP_PLAYER_OUT`; `lives_ok` otázny FWD do `flex`.
  - `throws_ok` hráč iného klubu → `LINEUP_WRONG_PLAYER`.
  - `throws_ok` insert, update aj delete na locked zápase → `LINEUP_LOCKED`; na postponed → `LINEUP_LOCKED`.
  - `is(points, null)` po inserte s `points = 99`.
  - hráč B nevidí zostavu A na open zápase, vidí ju na locked (seed ako postgres).
  - `lives_ok` insert ponuky `club_tip_offers` s 21 kľúčmi (zrušený check na 6).
  - `leaderboard_club` pre A s finálnou zostavou 7 a tipom 3 → `points = 10`, `lineup_points = 7`.
- [ ] **Step 2: Spustiť** `npx supabase test db` → FAIL (tabuľka neexistuje).
- [ ] **Step 3: Napísať migráciu.** Trigger `club_lineups_guard` before insert/update/delete, v poradí: zápas klubu hráča a `kickoff_time > now()` (inak `LINEUP_LOCKED`, nezhoda klubu `LINEUP_WRONG_FIXTURE`), `fixture_id` sa nedá zmeniť (`TIP_FIXTURE_IMMUTABLE` ako pri tipoch), hráč z klubu, pozícia podľa slotu, stav nie `i/s/u/n`. Klient nenastaví `points`/`is_final` (vzor z `club_tips_guard` v 0009). Trigger preskočí kontroly, keď `current_user` nie je `authenticated` (sync zapisuje service role, aj po výkope). RLS politiky skopírovať zo `club_tips` (0009: `read_own_or_started`, write/update/delete own). `alter table club_tip_offers drop constraint` na cardinality check. Nové stĺpce `players`. `create or replace view leaderboard_club` ako `union all` tipov a zostáv zoskupené podľa hráča a kola, s `lineup_points`. `create or replace function iq_total` s ďalším sčítancom zo `club_lineups`. Granty ako pri `club_tips` (0010).
- [ ] **Step 4: Spustiť** `npx supabase db reset && npx supabase test db` → PASS vrátane starých testov.
- [ ] **Step 5: Commit** `git commit -m "DB: club lineups with lock, position and availability rules"`

### Task 4: Čistá logika zostavy

**Files:**
- Create: `supabase/functions/_shared/lineup.ts`
- Test: `supabase/functions/_shared/lineup.test.ts`

**Interfaces:**
- Produces:
  - `type Slot = 'gk' | 'def' | 'mid' | 'fwd' | 'flex'`; `SLOTS: { slot: Slot; label: string; positions: number[] }[]` (labely `Brankár`, `Obranca`, `Stredopoliar`, `Útočník`, `Voľný`).
  - `isPickable(status: string): boolean` (false pre `i/s/u/n`).
  - `carryOver(prev: { slot: Slot; player_id: number }[], players: Map<number, { team_id: number; position: number; status: string }>, club: number): { slot: Slot; player_id: number }[]` vráti len sloty, ktorých hráč je stále v klube, sedí na slot a je vybrateľný.
  - `lineupPoints(playerId: number, stats: Map<number, { total_points?: number | null }>): number` (chýba = 0).

- [ ] **Step 1: Testy:** `carryOver` ponechá platných, vynechá zraneného (`i`), hráča, ktorý prestúpil (iný `team_id`), a ponechá `d`; `isPickable('d') === true`, `isPickable('s') === false`; `lineupPoints` vráti `-1` pri `total_points: -1` a `0` pri chýbajúcom hráčovi.
- [ ] **Step 2: Spustiť** `npx deno test supabase/functions/_shared/lineup.test.ts` → FAIL.
- [ ] **Step 3: Implementovať** podľa signatúr.
- [ ] **Step 4: Spustiť** → PASS.
- [ ] **Step 5: Commit** `git commit -m "Lineup rules: slots, availability, carry-over"`

### Task 5: Sync – štatistiky, ponuka, prenos, bodovanie

**Files:**
- Modify: `supabase/functions/sync/sync.ts`
- Modify: `supabase/functions/_shared/scoring.ts` (`PlayerStats` + `total_points: number | null`, `breakdown: { identifier: string; value: number; points: number }[]`)
- Test: `supabase/functions/sync/sync.test.ts` (v `live()` doplniť `total_points` a `explain` so `stats: [{identifier, value, points}]`; v `reset()` mazať aj `club_lineups`)

**Interfaces:**
- Consumes: `eligibleKeys` (Task 1), `carryOver`, `lineupPoints` (Task 4), tabuľka z Task 3.

- [ ] **Step 1: Testy v `sync.test.ts`:**
  - `stores total points and the per-fixture breakdown`: po syncu má `player_match_stats.stats` hráča `total_points` a `breakdown` z `explain` jeho zápasu.
  - `double gameweek scores each match from its own explain entry`: dva zápasy klubu v kole, rôzne body v `explain` → každý riadok má body svojho zápasu.
  - `offers every eligible tip and widens an old six`: existujúca 6-tica na nezačatý zápas → po syncu `tip_keys` = `eligibleKeys(false)`. Na začatý zápas sa 6-tica nemení.
  - `copies the last lineup at kickoff, skipping injured players`: alfa má zostavu na zápas 1 (finished), zápas 2 sa začal a zostavu nemá, jeden hráč má teraz `status: 'i'` → zostava zápasu 2 má 4 sloty.
  - `does not overwrite a saved lineup`: zostava na zápas 2 existuje → ostane.
  - `scores lineups from FPL points, missing player gets 0`: body sedia na `total_points`, hráč bez štatistík 0, `is_final` podľa `finished`.
  - `postponed match voids lineups`: zápas bez `kickoff_time` → body 0, `is_final = true`.
- [ ] **Step 2: Spustiť** sync testy → FAIL.
- [ ] **Step 3: Implementovať:**
  - Krok 1: do upsertu `players` pridať `total_points`, `form` (`Number(e.form)`), `minutes`, `goals_scored`, `assists` z `boot.elements`.
  - Krok 3: `total_points` = jeden zápas `el.stats.total_points`, dvojkolo súčet `points` v `explain` zázname zápasu. `breakdown` = `entry.stats` zápasu (identifier, value, points), vždy.
  - Krok 4: pre nezačaté zápasy klubov v `current`, `current+1` upsert `club_tip_offers` s `eligibleKeys(double)` (aj prepísanie existujúcich, `voided` nemeniť). Odstrániť `drawOffer` a `roundKeys`.
  - Nový krok za krokom 4: pre začaté, nevyhodnotené (`!finished`) zápasy klubov a vlastníkov bez zostavy na ten zápas nájsť ich zostavu z posledného začatého zápasu klubu (podľa `kickoff_time`) a vložiť `carryOver(...)`.
  - Krok 5: `club_lineups` na `voidIds` → `points: 0, is_final: true`.
  - Krok 6: pre každý vyhodnocovaný zápas upsert `club_lineups` s `lineupPoints` a `is_final: f.finished`.
- [ ] **Step 4: Spustiť** sync testy → PASS, potom `npx supabase db reset`.
- [ ] **Step 5: Commit** `git commit -m "Sync: FPL points, all tips on offer, lineup carry-over and scoring"`

### Task 6: Pripomienka kola so zraneným hráčom v zostave

**Files:**
- Modify: `supabase/functions/sync/notify.ts`
- Test: `supabase/functions/sync/notify.test.ts`

**Interfaces:**
- Produces: `dueNotices(fixtures, tips, users, sent, now, lineupAlerts: Set<string>)`. `lineupAlerts` = používatelia, ktorých posledná uložená zostava má hráča so stavom `i/s/u/n/d`.

- [ ] **Step 1: Testy:** používateľ so všetkými tipmi a v `lineupAlerts` dostane pripomienku s telom `V zostave máš zraneného hráča.`. Používateľ s chýbajúcimi tipmi a v `lineupAlerts` dostane `Ešte nemáš natipované 2 zápasy. V zostave máš zraneného hráča.`, `url: '/klub'` iba vtedy, keď mu chýba iba zostava, inak `/`.
- [ ] **Step 2: Spustiť** → FAIL.
- [ ] **Step 3: Implementovať.** V `runNotify` načítať posledné zostavy vlastníkov (najnovší `fixture_id` podľa výkopu) a stav ich hráčov.
- [ ] **Step 4: Spustiť** → PASS.
- [ ] **Step 5: Commit** `git commit -m "Round reminder warns about an injured player in the lineup"`

### Task 7: Môj klub – trojkrokový postup a výsledky zostavy

**Files:**
- Modify: `web/src/pages/ClubMatch.tsx` (zoznam zápasov, kroky, výsledky)
- Create: `web/src/components/LineupStep.tsx` (ihrisko + výber hráča)
- Create: `web/src/components/ClubTipsStep.tsx` (tipy podľa `CATEGORIES`, používa existujúci `ClubTipField`)
- Create: `web/src/lib/breakdown.ts` (`breakdownLabel(identifier: string): string`, `formatBreakdown(rows): string`)
- Test: `web/src/lib/breakdown.test.ts`

**Interfaces:**
- Consumes: `SLOTS`, `isPickable` (Task 4), `CATEGORIES` (Task 1), `availability()` z `web/src/lib/availability.ts`, `tipState()`.

- [ ] **Step 1: Test `breakdown.test.ts`:** `formatBreakdown([{identifier:'goals_scored',value:1,points:5},{identifier:'assists',value:1,points:3},{identifier:'yellow_cards',value:1,points:-1}])` → `'Gól +5 · Asistencia +3 · Žltá karta −1'` (U+2212 mínus); riadky s `points: 0` sa vynechajú; neznámy identifikátor sa zobrazí surovo (`'foo +2'`). Labely: `minutes` Odohrané minúty, `goals_scored` Gól, `assists` Asistencia, `clean_sheets` Čisté konto, `goals_conceded` Inkasované góly, `own_goals` Vlastný gól, `penalties_saved` Chytená penalta, `penalties_missed` Nepremenená penalta, `yellow_cards` Žltá karta, `red_cards` Červená karta, `saves` Zákroky, `bonus` Bonus, `defensive_contribution` Obranná práca.
- [ ] **Step 2: Spustiť** `npm --prefix web test` → FAIL, implementovať `breakdown.ts`, → PASS.
- [ ] **Step 3: Postaviť UI.** Pre otvorený zápas: indikátor ①②③. Krok 1: 5 políčok podľa `SLOTS`, klik otvorí zoznam hráčov s pozíciami slotu (zoradení podľa `total_points` zostupne) so stĺpcami FPL body, forma, minúty, góly, asistencie a ikonou z `availability()`. Nevybrateľní sú zašednutí s dôvodom. Bez uloženej zostavy predvyplniť sloty z poslednej zostavy hráča s hlavičkou „Prevzaté z minulého zápasu“ a tlačidlom „Uložiť zostavu“. Každá voľba = upsert/delete riadku `club_lineups` a toast. Chyby `LINEUP_*` preložiť v `errorText` (`web/src/lib/supabase.ts`). Krok 2: tipy podľa kategórií, počítadlo `x/3`, tlačidlo „Preskočiť“. Krok 3: zhrnutie s „Upraviť“ pri zostave aj tipoch. Zápas s uloženou zostavou sa otvorí na kroku 3. Zamknutý alebo odohraný zápas: zostava s bodmi hráčov a `formatBreakdown`, súčty „Zostava X · Tipy Y“. Nahradiť úvodný text o šestici textom „Pred každým zápasom postav zostavu piatich hráčov, zbierajú IQ podľa FPL bodov. K tomu si môžeš vybrať až 3 tipy.“
- [ ] **Step 4: Overiť v prehliadači** (`preview_start`, lokálny stack): uložiť zostavu, zranený je zašednutý, preskočiť tipy, zhrnutie, po `npm run sim:round` výsledky s rozpisom. Konzola bez chýb.
- [ ] **Step 5: Commit** `git commit -m "Môj klub: lineup, tips by category, summary and lineup results"`

### Task 8: Káder

**Files:**
- Create: `web/src/pages/ClubSquad.tsx`
- Modify: `web/src/App.tsx` (route `klub/kader`), `web/src/pages/ClubMatch.tsx` (odkaz „Káder“ v hlavičke)

- [ ] **Step 1: Postaviť tabuľku** hráčov klubu: meno, pozícia (GK/DEF/MID/FWD), stav (ikona + `news`), FPL body v sezóne, forma, minúty, góly, asistencie, „Pre teba“ = súčet `club_lineups.points` hráča pre prihláseného. Klik na hlavičku stĺpca zoradí. Predvolene podľa FPL bodov. Na mobile sa tabuľka posúva vodorovne a meno ostáva prilepené vľavo.
- [ ] **Step 2: Overiť v prehliadači** (desktop aj `resize_window` mobile), radenie funguje.
- [ ] **Step 3: Commit** `git commit -m "Môj klub: squad table with season stats"`

### Task 9: Ako hrať a klubová tabuľka

**Files:**
- Modify: `web/src/pages/HowToPlay.tsx`
- Modify: `web/src/pages/Standings.tsx` (klubová tabuľka)

- [ ] **Step 1: „Ako hrať“, nová sekcia „Zostava“:** pravidlá (5 miest, voľné miesto z poľa, zranený/suspendovaný sa nedá vybrať, prenos pri výkope, 1 FPL bod = 1 IQ, IQ môže klesnúť, level nie). Tabuľka bodov (z FPL `game_config.scoring`, GK / DEF / MID / FWD): odohrané do 60 min 1/1/1/1; 60 min a viac 2/2/2/2; gól 10/6/5/4; asistencia 3; čisté konto 4/4/1/0; každé 3 zákroky 1 (GK); chytená penalta 5; obranná práca 0/2/2/2 (pri DEF za 10 odkopov, blokov, zákrokov a zachytení, pri MID a FWD za 12, keď sa ráta aj získanie lopty); bonus 1 – 3; každé 2 inkasované góly −1/−1/0/0; nepremenená penalta −2; žltá −1; červená −3; vlastný gól −2. Pri obrannej práci pred commitom overiť prahy na stránke pravidiel FPL. Nahradiť popis losovanej šestice textom o všetkých tipoch v kategóriách.
- [ ] **Step 2: Klubová tabuľka:** pri hráčovi zobraziť `z toho zostava X` z `lineup_points` (rozšíriť `RoundRow` v `standings.ts` o nepovinné `lineup_points`).
- [ ] **Step 3: Overiť v prehliadači**, potom spustiť všetky tri sady testov a `npm --prefix web run build` → bez chýb.
- [ ] **Step 4: Commit** `git commit -m "How to play: lineup scoring; club standings show lineup points"`
