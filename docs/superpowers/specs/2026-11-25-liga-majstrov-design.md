# Liga majstrov: tipovanie výsledkov (dizajn)

Návrh z rozhovoru 25. 11. 2026. Rozširuje [PitchIQ dizajn](2026-11-14-pl-tipovacka-design.md) o druhú, oddelenú súťaž.
Čo rozhodol zadávateľ, je označené **[zadanie]**. Ostatné sú moje rozhodnutia, ktoré sa dajú zmeniť pri schvaľovaní.

## Zámer
Partia chce v tej istej apke tipovať aj Ligu majstrov (LM). Prečo práve teraz, zadanie nehovorí.

## Ciele
- **[zadanie]** Samostatná stránka Liga majstrov. Tipujú sa len výsledky.
- **[zadanie]** Oddelená súťaž s vlastnou tabuľkou.
- **[zadanie]** Vyhodnocovanie a tabuľka sú totožné s Premier League (PL): 3 IQ za víťaza alebo remízu, ďalšie 3 IQ
  za presné skóre. Pri rovnosti rozhoduje viac presných výsledkov, potom menšia priemerná chyba.

## Mimo rozsahu
- Môj klub, zostavy, tipy na hráčov, duely a push notifikácie pre LM.
- Kvalifikácia LM, iné súťaže, všeobecná podpora „ľubovoľnej súťaže“.
- Simulácia kola (`sim:round`) pre LM.
- Archív sezón. Rovnako ako PL drží apka jednu sezónu; pred ďalšou sa tabuľky LM ručne vyčistia.

## Čo by bolo zlyhanie
- IQ z LM sa objaví v PL tabuľke, leveli, duele alebo notifikácii.
- Výpadok dát LM zastaví synchronizáciu PL.
- Dá sa tipovať po výkope alebo vidieť cudzí tip pred výkopom.
- Remíza po 90 minútach sa vyhodnotí ako prehra, lebo zápas rozhodlo predĺženie.

## Pravidlá
- Tipuje sa presné skóre (0 – 20 na tím), meniť sa dá do výkopu. Cudzie tipy vidno až po výkope a len členom.
- **Vyraďovacia časť:** platí skóre po 90 minútach vrátane nadstaveného času, bez predĺženia a penált.
  Text na stránke to hovorí pri každom vyraďovacom kole.
- **Každý zápas dvojzápasu** sa tipuje zvlášť.
- **Kolá:** 1 – 8 ligová fáza, 9 play-off, 10 osemfinále, 11 štvrťfinále, 12 semifinále, 13 finále. Oba zápasy
  dvojzápasu patria do jedného kola. Ligové kolo sa volá „6. kolo“, vyraďovacie názvom fázy.
- **Štart:** tipovať sa dajú len zápasy pred výkopom. Odohrané kolá sa dajú prezrieť, ale nikto v nich nemá body.
- **Odložený zápas:** nemá výkop, tip ostáva platný do nového termínu a nemá body.
- **Zrušený alebo kontumovaný zápas:** tipy nemajú body a do tabuľky sa nepočítajú. Na karte sa
  zobrazí ako odložený; je to také zriedkavé, že vlastný stav nedostane.
- IQ z LM nezvyšuje level a nepočíta sa do PL tabuliek ani duelov. V „Ako hrať“ je to napísané.

## Postup
Zvažované:
1. **Vlastné tabuľky `cl_*` – zvolené [zadanie].** Existujúcich dát sa nedotkne a súťaže sa nemôžu pomiešať.
   Cena: zámok tipov a RLS sú napísané druhýkrát.
2. Spoločné tabuľky so stĺpcom súťaže – zamietnuté: filter by musel pribudnúť vo všetkom, čo číta zápasy a kolá
   (level, rebríčky, duely, notifikácie, sync). Jeden zabudnutý filter pomieša IQ.

Zdroj dát: **football-data.org**, free plán (LM je v ňom, 10 volaní za minútu, oneskorené skóre, potrebný kľúč).
UEFA API má viac dát, ale jeho podmienky zakazujú automatizovaný zber. Na výsledky ho netreba.

### Databáza (nová migrácia `0016`)
Názvy stĺpcov kopírujú PL, aby karta zápasu a výpočty fungovali bez prekladu.
- `cl_teams (id int pk, name, short_name, crest text)`
- `cl_fixtures (id int pk, gameweek_id int not null 1–13, kickoff_time, team_h, team_a → cl_teams, team_h_score,
  team_a_score, started, finished_provisional, finished)`. Skóre je vždy po 90 minútach. `gameweek_id` je kolo LM a nie je
  cudzím kľúčom na `gameweeks`.
- `cl_match_tips (user_id → profiles on delete cascade, fixture_id → cl_fixtures, home_goals, away_goals, points,
  is_final)`, PK `(user_id, fixture_id)`, góly 0 – 20.
- Trigger ako `match_tips_guard`: klient nemôže zapísať `points`/`is_final`, presunúť tip na iný zápas ani meniť tip
  zamknutého zápasu. Zamknutý je bez výkopu, po výkope **alebo** so `started = true` (rozvrh môže byť oneskorený).
  Chyby `TIP_LOCKED` a `TIP_FIXTURE_IMMUTABLE` už web pozná.
- RLS zapnuté: tímy a zápasy číta každý prihlásený. Tip číta vlastník, alebo člen (`is_member()`), keď je zápas
  zamknutý výkopom alebo `started` (to isté pravidlo ako zámok). Zapisuje
  len vlastník. Funkcie majú pevný `search_path` a odobraté práva ako v `0010`.

