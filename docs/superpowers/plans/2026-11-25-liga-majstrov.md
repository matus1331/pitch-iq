# Liga majstrov Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate Champions League competition in PitchIQ: tip exact scores, own table, same scoring as the Premier League.

**Architecture:** Own `cl_*` tables with their own lock trigger and RLS. The existing `sync` function gets a second, isolated step that reads football-data.org once per run. On the web, the round list and the standings table are extracted from the PL pages and reused by a new page.

**Tech Stack:** Supabase (Postgres, Deno Edge Function), React 19, TanStack Query, Tailwind, Vitest, pgTAP. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-11-25-liga-majstrov-design.md](../specs/2026-11-25-liga-majstrov-design.md)

## Global Constraints

- Scoring only through the existing `scoreMatchTip` (3 IQ outcome, 6 IQ exact). Ranking only through `rankRows`.
- The score of every CL match is the one after 90 minutes. Never use `fullTime` when `duration` is not `REGULAR`.
- CL data never touches `fixtures`, `match_tips`, `gameweeks`, levels, duels or notifications.
- A CL failure must not stop the PL sync, and the other way round.
- Rounds: 1–8 league phase; 9 Play-off, 10 Osemfinále, 11 Štvrťfinále, 12 Semifinále, 13 Finále.
- Never log or print `FOOTBALL_DATA_KEY`. Only the Edge Function uses it.
- UI copy in Slovak, code and comments in English. PL pages must look and behave as before.
- Existing PL tests pass without changed expectations.
- Deno tests wipe the local database (README); they only ever run against the local stack.

## Review Focus

1. The match really starts before the stored kickoff (delayed schedule): the tip is locked by `started`. → Task 1
2. The API answers 429, an error JSON or an empty list: nothing is deleted or overwritten. → Tasks 2, 3
3. A finished match has no score, or no `regularTime` after extra time: it is not scored, not even as 0:0. → Task 2
4. A postponed match in an old round must not make that round the default forever. → Task 5
5. Barcelona and Bayern share `tla` FCB: names come from `shortName`. → Task 2

## Files

| File | Responsibility |
|---|---|
| `supabase/migrations/0016_champions_league.sql` | tables, lock trigger, RLS |
| `supabase/tests/champions_league.test.sql` | pgTAP for the above |
| `supabase/functions/sync/footballData.ts` + `.test.ts` | fetch + translate the API answer (the only file that knows football-data.org) |
| `supabase/functions/sync/clSync.ts` + `.test.ts` | store and score |
| `supabase/functions/sync/index.ts` | run both syncs, isolated |
| `web/src/components/MatchTipCard.tsx` | team badge and saving come from outside |
| `web/src/components/RoundMatches.tsx` | progress box + cards, from `Round.tsx` |
| `web/src/components/TipTable.tsx` | player table + legend, from `Standings.tsx` |
| `web/src/lib/cl.ts` + `.test.ts` | CL types, queries, round names, default round |
| `web/src/pages/ChampionsLeague.tsx` | the page |

---

### Task 1: Database

**Files:** Create `supabase/migrations/0016_champions_league.sql`, `supabase/tests/champions_league.test.sql`

**Interfaces – Produces:**
- `cl_teams(id int pk, name text, short_name text, crest text)`, all not null except `crest`
- `cl_fixtures(id int pk, gameweek_id int not null check 1..13, kickoff_time timestamptz, team_h int → cl_teams, team_a int → cl_teams, team_h_score int, team_a_score int, started bool, finished_provisional bool, finished bool)`; booleans not null default false
- `cl_match_tips(user_id uuid → profiles on delete cascade, fixture_id int → cl_fixtures, home_goals int, away_goals int, points int, is_final bool default false)`, PK `(user_id, fixture_id)`, goals not null check 0..20
- `cl_locked(p_fixture int) returns boolean`, `cl_revealed(p_fixture int) returns boolean`

