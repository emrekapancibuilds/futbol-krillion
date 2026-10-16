# Niche-o-meter

User request (2026-10-16): a free tool where you type a player and get a niche score from 1 to 100. 97 or above must be
essentially impossible ("unless it's genuinely so niche, like some random division 7 player in Spain"). The score counts
toward nothing. A pop-up explains the tool the very first time a user opens it, and never again. Unknown names say
"Even we don't know who that is" and get no score.

## Score (`web/lib/niche.ts`)
- From the player's fame rank (1 = most famous of 178,258 players), piecewise linear in log(rank) through anchors at the
  game's tier boundaries: rank 1 -> 1, 300 -> 15, 1,000 -> 28, 2,000 -> 38, 5,000 -> 50, 12,000 -> 64, 32,000 -> 78,
  172,000 -> 96.
- Any player with a Wikipedia article (fame > 0) is capped at 96. Only players with NO article at all (5,838, 3.3%) can
  score 97-100. Within that band: a known Transfermarkt peak market value gives 97-98.2 (higher value, lower score);
  an unknown value spreads 98.2-100 by a stable hash of the id. A test checks the guarantee over the shipped data.
- "More niche than N% of the 178,258 players we track" comes from the rank.

## Data (`pipeline/jobless/niche.py` -> `web/data/niche-players.json`)
`{ "n": 178258, "p": { "<id>": [rank, fame, "France · Forward · 1994-2015", deep] } }`, `deep` 0-100 only used when fame is 0.
Search uses the existing `names-player.json` (names and aliases).

## Web
- `GET /api/niche?q=` (2-60 chars) -> up to 6 matches, most famous first, each with score, label, percentile and the
  one-line description; `{ results: [] }` when nothing matches.
- Page `/niche`: input, suggestions, result gauge (big number, segmented pixel meter, label, percentile line), the
  not-found message "Even we don't know who that is" with no number.
- First-visit pop-up explaining the tool, remembered in localStorage (`fk:niche-seen`); no way to reopen it.
- Entry points: a button on the first page under KICK OFF, and a header link from 480px up (the 375px header is full).
- Nothing is stored or scored: no points, streaks or standings are touched.
