"""Futkrill pixel art, drawn in code so every asset is crisp and reproducible.

Run:  pipeline/.venv/bin/python art/make_art.py
Writes native-resolution PNGs to web/public/art/ (the site scales them with image-rendering: pixelated)
and a review sheet to art/preview.png.
"""
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "art"

# ---------------------------------------------------------------- palette
INK = (10, 12, 24)
SKY = [(6, 8, 22), (12, 16, 40), (22, 28, 64), (34, 40, 86)]
STAR = (196, 208, 255)
STAR_DIM = (110, 120, 170)
ROOF = (30, 34, 58)
ROOF_EDGE = (58, 66, 104)
STAND = [(20, 24, 42), (28, 32, 54), (36, 42, 68)]
CROWD = [(214, 64, 64), (236, 204, 86), (236, 236, 236), (64, 124, 224), (236, 132, 60), (120, 200, 120), (170, 90, 200)]
SECTION = [(200, 56, 56), (60, 110, 210), (236, 236, 236), (230, 190, 70), (200, 56, 56), (40, 150, 90)]
SKIN = [(232, 190, 150), (198, 146, 104), (140, 96, 66), (96, 64, 44)]
LAMP = (255, 248, 214)
LAMP_HOT = (255, 255, 255)
GLOW = (255, 214, 110)
POLE = (70, 76, 104)
BOARD = (8, 8, 14)
AMBER = (255, 176, 0)
AMBER_DIM = (120, 74, 0)
RED = (255, 72, 60)
CYAN = (80, 220, 255)
PITCH = [(30, 110, 50), (38, 128, 58)]
LINE = (226, 238, 226)
GOLD = (255, 206, 72)
GOLD_DARK = (214, 140, 24)
KRILL = (240, 96, 84)
KRILL_LIGHT = (255, 150, 132)
KRILL_DARK = (170, 48, 52)
WHITE = (244, 244, 244)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def dither(x: int, y: int, frac: float) -> bool:
    """Ordered dithering: True on roughly `frac` of pixels in a stable pattern."""
    return BAYER[y % 4][x % 4] / 16 < frac


def mix(a, b, t: float):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


class Canvas:
    def __init__(self, w: int, h: int, bg=(0, 0, 0, 0)):
        self.im = Image.new("RGBA", (w, h), bg)
        self.px = self.im.load()
        self.w, self.h = w, h

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c if len(c) == 4 else (*c, 255)

    def get(self, x, y):
        return self.px[x, y][:3]

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def frame(self, x0, y0, x1, y1, c):
        for x in range(x0, x1 + 1):
            self.put(x, y0, c); self.put(x, y1, c)
        for y in range(y0, y1 + 1):
            self.put(x0, y, c); self.put(x1, y, c)

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.put(x0, y0, c)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2 <= 1.0:
                    self.put(x, y, c)

    def outline(self, c=INK):
        """1px outline around every opaque shape (for sprites on a transparent background)."""
        solid = {(x, y) for y in range(self.h) for x in range(self.w) if self.px[x, y][3] > 0}
        for x, y in solid:
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if (nx, ny) not in solid and 0 <= nx < self.w and 0 <= ny < self.h:
                    self.px[nx, ny] = (*c, 255)

    def blit(self, other: "Canvas", ox: int, oy: int):
        for y in range(other.h):
            for x in range(other.w):
                p = other.px[x, y]
                if p[3] > 0:
                    self.put(ox + x, oy + y, p)


