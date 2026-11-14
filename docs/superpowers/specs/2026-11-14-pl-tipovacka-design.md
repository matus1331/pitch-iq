# PL Tipovačka – dizajnový dokument

Dátum: 2026-11-14

## Zámer

Bezplatná webová hra pre partiu kamošov na tipovanie zápasov aktuálneho kola Premier League. Hráči súťažia v dvoch oddelených tabuľkách:

1. **Individuálna súťaž** – tipovanie výsledkov všetkých zápasov kola.
2. **Klubová súťaž** – každý hráč „vlastní“ jeden klub PL a tipuje štatistiky zápasu svojho klubu.

Hra musí byť **úplne zadarmo** (žiadne platené API ani hosting). Body sa po zápasoch vyhodnocujú automaticky.

## Ciele

- Tipovanie kola z mobilu, jednoduché prihlásenie.
- Automatické vyhodnotenie a pripísanie bodov po zápasoch.
- Dve tabuľky: individuálna a klubová.
- Klubová časť je zaujímavá vďaka rotácii tipov (každý zápas iná šestica).

## Ne-ciele

- Žiadne platené dáta (držanie lopty, strely, rohy, minúta gólu nie sú dostupné → nie sú v hre).
- Žiadne viaceré ligy/skupiny – jedna hra pre jednu partiu.
- Žiadne natívne mobilné appky.
- Notifikácie (Resend) – neskôr, nie v prvej verzii.

## Anti-ciele (čo by bolo zlyhanie)

- Akýkoľvek mesačný poplatok.
- Možnosť odpisovať cudzie tipy alebo meniť tip po výkope.
- Nesprávne alebo nespoľahlivo pripísané body.

## Obmedzenia

- Zdroj dát: **oficiálne FPL API** (`https://fantasy.premierleague.com/api/`), neoficiálne, bez kľúča. Nedá sa volať priamo z prehliadača (CORS) → všetky volania idú zo servera.
- Bezplatné tiery: Supabase Free (projekt sa uspí po ~7 dňoch bez aktivity), Cloudflare Pages / Vercel Hobby.

## Zvolený prístup (Approaches)

Zvažované:

- **A) React SPA + Supabase (Auth, Postgres, Edge Function + pg_cron)** – **zvolené.** Najmenej kódu, pravidlá (unikátny klub, zamknutie tipov, skrytie cudzích tipov) vynúti databáza cez RLS/constraints, plánovač beží každých pár minút zadarmo.
- B) Next.js na Verceli + Supabase ako DB – Vercel Hobby cron len raz denne, potreboval by externý plánovač; viac kódu bez prínosu.
- Vyradené: Firebase (naplánované funkcie vyžadujú Blaze plán s kartou), vlastný server doma (musí bežať nonstop).

Používateľ zvolil A.

## Technológie (rozhodnuté používateľom)

- Frontend: React (Vite), **Tailwind CSS**, komponenty z **https://21st.dev/** (shadcn-štýl komponenty inštalované cez CLI).
- Vizuálny dizajn tvoriť so skillom **frontend-design**.
- Backend: Supabase – Auth, Postgres, Edge Functions, pg_cron (+ pg_net).
- Hosting frontendu: Cloudflare Pages alebo Vercel (voľba buildera).

## Používatelia a prihlásenie

- Každý hráč má vlastný účet: **Google login** + **registrácia e-mail/heslo**, obe cez Supabase Auth.
- Pri registrácii si hráč zvolí **nickname** (unikátny).
- *Moje rozhodnutie:* registrácia je chránená **pozývacím kódom** (jeden kód pre celú partiu, nastavený v DB/env), aby sa nepridal cudzí, kto nájde odkaz.
- *Moje rozhodnutie:* hráč, ktorý sa pridá v polovici sezóny, začína s 0 bodmi.

## Individuálna súťaž

- Hráč tipuje každý zápas aktuálneho kola. Pri každom zápase zvolí **jeden** typ tipu:
  - **1/X/2** (výhra domácich / remíza / výhra hostí) → **2 body** pri správnom tipe.
  - **Presný výsledok** → **5 bodov** pri presnom skóre; inak 0 (aj keby sedel víťaz). Body sa nesčítavajú.
