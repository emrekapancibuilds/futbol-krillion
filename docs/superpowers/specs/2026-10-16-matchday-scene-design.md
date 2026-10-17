# Matchday scene, Smash 2.0 and a site-wide polish pass

User request (2026-10-16): "make the bg even higher quality and with more animations... a POV scene from a live game
... the animation can be the same wall smashing but way more high quality. The whole site should feel upgraded, like
whoever made it has put some real thought into it." Players are GENERIC (user's choice): invented faces, plain kits,
no crests, logos, sponsors or readable numbers. The user then asked Claude to make all the art itself, now.

## Art source
The image-generation connector is invalidated and Blender isn't running, so the art is generated in code, like the
existing art (`art/make_art.py`), but rendered as a small 3D scene: every pixel is ray-cast against a stadium model
(pitch, four stands with rows of seats and supporters, roof, floodlight towers, LED boards), lit by the floodlights
with distance haze, then reduced to a fixed palette with ordered dithering so it reads as pixel art, not a render.
Because it is one model, every layer and animation frame lines up exactly. `art/scene.py`, numpy + Pillow.

## Scene (PR 1)
- Camera low on the halfway line, a few metres behind the centre spot, looking across the pitch at the main stand.
  Ball on the centre spot, centre circle around it. Two invented players face each other across the halfway line:
  sky-blue/white (left) and crimson/dark-green (right), placed wide so the centred UI panel doesn't hide them.
- Two compositions: wide 480x270 (desktop) and tall 270x480 (phones), each drawn with a margin for parallax.
- Layers: back (sky, roof, stands, boards, towers), pitch, players (2 breathing frames each), front (grass blades),
  beams (additive light cones), crowd frames (only the pixels that change), and a JSON of seats, lamps and positions.
- Engine (`components/Scene.tsx`, pure maths in `lib/scene/`): one fixed canvas behind the site, drawn at an integer
  scale of the device pixels so every art pixel is a crisp square; cover-cropped around a focus point. Animations:
  crowd waves (speed follows the existing crowd mood: settled after a miss, bouncing on a rare answer), camera-flash
  pops across the stands, floodlight flicker and breathing beams, dust drifting in the light, players breathing,
  a slow camera drift and pointer parallax. Pauses when the tab is hidden; Reduced Motion shows one still frame.
- The old blur over the background goes (it hid the pixel art); a gradient keeps the panels readable.

## Smash 2.0 (PR 2)
Same tunnel and gates, same timeline (`lib/reveal/timeline.ts`), drawn at twice the resolution with textured concrete
walls and steel ribs, ceiling strip lights, a floor guide line, brick-and-steel gates tinted per tier, more debris,
a hit-stop freeze on impact, a chromatic flash, speed lines and a stronger shockwave.

## Polish (PR 3)
Panels, buttons, inputs, modals and transitions get a consistent, more crafted pixel treatment (bevels, highlights,
hover and press states, focus rings), without changing what any control does.
