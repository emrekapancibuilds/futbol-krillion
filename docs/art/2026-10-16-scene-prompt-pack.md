# Futkrill art prompt pack (2026-10-16)

Run these in ONE chat with the best image model, in order. Paste the STYLE BIBLE first. Ask for the largest size the
model can give (PNG, no compression). When a prompt says "previous image", attach that image again so the model keeps
the same characters, camera and palette. If the model can't make a perfect pixel grid, that's fine: the grid gets
snapped in code afterwards.

Magenta (#FF00FF) backgrounds are for cut-outs: they get removed in code, so no shadows or glow on them.

## 0. STYLE BIBLE (paste first, once)

```text
Art direction for FUTKRILL, a daily football trivia browser game. Remember this for every image I ask for in this chat.

Style: modern "hi-bit" pixel art, like a polished indie game (Sea of Stars, Octopath Traveler, Noita-level lighting). Hard pixel edges, NO anti-aliased smoothing, NO blur, NO photorealism, NO 3D-render look. The visible pixel grid is about 480 pixels across for a 16:9 image, and the pixel size is identical in every image. Painterly pixel clusters, dithering only inside gradients.

Palette (cohesive, limited): deep navy shadows (#070a18), teal and cyan rim light (#50dcff), warm gold floodlights (#ffce48), grass greens, plus crimson and sky-blue as the two team colours. Dusk blue-hour matchday atmosphere, volumetric light beams, haze, tiny star-shaped lens flares.

Everything is invented and generic: no real people, no real faces, no real clubs, no national-team crests, no brand logos, no sponsors, no readable text or numbers anywhere (signage and shirts use abstract shapes only). No watermarks.
```

## 1. SCENE (wide and tall, then the cut-outs)

### 1a. Hero, wide (16:9, largest size)

```text
First-person POV from a low camera on the pitch at the moment of kick-off.

Centre of the frame: a football on the centre spot, the white halfway line running toward the camera and a faint centre circle.
Left third: a footballer in a plain sky-blue shirt with a white collar, white shorts and white socks, standing side-on facing right, arms relaxed, intense stare. Invented character: generic stylised face, short dark hair.
Right third: a footballer in a plain crimson shirt with dark-green shorts and red socks, standing side-on facing left, same intensity. Invented character: generic stylised face, short styled light-brown hair.
The players are mid-height in the frame, NOT huge, so the stadium dominates.

Behind them: a vast two-tier stadium packed with a cheering crowd in the two team colours, waving flags with abstract patterns (no crests), floodlight rigs in the top corners with bright warm beams and star flares, a goal far away in the centre, advertising boards with abstract shapes only. Blue-hour sky visible through the roof opening.
The lower-centre 40% of the frame (the pitch near the camera) is calm and uncluttered, with mown grass stripes, because interface panels sit there. A few crisp grass blades along the very bottom edge.
```

### 1b. Empty plate, wide (same image, no players or ball)

```text
Use the previous image as the exact reference. Recreate it identically (same camera, composition, crowd, lighting, palette, pixel size) but with NO players and NO ball. Keep the pitch markings and the centre spot. Change nothing else.
```

### 1c. Player A cut-out (the sky-blue player)

```text
Using the sky-blue player from image 1a as the exact reference: the same invented character, full body, two poses side by side on one image. Pose 1: standing idle as in the scene. Pose 2: the same stance with the chest slightly raised and shoulders higher (mid-breath). Flat solid #FF00FF magenta background, no shadow, no ground, no glow. Same pixel size and palette. Large, crisp, centred, with margin around each pose.
```

### 1d. Player B cut-out (the crimson player)

```text
Same as the previous prompt, for the crimson player from image 1a (the same invented character, two poses: idle, then mid-breath), flat #FF00FF magenta background, no shadow.
```

### 1e. Hero, tall (9:16, largest size)

```text
Recompose image 1a for a phone held upright (9:16), same style, palette, pixel size and the same two characters.
Top third: the stadium roof opening, blue-hour sky and the floodlight beams.
Middle third: the packed crowd tiers with flags.
Lower third: the pitch. The two players stand small at the left and right edges at about 62% of the height, the ball on the centre spot between them, the halfway line running toward the camera.
The centre 40% of the frame is calm and uncluttered, because interface panels sit there. A few crisp grass blades along the bottom edge.
```

### 1f. Empty plate, tall

```text
Use image 1e as the exact reference. Recreate it identically but with NO players and NO ball. Keep the pitch markings. Change nothing else.
```

## 2. THE SMASH (tunnel, gate, textures, debris)

### 2a. Tunnel (16:9)

```text
First-person POV looking straight down a stadium players' tunnel, perfect one-point perspective, symmetrical, the vanishing point exactly at the centre of the frame.
Concrete walls with steel ribs and cable runs, strip lights along the ceiling, a scuffed painted floor with a guide line. At the far end a bright warm opening onto a glowing pitch and floodlights, with strong light bloom. Dark navy and grey concrete with teal rim light. No people, no text.
```

### 2b. Gate panel (1:1, flat front view)

```text
A flat, front-on, perfectly symmetrical view of a heavy steel-and-concrete barrier gate that fills the whole frame edge to edge: reinforced brick panels, steel bands, rivets, a hazard stripe. NO perspective. Use NEUTRAL greys and off-whites only (no colour), because it gets tinted in code to different colours. Same pixel size and style.
```

### 2c. Wall texture (1:1, seamless)

```text
A seamless tileable texture of the tunnel's concrete wall with vertical steel ribs and small scuffs, neutral grey only, front-on, no perspective. It must tile perfectly both horizontally and vertically. Same pixel size and style.
```

### 2d. Debris sheet (1:1, magenta background)

```text
A sprite sheet of 24 separate pieces of debris from a smashed gate, spaced well apart on a flat #FF00FF magenta background: brick chunks, concrete shards, bent steel plates, rivets, dust puffs, spark glints. Neutral grey and off-white only (tinted in code). Same pixel size and style. No shadows.
```

## 3. BADGES AND MASCOT (UI)

### 3a. Seven tier badges (one image, 4 + 3 grid on magenta)

```text
Seven square badge icons in a grid (4 on top, 3 below) on a flat #FF00FF magenta background, each icon centred in an equal square cell with plenty of margin. High-resolution pixel art (equivalent to a 64x64 pixel grid per icon), a thick dark-navy outline, bold readable silhouettes, warm highlights, consistent lighting from the top-left. Keep these exact concepts:
1. A red team bus with little flags on the roof.
2. A red, white and blue supporter scarf, hanging diagonally.
3. A retro TV with an antenna showing a green football pitch.
4. A match ticket with a perforated stub.
5. A green tactics board with arrows and X and O markers.
6. A pink, glowing brain with small sparkles.
7. A brown sofa with a pizza box and a TV remote on it.
No text anywhere.
```

### 3b. Mascot (1:1, magenta background)

```text
A friendly footballer mascot, front view, arms raised in celebration, red shirt with a small yellow badge shape (no real crest), blue shorts, white socks, a football at his feet. Invented character, high-resolution pixel art (equivalent to a 96x96 grid), thick dark-navy outline. Three poses in a row: celebrating, idle, disappointed (head down). Flat #FF00FF magenta background, no shadow.
```

## What to send back
Name the files by number (`1a`, `1b`, `1c` ... `3b`), PNG, largest size, one file per image. If an image comes out
wrong, redo only that one. For 1b/1f, tell the model "the crowd and stands must be pixel-identical to the reference".
