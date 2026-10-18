# Scene 3: a sunset stadium bowl, like the reference

User request (2026-10-18), with a reference picture (an in-game screenshot over a painted stadium): "Make the bg look
more like this." The reference: a stadium bowl at sunset seen from low on the pitch, looking at the far goal; stands
wrapping all the way round in tiers; fiery orange and purple clouds; a ring of floodlights with bloom and starbursts
along the roof, with steel masts on top; warm lights under every tier; big video screens in the corners; LED ribbons
following the curve of the stands; LED boards with crowns round the pitch; a dense, warm crowd with flags.

Same method as before: everything is generated in code (`art/scene.py`, numpy + Pillow, dithered pixel art) and every
moving part is a tested pure function of time (`web/lib/scene/engine.ts`). Players stay generic (no crests, logos or
readable numbers); the reference's national flags and crest become the teams' colours and the Futkrill ball.

## What changed
- **Camera and stadium**: the camera stands just behind the centre spot, tilted up, looking down the pitch at the far
  goal. The bowl is a rounded rectangle in plan with four raked tiers, ray-marched against a heightfield of the
  distance from its inner edge, with a roof ring (lamp-lined fascia, a lattice girder, masts with lamp heads).
- **Sky**: sunset gradient warmest towards the sun, fractal clouds lit from below; stars only high up.
- **LEDs**: the boards and ribbons now curve round the bowl, so they are painted by the site through an LED map
  (each LED pixel's board or screen and texel), still scrolling. Two corner video screens cycle pictures (the ball and
  FUTKRILL, KICK OFF, a team flag, the score).
- **Light**: warm lamps under every tier, blue accents on the side stands, bloom and short starbursts.
- **Pitch**: brighter grass, full markings seen from this angle, the far goal with its net; the far team lined up for
  kick-off (4-4-2 and a keeper), the referee, an assistant on the touchline, our two at the ball.
- Art size: wide 640x400 (desktop), tall 300x640 (phones); `art/figures.py` now holds the footballers.
- Everything that moved before still moves (crowd frames and wave, flashes, flares, confetti, players jogging, dust,
  grass, parallax); the tunnel walkout lands on the new `still` picture.