- Tip sa dá meniť do **výkopu zápasu** (`kickoff_time`), potom je zamknutý.
- Cudzie tipy sú viditeľné až po výkope daného zápasu.
- *Moje rozhodnutie:* tipovať sa dá aktuálne aj nasledujúce kolo, hneď ako FPL zverejní zápasy (každý zápas sa zamyká samostatne pri svojom výkope).
- *Moje rozhodnutie:* odložený zápas – tip ostáva naviazaný na fixture id, odomkne sa až do nového výkopu a body sa počítajú do kola, v ktorom sa zápas reálne odohrá. Kým `kickoff_time` je null, zápas sa nedá tipovať.
- Tabuľka: nickname, celkové body; možnosť pozrieť body za konkrétne kolo.

## Klubová súťaž

### Výber klubu
- Hráč si vyberie jeden z 20 klubov PL. **Jeden klub = najviac jeden hráč** (unikátne obmedzenie v DB). Obsadené kluby sú v ponuke označené.
- *Moje rozhodnutie:* klub sa po výbere nedá zmeniť počas sezóny (zmenu môže urobiť admin priamo v DB).
- Po výbere klubu sa **celá appka prefarbí do farieb klubu** (primárna/sekundárna farba; tabuľka farieb 20 klubov je napevno v kóde).
- Klubová tabuľka: nickname + **logo klubu** + body.

### Rotácia tipov
- Pre každý zápas klubu sa raz vylosuje **6 tipov** z katalógu: **3 hráčske + 3 tímové**. Šestica sa uloží a nemení sa.
- Ak sa dá, nevyberajú sa tipy zo šestice predchádzajúceho zápasu toho klubu.
- Hráč si z 6 vyberie **3** a vyplní ich. Tipy sa zamykajú pri výkope.
- Hráčske tipy: hráč vyberá z aktuálneho kádra svojho klubu (FPL `elements`, filtrované podľa `team`).
- Ak klub v kole nehrá → žiadne klubové tipy. Dvojkolo (dva zápasy) → dve samostatné šestice.
- Odložený zápas (zmení sa kolo / `kickoff_time` je null) → tipy sa zrušia, body 0.

### Katalóg tipov (body orientačné, ľahko nastaviteľné v kóde)

Hráčske (vybraný hráč vlastného klubu):

| Kľúč | Tip | Body | Vyhodnotenie z FPL |
|---|---|---|---|
| player_goal | Dá gól | 3 | `goals_scored >= 1` |
| player_brace | Dá aspoň 2 góly | 6 | `goals_scored >= 2` |
| player_assist | Bude mať asistenciu | 3 | `assists >= 1` |
| player_ga | Gól alebo asistencia | 2 | `goals_scored + assists >= 1` |
| player_yellow | Dostane žltú kartu | 3 | `yellow_cards >= 1` |
| player_top_bonus | Najviac bonusových bodov v klube | 4 | max `bonus` v rámci klubu v zápase (pri remíze uznať všetkým zhodným); aspoň 1 bonus bod |
| player_full90 | Odohrá celých 90 minút | 1 | `minutes >= 90` |
| player_super_sub | Príde z lavičky a zahrá si | 3 | `starts == 0 && minutes > 0` |
| player_top_tackles | Najviac tacklov v klube | 3 | max `tackles` v klube (remíza uznaná) |
| player_top_xg | Najvyššie xG v klube | 3 | max `expected_goals` v klube (remíza uznaná) |

Tímové (vlastný klub v zápase):

| Kľúč | Tip | Body | Vyhodnotenie |
|---|---|---|---|
| team_goals_exact | Presný počet strelených gólov | 2 | skóre klubu z fixture |
| team_conceded_exact | Presný počet inkasovaných gólov | 2 | skóre súpera |
| team_clean_sheet | Udržíme čisté konto | 2 | súper skóre == 0 |
| team_yellows_exact | Presný počet žltých kariet | 2 | súčet `yellow_cards` hráčov klubu (fixture.stats) |
| team_red | Dostaneme červenú kartu | 3 | súčet `red_cards` klubu > 0 |
| team_sub_goal | Gól dá striedajúci hráč | 4 | niektorý hráč klubu `starts == 0 && goals_scored > 0` |
| team_scorers_count | Počet rôznych strelcov | 3 | počet hráčov klubu s `goals_scored > 0` |
| team_xg_over | xG tímu bude nad 1,5 | 2 | súčet `expected_goals` hráčov klubu > 1.5 |
| team_saves_over | Brankár bude mať viac ako 3 zákroky | 1 | súčet `saves` klubu > 3 |
| match_penalty_fail | V zápase bude nepremenená alebo chytená penalta | 4 | `penalties_missed + penalties_saved > 0` (oba tímy) |
| match_own_goal | V zápase padne vlastný gól | 4 | `own_goals > 0` (oba tímy) |

