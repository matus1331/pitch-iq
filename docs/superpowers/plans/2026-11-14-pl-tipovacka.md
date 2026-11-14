# PL Tipovačka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bezplatná webová tipovačka Premier League pre partiu kamošov s individuálnou a klubovou súťažou, vyhodnocovaná automaticky z FPL API.

**Architecture:** React SPA (Vite) volá iba Supabase. Supabase drží Auth (Google + e-mail/heslo), Postgres so všetkými pravidlami (constraints, triggery, RLS) a Edge Function `sync`, ktorú pg_cron spúšťa každých 10 minút: stiahne FPL dáta, uloží ich, vylosuje šestice klubových tipov a idempotentne prepočíta body. Čistá logika (bodovanie, losovanie, katalóg) je v `supabase/functions/_shared/` a importuje ju aj frontend.

**Tech Stack:** Vite + React + TypeScript, Tailwind CSS v4, shadcn/ui + komponenty z 21st.dev, TanStack Query, React Router, Supabase (Auth, Postgres, Edge Functions/Deno, pg_cron, pg_net), pgTAP, `deno test`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-pl-tipovacka-design.md`

## Global Constraints

- Nič platené: len FPL API (`https://fantasy.premierleague.com/api/`), Supabase Free, Cloudflare Pages/Vercel Hobby.
- FPL sa nikdy nevolá z prehliadača, len z Edge Function.
- Individuálny tip: 1/X/2 = 2 b, presný výsledok = 5 b (nesčítava sa), jeden typ tipu na zápas.
- Tipy (oba typy) sa zamykajú pri `kickoff_time`; cudzie tipy viditeľné až po `kickoff_time`; pri `kickoff_time IS NULL` sa zápas nedá tipovať.
- Jeden klub = najviac jeden hráč; nickname unikátny; klub sa po výbere nemení (len admin v DB).
- Klubové tipy: šestica = 3 hráčske + 3 tímové, vylosovaná raz a nemenná; hráč vyberie max 3; tímové bez čísla sú len tvrdenia „stane sa to“.
- V dvojkole sa nelosujú: `player_top_tackles`, `player_top_xg`, `player_super_sub`, `team_sub_goal`, `team_xg_over`.
- Odložený zápas: individuálny tip ostáva naviazaný na fixture id, body idú do kola, kde sa zápas odohrá; klubové tipy a šestica sa zrušia.
- Body predbežné pri `finished_provisional`, konečné pri `finished`; body zapisuje len service role.
- Registrácia vyžaduje pozývací kód (`app_config.invite_code`).
- UI v slovenčine; vizuál tvoriť so skillom `frontend-design`, CSS len Tailwind, komponenty z 21st.dev (`npx shadcn@latest add "https://21st.dev/r/<autor>/<komponent>"`).
- Logá: `https://resources.premierleague.com/premierleague/badges/t{team.code}.png`.

## Review Focus

1. Tip odoslaný po výkope priamym volaním Supabase API (obídené UI) → DB ho odmietne. Test v Task 2.
2. Dvaja hráči naraz vyberú ten istý klub → jeden uspeje, druhý dostane chybu „klub je obsadený“. Test v Task 2 a Task 7.
3. Zápas odložený (kickoff → null alebo iné kolo) po tom, čo boli podané tipy → klubové tipy zrušené, individuálny tip znova editovateľný a nebodovaný. Test v Task 6.
4. FPL opraví dáta po skončení (gól pripísaný inému hráčovi) → ďalší `sync` body zmení, nezdvojí. Test v Task 6.
5. Tip na hráča, ktorý nenastúpil alebo medzitým prestúpil (nemá štatistiky v zápase) → 0 bodov, žiadny pád. Test v Task 4.

---

### Task 1: Kostra projektu

**Files:**
- Create: `web/` (Vite React TS), `supabase/` (`supabase init`), `.gitignore`, `README.md`

**Interfaces:**
- Produces: `web/` so Tailwind v4 a shadcn (`components.json`, alias `@/`); Vite alias `@shared` → `../supabase/functions/_shared`; `tsconfig` s `allowImportingTsExtensions: true`; `server.fs.allow: ['..']`.

