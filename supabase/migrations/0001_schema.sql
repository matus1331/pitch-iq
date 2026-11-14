create table app_config (key text primary key, value text not null);

create table teams (
  id int primary key,
  code int not null,
  name text not null,
  short_name text not null
);

create table players (
  id int primary key,
  team_id int not null references teams,
  web_name text not null,
  position int not null
);

create table gameweeks (
  id int primary key,
  deadline_time timestamptz,
  is_current boolean not null default false,
  is_next boolean not null default false,
  finished boolean not null default false
);

create table fixtures (
  id int primary key,
  gameweek_id int references gameweeks,
  kickoff_time timestamptz,
  team_h int not null references teams,
  team_a int not null references teams,
  team_h_score int,
  team_a_score int,
  started boolean not null default false,
  finished_provisional boolean not null default false,
  finished boolean not null default false,
  is_double_gw_h boolean not null default false,
  is_double_gw_a boolean not null default false
);

create table player_match_stats (
  player_id int not null,
  fixture_id int not null references fixtures on delete cascade,
  team_id int not null references teams,
  stats jsonb not null,
  primary key (player_id, fixture_id)
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null unique,
  club_team_id int unique references teams
);

create table match_tips (
  user_id uuid not null references profiles on delete cascade,
  fixture_id int not null references fixtures,
  kind text not null check (kind in ('1x2', 'exact')),
  outcome text check (outcome in ('H', 'D', 'A')),
  home_goals int check (home_goals >= 0),
  away_goals int check (away_goals >= 0),
  points int,
  is_final boolean not null default false,
  primary key (user_id, fixture_id),
  check (
    (kind = '1x2' and outcome is not null and home_goals is null and away_goals is null)
    or (kind = 'exact' and outcome is null and home_goals is not null and away_goals is not null)
  )
);

create table club_tip_offers (
  fixture_id int not null references fixtures on delete cascade,
  team_id int not null references teams,
  tip_keys text[] not null check (cardinality(tip_keys) = 6),
  voided boolean not null default false,
  primary key (fixture_id, team_id)
);

create table club_tips (
  user_id uuid not null references profiles on delete cascade,
  fixture_id int not null references fixtures,
  tip_key text not null,
  player_id int,
  value int check (value >= 0),
  points int,
  is_final boolean not null default false,
  primary key (user_id, fixture_id, tip_key)
);

create view leaderboard_individual with (security_invoker = true) as
select p.id as user_id, p.nickname, f.gameweek_id, sum(t.points)::int as points
from match_tips t
join profiles p on p.id = t.user_id
join fixtures f on f.id = t.fixture_id
where t.points is not null and f.gameweek_id is not null
group by p.id, p.nickname, f.gameweek_id;

create view leaderboard_club with (security_invoker = true) as
select p.id as user_id, p.nickname, p.club_team_id as team_id, tm.code as team_code,
       f.gameweek_id, sum(t.points)::int as points
from club_tips t
join profiles p on p.id = t.user_id
join teams tm on tm.id = p.club_team_id
join fixtures f on f.id = t.fixture_id
where t.points is not null and f.gameweek_id is not null
group by p.id, p.nickname, p.club_team_id, tm.code, f.gameweek_id;
