#!/usr/bin/env bash
# Local testing only: pretend a round has been played, then undo it.
#   npm run sim:round          simulate the round players are tipping now
#   npm run sim:round -- 12    simulate round 12
#   npm run sim:reset          back to the real FPL data, simulated points removed
set -euo pipefail
sql() { docker exec -i supabase_db_pl-expert psql -U postgres -tAq -c "$1"; }
sync() { curl -sf -X POST -H "Authorization: Bearer local-sync-secret" http://127.0.0.1:54321/functions/v1/sync; echo; }

# Back to real FPL data, then wipe everything scored on matches that have not really kicked off yet.
# Covers every round simulated so far, not just the last one (switching rounds used to leave points behind).
reset() {
  sql "delete from app_config where key = 'sim_round'"
  sync
  sql "update match_tips set points = null, is_final = false where not kicked_off(fixture_id);
       update club_tips set points = null, is_final = false where not kicked_off(fixture_id);
       delete from player_match_stats where not kicked_off(fixture_id);
       update duels set status = 'accepted', challenger_iq = null, opponent_iq = null,
         challenger_delta = null, opponent_delta = null
       where status = 'finished'
         and exists (select 1 from fixtures f where f.gameweek_id = duels.gameweek_id and not f.finished);"
}

case "${1:-start}" in
  start)
    if [ -n "$(sql "select value from app_config where key = 'sim_round'")" ]; then
      echo "Najprv vraciam predchádzajúcu simuláciu…"; reset
    fi
    round="${2:-$(sql "select duel_round()")}"
    sql "insert into app_config (key, value) values ('sim_round', '$round')
         on conflict (key) do update set value = excluded.value"
    echo "Simulujem koniec $round. kola…"
    sync
    echo "Hotovo. Obnov stránku. Simulácia platí, kým nespustíš: npm run sim:reset" ;;
  reset)
    echo "Vraciam simulované kolá na skutočné dáta FPL…"
    reset
    echo "Hotovo. Obnov stránku." ;;
  *) echo "Použitie: sim-round.sh start [kolo] | reset"; exit 1 ;;
esac