Tímové tipy bez čísla sú **len tvrdenia „stane sa to“** (rozhodnutie používateľa): hráč tip vyberie = tvrdí, že sa to stane; body len ak sa to stane. Tipovať „nestane sa“ nejde, aby nevznikali takmer isté body.

*Moje rozhodnutie / oprava oproti rozhovoru:* FPL nerozlišuje premenenú penaltu od bežného gólu, preto tip na penaltu je len „nepremenená alebo chytená“.

*Moje rozhodnutie:* pri dvojkole majú štatistiky z `/event/{gw}/live/` (xG, tackles, starts) súčet za oba zápasy. Tipy `player_top_tackles`, `player_top_xg`, `player_super_sub`, `team_sub_goal`, `team_xg_over` sa preto v dvojkole do rotácie nezaraďujú; ostatné sa vyhodnocujú z per-fixture dát (`fixtures[].stats` a `explain`).

## Dáta z FPL

- `GET /api/bootstrap-static/` – kolá (`events`: id, `deadline_time`, `is_current`, `is_next`, `finished`), kluby (`teams`: id, `code`, `name`, `short_name`), hráči (`elements`: id, `web_name`, `team`, `element_type`, `status`).
- `GET /api/fixtures/?event={gw}` – zápasy: id, `kickoff_time`, `team_h`, `team_a`, `team_h_score`, `team_a_score`, `started`, `finished_provisional`, `finished`, `stats` (per tím zoznamy `{element, value}` pre goals_scored, assists, own_goals, penalties_saved, penalties_missed, yellow_cards, red_cards, saves, bonus, …).
- `GET /api/event/{gw}/live/` – per hráč `stats` (minutes, starts, goals_scored, assists, yellow_cards, bonus, expected_goals, tackles, …) a `explain` per fixture.
- Logá: `https://resources.premierleague.com/premierleague/badges/t{team.code}.png` (používa sa `code`, nie `id`).

Builder má na začiatku overiť presné názvy polí (najmä `tackles`, `starts`, `expected_goals`) na živom API, lebo FPL ich medzi sezónami mení.

## Vyhodnocovanie

- Edge Function `sync` spúšťaná pg_cron **každých ~10 minút** (počas zápasových dní stačí; mimo nich môže bežať zriedkavejšie).
- Kroky: stiahnuť bootstrap + fixtures aktuálneho/predchádzajúceho kola + live → uložiť do DB → **prepočítať body idempotentne** pre všetky zápasy s `finished_provisional = true`.
- Body sú **predbežné** pri `finished_provisional`, **konečné** pri `finished` (FPL potvrdí bonusy, typicky do pár hodín). Keďže sa prepočítava stále odznova, opravy FPL sa prejavia samy.
- Vylosovanie šestíc tipov pre zápasy nasledujúceho kola robí tiež `sync` (keď zápas ešte nemá šesticu).

## Pravidlá vynútené databázou

- Unikátny klub na hráča a unikátny nickname.
- Tip sa dá vložiť/zmeniť len pred `kickoff_time` (RLS/trigger, nie len UI).
- Čítanie cudzích tipov len po `kickoff_time` (RLS).
- Klubový tip: max 3 na zápas, len z vylosovanej šestice, len pre zápas vlastného klubu.
- Body zapisuje len serverová funkcia (service role), nie klient.

## Obrazovky (orientačne; vizuál podľa frontend-design)

- Prihlásenie / registrácia (Google, e-mail+heslo, nickname, pozývací kód).
- Výber klubu (mriežka 20 log, obsadené označené).
- Kolo – individuálne tipy (zoznam zápasov, prepínač 1/X/2 vs. presné skóre, stav zamknutia, po výkope cudzie tipy).
- Klub – zápas klubu, 6 tipov, výber 3, vyplnenie.
- Tabuľky – individuálna a klubová (nickname + logo), celkovo a za kolo.

## Ponechané na buildera

- Presná DB schéma, štruktúra projektu, routovanie.
- Výber konkrétnych komponentov z 21st.dev a celkový vizuálny štýl (frontend-design skill).
- Hosting frontendu (Cloudflare Pages vs. Vercel).
- Frekvencia cronu mimo zápasových dní.
- Farby 20 klubov.
