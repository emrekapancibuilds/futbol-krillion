"""The matchday scene behind the whole site (spec: docs/superpowers/specs/2026-10-16-matchday-scene-design.md,
scene 2: docs/superpowers/specs/2026-10-17-scene-2-design.md).

A small 3D stadium, ray-cast one ray per pixel: the camera sits low on the halfway line a few metres behind the centre
spot, looking across the pitch at the main stand (four tiers with LED ribbons between them, a roof with a lamp row)
with two floodlight pylons behind it. Every surface is shaded from a hand-picked colour ramp with ordered dithering,
so the result reads as pixel art rather than a render. Supporters, flags, banners and the (invented, generic) players
are pixel sprites placed with the same camera, so all layers and animation frames line up exactly.

Run:  ~/.venvs/cadquery/bin/python art/scene.py      (numpy + Pillow; writes web/public/art/scene/)

Layers per composition (wide 480x300 for desktop, tall 234x506 for phones), each drawn with a margin for parallax:
  sky             the blue-hour gradient (opaque); the site twinkles the stars from the JSON on top of it
  clouds          thin lit wisps (transparent); the site drifts them sideways, wrapping around
  strips          the LED text of the ribbons and pitch-side boards, one tiling strip each; the site scrolls them
                  underneath the back layer, which has holes where the LEDs are
  back            pylons, roof, stands, crowd (frame 0), banners; transparent sky and LED holes
  crowd-1..4      only the pixels that change in each crowd frame; 4 is everyone up, for the Mexican wave
  pitch           the ground: grass, markings, the foreground players' shadows
  field           a sprite sheet of the players across the pitch, the referee and his assistant: standing (2 breaths)
                  and running (4 frames), facing right then left; the site moves them
  players-1..2    the two foreground players and the ball (breathing in / out)
  front-1..2      grass blades along the bottom edge (swaying)
  glow, beams     soft light (lamp halos, light shafts) drawn additively by the site
  still           everything at rest in one picture (the tunnel walkout lands on it)
  <name>.json     sizes, the visible window, a focus point, lamps, seats, stars, ribbons, flares and the field players
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "art" / "scene"

# ---------------------------------------------------------------- palette (hue-shifted ramps, dark -> light)
def hexes(*codes: str) -> np.ndarray:
    return np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in codes], dtype=np.uint8)


INK = hexes("#070a18")[0]
SKY = hexes("#060818", "#0a0f26", "#0f1735", "#152045", "#1c2a56", "#253668", "#30447a", "#3e528a", "#55618e")
STAR = hexes("#7d88b8", "#c4ccf0", "#ffffff")
CLOUD = hexes("#151d3d", "#1e2a50", "#2c3a64", "#4a4f78", "#7a6a80", "#a8887c")
ROOF = hexes("#05070f", "#0a0e1e", "#10162c", "#18203c", "#222c4e")
CONCRETE = hexes("#0b0f1e", "#131a30", "#1c2440", "#283252", "#374266")
SEAT_RAMP = hexes("#0a0f22", "#101a38", "#16254e", "#1d3064")
GRASS = hexes("#08200f", "#0c2b15", "#10381c", "#154523", "#1b532a", "#226232", "#2a723a", "#348343", "#40964d", "#4fa85a")
APRON = hexes("#061a0c", "#0a2312", "#0e2d17", "#13381d")
LINE = hexes("#8fa39a", "#b9c9c0", "#dfeae2", "#f6fbf7")
LED_BG = hexes("#04050b", "#080a14")
LED = {"gold": hexes("#5a3e10", "#c8a040"), "cyan": hexes("#12485a", "#3aa8c8"), "red": hexes("#5a1a16", "#c8483c"),
       "white": hexes("#4a5060", "#b8bed0")}     # dimmed: the boards are scenery, not the headline
LAMP = hexes("#ffe9b0", "#fff8e2", "#ffffff")
STEEL = hexes("#080b16", "#111628", "#1c2238", "#2a3250", "#3c4668")
HAZE = hexes("#141c3a", "#1d2950", "#2a3864")
EXIT = hexes("#1f7a4a")[0]

SKYBLUE = hexes("#22568e", "#3b7ec4", "#68aee8", "#a4d4ff")
WHITE = hexes("#8e9ab8", "#c6d0e0", "#eef2fa", "#ffffff")
CRIMSON = hexes("#5a1022", "#9a1f34", "#d23a46", "#f2706a")
GREEN = hexes("#0c2a1c", "#16482c", "#1f6a3a", "#3a8a54")
LIME = hexes("#4a5410", "#8a9a18", "#c6dc30", "#eeff7a")
BLACK = hexes("#05060c", "#10131e", "#1c2132", "#2c3348")
# a kit: shirt, alt (collar, sleeve trim), shorts, socks, the band at the top of the socks, the boot sole and the
# stripe down the shorts
TEAM_A = dict(shirt=SKYBLUE, alt=WHITE, shorts=WHITE, socks=WHITE, band=SKYBLUE, sole=WHITE[3], stripe=SKYBLUE[2])
TEAM_B = dict(shirt=CRIMSON, alt=GREEN, shorts=GREEN, socks=CRIMSON, band=GREEN, sole=CRIMSON[2], stripe=GREEN[2])
REF = dict(shirt=LIME, alt=BLACK, shorts=BLACK, socks=BLACK, band=LIME, sole=BLACK[3], stripe=LIME[2])
KITS = {"A": TEAM_A, "B": TEAM_B, "REF": REF, "AR": REF}
NEUTRAL = [hexes("#0e1224", "#1a2038", "#2a3150"), hexes("#1c1c22", "#2e2e38", "#45454f"), hexes("#2a2416", "#4a3e22", "#6c5a30")]
SKINS = [hexes("#7a4c30", "#a8714c", "#d9a57a", "#f2c9a0"), hexes("#4a2c1a", "#70452a", "#9a6440", "#c08458"),
         hexes("#5c3a24", "#8a5a3a", "#b8805a", "#e0ac80"), hexes("#2e1a10", "#4a2c1a", "#6c4228", "#8e5c3a")]
HAIRS = [hexes("#120c0a", "#24160e", "#3a2418"), hexes("#2e1c10", "#5a3a20", "#8a5a32"), hexes("#0c0a0e", "#18141a", "#2a2430"),
         hexes("#5a4a2a", "#8a7440", "#b89c5a")]
BOOT = hexes("#05060c", "#141826", "#2a3048")
FLAG_AR = hexes("#e8d020", "#d83020")

BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def threshold(h: int, w: int) -> np.ndarray:
    return np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]


def ramp(colors: np.ndarray, v: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Shade `v` (0-1) from a colour ramp, dithering between neighbouring shades with the threshold map `t`."""
    n = len(colors)
    pos = np.clip(v, 0, 1) * (n - 1)
    lo = np.floor(pos).astype(int)
    idx = np.clip(lo + ((pos - lo) > t), 0, n - 1)
    return colors[idx]


def shade1(colors: np.ndarray, v: float) -> np.ndarray:
    return colors[int(round(min(1.0, max(0.0, v)) * (len(colors) - 1)))]


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


# ---------------------------------------------------------------- the stadium (metres; camera at x=0, z=0, looking +z)
SPOT_Z = 6.5            # the centre spot
HALF_W = 34.0           # touchline to halfway along z
HALF_L = 52.5           # goal line to halfway along x
BOARD_Z, BOARD_H = 43.5, 0.95
WALL_Z, WALL_H = 46.0, 1.4
STAND_X = 90.0
ROW = 0.8               # row depth along z
SEAT = 0.55             # seat width along x
AISLE_EVERY, AISLE_W = 14.0, 1.2
VOM_EVERY, VOM_W, VOM_ROWS = 28.0, 3.2, (5, 8)


@dataclass(frozen=True)
class Tier:
    """A raked tier of seats: rows from z0 to z1, rising from y0 at `k` metres per metre."""
    z0: float
    z1: float
    y0: float
    k: float

    @property
    def y1(self) -> float:
        return self.y0 + (self.z1 - self.z0) * self.k

    def y(self, z: float) -> float:
        return self.y0 + (z - self.z0) * self.k


@dataclass(frozen=True)
class Band:
    """The vertical front between two tiers: a dark gap with concourse lights, an LED ribbon, a rail."""
    z: float
    y0: float
    y1: float
    ribbon: tuple[float, float]


TIER_SPEC = ((46.0, 56.0, 30), (56.0, 66.0, 34), (66.0, 76.5, 37), (76.5, 89.0, 40))   # z0, z1, rake in degrees
BAND_GAP, BAND_RAIL = 1.2, 0.35
RIBBON_H = (1.8, 2.1, 2.4)      # taller further back, so every ribbon is at least five pixels on a phone
TIER_LIGHT = ((0.62, 0.36), (0.56, 0.3), (0.5, 0.26), (0.46, 0.2))   # crowd light at the front and back row


def stadium() -> tuple[list[Tier], list[Band]]:
    tiers, bands = [], []
    y0 = WALL_H
    for i, (z0, z1, deg) in enumerate(TIER_SPEC):
        t = Tier(z0, z1, y0, math.tan(math.radians(deg)))
        tiers.append(t)
        if i < len(TIER_SPEC) - 1:
            r0 = t.y1 + BAND_GAP
            r1 = r0 + RIBBON_H[i]
            bands.append(Band(z1, t.y1, r1 + BAND_RAIL, (r0, r1)))
            y0 = r1 + BAND_RAIL
    return tiers, bands