### Synchronizácia
- Nové súbory vedľa `sync.ts`: `footballData.ts` (stiahne a preloží odpoveď na naše riadky) a `clSync.ts` (uloží,
  vyhodnotí). Výmena zdroja sa týka len prvého.
- Jedno volanie `GET https://api.football-data.org/v4/competitions/CL/matches`, hlavička `X-Auth-Token`,
  timeout 10 s. Kľúč je v secrete `FOOTBALL_DATA_KEY`; bez neho sa krok preskočí.
- `index.ts` spustí LM samostatne: chyba jednej súťaže nezastaví druhú. Chyba LM sa zaloguje a vráti v odpovedi,
  HTTP stav ďalej určuje PL.
- Zápas bez oboch známych tímov a kvalifikačné fázy sa vynechajú. Neznáma fáza sa vynechá a zaloguje.
- Stav: `IN_PLAY`, `PAUSED`, `SUSPENDED`, `FINISHED` → `started`; `FINISHED` → `finished_provisional` aj `finished`;
  `POSTPONED`, `CANCELLED`, `AWARDED` → `kickoff_time = null`, bez skóre.
- Skóre: pri `duration = REGULAR` je to `fullTime`, inak `regularTime`. Ak `regularTime` chýba, zápas sa nevyhodnotí
  a zaloguje sa to. `fullTime` sa vtedy použiť nesmie, obsahuje predĺženie a penalty.
- Vyhodnotenie cez existujúci `scoreMatchTip`. Prepočítajú sa dohrané zápasy posledných 7 dní a všetky dohrané tipy
  bez bodov, takže oprava skóre aj výpadok synchronizácie sa doženú. Tip na nedohraný zápas má `points = null`.

### Web
- Trasa `/liga-majstrov`, v menu „LM“ s ikonou pohára medzi Tabuľkami a Duelmi. Šírka pásika v `Shell.tsx` sa počíta
  z počtu položiek (dnes napevno pätina, v produkcii so štyrmi položkami preto nesedí).
- Stránka má prepínač **Zápasy / Tabuľka**. Kolo sa vyberá zoznamom; predvolené je prvé s nezačatým zápasom.
- Z `Round.tsx` sa vyčlení zoznam zápasov s ukazovateľom „Natipované X z Y“, zo `Standings.tsx` tabuľka hráčov.
  Obe stránky potom používajú to isté. PL sa nesmie správať inak ako dnes.
- `MatchTipCard` dostane zvonka uloženie tipu a erb. Starý režim 1/X/2 sa riadi číslom kola < 12 a pre LM musí byť
  vypnutý, inak by sa zapol vo všetkých kolách okrem posledných dvoch. Karta nesmie použiť `badgeUrl` pre LM.
- Tabuľka sa počíta na webe z `cl_match_tips` spojených s `cl_fixtures` cez `totals`, `tipStats` a `rankRows`. Bez pohľadu v DB.
  Strop je 1000 riadkov PostgREST (5 hráčov × približne 100 zvyšných zápasov = 500), označiť `ponytail:`.
- CSP v `web/public/_headers`: do `img-src` pridať `https://crests.football-data.org`.
- „Ako hrať“: krátka časť o LM (pravidlá vyššie). Na stránke LM dole „Dáta: football-data.org“.
- README: secret `FOOTBALL_DATA_KEY` a kde ho získať.

## Overené s kľúčom (25. 11. 2026)
1. Free plán vracia sezónu 2026/27: 144 zápasov ligovej fázy, z toho 81 dohraných, vrátane 9 zápasov zo 24. 11.
   Vyraďovacie zápasy pribudnú po žrebe (minulá sezóna ich mala všetky, spolu 189).
2. `stage`: `LEAGUE_STAGE`, `PLAYOFFS`, `LAST_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `FINAL`. `matchday` je v ligovej fáze
   číslo kola 1 – 8, vo vyraďovacej poradie zápasu 1 – 2 a vo finále `null`. Kvalifikácia v odpovedi nie je.
3. Tímy: `homeTeam`/`awayTeam` s `id`, `name`, `shortName`, `tla`, `crest`; erby sú z `crests.football-data.org`.
   `tla` **nie je jedinečné** (FCB je Barcelona aj Bayern), `short_name` sa preto plní zo `shortName`.
4. Predĺženie a penalty: `regularTime` je vyplnené a `fullTime` obsahuje aj penalty (finále 2026: 5:4 oproti 1:1 po 90 min).
5. Všetkých 81 skóre aj výkopy sedia s UEFA.

**Neoverené: oneskorenie skóre.** Zápasy zo 24. 11. mali poslednú úpravu o 00:20 UTC, o 05:53 UTC bolo
všetko hotové. Presné oneskorenie sa zmeria pri živom kole; ak je viac ako približne 3 hodiny, vrátiť sa k výberu zdroja.

## Testy
- Deno, preklad odpovede: ligový zápas, predĺženie a penalty (90 minút), chýbajúce `regularTime`, odložený, kontumovaný, neznámy
  tím, neznáma a kvalifikačná fáza.
- Deno, `clSync`: vyhodnotenie, idempotencia, oprava skóre, dohraný → odložený vymaže body, preskočenie bez kľúča.
- pgTAP: zámok po výkope, bez výkopu a pri `started`; viditeľnosť; klient nezapíše body ani nepresunie tip.
- Vitest: predvolené kolo a názvy kôl. Existujúce testy PL prejdú bez zmeny očakávaní.
- V prehliadači: stránka na mobilnej šírke, uloženie tipu, tabuľka, menu s 5 aj 6 položkami.

## Na staviteľovi
Názvy komponentov, rozdelenie súborov na webe, presné znenie textov, ikona.