- [ ] **Step 1:** `git init`, `.gitignore` (node_modules, .env*, dist, supabase/.temp).
- [ ] **Step 2:** `npm create vite@latest web -- --template react-ts`, pridať Tailwind v4 (`@tailwindcss/vite`), `npx shadcn@latest init`, Vitest, `@supabase/supabase-js`, `@tanstack/react-query`, `react-router-dom`.
- [ ] **Step 3:** `supabase init`; v `supabase/config.toml` zapnúť Google provider (client id/secret z env).
- [ ] **Step 4:** Overiť: `cd web && npm run build` prejde, `supabase start` nabehne.
- [ ] **Step 5:** Commit `chore: scaffold web and supabase`.

---

### Task 2: Databázová schéma, pravidlá a RLS

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_rules.sql`, `supabase/tests/rules.test.sql`

**Interfaces:**
- Produces tabuľky (všetky `id` FPL sú `int`):
  - `app_config(key text pk, value text)` – riadok `invite_code`.
  - `profiles(id uuid pk → auth.users, nickname text unique not null, club_team_id int unique null → teams)`.
  - `teams(id, code, name, short_name)`, `players(id, team_id, web_name, position int)`.
  - `gameweeks(id, deadline_time timestamptz, is_current bool, is_next bool, finished bool)`.
  - `fixtures(id, gameweek_id int null, kickoff_time timestamptz null, team_h, team_a, team_h_score int null, team_a_score int null, started bool, finished_provisional bool, finished bool, is_double_gw_h bool, is_double_gw_a bool)`.
  - `player_match_stats(player_id, fixture_id, team_id, stats jsonb, pk(player_id, fixture_id))`.
  - `match_tips(user_id uuid, fixture_id int, kind text check in ('1x2','exact'), outcome text check in ('H','D','A') null, home_goals int null, away_goals int null, points int null, is_final bool default false, pk(user_id, fixture_id))` + check: `kind='1x2'` ⇒ outcome not null; `kind='exact'` ⇒ obe góly not null ≥ 0.
  - `club_tip_offers(fixture_id, team_id, tip_keys text[] check cardinality = 6, voided bool default false, pk(fixture_id, team_id))`.
  - `club_tips(user_id, fixture_id, tip_key text, player_id int null, value int null, points int null, is_final bool default false, pk(user_id, fixture_id, tip_key))`.
  - Views `leaderboard_individual(user_id, nickname, gameweek_id, points)` a `leaderboard_club(user_id, nickname, team_id, team_code, gameweek_id, points)` – sumy podľa kola (kolo = `fixtures.gameweek_id`); celkové poradie robí klient sumou.
- Pravidlá (triggery `before insert or update` na `match_tips`, `club_tips`, `profiles`):
  - tip len ak `now() < kickoff_time` a `kickoff_time is not null`; inak chyba `TIP_LOCKED`.
  - `club_tips`: fixture musí mať užívateľov klub (`team_h` alebo `team_a`), `tip_key ∈ club_tip_offers.tip_keys`, offer nie je `voided`, max 3 riadky na (user, fixture) → `CLUB_TIP_LIMIT`.
  - `profiles.club_team_id` sa dá nastaviť len z null; zmena → `CLUB_LOCKED`; unikát → obsadený klub.
  - Stĺpce `points`, `is_final` klient nesmie meniť (trigger ich pri role `authenticated` prepíše na OLD hodnoty).
- RLS: číta každý prihlásený `teams/players/gameweeks/fixtures/player_match_stats/club_tip_offers/profiles`; `match_tips`/`club_tips` číta vlastné vždy, cudzie len ak `fixtures.kickoff_time <= now()`; zapisuje len vlastné.

- [ ] **Step 1: Napísať pgTAP testy** v `supabase/tests/rules.test.sql`:
  - `tip_after_kickoff_rejected`: insert do `match_tips` pre fixture s `kickoff_time = now() - 1 min` → `throws_ok(..., 'TIP_LOCKED')`.
  - `tip_null_kickoff_rejected`.
  - `other_tip_hidden_before_kickoff`: user B nevidí tip A (count = 0), po posunutí kickoff do minulosti vidí (count = 1).
  - `club_unique`: druhý profil s tým istým `club_team_id` → `throws_ok` (unique violation).
  - `club_change_locked` → `CLUB_LOCKED`.
  - `club_tip_fourth_rejected` → `CLUB_TIP_LIMIT`; `club_tip_not_in_offer_rejected`; `club_tip_wrong_fixture_rejected`.
  - `client_cannot_set_points`: update `points = 99` ako authenticated → hodnota ostane null.
- [ ] **Step 2:** `supabase test db` → FAIL (tabuľky neexistujú).
- [ ] **Step 3:** Napísať migrácie podľa Interfaces.
- [ ] **Step 4:** `supabase db reset && supabase test db` → všetky PASS.
- [ ] **Step 5:** Commit `feat(db): schema, tip rules and RLS`.

---

### Task 3: Dokončenie profilu s pozývacím kódom

**Files:**
- Create: `supabase/migrations/0003_profile_rpc.sql`, `supabase/tests/profile.test.sql`

**Interfaces:**
- Produces: RPC `complete_profile(p_nickname text, p_invite_code text) returns profiles` (security definer) – overí kód proti `app_config`, vytvorí profil pre `auth.uid()`. Chyby: `INVALID_INVITE`, `NICKNAME_TAKEN`, `PROFILE_EXISTS`. Nickname 2–20 znakov po trim.
- RPC `choose_club(p_team_id int) returns profiles` – chyba `CLUB_TAKEN` pri unikátnom konflikte, `CLUB_LOCKED` ak už má klub.
- Priamy insert do `profiles` klientom zakázaný (RLS).

- [ ] **Step 1: Testy:** `wrong_invite` → `INVALID_INVITE`; `ok_creates_profile`; `duplicate_nickname` → `NICKNAME_TAKEN`; `choose_taken_club` → `CLUB_TAKEN`; `choose_second_time` → `CLUB_LOCKED`.
- [ ] **Step 2:** `supabase test db` → FAIL.
- [ ] **Step 3:** Implementovať obe RPC.
- [ ] **Step 4:** `supabase test db` → PASS.
- [ ] **Step 5:** Commit `feat(db): complete_profile and choose_club rpc`.

---

### Task 4: Katalóg a bodovanie (čistá logika)

**Files:**
- Create: `supabase/functions/_shared/catalog.ts`, `supabase/functions/_shared/scoring.ts`, `supabase/functions/_shared/scoring.test.ts`

**Interfaces:**
- `catalog.ts`:
  - `type TipKind = 'player' | 'team'`; `type TipInput = 'player' | 'number' | 'claim'`.
  - `interface TipDef { key: string; kind: TipKind; input: TipInput; points: number; label: string; excludedInDoubleGw: boolean }`.
  - `export const CATALOG: TipDef[]` – presne 21 kľúčov, bodov a textov zo spec tabuliek (hráčske: input `player`; `team_goals_exact`, `team_conceded_exact`, `team_yellows_exact`, `team_scorers_count`: input `number`; ostatné tímové: `claim`).
- `scoring.ts`:
  - `interface PlayerStats { minutes: number; starts: number | null; goals_scored: number; assists: number; yellow_cards: number; red_cards: number; own_goals: number; saves: number; bonus: number; penalties_missed: number; penalties_saved: number; tackles: number | null; expected_goals: number | null }`.
  - `interface MatchContext { clubId: number; opponentId: number; clubGoals: number; opponentGoals: number; players: Map<number, { teamId: number; stats: PlayerStats }> }` – len hráči oboch tímov v tomto zápase.
  - `scoreMatchTip(tip: { kind: '1x2' | 'exact'; outcome?: 'H'|'D'|'A'; home_goals?: number; away_goals?: number }, home: number, away: number): number`.
  - `scoreClubTip(tip: { tip_key: string; player_id?: number | null; value?: number | null }, ctx: MatchContext): number` – vráti `CATALOG` body alebo 0. Pravidlá vyhodnotenia presne podľa stĺpca „Vyhodnotenie z FPL“ v spec; „najviac v klube“ = max medzi hráčmi klubu, remíza uznaná všetkým; `player_top_bonus` navyše `bonus >= 1`; hráč bez štatistík → 0.

- [ ] **Step 1: Testy** (`deno test`):
  - `scoreMatchTip({kind:'1x2',outcome:'D'},0,0) === 2`; `({kind:'exact',home_goals:0,away_goals:0},0,0) === 5`; `({kind:'exact',home_goals:2,away_goals:1},1,0) === 0`; `({kind:'1x2',outcome:'H'},1,0) === 2`.
  - `player_goal` hráč s 1 gólom → 3; `player_brace` s 1 gólom → 0, s 2 → 6.
  - `player_top_bonus`: dvaja hráči klubu s bonus 3 → obaja tipy 4; všetci bonus 0 → 0; najlepší bonus má súper → nerozhoduje.
  - `player_super_sub`: starts 0, minutes 12 → 3; starts 1 → 0.
  - `team_goals_exact` value 2 pri clubGoals 2 → 2; `team_clean_sheet` pri opponentGoals 0 → 2, pri 1 → 0.
  - `team_xg_over`: súčet xG 1.51 → 2, 1.5 → 0.
  - `match_own_goal`: vlastný gól hráča súpera → 4.
  - `missing_player_scores_zero`: `player_goal` s `player_id` mimo mapy → 0.
  - `CATALOG.length === 21`, všetky kľúče unikátne, 10 `player`, 11 `team`.
- [ ] **Step 2:** `deno test supabase/functions/_shared` → FAIL.
- [ ] **Step 3:** Implementovať.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: tip catalog and scoring`.