TIERS, BANDS = stadium()
TOP = TIERS[-1]
ROOF_Y = TOP.y1 + 4.5
ROOF_Z0, ROOF_Z1, FASCIA_H = TOP.z0 + 4.0, TOP.z1, 2.8
M_SKY, M_GROUND, M_BOARD, M_WALL, M_ROOF, M_FASCIA, M_BACKWALL = 0, 1, 2, 3, 7, 8, 9
M_TIER, M_BAND = 10, 20     # + the tier's / band's index


def is_vom(x, i: int):
    """Vomitories (the tunnels up into the stand), staggered from tier to tier."""
    off = (VOM_EVERY / 2) * (i % 2)
    return np.abs(((x + VOM_EVERY / 2 + off) % VOM_EVERY) - VOM_EVERY / 2) < VOM_W / 2


def is_aisle(x):
    return np.abs(((x + AISLE_EVERY / 2) % AISLE_EVERY) - AISLE_EVERY / 2) < AISLE_W / 2


@dataclass
class Player:
    """One of the two foreground players."""
    x: float
    z: float
    team: str
    facing: int          # +1 faces right (+x), -1 faces left
    skin: int
    hair: int
    style: str           # hair style: "short", "swept"


@dataclass
class FieldPlayer:
    """Someone further up the pitch, whom the site moves: jogs to a new spot within `range` metres of home now and
    then, at `speed` metres a second."""
    x: float
    z: float
    team: str            # "A", "B", "REF" or "AR"
    skin: int
    hair: int
    style: str
    range: float
    speed: float


# The line-up at kick-off: the sky-blues in the left half, the crimsons in the right, the referee by the circle and
# his assistant on the far touchline. x runs along the pitch, z across it, away from the camera.
FIELD = [
    FieldPlayer(-9.0, 11.5, "A", 1, 2, "short", 2.5, 2.4),
    FieldPlayer(-16.5, 17.0, "A", 3, 0, "swept", 3.5, 2.8),
    FieldPlayer(-6.0, 22.5, "A", 2, 1, "short", 4.0, 3.0),
    FieldPlayer(-23.0, 26.5, "A", 0, 3, "swept", 4.0, 2.6),
    FieldPlayer(-12.5, 31.0, "A", 1, 0, "short", 5.0, 3.2),
    FieldPlayer(-29.0, 35.0, "A", 3, 2, "short", 4.5, 2.7),
    FieldPlayer(-3.5, 36.5, "A", 2, 0, "swept", 2.5, 2.5),
    FieldPlayer(8.5, 12.0, "B", 0, 1, "short", 2.5, 2.4),
    FieldPlayer(15.5, 18.0, "B", 3, 2, "swept", 3.5, 2.9),
    FieldPlayer(5.0, 24.0, "B", 1, 0, "short", 3.5, 2.8),
    FieldPlayer(21.5, 26.0, "B", 2, 3, "short", 4.5, 3.1),
    FieldPlayer(3.0, 30.0, "B", 0, 2, "swept", 2.0, 2.4),
    FieldPlayer(11.5, 32.5, "B", 3, 1, "short", 5.0, 3.0),
    FieldPlayer(29.5, 37.0, "B", 1, 0, "swept", 4.0, 2.6),
    FieldPlayer(-1.8, 16.0, "REF", 1, 2, "short", 3.0, 1.8),
    FieldPlayer(-18.0, 40.9, "AR", 2, 0, "short", 9.0, 3.4),
]


@dataclass
class Comp:
    name: str
    view_w: int
    view_h: int
    f: float             # focal length in pixels
    horizon: float       # horizon row as a share of the view height
    eye: float = 1.2
    margin: tuple[int, int] = (16, 14)    # room for parallax (PARALLAX) and for the whole-number fit to crop into
    pylons: list[tuple[float, float, float]] = field(default_factory=list)   # (x, z, top) of the floodlight pylons
    players: list[Player] = field(default_factory=list)
    focus: tuple[float, float] = (0.5, 0.55)
    seed: int = 7
    cam_x: float = 0.0   # the camera's sideways offset from the halfway line (metres)

    @property
    def w(self): return self.view_w + 2 * self.margin[0]

    @property
    def h(self): return self.view_h + 2 * self.margin[1]

    @property
    def cx(self): return self.w / 2

    @property
    def cy(self): return self.margin[1] + self.horizon * self.view_h

    def project(self, x, y, z):
        return self.cx + self.f * (x - self.cam_x) / z, self.cy - self.f * (y - self.eye) / z


def raycast(c: Comp):
    """One ray per pixel against the stadium. Returns depth (z of the hit, inf for sky), material id and hit point."""
    H, W = c.h, c.w
    py, px = np.mgrid[0:H, 0:W].astype(float) + 0.5
    dx = (px - c.cx) / c.f
    dy = (c.cy - py) / c.f                   # direction (dx, dy, 1): t equals the hit's z
    best = np.full((H, W), np.inf)
    mat = np.zeros((H, W), dtype=np.int16)
    X = np.zeros((H, W)); Y = np.zeros((H, W))

    def take(t, valid, m):
        nonlocal best
        upd = valid & (t > 0.1) & (t < best)
        best = np.where(upd, t, best)
        mat[upd] = m
        X[upd] = (t * dx + c.cam_x)[upd]
        Y[upd] = (c.eye + t * dy)[upd]

    with np.errstate(divide="ignore", invalid="ignore"):
        tg = np.where(dy < 0, -c.eye / dy, np.inf)
    take(tg, (tg < WALL_Z), M_GROUND)
    # vertical planes facing the camera: boards, the wall, the fascia, the wall behind the top tier, the bands
    planes = [(BOARD_Z, 0.0, BOARD_H, M_BOARD), (WALL_Z, 0.0, WALL_H, M_WALL), (ROOF_Z0, ROOF_Y, ROOF_Y + FASCIA_H, M_FASCIA),
              (TOP.z1, TOP.y1, ROOF_Y, M_BACKWALL)]
    planes += [(b.z, b.y0, b.y1, M_BAND + i) for i, b in enumerate(BANDS)]
    for z, ylo, yhi, m in planes:
        y = c.eye + z * dy
        take(np.full((H, W), z), (y >= ylo) & (y <= yhi) & (np.abs(z * dx + c.cam_x) < STAND_X), m)
    for i, tr in enumerate(TIERS):
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (tr.y0 - tr.z0 * tr.k - c.eye) / (dy - tr.k)
        take(t, (t >= tr.z0) & (t <= tr.z1) & (np.abs(t * dx + c.cam_x) < STAND_X), M_TIER + i)
    with np.errstate(divide="ignore", invalid="ignore"):
        tr_ = np.where(dy > 0, (ROOF_Y - c.eye) / dy, np.inf)
    take(tr_, (tr_ >= ROOF_Z0) & (tr_ <= ROOF_Z1) & (np.abs(tr_ * dx + c.cam_x) < STAND_X), M_ROOF)
    return best, mat, X, Y, px, py


def hash01(*a) -> np.ndarray:
    """Cheap deterministic noise in 0..1 from integer grids."""
    h = np.zeros_like(a[0], dtype=np.uint64)
    for i, v in enumerate(a):
        h ^= (v.astype(np.int64).astype(np.uint64) + np.uint64(0x9E3779B97F4A7C15 + i)) * np.uint64(0xBF58476D1CE4E5B9)
        h ^= h >> np.uint64(29)
    return (h % np.uint64(10007)).astype(float) / 10007


