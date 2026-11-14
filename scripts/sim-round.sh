#!/usr/bin/env bash
# Local testing only: pretend a round has been played, then undo it.
#   npm run sim:round          simulate the round players are tipping now
#   npm run sim:round -- 12    simulate round 12
#   npm run sim:reset          back to the real FPL data, simulated points removed
set -euo pipefail
sql() { docker exec -i supabase_db_pl-expert psql -U postgres -tAq -c "$1"; }
sync() { curl -sf -X POST -H "Authorization: Bearer local-sync-secret" http://127.0.0.1:54321/functions/v1/sync; echo; }

case "${1:-start}" in
  start)
    round="${2:-$(sql "select duel_round()")}"
    sql "insert into app_config (key, value) values ('sim_round', '$round')
         on conflict (key) do update set value = excluded.value"
    echo "Simulujem koniec $round. kola…"
    sync
    echo "Hotovo. Obnov stránku. Simulácia platí, kým nespustíš: npm run sim:reset" ;;
  reset)
    round="$(sql "select value from app_config where key = 'sim_round'")"
    if [ -z "$round" ]; then echo "Simulácia nebeží."; exit 0; fi
    in_round="fixture_id in (select id from fixtures where gameweek_id = $round)"
    sql "delete from app_config where key = 'sim_round';
         update match_tips set points = null, is_final = false where $in_round;
         update club_tips set points = null, is_final = false where $in_round;
         delete from player_match_stats where $in_round;
         update duels set status = 'accepted', challenger_iq = null, opponent_iq = null,
           challenger_delta = null, opponent_delta = null
         where gameweek_id = $round and status = 'finished';"
    echo "Vraciam $round. kolo na skutočné dáta FPL…"
    sync
    echo "Hotovo. Obnov stránku." ;;
  *) echo "Použitie: sim-round.sh start [kolo] | reset"; exit 1 ;;
esac