---

### Task 5: Losovanie šestice

**Files:**
- Create: `supabase/functions/_shared/rotation.ts`, `supabase/functions/_shared/rotation.test.ts`

**Interfaces:**
- Consumes: `CATALOG`, `TipDef` z Task 4.
- Produces: `drawOffer(previousKeys: string[], isDoubleGw: boolean, rng: () => number): string[]` – 3 kľúče `kind='player'` + 3 `kind='team'`; v dvojkole vynechá `excludedInDoubleGw`; preferuje kľúče mimo `previousKeys`, doplní z nich len ak nových nie je dosť. `rng` injektovaný kvôli testom (v produkcii `Math.random`).

- [ ] **Step 1: Testy:** výsledok má dĺžku 6, 3+3 podľa `kind`, bez duplikátov; s `previousKeys` = predchádzajúca šestica nemá prienik (pri 10/11 kľúčoch sa to vždy dá); `isDoubleGw=true` neobsahuje žiadny vylúčený kľúč (opakovať 200× s rôznym seedom).
- [ ] **Step 2:** `deno test` → FAIL.
- [ ] **Step 3:** Implementovať (zamiešanie Fisher–Yates nad poolom).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: club tip rotation`.

---

### Task 6: Edge Function `sync` a plánovač

**Files:**
- Create: `supabase/functions/sync/index.ts`, `supabase/functions/sync/fpl.ts`, `supabase/functions/sync/sync.ts`, `supabase/functions/sync/sync.test.ts`, `supabase/functions/sync/fixtures/*.json` (uložené vzorky FPL odpovedí), `supabase/migrations/0004_cron.sql`

**Interfaces:**
- Consumes: `scoreMatchTip`, `scoreClubTip`, `drawOffer`, `CATALOG`.
- `fpl.ts`: `fetchBootstrap()`, `fetchFixtures(gw: number)`, `fetchLive(gw: number)` – vracajú surový JSON; User-Agent generický (`pl-tipovacka`).
- `sync.ts`: `runSync(db: SupabaseClient, fpl: { fetchBootstrap; fetchFixtures; fetchLive }): Promise<{ fixtures: number; scored: number }>` – kroky:
  1. Upsert `teams`, `players`, `gameweeks` z bootstrap.
  2. Pre kolá `current-1`, `current`, `next`: upsert `fixtures` (aj zmeny `gameweek_id`/`kickoff_time`), `is_double_gw_*` podľa počtu zápasov tímu v kole.
  3. Upsert `player_match_stats`: v jednoduchom kole `live.elements[].stats`; v dvojkole z `explain` pre daný fixture (xG/tackles/starts = null).
  4. Pre zápasy s neprázdnym `kickoff_time` a bez offeru: pre každý tím, ktorý má hráča s týmto klubom, `drawOffer(predchádzajúca šestica klubu, isDoubleGw, Math.random)`.
  5. Odložené (`kickoff_time` null alebo FPL `gameweek_id` null): `club_tip_offers.voided = true`, `club_tips.points = 0`; `match_tips.points = null`.
  6. Pre `finished_provisional = true`: prepočítať `points` všetkých tipov od nuly, `is_final = finished`.
- `index.ts`: HTTP handler, vyžaduje header `Authorization: Bearer <SYNC_SECRET>`, volá `runSync` so service-role klientom.
- `0004_cron.sql`: `cron.schedule('fpl-sync', '*/10 * * * *', net.http_post(<function url>, headers s SYNC_SECRET z vault))`.