- [ ] **Step 1: Write the pgTAP test**, same shape as `supabase/tests/rules.test.sql` (users A and B with profiles, seeded as postgres, `set local role authenticated`). Fixtures: 9200 opens in 1 day; 9201 kicked off a minute ago with B's tip and A's tip; 9202 no kickoff; 9203 kickoff in 1 day but `started = true`; 9204 second open match. Assertions:
  - insert on 9201, 9202 and 9203 → `TIP_LOCKED` (three tests); update of A's tip on 9201 → `TIP_LOCKED`; delete of it → `TIP_LOCKED`
  - insert on 9200 with `points = 99, is_final = true` lives, and reads back `points is null` and `is_final = false`
  - `update … set points = 99` on 9200 leaves `points` null
  - moving the 9200 tip to 9204 → `TIP_FIXTURE_IMMUTABLE`
  - `home_goals = 21` → SQLSTATE `23514`
  - inserting a tip for the other user's id → SQLSTATE `42501`
  - as B: A's tip on 9200 is invisible (0 rows), on 9201 visible (1 row)
  - as a signed-in account without a profile: 0 rows on 9201
  - as a client: insert into `cl_fixtures` → `42501`

- [ ] **Step 2:** Run `npx supabase test db`. Expected: the new file fails, `relation "cl_teams" does not exist`.

- [ ] **Step 3: Write the migration.** `cl_locked` is `stable security definer set search_path = public` and returns `coalesce((select kickoff_time is null or kickoff_time <= now() or started …), true)` (unknown match = locked). Trigger `cl_match_tips_guard` mirrors `match_tips_guard` from `0005`, without `kind`, and raises `TIP_LOCKED` from `cl_locked`; `set search_path = public`. RLS on all three tables: teams and fixtures `select to authenticated using (true)`; tips insert/update/delete own rows as in `0002`; select is `user_id = auth.uid() or ((select is_member()) and cl_revealed(fixture_id))`. **A postponed match is locked but not revealed**, so add `cl_revealed(p_fixture int)` = `coalesce(kickoff_time <= now(), false) or started`. Revoke execute on both helpers from `public, anon`, keep it for `authenticated`. Index `cl_match_tips(fixture_id)`.

- [ ] **Step 4:** Run `npx supabase migration up --local` then `npx supabase test db`. Expected: all files pass.

- [ ] **Step 5:** Commit `DB: Champions League tables with their own lock`.

### Task 2: football-data.org adapter

**Files:** Create `supabase/functions/sync/footballData.ts`, `supabase/functions/sync/footballData.test.ts`

**Interfaces – Produces:**
```ts
export interface ClTeamRow { id: number; name: string; short_name: string; crest: string | null }
export interface ClFixtureRow {
  id: number; gameweek_id: number; kickoff_time: string | null; team_h: number; team_a: number
  team_h_score: number | null; team_a_score: number | null
  started: boolean; finished_provisional: boolean; finished: boolean
}
export interface ClData { teams: ClTeamRow[]; fixtures: ClFixtureRow[] }
/** Throws when the answer is not a match list. */
export function translate(body: unknown): ClData
export function fetchChampionsLeague(key: string): Promise<ClData>
```

- [ ] **Step 1: Write the failing tests** (no database). Build matches with a helper shaped like the real answer (spec, „Overené s kľúčom“). Assertions on `translate({ matches: [...] })`:
  - league match, `matchday: 6`, `TIMED` → `gameweek_id: 6`, `kickoff_time` = `utcDate`, scores null, not started
  - `FINISHED`, `REGULAR`, `fullTime 2:3` → `2, 3`, all three flags true
  - `EXTRA_TIME`, `fullTime 5:0`, `regularTime 3:0` → `3, 0`
  - `PENALTY_SHOOTOUT`, `fullTime 5:4`, `regularTime 1:1` → `1, 1`
  - `EXTRA_TIME` without `regularTime`, and `FINISHED` with `fullTime` null/null → `started: true`, `finished: false`, scores null
  - `IN_PLAY` 1:0 → score 1:0, started, not finished
  - `POSTPONED`, `CANCELLED`, `AWARDED` → `kickoff_time` null, scores null, flags false
  - stages `PLAYOFFS` … `FINAL` (`matchday` 1, 2 or null) → 9, 10, 11, 12, 13
  - unknown stage `FOO` and a match with `homeTeam.id: null` are left out
  - two teams with `tla: 'FCB'` → `short_name` `Barça` and `Bayern`
  - each team appears once in `teams`
  - `translate({ message: 'x', errorCode: 429 })` and `translate(null)` throw

