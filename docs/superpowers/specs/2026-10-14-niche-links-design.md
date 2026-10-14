# Niche links: how few appearances make a famous player's answer rarer

User request (2026-10-14): "factor in how many appearances the player has and how niche it is. Messi playing for Young
Boys would be niche, but Messi isn't niche himself." Decided: one way only, the table and cap below, and the shortfall
in daily runway is handled afterwards.

## Rule (`pipeline/jobless/tiers.link_tier`, constants in `config.py`)
An answer's tier is its fame tier plus a link penalty, never easier than its fame tier.

| Apps for the club in the prompt (summed over the prompt's era) | Steps rarer |
|---|---|
| 30 or more, or unknown / 0 | 0 |
| 10-29 | +1 |
| 3-9 | +2 |
| 1-2 | +3 |

- Star cap (a star isn't niche himself): fame tier 1-2 can fall to 4 at most, tier 3-4 to 5 at most; tiers 5+ can reach 7.
- Spells that began in 2025 or later are exempt (the data stops at July 2026, so their apps are small only because they
  just started). The latest spell start in the era is used.
- Scope: club prompts ("played for X", by position, in the Champions League; CL apps are Champions League apps). Not
  national-team, scorer, team or two-club prompts.
- `answers_for` keeps the fame tier in `base_tier` beside `tier`; points follow the final tier. The website needs no
  change: every answer already carries its own tier and points.

## Measured on the real data (2026-10-14)
- 73,417 of 570,761 answers moved to a rarer tier; Maradona at Newell's Old Boys (5 apps) goes Bandwagon -> Part-Time Fan.
- Days of dailies covered 24 -> 22; Unlimited prompts 1,784 -> 1,567 (pipeline), 213 -> 196 in the shipped slice.
- `out/build_report.md` has a "Niche links" section: counts per tier and the 40 most famous players moved.

## Rollout
Live day and the next (days 1-5) keep their shipped prompt files; the schedule from day 6 on was regenerated. A script
check confirmed every changed answer only got rarer, on the new points ladder, with names, variants and facts unchanged.