- [ ] **Step 1: Testy** (`sync.test.ts`, proti lokálnej `supabase start` DB, FPL nahradené vzorkami):
  - `sync_imports_and_scores`: po `runSync` má užívateľ s tipom `exact 2:1` na skončený zápas 2:1 `points = 5`.
  - `sync_is_idempotent`: dvakrát `runSync` → rovnaké body, žiadne duplikáty.
  - `fpl_correction_rescores`: vzorka 2 presunie gól na iného hráča → `player_goal` tip prvého hráča klesne na 0, druhého stúpne na 3.
  - `postponed_voids_club_tips`: vzorka s `kickoff_time: null` → offer `voided`, klubové tipy 0, individuálny tip `points null`.
  - `offer_drawn_once`: druhý `runSync` šesticu nezmení.
  - `provisional_vs_final`: `finished_provisional && !finished` → `is_final=false`; po `finished` → `true`.
- [ ] **Step 2:** `deno test --allow-net --allow-env supabase/functions/sync` → FAIL.
- [ ] **Step 3:** Implementovať. Najprv ručne stiahnuť reálne `bootstrap-static`, `fixtures?event=N`, `event/N/live` a overiť názvy polí (`tackles`, `starts`, `expected_goals`, `defensive_contribution`); vzorky orezať na 2 tímy.
- [ ] **Step 4:** → PASS; `supabase functions serve sync` + `curl` s tokenom vráti `{fixtures, scored}`.
- [ ] **Step 5:** Commit `feat: fpl sync edge function and cron`.