- [ ] **Step 2:** Run `npx deno test --config supabase/functions/deno.json supabase/functions/sync/footballData.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** `SCHEDULED` behaves like `TIMED`. `SUSPENDED` is started with its score. Unknown stages and unusable results are reported once per run with `console.warn` (ids only). `fetchChampionsLeague`: `GET https://api.football-data.org/v4/competitions/CL/matches`, header `X-Auth-Token`, `AbortSignal.timeout(10_000)`, a non-200 throws `football-data → <status>` (no body, no headers).

- [ ] **Step 4:** Run the test again. Expected: PASS.

- [ ] **Step 5:** Commit `football-data.org adapter for the Champions League`.

### Task 3: Store, score, wire up

**Files:** Create `supabase/functions/sync/clSync.ts`, `clSync.test.ts`. Modify `supabase/functions/sync/index.ts`, `README.md`

**Interfaces**
- Consumes: `ClData`, `fetchChampionsLeague` (Task 2), tables (Task 1), `scoreMatchTip`
- Produces:
```ts
export type ClResult = { fixtures: number; scored: number } | { skipped: true } | { error: string }
export function runClSync(db: SupabaseClient, data: ClData, now?: Date): Promise<{ fixtures: number; scored: number }>
/** Never throws: skipped without a key, { error } on any failure. */
export function syncChampionsLeague(db: SupabaseClient, key: string | undefined, fetcher?: (key: string) => Promise<ClData>): Promise<ClResult>
```

- [ ] **Step 1: Write the failing tests** against the local stack, set up like `sync.test.ts` (own `reset()` that clears `cl_match_tips`, `cl_fixtures`, `cl_teams` and creates user `cl_alfa`). Tests:
  - tip 2:1 on a match that ends 2:1 → `points 6, is_final true`; 1:0 → 3; 0:0 → 0
  - running it twice gives the same single row
  - corrected score 2:1 → 2:2 rescores 6 → 0 (kickoff 3 hours ago)
  - a finished tip without points and kickoff 30 days ago is scored; one **with** points from 30 days ago is left alone
  - finished → `kickoff_time` null clears `points` to null and `is_final` to false
  - an unfinished match leaves `points` null
  - `runClSync(db, { teams: [], fixtures: [] })` changes nothing: existing fixtures and points stay
  - `syncChampionsLeague(db, undefined)` → `{ skipped: true }` and the fetcher is not called
  - a throwing fetcher → `{ error: … }`, existing points stay