# ---------------------------------------------------------------- pixel fonts
# 5x7 capitals for the logo, 3x5 for LED boards. '#' = lit.
FONT5 = {
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    " ": ["....."] * 7,
}
FONT3 = {
    "F": ["###", "#..", "##.", "#..", "#.."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    "T": ["###", ".#.", ".#.", ".#.", ".#."], "B": ["##.", "#.#", "##.", "#.#", "##."],
    "O": ["###", "#.#", "#.#", "#.#", "###"], "L": ["#..", "#..", "#..", "#..", "###"],
    "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "I": ["###", ".#.", ".#.", ".#.", "###"], "N": ["#.#", "###", "###", "#.#", "#.#"],
    "G": ["###", "#..", "#.#", "#.#", "###"], "A": [".#.", "#.#", "###", "#.#", "#.#"],
    "E": ["###", "#..", "##.", "#..", "###"], "S": ["###", "#..", "###", "..#", "###"],
    "M": ["#.#", "###", "#.#", "#.#", "#.#"],
    "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"],
    "7": ["###", "..#", ".#.", ".#.", ".#."], " ": ["...", "...", "...", "...", "..."],
}


def text_width(text, font, gap=1):
    return sum(len(font[ch][0]) + gap for ch in text) - gap


def draw_text(cv: Canvas, text, x, y, font, color, gap=1, shade=None):
    """Draw text; `shade` colours the lower rows for a two-tone look."""
    for ch in text:
        glyph = font[ch]
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == "#":
                    c = shade if shade and gy >= len(glyph) - 2 else color
                    cv.put(x + gx, y + gy, c)
        x += len(glyph[0]) + gap


# ---------------------------------------------------------------- stadium scene
CROWD_FRAMES = 3      # animation frames on top of the still scene (frame 0)
JUMP_SHARE = 0.3      # share of supporters off their feet in each frame