---

### Task 7: Frontend – prihlásenie, profil, výber klubu, téma

Pri tvorbe UI najprv vyvolať skill `frontend-design` a podľa neho zvoliť vizuálny smer; komponenty brať z 21st.dev.

**Files:**
- Create: `web/src/lib/supabase.ts`, `web/src/lib/clubColors.ts`, `web/src/lib/clubColors.test.ts`, `web/src/theme/ClubTheme.tsx`, `web/src/pages/Login.tsx`, `web/src/pages/Onboarding.tsx`, `web/src/pages/ChooseClub.tsx`, `web/src/App.tsx` (routy, guard)

**Interfaces:**
- Consumes: RPC `complete_profile`, `choose_club` (Task 3), tabuľky `teams`, `profiles`.
- Produces:
  - `CLUB_COLORS: Record<string /* FPL short_name */, { primary: string; secondary: string; text: string }>` pre všetkých 20 klubov sezóny.
  - `ClubTheme` nastaví CSS premenné `--club-primary`, `--club-secondary`, `--club-text` na `<html>`; Tailwind ich používa cez `bg-[var(--club-primary)]`. Bez klubu neutrálna téma.
  - `badgeUrl(code: number): string`.
  - Guard: bez session → `/login`; bez profilu → `/onboarding` (nickname + pozývací kód, aj po Google loginu); bez klubu → `/club`.

- [ ] **Step 1: Test** `clubColors.test.ts`: každý `short_name` zo vzorky bootstrap (Task 6 fixtures) má záznam; každá farba je `#rrggbb`; kontrast `text` voči `primary` ≥ 4.5 (WCAG AA).
- [ ] **Step 2:** `npx vitest run` → FAIL.
- [ ] **Step 3:** Implementovať stránky; chyby RPC preložiť do slovenčiny (`CLUB_TAKEN` → „Tento klub už má iný hráč.“, `INVALID_INVITE` → „Nesprávny pozývací kód.“, `NICKNAME_TAKEN` → „Prezývka je obsadená.“). V `ChooseClub` mriežka 20 log, obsadené sivé s nickname vlastníka.
- [ ] **Step 4:** `npx vitest run` → PASS; ručne v prehliadači: registrácia e-mailom, Google login, výber klubu → farby sa zmenia; druhý účet vidí klub obsadený.
- [ ] **Step 5:** Commit `feat(web): auth, onboarding, club picker, club theme`.