def render(c: Comp, rnd: random.Random):
    """Shade every surface. Returns the scene, the sky, the clouds (RGBA), the stars, depth, materials, the hit points
    and a mask per LED ribbon."""
    t, mat, X, Y, px, py = raycast(c)
    H, W = c.h, c.w
    T = threshold(H, W)
    img = np.zeros((H, W, 3), dtype=np.uint8)

    # --- sky: blue-hour gradient with a warm stadium glow just above the roof; stars and clouds go in their own layers
    roof_row = c.project(0, ROOF_Y + FASCIA_H, ROOF_Z0)[1]
    sv = 1 - np.clip(py / max(roof_row, 1), 0, 1)           # 1 at the top
    glow = np.exp(-((py - roof_row) / (0.22 * c.view_h)) ** 2)
    sky_img = ramp(SKY, np.clip(0.1 + 0.55 * (1 - sv) + 0.35 * glow, 0, 1), T)
    sky = mat == M_SKY
    img[sky] = sky_img[sky]
    n1 = hash01((px // 1).astype(int), (py // 1).astype(int))
    st = sky & (n1 > 0.991) & (glow < 0.62)
    ys, xs = np.nonzero(st)
    stars = [[int(x), int(y), int(2 if n1[y, x] > 0.998 else 1 if n1[y, x] > 0.996 else 0)] for y, x in zip(ys, xs)]
    # thin wisps of cloud, lit from below by the stadium: long horizontal streaks that wrap around sideways
    clouds = np.zeros((H, W, 4), dtype=np.uint8)
    for k in range(6):
        wy = roof_row * (0.12 + 0.14 * k) + rnd.uniform(-5, 5)
        wx, ln, th, ph = rnd.uniform(0, W), rnd.uniform(36, min(140, W * 0.45)), rnd.uniform(0.8, 1.8), rnd.uniform(0, 6.28)
        dxw = (((px - wx) + W / 2) % W - W / 2) / ln
        prof = np.exp(-dxw * dxw * 2) * np.exp(-((py - wy - 2.5 * np.sin(dxw * 3 + ph)) / th) ** 2)
        m = (prof > 0.35 + 0.3 * T) & (py < roof_row + 4)
        lv = np.clip(0.22 + 0.55 * glow + 0.2 * (py > wy), 0, 1)
        clouds[m, :3] = ramp(CLOUD, lv, T)[m]
        clouds[m, 3] = 255

    # --- ground: grass with mowing stripes, light pools, markings, shadows
    g = mat == M_GROUND
    Z = np.where(g, t, 0)
    on_pitch = g & (np.abs(X) <= HALF_L) & (Z >= SPOT_Z - HALF_W) & (Z <= SPOT_Z + HALF_W)
    light = (0.40 + 0.34 * np.exp(-((Z - 24) / 22) ** 2) - 0.10 * np.clip((np.abs(X) - 18) / 40, 0, 1)
             - 0.16 * np.clip((9 - Z) / 9, 0, 1))
    stripe = ((np.floor((Z - SPOT_Z) / 5.25) % 2) == 0) * 0.075 + ((np.floor(X / 5.25) % 2) == 0) * 0.025
    fx = Z / c.f                                            # metres per pixel across
    texel = hash01(np.floor(X / 0.35).astype(int), np.floor(Z / 0.35).astype(int))
    grain = (texel - 0.5) * 0.12 * np.clip(0.35 / np.maximum(fx, 1e-6), 0, 1)
    gv = np.clip(light + stripe + grain, 0, 1)
    shadows = player_shadows(c, X, Z)
    gv = gv - shadows
    img[on_pitch] = ramp(GRASS, gv, T)[on_pitch]
    off = g & ~on_pitch
    img[off] = ramp(APRON, np.clip(gv * 0.9, 0, 1), T)[off]
    hw = 0.06
    lines = np.zeros_like(g)
    lines |= on_pitch & (np.abs(X) < np.maximum(hw, 0.55 * fx))                                      # halfway line
    rr = np.hypot(X, Z - SPOT_Z)
    lines |= g & (rr < np.maximum(0.2, 0.5 * fx))                                                     # centre spot
    lv = np.clip(gv + 0.25, 0, 1) - shadows * 0.6
    img[lines] = ramp(LINE, lv, T)[lines]

    def mark(xw, zw):
        if zw < 0.8:
            return
        sx, sy = c.project(xw, 0, zw)
        ix, iy = int(sx), int(sy)
        th = max(1, int(round(c.f * 0.12 / zw)))
        for yy in range(iy, iy + max(1, th // 2 + (1 if zw < 12 else 0))):
            for xx in range(ix - th // 2, ix - th // 2 + th):
                if 0 <= xx < W and 0 <= yy < H and mat[yy, xx] == M_GROUND:
                    img[yy, xx] = ramp(LINE, np.array([[lv[yy, xx]]]), T[yy:yy + 1, xx:xx + 1])[0, 0]
    for a in np.linspace(0, 2 * math.pi, 6000, endpoint=False):
        mark(9.15 * math.cos(a), SPOT_Z + 9.15 * math.sin(a))
    for xw in np.linspace(-HALF_L, HALF_L, 3000):
        mark(xw, SPOT_Z + HALF_W)

    # --- boards, the wall below the first tier, the four tiers, the bands between them, the roof
    b = mat == M_BOARD
    img[b] = LED_BG[0]
    w3 = mat == M_WALL
    img[w3] = ramp(CONCRETE, np.full((H, W), 0.35) + (Y - WALL_H + 0.25 > 0) * 0.35, T)[w3]
    for i, tr in enumerate(TIERS):
        s = mat == M_TIER + i
        Zs = np.where(s, t, tr.z0)
        row = np.floor((Zs - tr.z0) / ROW)
        rf = (Zs - tr.z0) / ROW - row                         # position within the row: riser at the front
        depth_v = 1 - (Zs - tr.z0) / (tr.z1 - tr.z0)
        base = 0.5 - 0.035 * i + 0.3 * depth_v
        if i < len(TIERS) - 1:
            base = base - 0.22 * np.clip((Zs - (tr.z1 - 3)) / 3, 0, 1)                   # in the shadow of the band
        else:
            base = base - 0.25 * np.clip((Zs - ROOF_Z0) / (tr.z1 - ROOF_Z0), 0, 1)       # under the roof
        sv_ = np.clip(base - 0.12 * (rf < 0.25), 0, 1)
        img[s] = ramp(SEAT_RAMP, sv_, T)[s]
        a = s & is_aisle(X)
        img[a] = ramp(CONCRETE, np.clip(sv_ + 0.1 * (rf > 0.5), 0, 1), T)[a]
        vom = s & is_vom(X, i) & (row >= VOM_ROWS[0]) & (row < VOM_ROWS[1])
        img[vom] = ROOF[0]
        img[vom & (row == VOM_ROWS[1] - 1) & (rf > 0.6)] = CONCRETE[2]
    ribbons = []
    for i, bd in enumerate(BANDS):
        mid = mat == M_BAND + i
        img[mid] = ramp(CONCRETE, np.full((H, W), 0.12), T)[mid]
        rib = mid & (Y >= bd.ribbon[0]) & (Y <= bd.ribbon[1])
        img[rib] = LED_BG[1]
        ribbons.append(rib)
        rail = mid & (Y > bd.ribbon[1])
        img[rail] = CONCRETE[3]
        top_rail = rail & ~np.roll(rail, 1, axis=0)
        img[top_rail] = CONCRETE[4]
        gap_rows = np.where((mid & (Y < bd.ribbon[0] - 0.3)).any(axis=1))[0]
        if len(gap_rows):                                     # concourse lights in the dark gap, an exit sign or two
            gy = int(gap_rows[len(gap_rows) // 2])
            for gx in range(rnd.randrange(9), W, 7 + rnd.randrange(5)):
                if mid[gy, gx] and rnd.random() < 0.7:
                    img[gy, gx] = EXIT if rnd.random() < 0.08 else LAMP[0]
    bw = mat == M_BACKWALL
    img[bw] = ramp(ROOF, np.full((H, W), 0.3), T)[bw]
    rows = np.where(bw.any(axis=1))[0]
    if len(rows):
        gy = int(rows[len(rows) // 2])
        for gx in range(rnd.randrange(6), W, 5 + rnd.randrange(4)):
            if bw[gy, gx] and rnd.random() < 0.6:
                img[gy, gx] = EXIT if rnd.random() < 0.1 else LAMP[0]
    roof = mat == M_ROOF
    Zr = np.where(roof, t, ROOF_Z0)
    truss = (np.abs(((X + 4) % 8) - 4) < np.maximum(0.25, 0.6 * Zr / c.f)) | (np.abs(((Zr - ROOF_Z0 + 2) % 4) - 2) < np.maximum(0.15, 0.5 * Zr * Zr / (c.f * (ROOF_Y - c.eye))))
    rv = 0.2 + 0.25 * np.clip((ROOF_Z0 + 3 - Zr) / 3, 0, 1) + truss * 0.25
    img[roof] = ramp(ROOF, np.clip(rv, 0, 1), T)[roof]
    # downlights under the roof
    dl = roof & (np.abs(((X + 3) % 6) - 3) < np.maximum(0.2, 0.5 * Zr / c.f)) & (np.abs(Zr - (ROOF_Z0 + 2.2)) < np.maximum(0.25, 0.5 * Zr * Zr / (c.f * (ROOF_Y - c.eye))))
    img[dl] = LAMP[0]
    fas = mat == M_FASCIA
    img[fas] = ramp(STEEL, np.clip(0.35 + 0.3 * (Y - ROOF_Y) / FASCIA_H, 0, 1), T)[fas]

    # distance haze over the stands
    hz = mat >= M_WALL
    fog = np.clip((t - 55) / 70, 0, 0.42)
    hazemask = hz & (T < fog) & ~np.any(ribbons, axis=0)
    img[hazemask] = HAZE[1]
    return img, sky_img, clouds, stars, t, mat, X, Y, ribbons


def player_shadows(c: Comp, X, Z) -> np.ndarray:
    """The floodlit foreground players cast a dark contact shadow and four faint crossed shadows; the ball a small one.
    (The players further up the pitch move, so the site draws their shadows.)"""
    out = np.zeros_like(X)
    for p in c.players:
        dx, dz = X - p.x, Z - p.z
        out += 0.35 * (((dx / 0.45) ** 2 + (dz / 0.3) ** 2) < 1)
        for ax, az in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            u = (dx * ax + dz * az) / math.sqrt(2)
            v = (dx * -az + dz * ax) / math.sqrt(2)
            out += 0.07 * ((u > 0) & (u < 2.6) & (np.abs(v) < 0.22 * (1 - u / 3.2)))
    dx, dz = X, Z - SPOT_Z
    out += 0.3 * (((dx / 0.2) ** 2 + (dz / 0.14) ** 2) < 1)
    return np.clip(out, 0, 0.5)


# ---------------------------------------------------------------- crowd, flags and screen-space dressing
FONT3 = {
    "A": [".#.", "#.#", "###", "#.#", "#.#"], "B": ["##.", "#.#", "##.", "#.#", "##."], "C": ["###", "#..", "#..", "#..", "###"],
    "D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"], "F": ["###", "#..", "##.", "#..", "#.."],
    "G": ["###", "#..", "#.#", "#.#", "###"], "H": ["#.#", "#.#", "###", "#.#", "#.#"], "I": ["###", ".#.", ".#.", ".#.", "###"],
    "J": ["..#", "..#", "..#", "#.#", "###"], "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "L": ["#..", "#..", "#..", "#..", "###"],
    "M": ["#.#", "###", "#.#", "#.#", "#.#"], "N": ["#.#", "###", "###", "#.#", "#.#"], "O": ["###", "#.#", "#.#", "#.#", "###"],
    "P": ["###", "#.#", "###", "#..", "#.."], "Q": ["###", "#.#", "#.#", "###", "..#"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "S": ["###", "#..", "###", "..#", "###"], "T": ["###", ".#.", ".#.", ".#.", ".#."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    "V": ["#.#", "#.#", "#.#", "#.#", ".#."], "W": ["#.#", "#.#", "#.#", "###", "#.#"], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "Z": ["###", "..#", ".#.", "#..", "###"], "7": ["###", "..#", ".#.", ".#.", ".#."],
    " ": ["...", "...", "...", "...", "..."], "*": ["...", ".#.", "###", ".#.", "..."],
}


def led_strip(rows: int, words: list[str], colours: list[str]) -> np.ndarray:
    """One full cycle of an LED board's text, as a strip that tiles seamlessly: words in FONT3 over an unlit dot grid."""
    width = sum(len(w) * 4 + 9 for w in words)
    width += width % 2
    out = np.zeros((rows, width, 3), dtype=np.uint8)
    out[:] = LED_BG[0]
    out[:, ::2] = LED_BG[1]
    gy = max(0, (rows - 5) // 2)
    x = 0
    for word, colour in zip(words, colours):
        col = LED[colour]
        for ch in word:
            for j, line in enumerate(FONT3[ch]):
                for i, bit in enumerate(line):
                    if bit == "#" and gy + j < rows:
                        out[gy + j, x + i] = col[0] if (j == 4 and rows < 6) else col[1]
            x += 4
        x += 9
    return out


# The text on each LED: the pitch-side boards, then the ribbons between tiers 1-2, 2-3 and 3-4; speed in art px/s
LED_TEXT = [
    (["FUTKRILL", "*", "MATCHDAY", "*", "GAME ON", "*", "KICK OFF", "*"], ["gold", "white", "cyan", "white", "red", "white", "gold", "white"], 9),
    (["NAME A PLAYER", "*", "FUTKRILL", "*", "DAILY 7", "*"], ["white", "gold", "cyan", "gold", "red", "gold"], -6),
    (["JOBLESS", "*", "BALL KNOWLEDGE", "*", "FUTKRILL", "*"], ["gold", "red", "white", "red", "cyan", "red"], 5),
    (["FUTKRILL", "*", "MATCHDAY", "*"], ["cyan", "gold", "white", "gold"], -4),
]


@dataclass
class Fan:
    x: int
    y: int
    w: int
    rows: int
    shirt: np.ndarray
    skin: np.ndarray
    hair: np.ndarray
    v: float
    depth: float
    team: str
    act: list     # per frame: "", "jump", "arms", "scarf"; frame 4 is "wave" for everyone


def crowd(c: Comp, rnd: random.Random):
    """Every supporter in the four tiers as a tiny sprite, back rows first. Returns the fans, the flags (x, y, z, team,
    phase, size) and the flares (art pixels)."""
    fans: list[Fan] = []
    flags = []
    flares = []
    for i in reversed(range(len(TIERS))):
        tr = TIERS[i]
        lit = TIER_LIGHT[i]
        nrows = int((tr.z1 - tr.z0) / ROW)
        for r in reversed(range(nrows)):
            z = tr.z0 + (r + 0.55) * ROW
            yfloor = tr.y(z)
            sw = c.f * SEAT / z                                     # pixels per seat
            w = 1 if sw < 1.9 else 2 if sw < 3.2 else 3
            span = c.view_w * z / c.f / 2 + 4
            x = c.cam_x - span + rnd.random() * SEAT
            while x < c.cam_x + span:
                x += SEAT
                if abs(((x + AISLE_EVERY / 2) % AISLE_EVERY) - AISLE_EVERY / 2) < AISLE_W / 2 + 0.2:
                    continue
                if is_vom(x, i) and VOM_ROWS[0] - 1 <= r < VOM_ROWS[1]:
                    continue
                if rnd.random() > 0.9:
                    continue
                sx, sy = c.project(x, yfloor + 1.25, z)
                ix, iy = int(round(sx)), int(round(sy))
                if not (0 <= ix < c.w and 1 <= iy < c.h):
                    continue
                side = x / 30
                team = "A" if rnd.random() < 0.5 - 0.42 * max(-1, min(1, side)) else "B"
                kit = KITS[team]
                pick = rnd.random()
                if pick < 0.12:
                    shirt = NEUTRAL[rnd.randrange(len(NEUTRAL))]
                elif pick < 0.32:
                    shirt = kit["alt"][1:]
                else:
                    shirt = kit["shirt"][1:]
                light = lit[0] + (lit[1] - lit[0]) * (r / max(nrows - 1, 1))
                if i == len(TIERS) - 1:
                    light -= 0.22 * clamp01((z - ROOF_Z0) / (tr.z1 - ROOF_Z0))
                else:
                    light -= 0.12 * clamp01((z - (tr.z1 - 3)) / 3)
                light += (rnd.random() - 0.5) * 0.14 - 0.12 * min(1, abs(x) / 70)
                acts = [""]
                for _ in range(3):
                    q = rnd.random()
                    acts.append("jump" if q < 0.22 else "arms" if q < 0.36 and w >= 2 else "scarf" if q < 0.43 else "")
                acts.append("wave")
                fans.append(Fan(ix, iy, w, max(1, round(sw * 0.75)), shirt, SKINS[rnd.randrange(4)], HAIRS[rnd.randrange(4)],
                                light, z, team, acts))
                q = rnd.random()
                if q < (0.011 if i < 2 else 0.006) and abs(x) > 3:
                    flags.append((x, yfloor + 3.4, z, team, rnd.random(), 1.8 if (q < 0.0025 and i < 2) else 1.0))
                elif 1 <= i <= 2 and 0.02 <= q < 0.026 and 8 < abs(x) < 45:
                    flares.append((ix + w // 2, iy - 2, team, x))
    # a handful of flares, well apart, most of them in the crimson end
    chosen = []
    rnd.shuffle(flares)
    for fx, fy, team, x in sorted(flares, key=lambda f: (f[2] != "B", rnd.random())):
        if len(chosen) >= 5:
            break
        if 6 <= fx < c.w - 6 and all(abs(fx - a) > 26 for a, _ in chosen):
            chosen.append((fx, fy))
    return fans, flags, chosen


def draw_fans(img, depth, fans: list[Fan], frame: int):
    H, W = img.shape[:2]

    def put(x, y, col, z):
        if 0 <= x < W and 0 <= y < H and depth[y, x] >= z - 0.6:
            img[y, x] = col

    for f in fans:
        a = f.act[frame]
        wave = a == "wave"                      # the Mexican wave: up on their feet, arms high, in the light
        y = f.y - (1 if a in ("jump", "wave") else 0)
        v = f.v + (0.14 if wave else 0)
        sh = shade1(f.shirt, v)
        sk = f.skin[min(3, 1 + (v > 0.55) + wave)]
        for dy in range(f.rows):
            for dx in range(f.w):
                put(f.x + dx, y + dy, sh if not (dx == 0 and f.w > 1) else shade1(f.shirt, v - 0.35), f.depth)
        hx = f.x + (f.w - 1) // 2
        put(hx, y - 1, sk, f.depth)
        if f.w >= 3:
            put(hx + 1, y - 1, sk, f.depth)
            put(hx, y - 2, f.hair[1], f.depth)
            put(hx + 1, y - 2, f.hair[0], f.depth)
        if a == "arms" or (wave and f.w >= 2):
            put(f.x - 1, y - 1, sh, f.depth); put(f.x - 1, y - 2, sk, f.depth)
            put(f.x + f.w, y - 1, sh, f.depth); put(f.x + f.w, y - 2, sk, f.depth)
        elif wave:
            put(f.x, y - 2, sk, f.depth)
        elif a == "scarf":
            kit = KITS[f.team]
            for dx in range(-1, f.w + 1):
                put(f.x + dx, y - 2, (kit["shirt"][1] if (dx % 2) else kit["alt"][1]), f.depth)


def draw_flags(img, depth, c: Comp, flags, frame: int):
    H, W = img.shape[:2]
    for (x, y, z, team, phase, size) in flags:
        kit = KITS[team]
        x0, y0 = c.project(x, y + (size - 1) * 1.6, z)
        fw = max(4, int(c.f * 2.2 * size / z)); fh = max(3, int(c.f * 1.4 * size / z))
        x0, y0 = int(x0), int(y0)
        for yy in range(y0, y0 + fh + int(c.f * 1.8 * size / z)):
            if 0 <= x0 < W and 0 <= yy < H and depth[yy, x0] >= z - 0.6:
                img[yy, x0] = STEEL[3]
        for i in range(fw):
            wave = int(round(math.sin(i * 0.9 / size + phase * 6 + frame * 1.7) * (0.6 + i / fw) * size))
            for j in range(fh):
                xx, yy = x0 + 1 + i, y0 + j + wave
                if 0 <= xx < W and 0 <= yy < H and depth[yy, xx] >= z - 0.6:
                    stripe = (j * 3 // fh) == 1 if team == "A" else (i * 3 // fw) == 1
                    base = kit["alt"] if stripe else kit["shirt"]
                    img[yy, xx] = base[2 if (i + wave) % 3 else 1]


def draw_banners(img, mat, c: Comp, rnd: random.Random):
    """Supporters' banners hung along the wall in front of the first tier: two-tone, striped, no words."""
    H, W = img.shape[:2]
    x = -70.0 + rnd.random() * 4
    while x < 70:
        ln = rnd.uniform(5, 11)
        team = "A" if x + ln / 2 < 0 else "B"
        if rnd.random() < 0.15:
            team = "B" if team == "A" else "A"
        kit = KITS[team]
        style = rnd.randrange(3)
        x0, y0 = c.project(x, WALL_H - 0.12, WALL_Z - 0.01)
        x1, y1 = c.project(x + ln, 0.2, WALL_Z - 0.01)
        for yy in range(int(y0), int(y1) + 1):
            for xx in range(int(x0), int(x1) + 1):
                if 0 <= xx < W and 0 <= yy < H and mat[yy, xx] == M_WALL:
                    u, v = (xx - x0) / max(x1 - x0, 1), (yy - y0) / max(y1 - y0, 1)
                    alt = (style == 0 and int(u * 8) % 2 == 1) or (style == 1 and 0.35 < v < 0.65) or (style == 2 and abs(u - 0.5) < 0.12)
                    col = kit["alt"] if alt else kit["shirt"]
                    edge = yy == int(y0) or yy == int(y1)
                    img[yy, xx] = col[0] if edge else col[2] if yy == int(y0) + 1 else col[1]
        x += ln + rnd.uniform(4, 14)


def draw_pylons(img, depth, c: Comp):
    """Lattice floodlight pylons behind the stand, with a lamp bank on top. Returns lamp positions for the glow."""
    lamps = []
    H, W = img.shape[:2]
    for (x, z, top) in c.pylons:
        bx0, by0 = c.project(x - 1.8, 0, z); bx1, _ = c.project(x + 1.8, 0, z)
        tx0, ty0 = c.project(x - 1.0, top - 7, z); tx1, _ = c.project(x + 1.0, top - 7, z)
        for yy in range(max(0, int(ty0)), min(H, int(by0))):
            s = (yy - ty0) / max(by0 - ty0, 1)
            l = tx0 + (bx0 - tx0) * s; r = tx1 + (bx1 - tx1) * s
            for xx in (int(l), int(r)):
                if 0 <= xx < W and np.isinf(depth[yy, xx]):
                    img[yy, xx] = STEEL[2]
            if (yy // 3) % 2 == 0:                                      # cross bracing
                xx = int(l + (r - l) * ((yy % 6) / 6))
                if 0 <= xx < W and np.isinf(depth[yy, xx]):
                    img[yy, xx] = STEEL[1]
        hx0, hy0 = c.project(x - 5.0, top, z); hx1, hy1 = c.project(x + 5.0, top - 6.0, z)
        hx0, hy0, hx1, hy1 = int(hx0), int(hy0), int(hx1), int(hy1)
        for yy in range(hy0, hy1 + 1):
            for xx in range(hx0, hx1 + 1):
                if 0 <= xx < W and 0 <= yy < H and np.isinf(depth[yy, xx]):
                    edge = yy in (hy0, hy1) or xx in (hx0, hx1)
                    cell = ((xx - hx0) % 3 == 0) or ((yy - hy0) % 3 == 0)
                    hot = ((xx - hx0) % 3 == 1) and ((yy - hy0) % 3 == 1)
                    img[yy, xx] = STEEL[3] if edge else STEEL[1] if cell else (LAMP[2] if hot else LAMP[0])
        lamps.append(((hx0 + hx1) / 2, (hy0 + hy1) / 2, max(hx1 - hx0, 4) * 1.6, 1.0))
    return lamps


def draw_fascia_lamps(img, mat, c: Comp):
    lamps = []
    H, W = img.shape[:2]
    y_mid = ROOF_Y + 0.6
    for i in range(-30, 31):
        x = i * 3.0
        sx, sy = c.project(x, y_mid, ROOF_Z0 - 0.05)
        ix, iy = int(sx), int(sy)
        if 0 <= ix < W - 1 and 0 <= iy < H and mat[iy, ix] == M_FASCIA:
            img[iy, ix] = LAMP[2]; img[iy, ix + 1] = LAMP[1]
            if iy + 1 < H and mat[iy + 1, ix] == M_FASCIA:
                img[iy + 1, ix] = LAMP[0]
            lamps.append((sx, sy, 7.0, 0.55))
    return lamps


# ---------------------------------------------------------------- the players
def capsule(buf, zb, nb, sb, p0, p1, r0, r1, part, order):
    """Rasterise a tapered capsule into the part buffer, keeping the higher `order` on top, and store each pixel's
    surface normal (as if the capsule were a rounded 3D limb) and how far along the limb it is (0..1)."""
    H, W = buf.shape
    x0 = max(0, int(min(p0[0] - r0, p1[0] - r1)) - 1); x1 = min(W, int(max(p0[0] + r0, p1[0] + r1)) + 2)
    y0 = max(0, int(min(p0[1] - r0, p1[1] - r1)) - 1); y1 = min(H, int(max(p0[1] + r0, p1[1] + r1)) + 2)
    if x0 >= x1 or y0 >= y1:
        return
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(float)
    vx, vy = p1[0] - p0[0], p1[1] - p0[1]
    L2 = vx * vx + vy * vy or 1e-6
    qx, qy = xs + 0.5 - p0[0], ys + 0.5 - p0[1]
    s = np.clip((qx * vx + qy * vy) / L2, 0, 1)
    r = r0 + (r1 - r0) * s
    dx, dy = qx - vx * s, qy - vy * s
    d = np.hypot(dx, dy)
    m = (d <= r) & (order >= zb[y0:y1, x0:x1])
    buf[y0:y1, x0:x1][m] = part
    zb[y0:y1, x0:x1][m] = order
    nz = np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1))
    nb[y0:y1, x0:x1][m] = np.stack([dx / r, dy / r, nz], axis=-1)[m]
    sb[y0:y1, x0:x1][m] = s[m]


KEY = np.array([-0.12, -0.62, 0.78]) / np.linalg.norm([-0.12, -0.62, 0.78])     # floodlights: above, towards the camera
SKIN_, HAIR_, SHIRT_, SHORTS_, THIGH_, SHIN_, BOOT_, COLLAR_, UARM_, FARM_ = range(1, 11)
THIGH_LEN, SHIN_LEN, UARM_LEN, FARM_LEN = 9.8, 12.0, 8.7, 7.6
# the run cycle, four frames: (thigh, shin) angles in degrees from straight down, forward positive, for the near and far
# leg; the arms swing against the legs
LEG_FRONT, LEG_BACK, LEG_SUPPORT, LEG_SWING = (30, 12), (-26, -62), (10, -10), (22, -66)
RUN_LEGS = [(LEG_FRONT, LEG_BACK), (LEG_SUPPORT, LEG_SWING), (LEG_BACK, LEG_FRONT), (LEG_SWING, LEG_SUPPORT)]
RUN_ARMS = [(-34, 32), (-6, 8), (32, -34), (8, -6)]


def limb(a, length, deg):
    r = math.radians(deg)
    return (a[0] + math.sin(r) * length, a[1] + math.cos(r) * length)


def figure(h: int, kit: dict, skin_i: int, hair_i: int, style: str, pose: str = "stand", phase: int = 0, breath: int = 0,
           flag: bool = False) -> tuple[np.ndarray, int]:
    """An invented footballer about `h` pixels tall, facing right: standing ready (breathing in or out) or in one of
    four running frames. Every body part is a tapered capsule with a 3D normal; shading is a key light from the upper
    left in four banded tones (no dithering, as a pixel artist would), a cool rim light from behind, contact shade where
    one part meets another in front of it, then an ink outline. Players smaller than 40 pixels are drawn at 4x and
    reduced part by part (never by blending colours), with limbs at least a pixel wide, so they stay crisp.
    Returns RGBA pixels (h + 4 rows; the body's centre line is the middle of the width) and the ground row."""
    S = 4 if h < 40 else 1
    W = h + (h % 2)
    H2 = h + 4
    buf = np.zeros((H2 * S, W * S), dtype=np.int16)
    zb = np.full((H2 * S, W * S), -1, dtype=np.int16)
    nb = np.zeros((H2 * S, W * S, 3))
    sb = np.zeros((H2 * S, W * S))
    u = h * S / 64.0
    cx, top = W * S / 2, 2 * S
    run = pose == "run"
    up = breath * max(1, round(u * 0.8)) if not run else 0
    lean = 2.4 if run else 0.0

    if run:
        nl, fl = RUN_LEGS[phase]
        na, fa = RUN_ARMS[phase]

        def leg(hip, a):
            knee = limb(hip, THIGH_LEN, a[0])
            return hip, knee, limb(knee, SHIN_LEN, a[1])
        near, far = leg((1.8, 36.8), nl), leg((-1.4, 36.4), fl)
        bob = 58.6 - max(near[2][1], far[2][1])

        def arm(sh, a):
            elbow = limb(sh, UARM_LEN, a)
            return sh, elbow, limb(elbow, FARM_LEN, a + 80)
        arm_near, arm_far = arm((2.8, 14.9), na), arm((-3.2, 15.1), fa)
    else:
        near = ((2.6, 37.0), (4.4, 46.5), (3.8, 58.4))
        far = ((-2.2, 36.5), (-3.4, 46.5), (-3.8, 58.5))
        arm_near = ((3.6, 14.8), (5.4, 23.4), (6.6, 31.0))
        arm_far = ((-4.2, 15.0), (-5.6, 23.5), (-4.6, 31.0))
        bob = 0.0

    def P(x, y, lift=True):
        dx = lean * (36 - y) / 36 if lift else 0.0
        return (cx + (x + dx) * u, top + (y + bob) * u - (up if lift else 0))

    def cap(a, b, r0, r1, part, order, lift=True):
        rmin = 0.55 * S if S > 1 else 0.0           # limbs at least a pixel wide on small players
        capsule(buf, zb, nb, sb, P(*a, lift=lift), P(*b, lift=lift), max(r0 * u, rmin), max(r1 * u, rmin), part, order)

    def boot(leg_, back, fwd, r0, r1, order):
        _, knee, ankle = leg_
        a = math.atan2(ankle[0] - knee[0], ankle[1] - knee[1])
        d, n = (math.cos(a), -math.sin(a)), (math.sin(a), math.cos(a))
        p0 = (ankle[0] + n[0] * 1.8 - d[0] * back, ankle[1] + n[1] * 1.8 - d[1] * back)
        p1 = (ankle[0] + n[0] * 2.8 + d[0] * fwd, ankle[1] + n[1] * 2.8 + d[1] * fwd)
        cap(p0, p1, r0, r1, BOOT_, order, lift=False)
        return p0, p1

    def shorts_leg(leg_, r0, r1, order, stand):
        hip, knee, _ = leg_
        if stand is not None:
            cap(stand[0], stand[1], r0, r1, SHORTS_, order, lift=False)
            return
        L = math.hypot(knee[0] - hip[0], knee[1] - hip[1])
        d = ((knee[0] - hip[0]) / L, (knee[1] - hip[1]) / L)
        cap((hip[0] - d[0] * 3.4, hip[1] - d[1] * 3.4), (hip[0] + d[0] * 0.8, hip[1] + d[1] * 0.8), r0, r1, SHORTS_, order, lift=False)

    def hand(arm_, r0, r1, order):
        _, elbow, wrist = arm_
        L = math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1])
        d = ((wrist[0] - elbow[0]) / L, (wrist[1] - elbow[1]) / L)
        a, b = (wrist[0] + d[0] * 1.4, wrist[1] + d[1] * 1.4), (wrist[0] + d[0] * 2.3, wrist[1] + d[1] * 2.3)
        cap(a, b, r0, r1, SKIN_, order)
        return b

    # far side (drawn first, so the near side overlaps it)
    cap(far[0], far[1], 3.3, 2.6, THIGH_, 1, lift=False)
    cap(far[1], far[2], 2.6, 1.8, SHIN_, 1, lift=False)
    boot(far, 1.0, 3.0, 1.8, 1.9, 2)
    cap(arm_far[0], arm_far[1], 2.5, 2.1, UARM_, 2)
    cap(arm_far[1], arm_far[2], 2.0, 1.6, FARM_, 2)
    hand(arm_far, 1.8, 1.7, 2)
    # body
    cap((0.4, 15.5), (0.1, 27.5), 7.0, 5.9, SHIRT_, 4)                       # chest and waist
    cap((-4.6, 14.8), (5.0, 14.8), 3.0, 3.0, SHIRT_, 3)                      # shoulders (under the chest)
    cap((0.0, 29.5), (0.0, 33.0), 6.2, 6.2, SHORTS_, 5)                      # shorts
    shorts_leg(far, 3.5, 3.3, 5, None if run else ((-2.6, 33.5), (-3.0, 37.0)))
    # near side
    cap(near[0], near[1], 3.6, 2.8, THIGH_, 6, lift=False)
    cap(near[1], near[2], 2.8, 2.0, SHIN_, 6, lift=False)
    sole = boot(near, 0.6, 4.5, 2.0, 2.0, 7)
    shorts_leg(near, 3.7, 3.4, 7, None if run else ((2.7, 33.5), (3.6, 37.2)))
    cap((1.0, 8.5), (1.3, 12.8), 2.3, 2.4, SKIN_, 8)                         # neck
    cap((1.4, 3.6), (1.9, 7.0), 5.1, 4.3, SKIN_, 9)                          # head
    cap((5.6, 5.8), (5.9, 6.3), 1.0, 0.8, SKIN_, 9)                          # nose
    if style == "short":
        cap((0.6, 1.0), (-1.6, 3.4), 4.6, 3.6, HAIR_, 10)
        cap((-2.6, 3.2), (-2.4, 6.4), 2.6, 2.0, HAIR_, 10)
        cap((2.6, 0.2), (5.0, 1.6), 2.4, 1.6, HAIR_, 10)
    else:
        cap((1.0, 0.0), (-2.0, 2.6), 4.8, 4.0, HAIR_, 10)
        cap((-2.8, 2.8), (-3.0, 7.6), 2.8, 2.2, HAIR_, 10)
        cap((3.4, -0.2), (6.2, 1.8), 2.4, 1.5, HAIR_, 10)
    cap(arm_near[0], arm_near[1], 2.7, 2.2, UARM_, 11)
    cap(arm_near[1], arm_near[2], 2.0, 1.6, FARM_, 11)
    hand_pt = hand(arm_near, 2.0, 1.9, 11)
    cap((-1.4, 11.9), (3.4, 12.3), 1.3, 1.3, COLLAR_, 12)

    buf, zb, nb, sb = reduce_parts(buf, zb, nb, sb, S)
    skin = SKINS[skin_i]
    hair = np.vstack([HAIRS[hair_i][:1], HAIRS[hair_i]])
    v = 0.12 + 0.88 * np.clip(nb @ KEY, 0, None)
    contact = np.zeros(buf.shape, dtype=bool)
    for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nbuf = np.roll(np.roll(buf, -oy, axis=0), -ox, axis=1)
        nzb = np.roll(np.roll(zb, -oy, axis=0), -ox, axis=1)
        contact |= (nbuf != 0) & (nbuf != buf) & (nzb > zb)
    v = v - 0.22 * contact
    k = np.digitize(v, [0.3, 0.55, 0.8])
    out = np.zeros(buf.shape + (4,), dtype=np.uint8)
    rules = [
        (buf == SKIN_, skin), (buf == HAIR_, hair), (buf == SHIRT_, kit["shirt"]), (buf == SHORTS_, kit["shorts"]),
        (buf == BOOT_, BOOT), (buf == COLLAR_, kit["alt"]), (buf == THIGH_, skin), (buf == FARM_, skin),
        ((buf == SHIN_) & (sb < 0.2), skin), ((buf == SHIN_) & (sb >= 0.2) & (sb < 0.3), kit["band"]),
        ((buf == SHIN_) & (sb >= 0.3), kit["socks"]),
        ((buf == UARM_) & (sb < 0.51), kit["shirt"]), ((buf == UARM_) & (sb >= 0.51) & (sb < 0.63), kit["alt"]),
        ((buf == UARM_) & (sb >= 0.63), skin),
    ]
    for m, r in rules:
        out[m, :3] = r[np.minimum(k[m], len(r) - 1)]
    rim = (np.abs(nb[..., 0]) > 0.82) & (nb[..., 1] < 0.35) & (buf != BOOT_) & (buf > 0)
    out[rim, :3] = np.minimum(255, out[rim, :3].astype(int) + np.array([18, 48, 70]))
    out[buf > 0, 3] = 255

    def px(xr, yr, col, lift=True):
        xx, yy = P(xr, yr, lift)
        xx, yy = int(xx / S), int(yy / S)
        if 0 <= xx < W and 0 <= yy < H2 and out[yy, xx, 3]:
            out[yy, xx, :3] = col
    if S == 1:      # face, on the near side: eye (white and pupil), brow, mouth, ear; a sole highlight; the shorts stripe
        px(3.9, 4.6, INK); px(3.0, 4.6, hexes("#e8ecf4")[0]) if u > 0.9 else None
        px(3.4, 3.2, hair[1]); px(4.4, 3.2, hair[1])
        px(4.3, 8.0, skin[0]); px(-0.4, 5.4, skin[0]); px(-0.4, 6.4, skin[1])
        for s in np.linspace(0.0, 1.0, 7):
            px(sole[0][0] + (sole[1][0] - sole[0][0]) * s, sole[0][1] + (sole[1][1] - sole[0][1]) * s + 1.4, kit["sole"], False)
        for yy_ in np.arange(34.0, 37.6, 0.8):
            px(6.6, yy_, kit["stripe"], False)
    if flag:        # the assistant referee's flag, held out from the near hand
        hx, hy = P(*hand_pt)
        hx, hy = int(hx / S), int(hy / S)
        fw, fh = max(2, round(h * 0.16)), max(2, round(h * 0.12))
        for yy in range(hy - fh, hy):
            for xx in range(hx + 1, hx + 1 + fw):
                if 0 <= xx < W and 0 <= yy < H2:
                    out[yy, xx, :3] = FLAG_AR[((xx - hx) * 2 // fw + (yy - hy) * 2 // fh) % 2]
                    out[yy, xx, 3] = 255
    alpha = out[:, :, 3] > 0
    ring = np.zeros_like(alpha)
    ring[1:, :] |= alpha[:-1, :]; ring[:-1, :] |= alpha[1:, :]; ring[:, 1:] |= alpha[:, :-1]; ring[:, :-1] |= alpha[:, 1:]
    ring &= ~alpha
    out[ring, :3] = INK; out[ring, 3] = 255
    return out, int(np.nonzero(alpha.any(axis=1) | ring.any(axis=1))[0].max())


def reduce_parts(buf, zb, nb, sb, S):
    """Reduce a 4x drawing to pixels part by part: a pixel is drawn if enough of it is covered, and takes the front-most
    part that covers a fair share of it (else the most common), with that part's average normal."""
    if S == 1:
        return buf, zb, nb, sb
    H, W = buf.shape[0] // S, buf.shape[1] // S
    B = buf.reshape(H, S, W, S).transpose(0, 2, 1, 3).reshape(H, W, S * S)
    Zb = zb.reshape(H, S, W, S).transpose(0, 2, 1, 3).reshape(H, W, S * S)
    N = nb.reshape(H, S, W, S, 3).transpose(0, 2, 1, 3, 4).reshape(H, W, S * S, 3)
    Sb = sb.reshape(H, S, W, S).transpose(0, 2, 1, 3).reshape(H, W, S * S)
    cov = (B > 0).sum(-1)
    ob = np.zeros((H, W), dtype=np.int16); oz = np.full((H, W), -1, dtype=np.int16)
    on = np.zeros((H, W, 3)); os_ = np.zeros((H, W))
    for y, x in zip(*np.nonzero(cov >= 0.4 * S * S)):
        parts, zs = B[y, x], Zb[y, x]
        best, key = 0, None
        for p in set(parts[parts > 0].tolist()):
            m = parts == p
            n_, z_ = int(m.sum()), int(zs[m].max())
            kk = (n_ * 3 >= cov[y, x], z_, n_)
            if key is None or kk > key:
                best, key = p, kk
        m = parts == best
        ob[y, x] = best; oz[y, x] = key[1]
        n = N[y, x][m].mean(axis=0)
        on[y, x] = n / (np.linalg.norm(n) or 1)
        os_[y, x] = Sb[y, x][m].mean()
    return ob, oz, on, os_


def ball_sprite(d: int) -> Image.Image:
    """A football d pixels across, lit from the upper left, with dark patches and an ink outline."""
    n = d + 2
    out = np.zeros((n, n, 4), dtype=np.uint8)
    c = (n - 1) / 2; R = d / 2
    for y in range(n):
        for x in range(n):
            dx, dy = x - c, y - c
            if dx * dx + dy * dy <= R * R:
                v = 0.85 - (dx + dy) / (2.4 * R)
                patch = (abs(dx) < R * 0.28 and abs(dy) < R * 0.28) or (abs(dx + R * 0.62) < R * 0.18 and abs(dy + R * 0.2) < R * 0.2) \
                    or (abs(dx - R * 0.55) < R * 0.18 and abs(dy - R * 0.35) < R * 0.2)
                col = shade1(hexes("#1a1e30", "#2a3048"), v) if patch else shade1(hexes("#8e98b8", "#c8d0e4", "#f4f6ff", "#ffffff"), v)
                out[y, x, :3] = col; out[y, x, 3] = 255
    a = out[:, :, 3] > 0
    ring = np.zeros_like(a)
    ring[1:, :] |= a[:-1, :]; ring[:-1, :] |= a[1:, :]; ring[:, 1:] |= a[:, :-1]; ring[:, :-1] |= a[:, 1:]
    ring &= ~a
    out[ring, :3] = INK; out[ring, 3] = 255
    return Image.fromarray(out, "RGBA")


def players_layer(c: Comp, breath: int) -> tuple[Image.Image, list]:
    """The two foreground players and the ball on the centre spot."""
    layer = Image.new("RGBA", (c.w, c.h), (0, 0, 0, 0))
    boxes = []
    items = []
    for p in c.players:
        hpx = max(24, int(round(c.f * 1.8 / p.z)))
        px_, ground = figure(hpx, KITS[p.team], p.skin, p.hair, p.style, "stand", breath=breath)
        sprite = Image.fromarray(px_ if p.facing > 0 else np.ascontiguousarray(px_[:, ::-1]), "RGBA")
        fx, fy = c.project(p.x, 0, p.z)
        items.append((p.z, sprite, int(round(fx - sprite.width / 2)), int(round(fy)) - ground))
    bz = SPOT_Z
    bd = max(5, int(round(c.f * 0.22 / bz)))
    bx, by = c.project(0, 0.11, bz)
    items.append((bz, ball_sprite(bd), int(round(bx - (bd + 2) / 2)), int(round(by - (bd + 2) / 2))))
    for z, sprite, x, y in sorted(items, key=lambda it: -it[0]):
        layer.alpha_composite(sprite, (x, y))
        boxes.append([x, y, sprite.width, sprite.height])
    return layer, boxes


FIELD_FRAMES = 6       # stand (2 breaths), run (4); each facing right, then the same facing left


def field_sheet(c: Comp):
    """The players up the pitch as one sprite sheet, a row each (furthest first), with where and how they move."""
    rows, entries = [], []
    for i, fp in enumerate(FIELD):
        ppm = c.f / fp.z
        h = max(9, int(round(ppm * 1.8)))
        sx, sy = c.project(fp.x, 0, fp.z)
        reach = ppm * fp.range + h
        if sx + reach < 0 or sx - reach > c.w:
            continue
        flag = fp.team == "AR"
        frames, ground = [], 0
        for k in range(FIELD_FRAMES):
            pose, phase, breath = ("stand", 0, k) if k < 2 else ("run", k - 2, 0)
            px_, ground = figure(h, KITS[fp.team], fp.skin, fp.hair, fp.style, pose, phase, breath, flag)
            frames.append(px_)
        frames += [np.ascontiguousarray(f[:, ::-1]) for f in frames]
        alpha = np.any([f[:, :, 3] > 0 for f in frames], axis=0)
        ys, xs = np.nonzero(alpha)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        cells = [f[y0:y1, x0:x1] for f in frames]
        cw, ch = x1 - x0, y1 - y0
        rows.append(np.concatenate(cells, axis=1))
        entries.append(dict(z=fp.z, home=fp.x, range=fp.range, speed=fp.speed, seed=i + 1, ppm=round(ppm, 3),
                            feet=[round(sx, 2), int(round(sy))], cell=[0, 0, int(cw), int(ch)],
                            anchor=[round(frames[0].shape[1] / 2 - x0, 1), int(ground - y0)], kind=fp.team))
    order = sorted(range(len(entries)), key=lambda j: -entries[j]["z"])
    width = max(r.shape[1] for r in rows)
    height = sum(r.shape[0] for r in rows)
    sheet = np.zeros((height, width, 4), dtype=np.uint8)
    y, out = 0, []
    for j in order:
        r = rows[j]
        sheet[y:y + r.shape[0], :r.shape[1]] = r
        entries[j]["cell"][1] = y
        out.append(entries[j])
        y += r.shape[0]
    return Image.fromarray(sheet, "RGBA"), out


def front_layer(c: Comp, frame: int, rnd_seed: int) -> Image.Image:
    """Blades of grass right in front of the lens along the bottom edge, darker and bigger than the pitch."""
    rnd = random.Random(rnd_seed)
    out = np.zeros((c.h, c.w, 4), dtype=np.uint8)
    base = c.h
    T = threshold(c.h, c.w)
    for _ in range(int(c.w * 0.9)):
        x = rnd.random() * c.w
        hgt = 3 + rnd.random() ** 2 * c.view_h * 0.07
        lean = (rnd.random() - 0.5) * 0.5 + (0.12 if frame else 0)
        shade = rnd.random()
        for k in range(int(hgt)):
            s = k / hgt
            xx = int(x + lean * k * (0.4 + s))
            yy = base - 1 - k
            if 0 <= xx < c.w and 0 <= yy < c.h:
                v = 0.12 + 0.35 * s * shade + (0.25 if s > 0.85 and shade > 0.6 else 0)
                out[yy, xx, :3] = ramp(GRASS, np.array([[v]]), T[yy:yy + 1, xx:xx + 1])[0, 0]
                out[yy, xx, 3] = 255
                if s < 0.5 and xx + 1 < c.w and not out[yy, xx + 1, 3]:
                    out[yy, xx + 1, :3] = GRASS[0]; out[yy, xx + 1, 3] = 255
    return Image.fromarray(out, "RGBA")


def light_layers(c: Comp, lamps: list) -> tuple[Image.Image, Image.Image]:
    """Additive light: halos around every lamp (glow) and shafts from the pylons and the roof down to the pitch."""
    H, W = c.h, c.w
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    glow = np.zeros((H, W, 3))
    for (x, y, r, k) in lamps:
        d = np.hypot(xx - x, (yy - y) * 1.15) / r
        glow += k * np.exp(-d * d * 2.2)[..., None] * np.array([1.0, 0.86, 0.6])
    beams = np.zeros((H, W, 3))
    pitch_y = c.project(0, 0, 25)[1]
    for (x, y, r, k) in lamps:
        if r < 10:
            continue
        for tx in np.linspace(c.w * 0.15, c.w * 0.85, 3):
            ax, ay = tx - x, pitch_y - y
            L = math.hypot(ax, ay)
            u = ((xx - x) * ax + (yy - y) * ay) / L
            v = np.abs((xx - x) * ay - (yy - y) * ax) / L
            width = 2 + u * 0.12
            m = (u > 0) & (u < L) & (v < width)
            beams += (m * np.clip(1 - u / L, 0, 1) * np.clip(1 - v / width, 0, 1) * 0.35)[..., None] * np.array([1.0, 0.9, 0.7])

    def to_img(a):
        a = np.clip(a, 0, 1)
        alpha = np.clip(a.max(axis=2), 0, 1)
        rgb = np.where(alpha[..., None] > 0, a / np.maximum(alpha[..., None], 1e-6), 0)
        return Image.fromarray(np.dstack([rgb * 255, alpha * 255]).astype(np.uint8), "RGBA")
    return to_img(glow), to_img(beams)


# ---------------------------------------------------------------- compositions
def wide() -> Comp:
    return Comp("wide", 480, 300, f=240, horizon=0.62, pylons=[(-82, 115, 86), (82, 115, 86)], focus=(0.5, 0.6), seed=7, players=[
        Player(-2.95, 5.0, "A", +1, skin=0, hair=0, style="short"),
        Player(3.0, 4.8, "B", -1, skin=2, hair=1, style="swept")])


def tall() -> Comp:
    # Phones: the content panel covers the middle of the screen, so the floodlights, roof and crowd sit in the top
    # band and the pitch fills the bottom; the camera is a step left of the halfway line, so it runs diagonally.
    return Comp("tall", 234, 506, f=170, horizon=0.36, pylons=[(-46, 115, 108), (46, 115, 108)], focus=(0.5, 0.4), seed=11,
                cam_x=-1.1, players=[Player(-3.4, 5.2, "A", +1, skin=0, hair=0, style="short"),
                                     Player(1.4, 4.9, "B", -1, skin=2, hair=1, style="swept")])


def save(arr: np.ndarray, path: Path, mode: str | None = None):
    Image.fromarray(arr, mode).save(path, optimize=True)


def build(c: Comp) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(c.seed)
    img, sky_img, clouds, stars, depth, mat, X, Y, ribbon_masks = render(c, rnd)
    ground = mat == M_GROUND
    sky = mat == M_SKY
    # back layer: everything but the ground; below the boards, keep the dark apron so parallax never shows a hole
    back = img.copy()
    back[ground] = APRON[1]
    lamps = draw_pylons(back, depth, c)
    lamps += draw_fascia_lamps(back, mat, c)
    draw_banners(back, mat, c, rnd)
    fans, flags, flares = crowd(c, rnd)
    frames = []
    for k in range(5):
        fr = back.copy()
        draw_fans(fr, depth, fans, k)
        draw_flags(fr, depth, c, flags, k)
        frames.append(fr)
    name = c.name

    # the LEDs: one tiling strip each, scrolled by the site underneath holes in the back layer
    leds = [mat == M_BOARD] + ribbon_masks
    strips, ribbons, sy = [], [], 0
    for mask, (words, cols, speed) in zip(leds, LED_TEXT):
        ys = np.where(mask.any(axis=1))[0]
        if not len(ys):
            continue
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        strip = led_strip(y1 - y0, words, cols)
        strips.append(strip)
        ribbons.append(dict(y=y0, h=y1 - y0, sy=sy, period=strip.shape[1], speed=speed))
        sy += y1 - y0
    sheet = np.zeros((sy, max(s.shape[1] for s in strips), 3), dtype=np.uint8)
    for s, r in zip(strips, ribbons):
        sheet[r["sy"]:r["sy"] + r["h"], :s.shape[1]] = s
    save(sheet, OUT / f"{name}-strips.png")
    led_any = np.any(leds, axis=0)
    covered = np.any(frames[0] != back, axis=2)               # supporters and flags in front of an LED stay opaque

    base = np.dstack([frames[0], np.full((c.h, c.w), 255, dtype=np.uint8)])
    hole = (sky & ~covered) | (led_any & ~covered)
    base[hole, 3] = 0
    # the pylons are drawn into the sky: keep them
    pylon = sky & np.any(back != img, axis=2)
    base[pylon & ~covered, 3] = 255
    save(base, OUT / f"{name}-back.png", "RGBA")
    for k in range(1, 5):
        diff = np.any(frames[k] != frames[0], axis=2)
        rgba = np.zeros((c.h, c.w, 4), dtype=np.uint8)
        rgba[diff, :3] = frames[k][diff]; rgba[diff, 3] = 255
        save(rgba, OUT / f"{name}-crowd-{k}.png", "RGBA")
    save(sky_img, OUT / f"{name}-sky.png")
    save(clouds, OUT / f"{name}-clouds.png", "RGBA")
    pitch = np.zeros((c.h, c.w, 4), dtype=np.uint8)
    pitch[ground, :3] = img[ground]; pitch[ground, 3] = 255
    save(pitch, OUT / f"{name}-pitch.png", "RGBA")
    boxes = []
    for k in range(2):
        layer, boxes = players_layer(c, k)
        layer.save(OUT / f"{name}-players-{k + 1}.png", optimize=True)
    fsheet, field = field_sheet(c)
    fsheet.save(OUT / f"{name}-field.png", optimize=True)
    for k in range(2):
        front_layer(c, k, c.seed * 31).save(OUT / f"{name}-front-{k + 1}.png", optimize=True)
    glow, beams = light_layers(c, lamps)
    glow.save(OUT / f"{name}-glow.png", optimize=True); beams.save(OUT / f"{name}-beams.png", optimize=True)
    seats = [(f.x, f.y, f.w) for f in fans]
    rs = random.Random(c.seed + 99)
    sample = rs.sample(seats, min(500, len(seats)))
    meta = {"w": c.w, "h": c.h, "view": [c.margin[0], c.margin[1], c.view_w, c.view_h], "focus": list(c.focus),
            "margin": list(c.margin), "horizon": c.cy,
            "lamps": [[round(a, 1), round(b, 1), round(r, 1), k] for a, b, r, k in lamps],
            "seats": [[x, y, w] for x, y, w in sample], "players": boxes,
            "stars": stars, "ribbons": ribbons, "flares": [[x, y] for x, y in flares], "field": field}
    (OUT / f"{name}.json").write_text(json.dumps(meta, separators=(",", ":")))
    still(c, meta).save(OUT / f"{name}-still.png", optimize=True)
    return meta


def still(c: Comp, meta: dict, crowd_frame: int = 0) -> Image.Image:
    """The scene at rest, as one picture: what the site shows before anything moves (and the tunnel's walkout)."""
    L = lambda n: Image.open(OUT / f"{c.name}-{n}.png").convert("RGBA")
    im = L("sky")
    px = im.load()
    for x, y, b in meta["stars"]:
        px[x, y] = tuple(int(v) for v in STAR[b]) + (255,)
    im.alpha_composite(L("clouds"))
    strips = L("strips")
    for r in meta["ribbons"]:
        tile = strips.crop((0, r["sy"], r["period"], r["sy"] + r["h"]))
        for x in range(0, c.w, r["period"]):
            im.alpha_composite(tile, (x, r["y"]))
    im.alpha_composite(L("back"))
    if crowd_frame:
        im.alpha_composite(L(f"crowd-{crowd_frame}"))
    im.alpha_composite(L("pitch"))
    sheet = L("field")
    for p in meta["field"]:
        x, y, w, h = p["cell"]
        cell = sheet.crop((x, y, x + w, y + h))
        sx = int(round(p["feet"][0] - p["anchor"][0]))
        sy = p["feet"][1] - p["anchor"][1]
        im.alpha_composite(cell, (sx, sy)) if sx >= 0 and sy >= 0 else im.paste(cell, (sx, sy), cell)
    im.alpha_composite(L("players-1"))
    return im


def composite(c: Comp, meta: dict, k: int = 0) -> Image.Image:
    """The scene as the site shows it (for previews): the still picture plus the grass in front and the light."""
    im = still(c, meta, k)
    im.alpha_composite(Image.open(OUT / f"{c.name}-front-1.png"))
    base = np.asarray(im).astype(float)
    for layer, strength in (("glow", 0.9), ("beams", 0.5)):
        L = np.asarray(Image.open(OUT / f"{c.name}-{layer}.png")).astype(float)
        base[..., :3] += L[..., :3] * (L[..., 3:] / 255) * strength
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def social_preview(meta: dict):
    """og.png (1200x630) for link previews: the wide scene at 3x, cropped, with the logo on the sky."""
    from make_art import logo
    c = wide()
    im = composite(c, meta, 1).resize((c.w * 3, c.h * 3), Image.NEAREST)
    lg = logo().im
    big = lg.resize((lg.width * 5, lg.height * 5), Image.NEAREST)
    x0 = (im.width - 1200) // 2
    roof = c.project(0, ROOF_Y + FASCIA_H, ROOF_Z0)[1] * 3
    y0 = int(max(0, min(roof - big.height - 34, im.height - 630)))      # the logo sits on the sky above the roof
    og = im.crop((x0, y0, x0 + 1200, y0 + 630)).convert("RGBA")
    og.alpha_composite(big, ((1200 - big.width) // 2, 14))
    og.convert("RGB").save(ROOT / "web" / "public" / "art" / "og.png")


def main():
    metas = {}
    for c in (wide(), tall()):
        metas[c.name] = build(c)
        k = 4 if c.name == "wide" else 3
        composite(c, metas[c.name]).resize((c.w * k, c.h * k), Image.NEAREST).save(ROOT / "art" / f"scene-{c.name}-preview.png")
    social_preview(metas["wide"])
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