def stadium(w: int, h: int, seed: int = 7, frame: int = 0) -> Canvas:
    """The night-match scene. `frame` > 0 redraws the same crowd with a different set of supporters jumping
    (1 px up); everything else, including every random choice, is identical to frame 0."""
    rnd = random.Random(seed)
    motion = random.Random(seed * 1000 + frame)
    cv = Canvas(w, h, (*SKY[0], 255))
    portrait = h > w
    sky_end = int(h * (0.40 if portrait else 0.30))
    roof_y = sky_end
    stands_end = int(h * (0.68 if portrait else 0.62))
    board_y = stands_end
    pitch_y = board_y + 6

    # sky: dithered gradient + stars
    for y in range(sky_end + 2):
        t = y / max(sky_end, 1) * (len(SKY) - 1)
        i = min(int(t), len(SKY) - 2)
        for x in range(w):
            cv.put(x, y, SKY[i + 1] if dither(x, y, t - i) else SKY[i])
    for _ in range(int(w * sky_end / 70)):
        x, y = rnd.randrange(w), rnd.randrange(int(sky_end * 0.8))
        cv.put(x, y, STAR if rnd.random() < 0.35 else STAR_DIM)

    # roof and stands
    cv.rect(0, roof_y, w - 1, roof_y + 3, ROOF)
    cv.rect(0, roof_y + 4, w - 1, roof_y + 4, ROOF_EDGE)
    tiers = 3
    span = stands_end - (roof_y + 5)
    for k in range(tiers):
        y0 = roof_y + 5 + k * span // tiers
        y1 = roof_y + 5 + (k + 1) * span // tiers - 1
        cv.rect(0, y0, w - 1, y1, STAND[k])
        fade = (0.62, 0.48, 0.34)[k]                           # far tiers are darker
        for y in range(y0 + 2, y1 - 1, 3):                     # rows of supporters: head over shirt
            x = rnd.randrange(2)
            while x < w:
                if rnd.random() < 0.82:
                    block = SECTION[(x // 36 + k) % len(SECTION)]
                    shirt = block if rnd.random() < 0.7 else rnd.choice(CROWD)
                    skin = SKIN[rnd.randrange(len(SKIN))]
                    up = 1 if frame and motion.random() < JUMP_SHARE else 0
                    cv.put(x, y - up, mix(shirt, STAND[k], fade))
                    cv.put(x, y - 1 - up, mix(skin, STAND[k], fade + 0.08))
                x += 2
        cv.rect(0, y1, w - 1, y1, ROOF_EDGE if k < tiers - 1 else STAND[0])

    # scoreboard hanging from the roof
    label = "FUTKRILL"
    tw = text_width(label, FONT3)
    sb_w, sb_h = tw + 8, 11
    sx, sy = (w - sb_w) // 2, roof_y - (8 if portrait else 6)
    cv.rect(sx - 1, sy - 1, sx + sb_w, sy + sb_h, ROOF_EDGE)
    cv.rect(sx, sy, sx + sb_w - 1, sy + sb_h - 1, BOARD)
    for x in range(sx + 1, sx + sb_w - 1, 2):                  # unlit LED grid
        for y in range(sy + 1, sy + sb_h - 1, 2):
            cv.put(x, y, (24, 18, 8))
    draw_text(cv, label, sx + 4, sy + 3, FONT3, AMBER)
    cv.line(sx + 4, sy - 1, sx + 4, roof_y, POLE)
    cv.line(sx + sb_w - 5, sy - 1, sx + sb_w - 5, roof_y, POLE)

    # floodlight towers with glow
    for tx in (int(w * 0.09), int(w * 0.91)):
        head_y = int(sky_end * 0.22)
        cv.rect(tx - 1, head_y + 6, tx, stands_end - 2, POLE)
        for (cx, cy, r) in [(tx, head_y + 2, 18)]:
            for y in range(cy - r, cy + r + 1):
                for x in range(cx - r, cx + r + 1):
                    d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / r
                    if d < 1 and 0 <= y < sky_end and dither(x, y, (1 - d) ** 2 * 0.9):
                        cv.put(x, y, mix(cv.get(x, y) if 0 <= x < w else SKY[0], GLOW, 0.35 + 0.4 * (1 - d)))
        cv.rect(tx - 6, head_y - 2, tx + 6, head_y + 5, ROOF)
        for y in range(head_y - 1, head_y + 5):
            for x in range(tx - 5, tx + 6):
                cv.put(x, y, LAMP_HOT if (x + y) % 2 == 0 else LAMP)
        # light beams down to the pitch
        for y in range(head_y + 6, pitch_y):
            spread = (y - head_y) * 0.45
            for x in range(int(tx - spread), int(tx + spread) + 1):
                if 0 <= x < w and dither(x, y, 0.06):
                    cv.put(x, y, mix(cv.get(x, y), GLOW, 0.35))

    # LED advertising boards
    cv.rect(0, board_y, w - 1, board_y + 5, BOARD)
    msg = "FUTKRILL  GAME 1  FUTKRILL  "
    x, colours = 2, [AMBER, CYAN, RED]
    k = 0
    while x < w:
        for word in msg.split("  "):
            if not word:
                continue
            draw_text(cv, word, x, board_y + 1, FONT3, colours[k % 3])
            x += text_width(word, FONT3) + 6
            k += 1
            if x >= w:
                break

    # pitch: stripes that widen towards the viewer, touchline, centre circle
    y, band, i = pitch_y, 2, 0
    while y < h:
        cv.rect(0, y, w - 1, min(h - 1, y + band - 1), PITCH[i % 2])
        y += band
        band = band + 1 if band < 14 else band
        i += 1
    cv.rect(0, pitch_y, w - 1, pitch_y, LINE)
    cx, cy = w // 2, h + int(h * 0.05)
    rx, ry = int(w * (0.30 if portrait else 0.18)), int((h - pitch_y) * 0.55)
    for a in range(0, 3600):
        import math
        t = a / 3600 * 2 * math.pi
        px, py = round(cx + rx * math.cos(t)), round(cy + ry * math.sin(t))
        if py >= pitch_y + 2:
            cv.put(px, py, LINE)
    cv.line(cx, pitch_y, cx, h - 1, LINE)

    # vignette
    for y in range(h):
        for x in range(w):
            d = max(abs(x - w / 2) / (w / 2), abs(y - h / 2) / (h / 2))
            if d > 0.9 and dither(x, y, (d - 0.9) * 3):
                cv.put(x, y, mix(cv.get(x, y), INK, 0.3))
    return cv


# ---------------------------------------------------------------- tier icons (24x24)
def icon_bus() -> Canvas:          # World Cup Bandwagon: open-top victory bus
    cv = Canvas(24, 24)
    red, red_d, glass = (214, 52, 52), (150, 30, 36), (150, 206, 240)
    cv.rect(2, 9, 21, 18, red)
    cv.rect(2, 17, 21, 18, red_d)
    for x in range(4, 20, 4):
        cv.rect(x, 11, x + 2, 13, glass)
    cv.rect(18, 14, 20, 17, glass)                                  # door
    for x in range(2, 22, 3):
        cv.rect(x, 6, x, 8, (230, 230, 230))                        # top-deck railing posts
    cv.rect(2, 6, 21, 6, (230, 230, 230))
    for x in (6, 11, 15):                                           # fans on the open deck
        cv.rect(x, 3, x + 1, 5, GOLD); cv.put(x, 2, GOLD)
    cv.put(16, 1, WHITE); cv.rect(16, 2, 19, 3, (64, 124, 224))     # flag
    for wx in (6, 17):
        cv.ellipse(wx, 19, 2, 2, (30, 30, 36)); cv.put(wx, 19, (140, 140, 150))
    cv.outline()
    return cv


def icon_scarf() -> Canvas:        # Glory Hunter: half-and-half scarf
    cv = Canvas(24, 24)
    a, b = (214, 52, 52), (64, 124, 224)
    for i in range(16):
        x, y = 3 + i, 4 + i
        col = a if i < 8 else b
        cv.rect(x, y - 2, x + 2, y + 1, col)
        if i % 4 == 1:
            cv.rect(x, y - 2, x + 2, y - 2, WHITE)
    for x in range(1, 5):                                           # fringes
        cv.put(x, 3 + (x % 2), WHITE)
    for x in range(19, 23):
        cv.put(x, 21 + (x % 2), WHITE)
    cv.outline()
    return cv


def icon_tv() -> Canvas:           # Part-Time Fan: watching the highlights
    cv = Canvas(24, 24)
    case, case_d = (120, 92, 70), (84, 62, 46)
    cv.line(9, 2, 12, 6, (160, 160, 170)); cv.line(15, 2, 12, 6, (160, 160, 170))
    cv.rect(2, 6, 21, 19, case)
    cv.rect(2, 18, 21, 19, case_d)
    cv.rect(4, 8, 16, 17, PITCH[1])
    for x in range(4, 17, 2):
        cv.rect(x, 8, x, 17, PITCH[0])
    cv.rect(10, 8, 10, 17, LINE); cv.put(12, 12, WHITE)             # halfway line and ball
    cv.ellipse(19, 10, 1, 1, GOLD); cv.ellipse(19, 14, 1, 1, (200, 200, 200))
    cv.rect(5, 20, 6, 21, case_d); cv.rect(17, 20, 18, 21, case_d)
    cv.outline()
    return cv


def icon_ticket() -> Canvas:       # Season Ticket Holder
    cv = Canvas(24, 24)
    paper, stub = (250, 226, 150), (236, 196, 96)
    cv.rect(1, 6, 22, 17, paper)
    cv.rect(16, 6, 22, 17, stub)
    for y in range(7, 17, 2):
        cv.put(15, y, INK)                                          # perforation
    cv.rect(0, 11, 0, 12, (0, 0, 0, 0)); cv.rect(23, 11, 23, 12, (0, 0, 0, 0))
    cv.rect(3, 8, 12, 8, (180, 60, 50))                             # printed lines
    cv.rect(3, 11, 10, 11, (120, 110, 90)); cv.rect(3, 14, 12, 14, (120, 110, 90))
    cv.rect(18, 9, 20, 14, (200, 80, 60))
    cv.outline()
    return cv


def icon_board() -> Canvas:        # True Analyst: tactics board
    cv = Canvas(24, 24)
    frame, green = (210, 210, 220), (40, 120, 70)
    cv.rect(2, 3, 21, 20, frame)
    cv.rect(3, 4, 20, 19, green)
    cv.rect(11, 4, 11, 19, (90, 170, 110))
    for (x, y) in [(6, 7), (6, 15), (15, 10)]:                      # X's
        cv.put(x - 1, y - 1, WHITE); cv.put(x + 1, y - 1, WHITE); cv.put(x, y, WHITE)
        cv.put(x - 1, y + 1, WHITE); cv.put(x + 1, y + 1, WHITE)
    for (x, y) in [(9, 11), (17, 15)]:                              # O's
        cv.frame(x - 1, y - 1, x + 1, y + 1, GOLD)
    cv.line(7, 8, 14, 10, RED); cv.put(13, 9, RED); cv.put(13, 11, RED)
    cv.rect(10, 21, 13, 22, frame)
    cv.outline()
    return cv


def icon_brain() -> Canvas:        # Insane Ball Knowledge
    cv = Canvas(24, 24)
    pink, pink_d, pink_l = (244, 140, 170), (196, 84, 120), (255, 196, 214)
    cv.ellipse(8, 11, 7, 7, pink)
    cv.ellipse(15, 11, 7, 7, pink)
    cv.ellipse(12, 16, 6, 4, pink)
    cv.line(12, 5, 12, 18, pink_d)
    for (x0, y0, x1, y1) in [(4, 9, 8, 8), (5, 13, 9, 14), (15, 8, 19, 10), (14, 14, 18, 13), (8, 17, 10, 16)]:
        cv.line(x0, y0, x1, y1, pink_d)
    cv.put(6, 7, pink_l); cv.put(16, 6, pink_l)
    for (x, y) in [(21, 2), (22, 5), (2, 3)]:                       # sparks
        cv.put(x, y, GOLD)
    cv.outline()
    return cv


def icon_sofa() -> Canvas:        # Jobless: the couch you never leave
    cv = Canvas(24, 24)
    brown, brown_d, brown_l, cushion = (150, 96, 60), (104, 64, 40), (186, 128, 84), (196, 140, 92)
    cv.rect(4, 6, 19, 12, brown)                                     # tall backrest
    cv.rect(4, 6, 19, 6, brown_l)
    cv.rect(11, 7, 12, 12, brown_d)                                  # backrest seam
    cv.rect(4, 13, 19, 16, cushion)                                  # seat cushions
    cv.rect(11, 13, 12, 16, brown)
    cv.rect(1, 10, 4, 17, brown_d); cv.rect(19, 10, 22, 17, brown_d)  # rolled arms
    cv.rect(1, 10, 4, 10, brown); cv.rect(19, 10, 22, 10, brown)
    cv.rect(1, 17, 22, 18, brown_d)                                  # base
    cv.rect(2, 19, 3, 20, INK); cv.rect(20, 19, 21, 20, INK)         # legs
    cv.rect(14, 14, 17, 14, (40, 40, 48)); cv.put(15, 14, RED)        # remote on the seat
    cv.rect(5, 12, 9, 13, (90, 160, 210))                            # crumpled blanket
    cv.put(20, 9, (240, 190, 90)); cv.put(21, 9, RED)                 # pizza on the arm
    cv.outline()
    return cv


ICONS = {"tier-1-bandwagon": icon_bus, "tier-2-glory-hunter": icon_scarf, "tier-3-part-time-fan": icon_tv,
         "tier-4-season-ticket": icon_ticket, "tier-5-true-analyst": icon_board,
         "tier-6-insane-ball-knowledge": icon_brain, "tier-7-jobless": icon_sofa}


# ---------------------------------------------------------------- mascot (32x32)
SHIRT = (214, 52, 56)
SHIRT_DARK = (160, 32, 44)
SHORTS = (36, 60, 140)
HAIR = (70, 42, 28)
SKIN_M = (240, 196, 150)
SKIN_SHADE = (206, 156, 112)


def mascot() -> Canvas:
    """A footballer celebrating: arms up, red shirt, ball at the feet."""
    cv = Canvas(32, 32)
    # arms up (sleeve, then hand)
    for (x0, y0, x1, y1) in ((11, 14, 6, 8), (21, 14, 26, 8)):
        cv.line(x0, y0, x1, y1, SHIRT); cv.line(x0, y0 + 1, x1, y1 + 1, SHIRT)
        cv.line(x0 + (1 if x0 > 16 else -1), y0, x1 + (1 if x0 > 16 else -1), y1, SHIRT_DARK)
    for (hx, hy) in ((5, 6), (27, 6)):
        cv.rect(hx - 1, hy - 1, hx + 1, hy + 1, SKIN_M)
    # legs and socks
    cv.rect(12, 23, 14, 27, SKIN_M); cv.rect(18, 23, 20, 27, SKIN_M)
    cv.rect(12, 26, 14, 28, WHITE); cv.rect(18, 26, 20, 28, WHITE)
    cv.rect(12, 26, 14, 26, SHIRT); cv.rect(18, 26, 20, 26, SHIRT)        # sock tops
    # boots
    cv.rect(11, 29, 15, 30, INK); cv.rect(17, 29, 21, 30, INK)
    cv.put(15, 29, SKIN_SHADE); cv.put(21, 29, SKIN_SHADE)
    # shorts
    cv.rect(11, 20, 21, 24, SHORTS)
    cv.line(16, 21, 16, 24, (20, 36, 96))
    # shirt, with a white collar and a gold number block
    cv.rect(11, 12, 21, 20, SHIRT)
    cv.rect(11, 18, 21, 20, SHIRT); cv.rect(11, 20, 21, 20, SHIRT_DARK)
    cv.rect(15, 12, 17, 12, SKIN_SHADE)                                    # neck
    cv.rect(14, 13, 18, 13, WHITE)                                         # collar
    cv.rect(14, 15, 18, 18, SHIRT_DARK)
    cv.rect(15, 15, 17, 17, GOLD)                                          # number block
    # head: skin, hair, face
    cv.ellipse(16, 7, 4, 4, SKIN_M)
    cv.rect(11, 4, 21, 5, HAIR); cv.rect(12, 3, 20, 3, HAIR); cv.rect(11, 6, 12, 8, HAIR); cv.rect(20, 6, 21, 8, HAIR)
    cv.put(14, 7, INK); cv.put(18, 7, INK)                                 # eyes
    cv.rect(14, 10, 18, 10, WHITE); cv.rect(15, 11, 17, 11, INK)           # big grin, mouth open
    cv.rect(15, 10, 17, 10, INK)
    cv.put(13, 9, SKIN_SHADE); cv.put(19, 9, SKIN_SHADE)
    # ball at the right foot
    cv.blit(ball(11), 21, 20)
    cv.outline()
    return cv


# ---------------------------------------------------------------- soccer ball + logo
BALL_SHADE = (176, 184, 204)
BALL_PATCH = (22, 26, 44)


def _inside_polygon(px, py, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _pentagon(cx, cy, r, up_deg):
    import math
    return [(cx + r * math.cos(math.radians(up_deg + 72 * k)), cy - r * math.sin(math.radians(up_deg + 72 * k))) for k in range(5)]


def ball(n: int) -> Canvas:
    """A pixel soccer ball in an n x n box: white sphere, dark pentagon in the middle and five clipped around the
    rim, a shaded lower-right, a 1px outline. Sampled per pixel from a geometric model, so any size stays crisp."""
    import math
    cv = Canvas(n, n)
    c = (n - 1) / 2
    R = n / 2 - 1.0                                   # leave a 1px border for the outline
    patches = [_pentagon(c, c, R * 0.32, 90)]
    for k in range(5):                                # rim patches, centred between the middle pentagon's corners
        a = math.radians(126 + 72 * k)
        patches.append(_pentagon(c + R * 0.80 * math.cos(a), c - R * 0.80 * math.sin(a), R * 0.24, 126 + 72 * k + 180))
    for y in range(n):
        for x in range(n):
            dx, dy = x - c, y - c
            if dx * dx + dy * dy > R * R + 0.35:
                continue
            col = WHITE
            if any(_inside_polygon(x, y, pts) for pts in patches):
                col = BALL_PATCH
            elif dx + dy > R * 0.95:                  # shaded crescent, lower right
                col = BALL_SHADE
            cv.put(x, y, col)
    cv.outline()
    return cv


def logo() -> Canvas:
    """Ball, then FUT over KRILL (two lines keep it no wider than the old logo, which the phone header needs)."""
    top, bottom = "FUT", "KRILL"
    tw = text_width(bottom, FONT5, 1)
    b = ball(20)
    w = b.w + 4 + tw + 4
    cv = Canvas(w, b.h + 2)
    cv.blit(b, 1, 1)
    x0 = b.w + 5
    for text, y in ((top, 2), (bottom, 12)):
        x = x0 + (tw - text_width(text, FONT5, 1)) // 2
        draw_text(cv, text, x + 1, y + 1, FONT5, AMBER_DIM, gap=1)      # drop shadow
        draw_text(cv, text, x, y, FONT5, GOLD, gap=1, shade=GOLD_DARK)
    cv.outline()
    return cv


# ---------------------------------------------------------------- output
def save(cv: Canvas, name: str) -> Image.Image:
    OUT.mkdir(parents=True, exist_ok=True)
    cv.im.save(OUT / f"{name}.png")
    return cv.im


def scaled(im: Image.Image, k: int) -> Image.Image:
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def crowd_frames(w: int, h: int, seed: int, name: str) -> Image.Image:
    """Writes <name>-crowd-<k>.png: only the pixels that differ from the still scene, transparent elsewhere,
    so each frame lays exactly over the background at any scale. Returns the still scene."""
    still = stadium(w, h, seed)
    base = still.im.load()
    for k in range(1, CROWD_FRAMES + 1):
        moved = stadium(w, h, seed, frame=k).im
        px = moved.load()
        for y in range(h):
            for x in range(w):
                if px[x, y] == base[x, y]:
                    px[x, y] = (0, 0, 0, 0)
        moved.save(OUT / f"{name}-crowd-{k}.png")
    return still.im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    wide = save(stadium(320, 180), "stadium-wide")
    tall = save(stadium(180, 360, seed=11), "stadium-tall")
    crowd_frames(320, 180, 7, "stadium-wide")
    crowd_frames(180, 360, 11, "stadium-tall")
    icons = {name: save(fn(), name) for name, fn in ICONS.items()}
    m = save(mascot(), "mascot")
    lg = save(logo(), "logo")

    # social preview 1200x630: scene + logo + mascot
    og = scaled(stadium(300, 158, seed=3).im, 4).crop((0, 0, 1200, 630)).convert("RGBA")
    big = scaled(lg, 5)
    og.alpha_composite(big, ((1200 - big.width) // 2, 38))     # above the stadium scoreboard, which would peek out behind it
    og.alpha_composite(scaled(m, 5), (1200 // 2 - 80, 360))
    og.convert("RGB").save(OUT / "og.png")
    scaled(ball(32).im, 1).save(OUT / "favicon-32.png")
    scaled(ball(32).im, 6).save(OUT / "icon-192.png")

    # review sheet
    sheet = Image.new("RGBA", (1340, 1720), (*INK, 255))
    sheet.alpha_composite(scaled(wide, 4), (10, 10))
    sheet.alpha_composite(scaled(tall, 2), (10, 740))
    for i, (name, im) in enumerate(icons.items()):
        sheet.alpha_composite(scaled(im, 5), (390 + (i % 4) * 140, 760 + (i // 4) * 140))
    sheet.alpha_composite(scaled(m, 6), (390, 1060))
    sheet.alpha_composite(scaled(lg, 8), (620, 1080))
    sheet.alpha_composite(Image.open(OUT / "og.png").convert("RGBA").resize((600, 315), Image.NEAREST), (390, 1370))
    sheet.convert("RGB").save(ROOT / "art" / "preview.png")
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
