# Tunnel tease: will it break through?

User request (2026-10-19): "It should be like another layer of dopamine where we're kind of wondering: is it going to
break through? For 30% of the time, it should break through to another layer, but then, 70% of the time, it
shouldn't."

## Rules
- Every reveal ends with a tease. The ball rams a gate, bounces back, rams it again and pushes against it while time
  runs at half speed, the picture trembles, chips trickle off and light from behind leaks through the spreading cracks.
- **Break (30%)**: the gate it rams is the answer's own last gate. After the push it smashes through and walks out into
  the stadium, as before.
- **Hold (70%)**: the ball smashes the answer's gate on the way, then rams the NEXT tier's gate (with that tier's icon
  on it) and the gate holds. The ball bounces off and drops to the floor; the gate stays cracked, glowing in the next
  tier's light: a near miss.
- **Jobless always breaks**: there is no gate past it to fail at.
- The tier, points and banner are always the answer's real tier. The tease is presentation only.
- The roll is `Math.random()` per reveal (`teaseOutcome(tier, roll)`); `/reveal-preview?tier=N&tease=break|hold`
  forces either ending in development.
- The tease replaces the old hang before the last gate for tier 5+ and the slow motion before the final smash.

## Timing (at the run's 80% tempo, on the wall clock)
- The push lasts longer for rarer tiers: about 0.6 s for Bandwagon up to 1.3 s for Jobless.
- Bandwagon: about 1.8 s when it breaks, 2.8 s when it holds. Jobless: about 4.6 s. The slowest hold (tier 6) is
  about 4.9 s. Tapping still skips to the end.

## Code
- `web/lib/reveal/timeline.ts`: `teaseOutcome`, `revealTimeline(tier, outcome)` (gates, `teaseGate`, `rams`,
  `strain`, `bounceAt`), `clockRate`, `strainAt`, `crackAt`, `camBack`; tested in `timeline.test.ts`.
- `web/lib/reveal/tunnel.ts`: `ballDrop` (the fall and three bounces after a hold).
- `web/components/TunnelReveal.tsx`: `knock` (a hit that doesn't get through), `trickle` (the push), the throbbing
  crack glow on the tease gate, the ball's shadow once it drops.