- [ ] **Step 2:** Run `npx deno test --config supabase/functions/deno.json --allow-net --allow-env --allow-read supabase/functions/sync/clSync.test.ts` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status -o env`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `clSync.ts`.** Upsert teams, then fixtures. Load tips of the fixtures in this answer in chunks of 100 fixture ids ordered by PK; rescore where the match is finished and (`points` is null or kickoff within 7 days of `now`); clear tips whose match is not finished and `points` is not null. Upsert only rows that changed. `scored` is the number of tips with points written. Mark `ponytail:` one chunk stays below 1000 rows up to 10 players.

- [ ] **Step 4: Wire `index.ts`.** Read the key from `Deno.env.get('FOOTBALL_DATA_KEY')`. CL runs after the PL try/catch, also when PL failed; the answer gets a `cl` field and the status stays the PL one. Log `cl.error` with `console.error`.

- [ ] **Step 5:** Run the whole Deno suite: `npx deno test --config supabase/functions/deno.json --allow-net --allow-env --allow-read supabase/functions`. Expected: PASS.

- [ ] **Step 6: README.** The competitions list gets Liga majstrov; `FOOTBALL_DATA_KEY` (free registration at football-data.org, locally in `supabase/functions/.env`, in production `npx supabase secrets set`); before a new season clear `cl_match_tips`, `cl_fixtures`, `cl_teams` in this order.

- [ ] **Step 7: Real data locally.** `npx supabase db reset`, start `functions serve` with the `.env`, run the sync `curl` from the README. Expected: answer has `"cl":{"fixtures":144,…}` and `select count(*) from cl_teams` is 36.

- [ ] **Step 8:** Commit `Sync: Champions League matches and tips`.

### Task 4: Extract the shared web pieces (PL unchanged)

**Files:** Create `web/src/components/RoundMatches.tsx`, `web/src/components/TipTable.tsx`. Modify `web/src/components/MatchTipCard.tsx`, `web/src/pages/Round.tsx`, `web/src/pages/Standings.tsx`

**Interfaces – Produces:**
```ts
// MatchTipCard.tsx
export interface CardTeam { name: string; short_name: string; badge: string }
export type TipInput = Pick<MatchTip, 'kind' | 'outcome' | 'home_goals' | 'away_goals'>
// props: home/away: CardTeam; save: (tip: TipInput) => Promise<{ error: unknown }>; exactOnly?: boolean; the rest as today
// RoundMatches.tsx
export function RoundMatches(p: {
  round: Fixture[]; postponed?: Fixture[]; tips: MatchTip[]; teamOf: (id: number) => CardTeam
  profiles: Map<string, Profile>; userId: string; exactOnly?: boolean; target?: number | null
  save: (fixtureId: number, tip: TipInput) => Promise<{ error: unknown }>; onSaved: () => void
}): React.ReactNode
// TipTable.tsx
export function TipTable(p: {
  rows: (Row & TieBreak & { rank: number })[]; me: string | undefined; nobody: boolean; swapKey: string
  stats?: Map<string, TipStats>; badgeOf?: (userId: string) => { src: string; alt: string } | undefined
  noteOf?: (userId: string) => string | undefined
}): React.ReactNode
export function TipLegend(): React.ReactNode  // the 🎯 ✓ ✗ Ø paragraph
```

- [ ] **Step 1: Baseline.** With the local app signed in, screenshot `/` and `/tabulky` (both boards) at 375 px. Run `npm --prefix web test` and `npm --prefix web run lint`; note the results.

- [ ] **Step 2: `MatchTipCard`.** `exactOnly` forces exact mode (never the 1/X/2 tabs, whatever `gameweek_id` is) and drops the „Tip: 1 = výhra …, X = …, 2 = …“ sentence from the footnote, keeping the IQ sentence. `save` replaces the direct `supabase.from('match_tips')` call; toast and error handling stay in the card.

- [ ] **Step 3: `RoundMatches`.** Move the progress box, the minute tick, the cards, and the postponed section there unchanged, plus the scroll to `target`. `Round.tsx` keeps heading, round picker, `WelcomeCard`, queries, and the `match_tips` upsert it passes as `save`.

- [ ] **Step 4: `TipTable` / `TipLegend`.** Move the white table and legend unchanged; `Standings.tsx` passes the club badge and „z toho zostava N“ through `badgeOf` / `noteOf`.

- [ ] **Step 5:** Run `npm --prefix web test`, `npm --prefix web run lint`, `npm --prefix web run build`. Expected: as in the baseline, build passes. Compare the screenshots from Step 1; save a PL tip and reload. Expected: no visible difference, the tip is kept.

- [ ] **Step 6:** Commit `Web: round list and player table as shared components`.

### Task 5: Champions League page

**Files:** Create `web/src/lib/cl.ts`, `web/src/lib/cl.test.ts`, `web/src/pages/ChampionsLeague.tsx`. Modify `web/src/App.tsx`, `web/src/components/Shell.tsx`, `web/src/pages/HowToPlay.tsx`, `web/public/_headers`

**Interfaces**
- Consumes: everything Task 4 produces; tables from Task 1
- Produces:
```ts
export interface ClTeam { id: number; name: string; short_name: string; crest: string | null }
export function clRoundName(gw: number): string
export function clDefaultRound(fixtures: Pick<Fixture, 'gameweek_id' | 'kickoff_time' | 'started'>[], now: number): number | undefined
export const useClTeams: …; export const useClFixtures: …; export const useClTips: … // keys ['cl', 'teams'], ['cl', 'fixtures'], ['cl', 'tips']
```
`useClTips` returns `MatchTip[]` (rows with `kind: 'exact', outcome: null` added).

- [ ] **Step 1: Write the failing Vitest tests.**
  - `clRoundName`: 6 → `6. kolo`, 9 → `Play-off`, 10 → `Osemfinále`, 11 → `Štvrťfinále`, 12 → `Semifinále`, 13 → `Finále`
  - `clDefaultRound`: the first round with a match that has a kickoff after `now` and is not started; a round 3 match with `kickoff_time: null` is ignored; a match past kickoff but still `started: false` is ignored; nothing open → the last round; no fixtures → undefined

- [ ] **Step 2:** Run `npm --prefix web test -- cl.test`. Expected: FAIL, module not found. Implement `cl.ts`. Run again. Expected: PASS.

- [ ] **Step 3: The page** `/liga-majstrov`. Heading „Liga majstrov“; a two-way switch **Zápasy / Tabuľka** styled like the one in `Standings.tsx`.
  - Zápasy: round `<select>` of rounds that have fixtures, „Tvoje IQ v tomto kole: N“, for rounds ≥ 9 the line „Platí skóre po 90 minútach, bez predĺženia a penált.“, then `RoundMatches` with `exactOnly`. `save` upserts `{ user_id, fixture_id, home_goals, away_goals }` into `cl_match_tips`. A missing crest shows no broken image.
  - Tabuľka: round filter „celú sezónu“ + rounds that have scored tips, `TipTable` with `stats`, `TipLegend`, all computed with `totals`, `tipStats`, `rankRows` from the tips joined to fixtures. `ponytail:` 1000 rows of PostgREST, page it when a season has more tips.
  - Empty state: „Zápasy Ligy majstrov zatiaľ nie sú k dispozícii.“ A failed query shows an error line instead of the endless skeleton. Footer: „Dáta: football-data.org“.

- [ ] **Step 4: Route, menu, CSP, rules.** Route in `App.tsx`. `Shell.tsx`: `{ to: '/liga-majstrov', label: 'LM', Icon: Trophy }` between Tabuľky and Duely; the indicator width is `100 / NAV.length` %. `_headers`: add `https://crests.football-data.org` to `img-src`. `HowToPlay.tsx`, in Podrobnosti: „**Liga majstrov:** samostatná súťaž v záložke LM s vlastnou tabuľkou. Body sú rovnaké ako pri Premier League, vo vyraďovacej časti platí skóre po 90 minútach. IQ z Ligy majstrov sa do levelu ani do tabuliek Premier League neráta.“

- [ ] **Step 5:** Run test, lint and build. Expected: PASS.

- [ ] **Step 6: Browser** (375 px, then desktop; preview server `web`): default round is the one with open matches; a tip saves, survives reload and round switching; a played round shows results; the table renders with zero points; crests load; the menu bar sits under the active item with 5 and with 6 items (dev has 6; build with duels off has 5); console has no errors. `/`, `/tabulky` and the level in the header did not change by the CL tip.

- [ ] **Step 7:** As postgres on the local DB, insert my tip 1:0 for an already finished match and run the sync `curl`. Check that the tip shows its IQ in the card and in the table but not in the PL table or level.

- [ ] **Step 8:** Commit `Web: Champions League page`.

### Task 6: Score delay

- [ ] **Step 1:** During a live matchday (25. 11., 17:45 and 20:00 UTC; next 6. kolo) poll the matches endpoint every 5 minutes and write `time, id, status, score` changes to the scratchpad. Compare each change to `fullTimeAt` from `match.uefa.com/v5/matches/{id}` read once the next morning.
- [ ] **Step 2:** Write the measured delay into the spec and into „Kedy pribudnú body“ for LM. If it is above about 3 hours, stop and go back to the choice of source with the user **before** merging.