---

### Task 8: Frontend – individuálne tipy kola

**Files:**
- Create: `web/src/pages/Round.tsx`, `web/src/components/MatchTipCard.tsx`, `web/src/lib/tipState.ts`, `web/src/lib/tipState.test.ts`

**Interfaces:**
- Consumes: `fixtures`, `teams`, `match_tips`, `gameweeks`.
- Produces: `tipState(fixture: { kickoff_time: string | null; finished_provisional: boolean }, now: Date): 'open' | 'locked' | 'scored' | 'postponed'`.

- [ ] **Step 1: Test:** null kickoff → `postponed`; budúci → `open`; minulý → `locked`; `finished_provisional` → `scored`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementovať: prepínač kolo aktuálne/nasledujúce; karta zápasu s prepínačom „1/X/2“ vs „Presný výsledok“, upsert do `match_tips`; po výkope zobraziť tipy ostatných a body; chybu `TIP_LOCKED` zobraziť ako „Zápas už začal, tip je zamknutý.“
- [ ] **Step 4:** Test PASS; ručne: tip uložený, po zmene typu sa prepíše.
- [ ] **Step 5:** Commit `feat(web): round tipping`.

---

### Task 9: Frontend – klubové tipy

**Files:**
- Create: `web/src/pages/ClubMatch.tsx`, `web/src/components/ClubTipField.tsx`

**Interfaces:**
- Consumes: `CATALOG` (`@shared/catalog.ts`), `club_tip_offers`, `club_tips`, `players` (filtrované `team_id = club_team_id`), `tipState` (Task 8).

- [ ] **Step 1:** Implementovať: najbližší zápas klubu (aj dvojkolo = dva bloky), 6 kariet z offeru, výber max 3 (štvrtá karta disabled), vstup podľa `TipDef.input` (`player` = výber z kádra, `number` = číslo 0–10, `claim` = len zaškrtnutie), body z katalógu na karte; voided offer → „Zápas odložený, tipy zrušené.“; po vyhodnotení body pri každom tipe.
- [ ] **Step 2:** Ručne: uložiť 3 tipy, štvrtý nejde, po výkope (posunúť `kickoff_time` v lokálnej DB) sú zamknuté.
- [ ] **Step 3:** Commit `feat(web): club tipping`.

---

### Task 10: Frontend – tabuľky

**Files:**
- Create: `web/src/pages/Standings.tsx`, `web/src/lib/standings.ts`, `web/src/lib/standings.test.ts`

**Interfaces:**
- Consumes: views `leaderboard_individual`, `leaderboard_club`, `badgeUrl`.
- Produces: `rankRows(rows: { user_id: string; nickname: string; points: number }[]): { rank: number; ... }[]` – zostupne podľa bodov, rovnaké body = rovnaké poradie (1, 1, 3), sekundárne abecedne podľa nickname.

- [ ] **Step 1: Test:** `rankRows` s bodmi [10, 10, 7] → ranky [1, 1, 3].
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementovať dve záložky (Individuálna / Klubová), filter „celkovo / kolo N“, v klubovej logo + nickname, riadok prihláseného hráča zvýraznený.
- [ ] **Step 4:** PASS; ručne skontrolovať na mobilnej šírke 375 px.
- [ ] **Step 5:** Commit `feat(web): standings`.

---

### Task 11: Nasadenie

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Spísať v README: vytvorenie Supabase projektu (Free), `supabase link`, `supabase db push`, nastavenie `invite_code` v `app_config`, secrets `SYNC_SECRET`, Google OAuth (Google Cloud Console redirect URL), `supabase functions deploy sync`, nasadenie `web/` na Cloudflare Pages s `VITE_SUPABASE_URL` a `VITE_SUPABASE_ANON_KEY`.
- [ ] **Step 2:** Overiť na nasadenej verzii: registrácia, tip, ručné spustenie sync (`curl`) vráti 200, cron beží (`select * from cron.job_run_details order by start_time desc limit 5`).
- [ ] **Step 3:** Commit `docs: deployment guide`.
