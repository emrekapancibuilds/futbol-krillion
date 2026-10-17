# Scene 2: a bigger stadium, a full pitch, more life; Tunnel 3.0

User request (2026-10-17): "It shouldn't just be 2 players, it should be multiple on the field, there should be more
animation, the stadium should be 2 tiers bigger, the smashing animation should be even more exciting, also the walls of
the tunnel should be less pristine and should be crumbly / have things (like hung up jerseys and stuff) on them."

Builds on `2026-10-16-matchday-scene-design.md`. Same method: everything is generated in code (`art/scene.py`, numpy +
Pillow, ray-cast and dithered) and animated by pure functions of time (`web/lib/scene/engine.ts`), drawn by
`web/components/Scene.tsx`. Players stay generic: invented faces, plain kits, no crests or readable numbers.

## PR A: the scene
- **Four tiers** instead of two (z 46-56, 56-66, 66-76.5, 76.5-89 m, raked 30-40 degrees), each front a band with a dark
  concourse gap, an LED ribbon and a rail. Higher roof with downlights, a lit back wall behind the top tier, taller
  pylons. Staggered vomitories, supporters' banners on the front wall.
- **A full pitch**: 14 players at kick-off positions (sky-blues left, crimsons right), a referee and an assistant on
  the far touchline with his flag, plus the two foreground players. Small players are drawn at 4x and reduced part by
  part, so they stay crisp. Each has two breathing frames and a four-frame run cycle, facing either way, in one sprite
  sheet. The site moves them: every 5 s each rests, jogs to a new spot within a few metres of home, and rests facing
  the ball; legs cycle with distance covered, so feet never slide.
- **More animation**: twinkling stars; clouds drifting (wrapping); all four LED boards scrolling their text (strips
  under holes in the back layer); a Mexican wave every 26 s (every 9 s after a rare answer, none after a miss);
  supporters' flares with flicker, glow and rising smoke (more of them after a rare answer); confetti after a rare
  answer; more flags, some big. Existing camera flashes, beams, dust, breathing and parallax stay.
- New layers: `sky`, `clouds`, `strips`, `crowd-4` (the wave), `field` (sprite sheet), `still` (everything at rest:
  the tunnel walkout lands on it). Reduced Motion still draws one frame.

## PR B: Tunnel 3.0
- **Weathered walls**: plaster fallen away in patches showing brick, cracks, water stains running down, grime near the
  floor, chipped paint on the lower band.
- **Things on the walls**: hung jerseys in both kits and the referee's, framed team photos, scarves, posters, exit
  signs, fire extinguishers, pipes along the ceiling, a "THIS IS FUTKRILL" sign over the last gate.
- **A more exciting smash**: slow motion as the ball reaches the final gate, polygon shards, a radial zoom-blur burst,
  an impact star, tier-tinted flashes; tier 5+ electric arcs, tier 6 embers, tier 7 gold lightning and confetti.
  Timing (`lib/reveal/timeline.ts`) and callbacks unchanged.
