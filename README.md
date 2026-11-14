# PitchIQ

Bezplatná tipovačka Premier League pre partiu kamošov. Hráči zbierajú IQ body a stúpajú v leveloch (1–25). Súťaže:

- **tipovanie výsledkov**: za správneho víťaza 2 IQ, za presný výsledok 5 IQ,
- **klubová súťaž**: pri každom zápase svojho klubu vyberieš 3 tipy zo šestice, ktorá sa losuje raz na kolo pre všetkých,
- **duely**: vyzveš kamoša o 5, 10 alebo 20 IQ; kto naberie v kole viac IQ, berie stávku.

Dáta sa berú z oficiálneho FPL API zadarmo. IQ body aj duely sa vyhodnocujú automaticky každých 10 minút.

Návrh je v `docs/superpowers/specs/`, plán implementácie v `docs/superpowers/plans/`.

## Štruktúra

| Priečinok | Čo obsahuje |
|---|---|
| `web/` | React appka (Vite, Tailwind, shadcn/ui) |
| `supabase/migrations/` | databáza, pravidlá tipovania, RLS, plánovač |
| `supabase/functions/_shared/` | katalóg tipov, bodovanie, losovanie šestice (zdieľa ich aj web) |
| `supabase/functions/sync/` | funkcia, ktorá stiahne FPL dáta a prepočíta body |

## Lokálny vývoj

Potrebuješ Node 20+ a Docker Desktop.

```bash
npm install && npm --prefix web install
```

```bash
npx supabase start
```

```bash
npx supabase functions serve sync --env-file supabase/functions/.env
```

`supabase/functions/.env` obsahuje `SYNC_SECRET=local-sync-secret`. Prvá synchronizácia FPL dát:

```bash
curl -X POST -H "Authorization: Bearer local-sync-secret" http://127.0.0.1:54321/functions/v1/sync
```

Do `web/.env.local` dopíš `VITE_SUPABASE_URL` a `VITE_SUPABASE_ANON_KEY`. Hodnoty vypíše `npx supabase status`. Potom spusti appku:

```bash
npm --prefix web run dev
```

Lokálny pozývací kód je `kamosi` (`supabase/seed.sql`).

### Testy

```bash
npx supabase test db
```

```bash
npm --prefix web test
```

```bash
npx deno test --config supabase/functions/deno.json --allow-net --allow-env --allow-read supabase/functions
```

Deno testy potrebujú premenné `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` z `npx supabase status`. **Pozor:** testy synchronizácie zmažú z lokálnej databázy zápasy, tipy aj používateľov. Po nich spusti `npx supabase db reset` a znova synchronizáciu.

Po zmene kódu Edge Function ju lokálny Supabase niekedy ďalej spúšťa v starej verzii. Pomôže reštart:

```bash
docker restart supabase_edge_runtime_pl-expert
```

### Simulácia konca kola

Natipuj zápasy a potom nechaj kolo „odohrať“ s vymyslenými výsledkami a štatistikami hráčov. Vyhodnotia sa tipy, klubové tipy aj duely, rovnako ako po skutočnom kole:

```bash
npm run sim:round
```

Simuluje sa kolo, ktoré sa práve tipuje. Iné kolo zvolíš takto: `npm run sim:round -- 12`. Výsledky sú pri každom spustení rovnaké a simulácia platí aj pre automatickú synchronizáciu, kým ju nevrátiš:

```bash
npm run sim:reset
```

Vrátenie zmaže body zo simulovaného kola a vráti zápasy na skutočné dáta FPL. Tipy ostanú, duely kola sa vrátia do stavu „prijatý“. Výzvy, ktoré počas simulácie prepadli, ostanú prepadnuté. Simulácia funguje len lokálne. V produkcii sa nikdy nezapne, lebo nikto nenastaví `sim_round` v `app_config`.

## Nasadenie (všetko zadarmo)

### 1. Supabase

1. Na [supabase.com](https://supabase.com) si vytvor projekt (plán Free).
2. Prepoj ho a nahraj databázu:

   ```bash
   npx supabase link --project-ref <ref-projektu>
   ```

   ```bash
   npx supabase db push
   ```

3. V SQL editore nastav pozývací kód a dve tajné hodnoty pre plánovač:

   ```sql
   insert into app_config (key, value) values ('invite_code', '<tvoj-kod>');
   select vault.create_secret('https://<ref-projektu>.supabase.co', 'project_url');
   select vault.create_secret('<dlhy-nahodny-retazec>', 'sync_secret');
   ```

4. Nastav ten istý tajný reťazec pre funkciu a nasaď ju:

   ```bash
   npx supabase secrets set SYNC_SECRET=<dlhy-nahodny-retazec>
   ```

   ```bash
   npx supabase functions deploy sync --no-verify-jwt
   ```

5. Over, že plánovač beží:

   ```sql
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   ```

### 2. Prihlásenie cez Google

1. V [Google Cloud Console](https://console.cloud.google.com/apis/credentials) vytvor OAuth Client ID typu Web application.
2. Ako Authorized redirect URI zadaj `https://<ref-projektu>.supabase.co/auth/v1/callback`.
3. V Supabase otvor Authentication → Providers → Google, zapni ho a vlož Client ID a Secret.
4. V Authentication → URL Configuration nastav Site URL na adresu appky (krok 3).

### 3. Webová appka (Cloudflare Pages)

1. Nahraj repozitár na GitHub a v Cloudflare Pages vytvor projekt z tohto repozitára.
2. Build command: `npm --prefix web install && npm --prefix web run build`. Output directory: `web/dist`.
3. Environment variables: `VITE_SUPABASE_URL` a `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).
4. Aby fungovali priame odkazy ako `/klub`, pridaj súbor `web/public/_redirects` s riadkom `/* /index.html 200` (je už v repozitári).

Odkaz na appku a pozývací kód potom pošli kamošom.

### Údržba

- Klub sa hráčovi dá zmeniť len ručne v SQL editore:

  ```sql
  set local app.admin = 'on';
  update profiles set club_team_id = <id> where nickname = '<prezyvka>';
  ```

- Bezplatný Supabase projekt sa uspí po týždni bez návštevy. Prebudíš ho v dashboarde jedným klikom.
