"""The matchday scene behind the whole site (specs: docs/superpowers/specs/2026-10-16-matchday-scene-design.md,
2026-10-17-scene-2-design.md and 2026-10-18-scene-3-design.md).

A stadium bowl at sunset, ray-marched one ray per pixel. The camera stands low on the pitch just behind the centre
spot, tilted up, looking down the pitch at the far goal: four raked tiers wrap all the way round (a rounded rectangle
in plan), each tier fronted by an LED ribbon with a row of warm lights under it, a roof ring with a lamp-lined fascia
and lattice masts on top, two big video screens in the far corners, LED boards round the pitch. Every surface is
shaded from hand-picked colour ramps with ordered dithering, so it reads as pixel art. Supporters, flags, the goal and
the (invented, generic) players are pixel sprites placed with the same camera, so every layer lines up.

Run:  ~/.venvs/cadquery/bin/python art/scene.py      (numpy + Pillow; writes web/public/art/scene/)

Layers per composition (wide 640x400 for desktop, tall 300x640 for phones), each drawn with a margin for parallax:
  sky             the sunset gradient (opaque); the site twinkles the stars from the JSON on top of it
  clouds          sunset-lit clouds (transparent); the site drifts them sideways, wrapping around
  ledmap          where every LED pixel is: which board or screen (B), and its texel there (R, G)
  strips          the boards' text, one tiling strip each, then the video screens' pictures. The site paints the LEDs
                  from these through the ledmap, scrolling the boards and cycling the screens
  back            masts, roof, stands, crowd (frame 0), banners; transparent sky and LED holes
  crowd-1..4      only the pixels that change in each crowd frame; 4 is everyone up, for the Mexican wave
  pitch           the grass, its markings, the goal and the foreground players' shadows
  field           a sprite sheet of the players up the pitch (standing, 2 breaths; running, 4 frames; facing right then
                  left); the site moves them
  players-1..2    the two foreground players and the ball (breathing in / out)
  front-1..2      grass blades along the bottom edge (swaying)
  glow, beams     soft light (lamp halos and starbursts, light shafts) drawn additively by the site
  still           everything at rest in one picture (the tunnel walkout lands on it)
  <name>.json     sizes, the visible window, a focus point, lamps, seats, stars, LEDs, screens, flares, field players
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

from figures import KITS, ball_sprite, figure, hexes, shade1

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "art" / "scene"

# ---------------------------------------------------------------- palette (hue-shifted ramps, dark -> light)
SKY = hexes("#05061a", "#0a0c28", "#121436", "#1c1b46", "#2a2152", "#3e275c", "#582d62", "#7a3562", "#a0405c",
            "#c85452", "#e8724a", "#f8985a")
STAR = hexes("#8a8cc0", "#cfd0f4", "#ffffff")
CLOUD = hexes("#120f2a", "#1c1838", "#2a1f48", "#3c2656", "#562c5c", "#7c345c", "#a84452", "#d4603e", "#f28a40",
              "#ffb45a", "#ffdc8c")
ROOF = hexes("#05050d", "#0b0b1a", "#131428", "#1c1e38", "#282a4c")
CONCRETE = hexes("#0d0d1c", "#17172c", "#22223e", "#302e52", "#423e66", "#5a5278")
SEAT_RAMP = hexes("#0c0d22", "#141634", "#1d1f46", "#282a58", "#3a3462", "#58405e")
GRASS = hexes("#0b3010", "#0f3d15", "#144c1a", "#1a5c20", "#216e27", "#29822e", "#339536", "#40a83e", "#52b848",
              "#6cc856", "#8cd86a")
APRON = hexes("#092409", "#0d2f0f", "#123b14", "#174819")
LINE = hexes("#9fb0a4", "#c6d4ca", "#e6efe8", "#fbfefb")
LED_BG = hexes("#05050c", "#0b0b18")
LED = {"gold": hexes("#6a4810", "#ffc848"), "cyan": hexes("#145466", "#5ae0ff"), "red": hexes("#6a1c18", "#ff5a48"),
       "white": hexes("#56586a", "#f0f2ff")}
LAMP = hexes("#ffd89a", "#fff2d8", "#ffffff")
WARM = hexes("#ff9a3c", "#ffc070", "#ffe6b8")
BLUE_LAMP = hexes("#3a6aff", "#8ab4ff", "#e6f0ff")
STEEL = hexes("#07070f", "#10101e", "#1a1a30", "#272844", "#38395a", "#4e4f72")
HAZE = hexes("#2a1f44", "#3a2650", "#4c2c58")
SKIN_TONES = [hexes("#7a4c30", "#a8714c", "#d9a57a", "#f2c9a0"), hexes("#4a2c1a", "#70452a", "#9a6440", "#c08458"),
              hexes("#5c3a24", "#8a5a3a", "#b8805a", "#e0ac80"), hexes("#2e1a10", "#4a2c1a", "#6c4228", "#8e5c3a")]
HAIR_TONES = [hexes("#120c0a", "#24160e", "#3a2418"), hexes("#2e1c10", "#5a3a20", "#8a5a32"),
              hexes("#0c0a0e", "#18141a", "#2a2430"), hexes("#5a4a2a", "#8a7440", "#b89c5a")]
NEUTRAL = [hexes("#121430", "#1e2244", "#30365a"), hexes("#201e26", "#34323e", "#4c4a58"), hexes("#2e2416", "#503e22", "#76603a")]
FLAGS = {"A": (KITS["A"]["shirt"], KITS["A"]["alt"], KITS["A"]["shirt"]),        # three stripes in the teams' colours
         "B": (KITS["B"]["shirt"], KITS["B"]["alt"], KITS["B"]["shirt"])}

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


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def hash01(*a) -> np.ndarray:
    """Cheap deterministic noise in 0..1 from integer grids."""
    h = np.zeros_like(np.asarray(a[0]), dtype=np.uint64)
    for i, v in enumerate(a):
        h ^= (np.asarray(v).astype(np.int64).astype(np.uint64) + np.uint64(0x9E3779B97F4A7C15 + i)) * np.uint64(0xBF58476D1CE4E5B9)
        h ^= h >> np.uint64(29)
    return (h % np.uint64(10007)).astype(float) / 10007


def fbm(px: np.ndarray, py: np.ndarray, width: int, cell: float, octaves: int, seed: int, stretch: float = 1.0) -> np.ndarray:
    """Fractal value noise (0..1) over pixel coordinates, periodic across `width` so it wraps sideways."""
    rng = np.random.default_rng(seed)
    total = np.zeros_like(px, dtype=float)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        period = max(1, int(round(width / (cell * stretch / 2 ** o))))
        cx = width / period
        cy = cell / 2 ** o
        gh = int(np.ceil((py.max() + 2) / cy)) + 2
        G = rng.random((gh, period))
        fx, fy = px / cx, py / cy
        x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
        tx, ty = fx - x0, fy - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        xa, xb = x0 % period, (x0 + 1) % period
        ya, yb = np.clip(y0, 0, gh - 1), np.clip(y0 + 1, 0, gh - 1)
        a, b, c_, d = G[ya, xa], G[ya, xb], G[yb, xa], G[yb, xb]
        total += amp * (a + (b - a) * tx + (c_ - a) * ty + (a - b - c_ + d) * tx * ty)
        norm += amp
        amp *= 0.5
    return total / norm


# ---------------------------------------------------------------- the pitch and the bowl (metres)
# The camera stands at x=0, z=0, a little behind the centre spot; z runs down the pitch to the far goal, x across it.
SPOT_Z = 9.0
PITCH_HW, PITCH_HL = 34.0, 52.5
GOAL_Z = SPOT_Z + PITCH_HL                      # the far goal line
BOWL_HX, BOWL_HZ, BOWL_R = 40.0, 59.5, 16.0     # the stands' inner edge: a rounded rectangle round the centre spot
A_, B_ = BOWL_HX - BOWL_R, BOWL_HZ - BOWL_R     # half-lengths of its straight parts
BOARD_D, BOARD_H = -3.4, 1.35                   # LED boards round the pitch, this far inside the stands' edge
WALL_H = 1.6
ROW, SEAT = 0.8, 0.55
AISLE_EVERY, AISLE_W = 14.0, 1.2
VOM_EVERY, VOM_W, VOM_ROWS = 28.0, 3.4, (5, 8)
TIER_SPEC = ((0.0, 13.0, 32), (13.0, 25.0, 36), (25.0, 37.0, 39), (37.0, 50.0, 42))   # d0, d1, rake (degrees)
BAND_GAP, BAND_RIBBON, BAND_RAIL = 1.6, 2.4, 0.4
TIER_LIGHT = ((0.6, 0.42), (0.56, 0.38), (0.52, 0.34), (0.48, 0.28))   # crowd light at the front and back row
LED_ROWS = 7                                    # LED text texels across a board: 5 for the letters, 1 above and below


@dataclass(frozen=True)
class Tier:
    d0: float
    d1: float
    y0: float
    k: float

    @property
    def y1(self) -> float:
        return self.y0 + (self.d1 - self.d0) * self.k


@dataclass(frozen=True)
class Band:
    d: float
    y0: float
    y1: float
    ribbon: tuple[float, float]


def stadium():
    tiers, bands = [], []
    y0 = WALL_H
    for i, (d0, d1, deg) in enumerate(TIER_SPEC):
        t = Tier(d0, d1, y0, math.tan(math.radians(deg)))
        tiers.append(t)
        if i < len(TIER_SPEC) - 1:
            r0 = t.y1 + BAND_GAP
            r1 = r0 + BAND_RIBBON
            bands.append(Band(d1, t.y1, r1 + BAND_RAIL, (r0, r1)))
            y0 = r1 + BAND_RAIL
    return tiers, bands


TIERS, BANDS = stadium()
TOP = TIERS[-1]
D_BACK = TOP.d1
ROOF_Y = TOP.y1 + 5.0
ROOF_D0, ROOF_D1, FASCIA_H = TOP.d0 + 2.0, D_BACK + 3.0, 3.4
Y_TOP = ROOF_Y + FASCIA_H + 0.5
MAST_H = 15.0
M_SKY, M_GROUND, M_BOARD, M_WALL, M_ROOF, M_FASCIA, M_BACKWALL = 0, 1, 2, 3, 7, 8, 9
M_TIER, M_BAND, M_SCREEN = 10, 20, 30


def sdf(x, z):
    """Signed distance (metres, in plan) from the stands' inner edge: negative on the pitch side, positive in the stands."""
    qx = np.abs(x) - A_
    qz = np.abs(z - SPOT_Z) - B_
    return np.hypot(np.maximum(qx, 0), np.maximum(qz, 0)) + np.minimum(np.maximum(qx, qz), 0) - BOWL_R


def perimeter(d: float) -> float:
    return 4 * A_ + 4 * B_ + 2 * math.pi * (BOWL_R + d)


def contour_s(x, z, d: float):
    """How far round the bowl (metres along the contour `d` out from the inner edge) the point (x, z) is, starting
    behind the camera and running left, so it reads left to right across the far end."""
    zz = z - SPOT_Z
    r = BOWL_R + d
    a, b = A_, B_
    s = np.zeros_like(x, dtype=float)
    near, far = zz < -b, zz > b
    left, right = x < -a, x > a
    mid_x, mid_z = ~left & ~right, ~near & ~far
    s = np.where(near & mid_x & (x <= 0), -x, s)
    s = np.where(near & mid_x & (x > 0), perimeter(d) - x, s)
    s = np.where(near & left, a + r * (-math.pi / 2 - np.arctan2(zz + b, x + a)), s)
    s = np.where(left & mid_z, a + r * math.pi / 2 + (zz + b), s)
    s = np.where(far & left, a + r * math.pi / 2 + 2 * b + r * (math.pi - np.arctan2(zz - b, x + a)), s)
    s = np.where(far & mid_x, a + r * math.pi + 2 * b + (x + a), s)
    s = np.where(far & right, 3 * a + r * math.pi + 2 * b + r * (math.pi / 2 - np.arctan2(zz - b, x - a)), s)
    s = np.where(right & mid_z, 3 * a + 1.5 * r * math.pi + 2 * b + (b - zz), s)
    s = np.where(near & right, 3 * a + 1.5 * r * math.pi + 4 * b + r * (-np.arctan2(zz + b, x - a)), s)
    return s


def contour_point(s, d: float):
    """The point (x, z) at `s` along the contour `d` out from the inner edge (the inverse of contour_s)."""
    s = np.mod(np.asarray(s, dtype=float), perimeter(d))
    r = BOWL_R + d
    a, b = A_, B_
    q = r * math.pi / 2
    edges = np.cumsum([0, a, q, 2 * b, q, 2 * a, q, 2 * b, q, a])
    x = np.zeros_like(s); zz = np.zeros_like(s)
    k = np.clip(np.searchsorted(edges, s, side="right") - 1, 0, 8)
    u = s - edges[k]
    segs = [
        (lambda u: -u, lambda u: -b - r + 0 * u),
        (lambda u: -a + r * np.cos(-math.pi / 2 - u / r), lambda u: -b + r * np.sin(-math.pi / 2 - u / r)),
        (lambda u: -a - r + 0 * u, lambda u: -b + u),
        (lambda u: -a + r * np.cos(math.pi - u / r), lambda u: b + r * np.sin(math.pi - u / r)),
        (lambda u: -a + u, lambda u: b + r + 0 * u),
        (lambda u: a + r * np.cos(math.pi / 2 - u / r), lambda u: b + r * np.sin(math.pi / 2 - u / r)),
        (lambda u: a + r + 0 * u, lambda u: b - u),
        (lambda u: a + r * np.cos(-u / r), lambda u: -b + r * np.sin(-u / r)),
        (lambda u: a - u, lambda u: -b - r + 0 * u),
    ]
    for seg, (fx, fz) in enumerate(segs):
        m = k == seg
        x[m] = fx(u[m]); zz[m] = fz(u[m])
    return x, zz + SPOT_Z


def height(d):
    """The stands' surface height on the contour `d` out from the inner edge (the heightfield the rays march against)."""
    h = np.full_like(d, -1e9, dtype=float)
    for t in TIERS:
        h = np.where((d >= t.d0) & (d < t.d1), t.y0 + (d - t.d0) * t.k, h)
    return np.where(d >= D_BACK, ROOF_Y, h)


def is_aisle(s):
    return np.abs(((s + AISLE_EVERY / 2) % AISLE_EVERY) - AISLE_EVERY / 2) < AISLE_W / 2


def is_vom(s, i: int):
    off = (VOM_EVERY / 2) * (i % 2)
    return np.abs(((s + VOM_EVERY / 2 + off) % VOM_EVERY) - VOM_EVERY / 2) < VOM_W / 2


@dataclass(frozen=True)
class Screen:
    """A video screen in a far corner, facing the pitch."""
    cx: float
    cy: float
    cz: float
    w: float
    h: float
    texels: tuple[int, int] = (48, 27)

    def basis(self):
        n = np.array([-self.cx, 0.0, SPOT_Z + 22 - self.cz])
        n /= np.linalg.norm(n)                                     # faces the pitch
        up = np.array([0.0, 1.0, 0.0])
        right = np.cross(up, -n)
        return n, right / np.linalg.norm(right), up


def corner(d: float, deg: float, side: int):
    r = BOWL_R + d
    return side * (A_ + r * math.cos(math.radians(deg))), SPOT_Z + B_ + r * math.sin(math.radians(deg))


SCREENS = [Screen(corner(23.0, 48, s)[0], 31.0, corner(23.0, 48, s)[1], 21.0, 11.8) for s in (-1, 1)]


@dataclass
class Player:
    """One of the two foreground players."""
    x: float
    z: float
    team: str
    facing: int
    skin: int
    hair: int
    style: str


@dataclass
class FieldPlayer:
    """Someone further up the pitch, whom the site moves: jogs to a new spot within `range` metres of home now and
    then (across the pitch), at `speed` metres a second."""
    x: float
    z: float
    team: str            # "A", "B", "GK", "REF" or "AR"
    skin: int
    hair: int
    style: str
    range: float
    speed: float


# The far team lined up for kick-off (4-4-2 in front of their keeper), the referee by the circle and his assistant on
# the touchline. Our team is behind the camera, but for the two at the ball.
FIELD = [
    FieldPlayer(0.0, GOAL_Z - 1.6, "GK", 1, 0, "short", 1.6, 1.4),
    FieldPlayer(-21.0, 47.0, "B", 0, 1, "short", 3.5, 2.6),
    FieldPlayer(-7.5, 48.5, "B", 3, 2, "swept", 2.5, 2.2),
    FieldPlayer(7.0, 48.0, "B", 2, 0, "short", 2.5, 2.2),
    FieldPlayer(21.5, 46.5, "B", 1, 3, "swept", 3.5, 2.6),
    FieldPlayer(-24.0, 33.0, "B", 2, 1, "short", 4.0, 2.9),
    FieldPlayer(-9.0, 34.5, "B", 0, 2, "swept", 3.5, 2.8),
    FieldPlayer(9.5, 33.5, "B", 3, 0, "short", 3.5, 2.8),
    FieldPlayer(24.5, 32.5, "B", 1, 1, "short", 4.0, 2.9),
    FieldPlayer(-10.5, 20.0, "B", 2, 3, "swept", 3.0, 2.6),
    FieldPlayer(11.0, 19.5, "B", 0, 0, "short", 3.0, 2.6),
    FieldPlayer(-5.5, 15.0, "REF", 1, 2, "short", 3.0, 1.8),
    FieldPlayer(-34.6, 46.0, "AR", 2, 0, "short", 0.6, 1.2),
]


@dataclass
class Comp:
    name: str
    view_w: int
    view_h: int
    f: float                       # focal length in pixels
    pitch: float                   # how far the camera tilts up (degrees)
    eye: float = 1.6
    cam_x: float = 0.0
    cam_z: float = 0.0
    margin: tuple[int, int] = (16, 14)
    players: list[Player] = field(default_factory=list)
    focus: tuple[float, float] = (0.5, 0.55)
    seed: int = 7

    @property
    def w(self): return self.view_w + 2 * self.margin[0]

    @property
    def h(self): return self.view_h + 2 * self.margin[1]

    @property
    def cx(self): return self.w / 2

    @property
    def cy(self): return self.h / 2

    @property
    def horizon(self): return self.cy + self.f * math.tan(math.radians(self.pitch))

    def basis(self):
        p = math.radians(self.pitch)
        return np.array([1.0, 0, 0]), np.array([0, math.cos(p), -math.sin(p)]), np.array([0, math.sin(p), math.cos(p)])

    def project(self, x, y, z):
        """World point -> screen x, y and camera depth."""
        _, U, F = self.basis()
        rx, ry, rz = np.asarray(x, dtype=float) - self.cam_x, np.asarray(y, dtype=float) - self.eye, np.asarray(z, dtype=float) - self.cam_z
        yc, zc = ry * U[1] + rz * U[2], ry * F[1] + rz * F[2]
        return self.cx + self.f * rx / zc, self.cy - self.f * yc / zc, zc

    def dist(self, x, y, z):
        return np.sqrt((np.asarray(x) - self.cam_x) ** 2 + (np.asarray(y) - self.eye) ** 2 + (np.asarray(z) - self.cam_z) ** 2)


# ---------------------------------------------------------------- ray marching
def raycast(c: Comp):
    """March one ray per pixel through the bowl. Returns per pixel: distance (inf for sky), material, hit point,
    contour distance d, the screens' texel coordinates and the ray's direction."""
    H, W = c.h, c.w
    py, px = np.mgrid[0:H, 0:W].astype(float) + 0.5
    sx, sy = ((px - c.cx) / c.f).ravel(), ((c.cy - py) / c.f).ravel()
    R, U, F = c.basis()
    D = np.stack([R[i] * sx + U[i] * sy + F[i] for i in range(3)], axis=1)
    D /= np.linalg.norm(D, axis=1, keepdims=True)
    dx, dy, dz = D[:, 0], D[:, 1], D[:, 2]
    ox, oy, oz = c.cam_x, c.eye, c.cam_z
    n = len(dx)
    T = np.full(n, np.inf)
    M = np.zeros(n, dtype=np.int16)
    with np.errstate(divide="ignore"):
        tg = np.where(dy < -1e-9, oy / -dy, np.inf)
    hxz = np.hypot(dx, dz)

    # 1: sphere-trace (in plan) out to the boards
    t = np.zeros(n)
    for _ in range(80):
        d = sdf(ox + t * dx, oz + t * dz)
        t = np.minimum(t + np.clip((BOARD_D - d) / np.maximum(hxz, 1e-6), 0, None), tg)
    y = oy + t * dy
    ground = t >= tg - 1e-6
    T[ground], M[ground] = tg[ground], M_GROUND
    board = ~ground & (y <= BOARD_H) & (y >= 0)
    T[board], M[board] = t[board], M_BOARD

    # 2: march on through the stands, checking each step for the stands' surface, the fascia and the roof's underside
    idx = np.nonzero(~ground & ~board & (hxz > 1e-4))[0]
    tt = t[idx]
    pd = sdf(ox + tt * dx[idx], oz + tt * dz[idx])
    pyy = oy + tt * dy[idx]
    kinds = np.array([M_GROUND, M_FASCIA, M_ROOF, M_TIER])
    for _ in range(800):
        if not len(idx):
            break
        step = np.clip(0.008 * tt, 0.2, 1.6)
        tn = tt + step
        x, z = ox + tn * dx[idx], oz + tn * dz[idx]
        yv = oy + tn * dy[idx]
        d = sdf(x, z)
        h = height(d)
        cand = np.full((4, len(idx)), np.inf)
        g = tn >= tg[idx]
        cand[0][g] = tg[idx][g]
        with np.errstate(divide="ignore", invalid="ignore"):
            cf = (pd < ROOF_D0) & (d >= ROOF_D0)
            fr = (ROOF_D0 - pd) / (d - pd)
            yc = pyy + fr * (yv - pyy)
            cand[1] = np.where(cf & (yc >= ROOF_Y) & (yc <= ROOF_Y + FASCIA_H), tt + fr * step, np.inf)
            cu = (pyy < ROOF_Y) & (yv >= ROOF_Y)
            fu = (ROOF_Y - pyy) / (yv - pyy)
            dc = pd + fu * (d - pd)
            cand[2] = np.where(cu & (dc >= ROOF_D0) & (dc <= ROOF_D1), tt + fu * step, np.inf)
        st = (d >= 0) & (yv < h)
        if st.any():                                               # refine the stands' surface by bisection
            lo, hi = tt[st].copy(), tn[st].copy()
            ii = idx[st]
            for _ in range(14):
                mid = (lo + hi) / 2
                below = (oy + mid * dy[ii]) < height(sdf(ox + mid * dx[ii], oz + mid * dz[ii]))
                hi = np.where(below, mid, hi)
                lo = np.where(below, lo, mid)
            cand[3][st] = hi
        best = cand.min(axis=0)
        kind = cand.argmin(axis=0)
        hit = np.isfinite(best)
        sky = ~hit & (((yv > Y_TOP) & (dy[idx] > 0)) | (d > ROOF_D1 + 4) | (tn > 700))
        T[idx[hit]] = best[hit]
        M[idx[hit]] = kinds[kind[hit]]
        keep = ~hit & ~sky
        idx, tt, pd, pyy = idx[keep], tn[keep], d[keep], yv[keep]

    fin = np.isfinite(T)
    tz = np.where(fin, T, 0)
    X, Y, Z = ox + tz * dx, oy + tz * dy, oz + tz * dz
    Dd = sdf(X, Z)
    # classify the stands' hits: the front wall, the bands between tiers, the tiers, the wall behind the top tier
    st = M == M_TIER
    m = M.copy()
    m[st & (Dd < 0.06)] = M_WALL
    for i, b in enumerate(BANDS):
        m[st & (np.abs(Dd - b.d) < 0.06) & (Y > b.y0 - 0.05)] = M_BAND + i
    for i, tr in enumerate(TIERS):
        m[st & (m == M_TIER) & (Dd >= tr.d0) & (Dd < tr.d1)] = M_TIER + i
    m[st & (Dd >= D_BACK - 0.06)] = M_BACKWALL
    M = m
    # the video screens, in front of everything behind them
    SU = np.full(n, -1.0); SV = np.full(n, -1.0)
    o = np.array([ox, oy, oz])
    for k, sc in enumerate(SCREENS):
        nrm, right, up = sc.basis()
        cen = np.array([sc.cx, sc.cy, sc.cz])
        with np.errstate(divide="ignore", invalid="ignore"):
            ts = ((cen - o) @ nrm) / (D @ nrm)
        P = o + D * ts[:, None]
        u = (P - cen) @ right / sc.w + 0.5
        v = 0.5 - (P - cen) @ up / sc.h
        inside = (ts > 0) & (ts < T) & (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
        T[inside] = ts[inside]
        M[inside] = M_SCREEN + k
        SU[inside], SV[inside] = u[inside], v[inside]
        X[inside], Y[inside], Z[inside] = P[inside, 0], P[inside, 1], P[inside, 2]
    shape = (H, W)
    r = lambda a: a.reshape(shape)
    return r(T), r(M), r(X), r(Y), r(Z), r(Dd), r(SU), r(SV), r(dy), r(dx), px, py


# ---------------------------------------------------------------- shading
def render(c: Comp):
    T, M, X, Y, Z, Dd, SU, SV, DY, DX, px, py = raycast(c)
    H, W = c.h, c.w
    Th = threshold(H, W)
    img = np.zeros((H, W, 3), dtype=np.uint8)

    # --- the sky: deep blue overhead to sunset orange low down, warmest towards the sun (behind the far left corner)
    el = np.degrees(np.arcsin(np.clip(DY, -1, 1)))
    az = np.degrees(np.arctan2(DX, np.sqrt(np.maximum(1 - DX * DX - DY * DY, 1e-9))))
    sun = np.exp(-((az + 25) / 55) ** 2)
    sv_ = np.clip(1 - (el - 18) / 55, 0, 1) ** 1.6 * (0.75 + 0.25 * sun)
    sky_img = ramp(SKY, sv_, Th)
    sky = M == M_SKY
    img[sky] = sky_img[sky]
    # clouds: banks of fractal noise lit from below by the low sun (bright undersides, dark tops), wrapping sideways
    cn = fbm(px, py, W, cell=55, octaves=5, seed=c.seed + 3, stretch=3.2)
    below = fbm(px, py + 5, W, cell=55, octaves=5, seed=c.seed + 3, stretch=3.2)
    cover = 0.48 + 0.12 * np.clip((el - 30) / 40, 0, 1)
    dens = np.clip((cn - cover) / 0.22, 0, 1)
    lit = np.clip((cn - below) * 7 + 0.45, 0, 1)                   # density falling away below: a lit underside
    glowc = np.clip(1 - (el - 20) / 60, 0, 1)
    cv = np.clip(0.1 + 0.55 * lit * (0.45 + 0.55 * glowc) + 0.35 * glowc * sun + 0.15 * (1 - dens), 0, 1)
    clouds = np.zeros((H, W, 4), dtype=np.uint8)
    cm = dens > 0.08 + 0.5 * Th
    clouds[cm, :3] = ramp(CLOUD, cv, Th)[cm]
    clouds[cm, 3] = 255
    n1 = hash01((px // 1).astype(int), (py // 1).astype(int))
    st = sky & (el > 50) & (dens < 0.05) & (n1 > 0.985)
    ys, xs = np.nonzero(st)
    stars = [[int(x), int(y), int(2 if n1[y, x] > 0.997 else 1 if n1[y, x] > 0.992 else 0)] for y, x in zip(ys, xs)]

    # --- the ground: floodlit grass with mowing stripes across the pitch, the markings, the foreground players' shadows
    g = M == M_GROUND
    on_pitch = g & (np.abs(X) <= PITCH_HW) & (np.abs(Z - SPOT_Z) <= PITCH_HL)
    light = 0.52 + 0.25 * np.exp(-((Z - 30) / 26) ** 2) - 0.08 * np.clip((np.abs(X) - 20) / 20, 0, 1) - 0.1 * np.clip((8 - Z) / 8, 0, 1)
    stripe = ((np.floor((Z - SPOT_Z) / 5.25) % 2) == 0) * 0.09 + ((np.floor((X + 100) / 7.0) % 2) == 0) * 0.025
    fp = np.maximum.reduce([np.abs(np.gradient(X, axis=1)), np.abs(np.gradient(Z, axis=1)),
                            np.abs(np.gradient(X, axis=0)), np.abs(np.gradient(Z, axis=0))])
    fp = np.where(g, fp, 1)
    far = fp > 0.3
    texel = np.where(far, hash01(np.floor(X / 0.3).astype(int), np.floor(Z / 0.3).astype(int)),
                     hash01(px.astype(int) + 7, py.astype(int) + 13))
    grain = (texel - 0.5) * np.where(far, 0.16 * np.clip(0.3 / np.maximum(fp, 1e-6), 0, 1), 0.14)
    gv = np.clip(light + stripe + grain, 0, 1)
    shadows = player_shadows(c, X, Z)
    gv = gv - shadows
    img[on_pitch] = ramp(GRASS, gv, Th)[on_pitch]
    off = g & ~on_pitch
    img[off] = ramp(APRON, np.clip(gv * 0.85, 0, 1), Th)[off]
    w = np.maximum(0.06, 0.5 * fp)
    zz = Z - SPOT_Z
    lines = np.zeros_like(g)
    inside_x, inside_z = np.abs(X) <= PITCH_HW + w, np.abs(zz) <= PITCH_HL + w
    lines |= (np.abs(zz) < w) & inside_x                                                  # halfway line
    lines |= (np.abs(np.abs(X) - PITCH_HW) < w) & inside_z                                # touchlines
    lines |= (np.abs(np.abs(zz) - PITCH_HL) < w) & inside_x                               # goal lines
    lines |= np.abs(np.hypot(X, zz) - 9.15) < w                                           # centre circle
    lines |= np.hypot(X, zz) < np.maximum(0.22, 0.6 * fp)                                 # centre spot
    for sgn in (1, -1):
        gz = sgn * PITCH_HL
        dz_ = sgn * (gz - zz)                                                             # metres in from the goal line
        lines |= (np.abs(np.abs(X) - 20.16) < w) & (dz_ >= 0) & (dz_ <= 16.5)             # penalty area
        lines |= (np.abs(dz_ - 16.5) < w) & (np.abs(X) <= 20.16)
        lines |= (np.abs(np.abs(X) - 9.16) < w) & (dz_ >= 0) & (dz_ <= 5.5)               # goal area
        lines |= (np.abs(dz_ - 5.5) < w) & (np.abs(X) <= 9.16)
        lines |= np.hypot(X, dz_ - 11) < np.maximum(0.2, 0.6 * fp)                        # penalty spot
        lines |= (np.abs(np.hypot(X, dz_ - 11) - 9.15) < w) & (dz_ > 16.5)                # the D
        for sx_ in (1, -1):
            lines |= (np.abs(np.hypot(X - sx_ * PITCH_HW, zz - gz) - 1.0) < w) & (np.abs(X) <= PITCH_HW) & (np.abs(zz) <= PITCH_HL)
    lines &= g
    lv = np.clip(gv + 0.3, 0, 1) - shadows * 0.6
    img[lines] = ramp(LINE, lv, Th)[lines]

    # --- the stands
    w3 = M == M_WALL
    img[w3] = ramp(CONCRETE, np.full((H, W), 0.35) + (Y > WALL_H - 0.25) * 0.3, Th)[w3]
    S0 = contour_s(X, Z, 0.0)
    for i, tr in enumerate(TIERS):
        s_ = M == M_TIER + i
        if not s_.any():
            continue
        dd = np.where(s_, Dd, tr.d0)
        row = np.floor((dd - tr.d0) / ROW)
        rf = (dd - tr.d0) / ROW - row
        depth_v = 1 - (dd - tr.d0) / (tr.d1 - tr.d0)
        base = 0.42 - 0.03 * i + 0.22 * depth_v
        if i < len(TIERS) - 1:
            base = base + 0.25 * np.clip((dd - (tr.d1 - 4)) / 4, 0, 1)            # lit by the lamps under the band above
        else:
            base = base - 0.2 * np.clip((dd - ROOF_D0) / (tr.d1 - ROOF_D0), 0, 1)
        v_ = np.clip(base - 0.12 * (rf < 0.25), 0, 1)
        img[s_] = ramp(SEAT_RAMP, v_, Th)[s_]
        a = s_ & is_aisle(S0)
        img[a] = ramp(CONCRETE, np.clip(v_ + 0.12 * (rf > 0.5), 0, 1), Th)[a]
        vom = s_ & is_vom(S0, i) & (row >= VOM_ROWS[0]) & (row < VOM_ROWS[1])
        img[vom] = ROOF[0]
        img[vom & (row == VOM_ROWS[1] - 1) & (rf > 0.6)] = CONCRETE[3]
    ribbons = []
    for i, bd in enumerate(BANDS):
        mid = M == M_BAND + i
        img[mid] = ramp(CONCRETE, np.full((H, W), 0.16), Th)[mid]
        rib = mid & (Y >= bd.ribbon[0]) & (Y <= bd.ribbon[1])
        img[rib] = LED_BG[1]
        ribbons.append(rib)
        rail = mid & (Y > bd.ribbon[1])
        img[rail] = CONCRETE[4]
        img[rail & ~np.roll(rail, 1, axis=0)] = CONCRETE[5]
        lip = mid & (Y < bd.ribbon[0]) & (Y > bd.ribbon[0] - 0.35)
        img[lip] = ramp(WARM, np.full((H, W), 0.1), Th)[lip]
    bw = M == M_BACKWALL
    img[bw] = ramp(ROOF, np.full((H, W), 0.35), Th)[bw]
    roof = M == M_ROOF
    S_roof = contour_s(X, Z, ROOF_D0)
    truss = (np.abs(((S_roof + 4) % 8) - 4) < 0.35) | (np.abs(((Dd - ROOF_D0 + 2) % 4) - 2) < 0.25)
    rv = 0.22 + 0.25 * np.clip((ROOF_D0 + 4 - Dd) / 4, 0, 1) + truss * 0.28
    img[roof] = ramp(ROOF, np.clip(rv, 0, 1), Th)[roof]
    dl = roof & (np.abs(((S_roof + 3) % 6) - 3) < 0.35) & (np.abs(Dd - (ROOF_D0 + 2.4)) < 0.45)
    img[dl] = LAMP[0]
    fas = M == M_FASCIA
    img[fas] = ramp(STEEL, np.clip(0.3 + 0.35 * (Y - ROOF_Y) / FASCIA_H, 0, 1), Th)[fas]
    for k in range(len(SCREENS)):                                  # the screens' bezels; their pictures are LEDs
        sm = M == M_SCREEN + k
        bez = sm & ((SU < 0.025) | (SU > 0.975) | (SV < 0.04) | (SV > 0.96))
        img[sm] = LED_BG[0]
        img[bez] = STEEL[3]
    # haze over the far stands, purple with the dusk
    hz = (M >= M_WALL) & (M < M_SCREEN)
    fog = np.clip((T - 70) / 90, 0, 0.42)
    img[hz & (Th < fog) & ~np.any(ribbons, axis=0)] = HAZE[1]
    return img, sky_img, clouds, stars, T, M, X, Y, Z, Dd, SU, SV, ribbons


def player_shadows(c: Comp, X, Z) -> np.ndarray:
    """The floodlit foreground players cast a contact shadow and four faint crossed shadows; the ball a small one.
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


# ---------------------------------------------------------------- LEDs: text strips, the video screens, the map
FONT3 = {
    "A": [".#.", "#.#", "###", "#.#", "#.#"], "B": ["##.", "#.#", "##.", "#.#", "##."], "C": ["###", "#..", "#..", "#..", "###"],
    "D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"], "F": ["###", "#..", "##.", "#..", "#.."],
    "G": ["###", "#..", "#.#", "#.#", "###"], "H": ["#.#", "#.#", "###", "#.#", "#.#"], "I": ["###", ".#.", ".#.", ".#.", "###"],
    "J": ["..#", "..#", "..#", "#.#", "###"], "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "L": ["#..", "#..", "#..", "#..", "###"],
    "M": ["#.#", "###", "#.#", "#.#", "#.#"], "N": ["#.#", "###", "###", "#.#", "#.#"], "O": ["###", "#.#", "#.#", "#.#", "###"],
    "P": ["###", "#.#", "###", "#..", "#.."], "Q": ["###", "#.#", "#.#", "###", "..#"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "S": ["###", "#..", "###", "..#", "###"], "T": ["###", ".#.", ".#.", ".#.", ".#."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    "V": ["#.#", "#.#", "#.#", "#.#", ".#."], "W": ["#.#", "#.#", "#.#", "###", "#.#"], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "Z": ["###", "..#", ".#.", "#..", "###"], "0": ["###", "#.#", "#.#", "#.#", "###"],
    "7": ["###", "..#", ".#.", ".#.", ".#."], "-": ["...", "...", "###", "...", "..."], " ": ["...", "...", "...", "...", "..."],
    "*": ["...", ".#.", "###", ".#.", "..."],
    "^": ["#.#.#", "#####", "#####", ".....", "#####"],                    # a crown (5 wide)
}


def text_width(word: str) -> int:
    return sum(len(FONT3[ch][0]) + 1 for ch in word) - 1


def draw_text(out: np.ndarray, x: int, y: int, word: str, col) -> int:
    for ch in word:
        glyph = FONT3[ch]
        for j, line in enumerate(glyph):
            for i, bit in enumerate(line):
                if bit == "#" and 0 <= y + j < out.shape[0] and 0 <= x + i < out.shape[1]:
                    out[y + j, x + i] = col
        x += len(glyph[0]) + 1
    return x


def led_strip(words: list[str], colours: list[str]) -> np.ndarray:
    """One full cycle of an LED board's text, as a strip that tiles seamlessly: words in FONT3 over an unlit dot grid."""
    width = sum(text_width(w) + 8 for w in words)
    width += width % 2
    out = np.zeros((LED_ROWS, width, 3), dtype=np.uint8)
    out[:] = LED_BG[0]
    out[::2, ::2] = LED_BG[1]
    x = 0
    for word, colour in zip(words, colours):
        x = draw_text(out, x, 1, word, LED[colour][1]) + 8
    return out


# The boards round the pitch, then the ribbons between tiers 1-2, 2-3 and 3-4; speed in texels per second
LED_TEXT = [
    (["FUTKRILL", "^", "MATCHDAY", "^", "FUTKRILL", "^", "GAME ON", "^"], ["cyan", "gold", "white", "gold", "cyan", "gold", "red", "gold"], 6),
    (["FUTKRILL", "*", "MATCHDAY", "*", "NAME A PLAYER", "*"], ["cyan", "gold", "white", "gold", "white", "gold"], -4),
    (["JOBLESS", "*", "BALL KNOWLEDGE", "*", "FUTKRILL", "*"], ["gold", "red", "white", "red", "cyan", "red"], 3),
    (["FUTKRILL", "*", "MATCHDAY", "*", "DAILY 7", "*"], ["cyan", "gold", "white", "gold", "red", "gold"], -3),
]


def screen_frames(k: int, tw: int, th: int) -> np.ndarray:
    """What the video screen in corner k cycles through: the ball and FUTKRILL, KICK OFF, a team flag, the score."""
    from make_art import ball                                        # the site's own pixel ball
    frames = []
    top, bot = (hexes("#0a1a5a")[0], hexes("#1a3aa8")[0]) if k == 0 else (hexes("#4a0a24")[0], hexes("#a01c3c")[0])
    for f in range(4):
        out = np.zeros((th, tw, 3), dtype=np.uint8)
        for y in range(th):
            out[y] = (top.astype(int) + (bot.astype(int) - top.astype(int)) * y // max(th - 1, 1)).astype(np.uint8)
        if f == 0:
            b = np.asarray(ball(15).im.convert("RGBA"))
            bh, bw_ = b.shape[:2]
            ox, oy = (tw - bw_) // 2, 2
            a = b[:, :, 3] > 0
            out[oy:oy + bh, ox:ox + bw_][a] = b[:, :, :3][a]
            draw_text(out, (tw - text_width("FUTKRILL")) // 2, th - 7, "FUTKRILL", hexes("#ffd84a")[0])
        elif f == 1:
            for j, word in enumerate(("KICK", "OFF")):
                draw_text(out, (tw - text_width(word)) // 2, 7 + j * 8, word, hexes("#ffffff")[0])
        elif f == 2:
            cols = FLAGS["A" if k == 0 else "B"]
            for y in range(3, th - 3):
                for x in range(6, tw - 6):
                    wave = int(round(1.2 * math.sin(x * 0.35)))
                    band = min(2, max(0, (y - 3 + wave) * 3 // (th - 6)))
                    out[y, x] = cols[band][2 if (x // 3 + y) % 5 else 1]
        else:
            draw_text(out, (tw - text_width("0 - 0")) // 2, 6, "0 - 0", hexes("#ffffff")[0])
            draw_text(out, (tw - text_width("KICK OFF")) // 2, 16, "KICK OFF", hexes("#5ae0ff")[0])
        out[::2, ::2] = (out[::2, ::2].astype(int) * 0.82).astype(np.uint8)           # the LED grid
        frames.append(out)
    return np.concatenate(frames, axis=1)


# ---------------------------------------------------------------- the crowd
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
    phone: bool


def crowd(c: Comp, rnd: random.Random):
    """Every supporter in sight, seat by seat round the bowl, furthest first. Returns the fans, flags and flares."""
    fans: list[Fan] = []
    flags, flares, seats = [], [], []
    for i, tr in enumerate(TIERS):
        nrows = int((tr.d1 - tr.d0) / ROW)
        for r in range(nrows):
            d = tr.d0 + (r + 0.55) * ROW
            s = np.arange(rnd.random() * SEAT, perimeter(d), SEAT)
            x, z = contour_point(s, d)
            y = tr.y0 + (d - tr.d0) * tr.k + 1.25
            sx, sy, zc = c.project(x, y, z)
            ok = (zc > 5) & (sx >= -2) & (sx < c.w + 2) & (sy >= 1) & (sy < c.h)
            ok &= ~is_aisle(s) & ~(is_vom(s, i) & (r >= VOM_ROWS[0] - 1) & (r < VOM_ROWS[1]))
            if i == len(TIERS) - 1:
                ok &= d < ROOF_D1
            dist = c.dist(x, y, z)
            for k in np.nonzero(ok)[0]:
                seats.append((float(dist[k]), i, r, nrows, float(x[k]), float(z[k]), y, float(sx[k]), float(sy[k]), float(zc[k])))
    seats.sort(key=lambda q: -q[0])
    for (dist, i, r, nrows, x, z, y, sx, sy, zc) in seats:
        if rnd.random() > 0.9:
            continue
        sw = c.f * SEAT / zc
        w = 1 if sw < 1.9 else 2 if sw < 3.2 else 3
        far = z > SPOT_Z + B_ + 4                                  # the end behind the far goal: the away fans
        team = ("B" if rnd.random() < 0.82 else "A") if far else ("A" if rnd.random() < 0.5 - 0.35 * max(-1, min(1, x / 40)) else "B")
        kit = KITS[team]
        pick = rnd.random()
        alt_share = 0.3 if team == "A" else 0.18                  # the crimsons' green is a trim, not a shirt colour
        shirt = NEUTRAL[rnd.randrange(len(NEUTRAL))] if pick < 0.1 else kit["alt"][1:] if pick < alt_share else kit["shirt"][1:]
        lit = TIER_LIGHT[i]
        light = lit[0] + (lit[1] - lit[0]) * (r / max(nrows - 1, 1))
        if i < len(TIERS) - 1:
            light += 0.18 * clamp01((r - (nrows - 5)) / 5)        # the back rows sit under the band's lamps
        light += (rnd.random() - 0.5) * 0.16
        acts = [""]
        for _ in range(3):
            q = rnd.random()
            acts.append("jump" if q < 0.22 else "arms" if q < 0.36 and w >= 2 else "scarf" if q < 0.43 else "")
        acts.append("wave")
        ix, iy = int(round(sx)), int(round(sy))
        fans.append(Fan(ix, iy, w, max(1, round(sw * 0.75)), shirt, SKIN_TONES[rnd.randrange(4)], HAIR_TONES[rnd.randrange(4)],
                        light, dist, team, acts, rnd.random() < 0.02))
        q = rnd.random()
        if q < (0.012 if i < 2 else 0.007):
            flags.append((x, y + 2.2, z, team, rnd.random(), 1.8 if (q < 0.003 and i < 2) else 1.0))
        elif 1 <= i <= 2 and 0.02 <= q < 0.025 and abs(x) > 6:
            flares.append((ix + w // 2, iy - 2, team))
    chosen = []
    rnd.shuffle(flares)
    for fx, fy, team in sorted(flares, key=lambda f: (f[2] != "B", rnd.random())):
        if len(chosen) >= 5:
            break
        if 6 <= fx < c.w - 6 and all(abs(fx - a) > 34 for a, _ in chosen):
            chosen.append((fx, fy))
    return fans, flags, chosen


def draw_fans(img, depth, fans: list[Fan], frame: int):
    H, W = img.shape[:2]

    def put(x, y, col, z):
        if 0 <= x < W and 0 <= y < H and depth[y, x] >= z - 0.8:
            img[y, x] = col

    for f in fans:
        a = f.act[frame]
        wave = a == "wave"
        y = f.y - (1 if a in ("jump", "wave") else 0)
        v = f.v + (0.14 if wave else 0)
        sh = shade1(f.shirt, v)
        sk = f.skin[min(3, 1 + (v > 0.5) + wave)]
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
        if f.phone and frame == 0:
            put(hx, y - 3, LAMP[2], f.depth)


def draw_flags(img, depth, c: Comp, flags, frame: int):
    """Supporters' flags in the teams' colours (horizontal tricolours), waving on short poles."""
    H, W = img.shape[:2]
    for (x, y, z, team, phase, size) in flags:
        cols = FLAGS[team]
        sx, sy, zc = c.project(x, y + (size - 1) * 1.6, z)
        dist = c.dist(x, y, z)
        fw = max(4, int(c.f * 2.0 * size / zc)); fh = max(3, int(c.f * 1.3 * size / zc))
        x0, y0 = int(sx), int(sy)
        for yy in range(y0, y0 + fh + int(c.f * 1.7 * size / zc)):
            if 0 <= x0 < W and 0 <= yy < H and depth[yy, x0] >= dist - 0.8:
                img[yy, x0] = STEEL[4]
        for i in range(fw):
            wave = int(round(math.sin(i * 0.9 / size + phase * 6 + frame * 1.7) * (0.6 + i / fw) * size))
            for j in range(fh):
                xx, yy = x0 + 1 + i, y0 + j + wave
                if 0 <= xx < W and 0 <= yy < H and depth[yy, xx] >= dist - 0.8:
                    img[yy, xx] = cols[min(2, j * 3 // fh)][2 if (i + wave) % 3 else 1]


def draw_banners(img, M, X, Z, rnd: random.Random):
    """Supporters' banners hung along the front wall: the teams' colours, striped, no words."""
    w3 = M == M_WALL
    if not w3.any():
        return
    S = contour_s(X, Z, 0.0)
    rng = np.random.default_rng(rnd.randrange(1 << 30))
    end = 0.0
    for k in range(120):
        s0 = end + rng.uniform(3, 10)
        end = s0 + rng.uniform(5, 11)
        m = w3 & (S >= s0) & (S < end)
        if not m.any():
            continue
        team = "A" if float(np.mean(X[m])) < 0 else "B"
        if rng.random() < 0.2:
            team = "B" if team == "A" else "A"
        kit = KITS[team]
        style = k % 3
        frac = np.clip((S - s0) / (end - s0), 0, 1)
        alt = ((style == 0) & ((frac * 8).astype(int) % 2 == 1)) | ((style == 2) & (np.abs(frac - 0.5) < 0.12))
        img[m & ~alt] = kit["shirt"][1]
        img[m & alt] = kit["alt"][1]


# ---------------------------------------------------------------- the roof's steelwork, masts and lamps
def line_px(img, depth, p0, p1, col, c: Comp):
    """A 3D segment drawn as pixels, hidden behind anything nearer."""
    (x0, y0, z0), (x1, y1, z1) = p0, p1
    a, b = c.project(x0, y0, z0), c.project(x1, y1, z1)
    if a[2] <= 1 or b[2] <= 1:
        return
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    if n > 4000:
        return
    H, W = img.shape[:2]
    for k in range(n + 1):
        u = k / max(n, 1)
        ix, iy = int(a[0] + (b[0] - a[0]) * u), int(a[1] + (b[1] - a[1]) * u)
        if 0 <= ix < W and 0 <= iy < H and depth[iy, ix] >= c.dist(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u):
            img[iy, ix] = col


def draw_steel(img, depth, c: Comp):
    """A lattice girder round the top of the roof, and masts on it with lamp heads. Returns the lamps for the glow."""
    lamps = []
    d = ROOF_D0 + 1.5
    top = ROOF_Y + FASCIA_H
    P = perimeter(d)
    ss = np.arange(0, P, 2.4)
    x, z = contour_point(ss, d)
    for k in range(len(ss) - 1):
        _, _, zc = c.project(x[k], top, z[k])
        if zc < 5:
            continue
        a, b = (x[k], z[k]), (x[k + 1], z[k + 1])
        line_px(img, depth, (a[0], top + 3.2, a[1]), (b[0], top + 3.2, b[1]), STEEL[3], c)
        line_px(img, depth, (a[0], top, a[1]), (b[0], top, b[1]), STEEL[2], c)
        lo, hi = ((a, b) if k % 2 == 0 else (b, a))
        line_px(img, depth, (lo[0], top, lo[1]), (hi[0], top + 3.2, hi[1]), STEEL[2], c)
    H, W = img.shape[:2]
    for sm in np.arange(17.0, P, 34.0):                           # masts with lamp heads
        mx, mz = contour_point(np.array([sm]), d + 2.5)
        mx, mz = float(mx[0]), float(mz[0])
        sx, sy, zc = c.project(mx, top + MAST_H, mz)
        if zc < 5 or not (-40 < sx < c.w + 40):
            continue
        for o in (-0.7, 0.7):
            line_px(img, depth, (mx + o, top, mz), (mx + o * 0.5, top + MAST_H - 2, mz), STEEL[3], c)
        for k in range(6):
            y0 = top + k * (MAST_H - 2) / 6
            line_px(img, depth, (mx - 0.7, y0, mz), (mx + 0.7, y0 + (MAST_H - 2) / 6, mz), STEEL[2], c)
        hw, hh = 2.8, 1.5                                          # the lamp head: a grid of lamps facing the pitch
        cs = [c.project(mx + ox, top + MAST_H + oy, mz) for ox, oy in ((-hw, hh), (hw, -hh))]
        x0, y0 = int(min(cs[0][0], cs[1][0])), int(min(cs[0][1], cs[1][1]))
        x1, y1 = int(max(cs[0][0], cs[1][0])), int(max(cs[0][1], cs[1][1]))
        dist = c.dist(mx, top + MAST_H, mz)
        for yy in range(y0, y1 + 1):
            for xx in range(x0, x1 + 1):
                if 0 <= xx < W and 0 <= yy < H and depth[yy, xx] >= dist:
                    edge = yy in (y0, y1) or xx in (x0, x1)
                    hot = ((xx - x0) % 2 == 1) and ((yy - y0) % 2 == 1)
                    img[yy, xx] = STEEL[3] if edge else (LAMP[2] if hot else STEEL[4])
        lamps.append(((x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, 3) * 2.0, 1.0, "star"))
    return lamps


def draw_lamps(img, M, c: Comp):
    """The fascia's row of floodlights, blue accent lamps on the side stands, and warm lamps under every tier."""
    lamps = []
    H, W = img.shape[:2]

    def lamp(x, y, z, col, mat, size, glow, strength, colour):
        sx, sy, zc = c.project(x, y, z)
        ix, iy = int(sx), int(sy)
        if zc < 4 or not (0 <= ix < W and 0 <= iy < H) or M[iy, ix] != mat:
            return
        for o in range(size):
            if ix + o < W and M[iy, ix + o] == mat:
                img[iy, ix + o] = col[2 if o == 0 else 1]
        lamps.append((sx, sy, glow, strength, colour))

    d = ROOF_D0 - 0.05
    for s in np.arange(0, perimeter(d), 2.6):
        x, z = contour_point(np.array([s]), d)
        x, z = float(x[0]), float(z[0])
        blue = abs(x) > A_ + 6 and z < SPOT_Z + B_ and int(s / 2.6) % 3 == 0
        lamp(x, ROOF_Y + FASCIA_H * 0.45, z, BLUE_LAMP if blue else LAMP, M_FASCIA, 2, 9.0, 0.6, "blue" if blue else "warm")
    for i, bd in enumerate(BANDS):
        dd = bd.d - 0.05
        for s in np.arange(1.0, perimeter(dd), 3.4):
            x, z = contour_point(np.array([s]), dd)
            lamp(float(x[0]), bd.ribbon[0] - 0.4, float(z[0]), WARM, M_BAND + i, 3, 7.0, 0.55, "warm")
    return lamps


def draw_goal(layer, depth, c: Comp):
    """The far goal: white posts and bar, a net behind. Drawn into the pitch layer, so it covers the boards."""
    H, W = layer.shape[:2]
    gz = GOAL_Z
    net = hexes("#c8d0d8")[0]

    def put(x, y, z, col):
        sx, sy, zc = c.project(x, y, z)
        ix, iy = int(sx), int(sy)
        if zc > 1 and 0 <= ix < W and 0 <= iy < H and depth[iy, ix] >= c.dist(x, y, z) - 0.5:
            layer[iy, ix, :3] = col
            layer[iy, ix, 3] = 255

    for gx in np.linspace(-3.66, 3.66, 40):                         # the net: back and roof
        for gy in np.linspace(0, 2.2, 14):
            if (round(gx / 0.183) + round(gy / 0.183)) % 2 == 0:
                put(gx, gy, gz + 2.0, net)
        for t in np.linspace(0, 1, 6):
            put(gx, 2.44 - 0.24 * t, gz + 2.0 * t, net)
    for side in (-3.66, 3.66):
        for t in np.linspace(0, 1, 12):
            for gy in np.linspace(0, 2.4, 10):
                if (round(t * 11) + round(gy / 0.24)) % 2 == 0:
                    put(side, gy * (1 - 0.1 * t), gz + 2.0 * t, net)
        for gy in np.linspace(0, 2.44, 40):
            put(side, gy, gz, LINE[3])
    for gx in np.linspace(-3.66, 3.66, 90):
        put(gx, 2.44, gz, LINE[3])


# ---------------------------------------------------------------- the players
def players_layer(c: Comp, breath: int) -> tuple[Image.Image, list]:
    """The two foreground players and the ball on the centre spot."""
    layer = Image.new("RGBA", (c.w, c.h), (0, 0, 0, 0))
    boxes, items = [], []
    for p in c.players:
        fx, fy, zc = c.project(p.x, 0, p.z)
        hpx = max(24, int(round(c.f * 1.8 / zc)))
        px_, ground = figure(hpx, KITS[p.team], p.skin, p.hair, p.style, "stand", breath=breath)
        sprite = Image.fromarray(px_ if p.facing > 0 else np.ascontiguousarray(px_[:, ::-1]), "RGBA")
        items.append((zc, sprite, int(round(fx - sprite.width / 2)), int(round(fy)) - ground))
    bx, by, bz = c.project(0, 0.11, SPOT_Z)
    bd = max(5, int(round(c.f * 0.22 / bz)))
    items.append((bz, ball_sprite(bd), int(round(bx - (bd + 2) / 2)), int(round(by - (bd + 2) / 2))))
    for z, sprite, x, y in sorted(items, key=lambda it: -it[0]):
        layer.paste(sprite, (x, y), sprite)
        boxes.append([x, y, sprite.width, sprite.height])
    return layer, boxes


FIELD_FRAMES = 6       # stand (2 breaths), run (4); each facing right, then the same facing left


def field_sheet(c: Comp):
    """The players up the pitch as one sprite sheet, a row each (furthest first), with where and how they move."""
    rows, entries = [], []
    for i, fp in enumerate(FIELD):
        sx, sy, zc = c.project(fp.x, 0, fp.z)
        ppm = c.f / zc
        h = max(9, int(round(ppm * 1.8)))
        reach = ppm * fp.range + h
        if sx + reach < 0 or sx - reach > c.w:
            continue
        frames, ground = [], 0
        for k in range(FIELD_FRAMES):
            pose, phase, breath = ("stand", 0, k) if k < 2 else ("run", k - 2, 0)
            px_, ground = figure(h, KITS[fp.team], fp.skin, fp.hair, fp.style, pose, phase, breath, fp.team == "AR")
            frames.append(px_)
        frames += [np.ascontiguousarray(f[:, ::-1]) for f in frames]
        alpha = np.any([f[:, :, 3] > 0 for f in frames], axis=0)
        ys, xs = np.nonzero(alpha)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rows.append(np.concatenate([f[y0:y1, x0:x1] for f in frames], axis=1))
        entries.append(dict(z=round(float(zc), 2), home=fp.x, range=fp.range, speed=fp.speed, seed=i + 1, ppm=round(float(ppm), 3),
                            feet=[round(float(sx), 2), int(round(float(sy)))], cell=[0, 0, int(x1 - x0), int(y1 - y0)],
                            anchor=[round(frames[0].shape[1] / 2 - x0, 1), int(ground - y0)], kind=fp.team))
    order = sorted(range(len(entries)), key=lambda j: -entries[j]["z"])
    sheet = np.zeros((sum(r.shape[0] for r in rows), max(r.shape[1] for r in rows), 4), dtype=np.uint8)
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
    T = threshold(c.h, c.w)
    for _ in range(int(c.w * 0.9)):
        x = rnd.random() * c.w
        hgt = 3 + rnd.random() ** 2 * c.view_h * 0.06
        lean = (rnd.random() - 0.5) * 0.5 + (0.12 if frame else 0)
        shade = rnd.random()
        for k in range(int(hgt)):
            s = k / hgt
            xx, yy = int(x + lean * k * (0.4 + s)), c.h - 1 - k
            if 0 <= xx < c.w and 0 <= yy < c.h:
                v = 0.14 + 0.38 * s * shade + (0.25 if s > 0.85 and shade > 0.6 else 0)
                out[yy, xx, :3] = ramp(GRASS, np.array([[v]]), T[yy:yy + 1, xx:xx + 1])[0, 0]
                out[yy, xx, 3] = 255
                if s < 0.5 and xx + 1 < c.w and not out[yy, xx + 1, 3]:
                    out[yy, xx + 1, :3] = GRASS[0]; out[yy, xx + 1, 3] = 255
    return Image.fromarray(out, "RGBA")


COLOURS = {"warm": np.array([1.0, 0.78, 0.5]), "blue": np.array([0.45, 0.62, 1.0]), "star": np.array([1.0, 0.88, 0.66])}


def light_layers(c: Comp, lamps: list) -> tuple[Image.Image, Image.Image]:
    """Additive light: halos round every lamp (with starbursts on the masts' lamp heads) and light shafts from the
    masts down to the pitch."""
    H, W = c.h, c.w
    glow = np.zeros((H, W, 3))
    for (x, y, r, k, colour) in lamps:
        R = int(r * 2.2) + 2
        x0, x1, y0, y1 = max(0, int(x) - R), min(W, int(x) + R + 1), max(0, int(y) - R), min(H, int(y) + R + 1)
        if x0 >= x1 or y0 >= y1:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
        d = np.hypot(xx - x, (yy - y) * 1.1) / r
        glow[y0:y1, x0:x1] += k * np.exp(-d * d * 2.2)[..., None] * COLOURS[colour]
        if colour == "star":                                   # a starburst: long thin rays
            L = int(r * 1.7)
            for (ax, ay, len_) in ((1, 0, L), (0, 1, L * 0.55), (0.7, 0.7, L * 0.35), (0.7, -0.7, L * 0.35)):
                for sgn in (1, -1):
                    for q in range(1, int(len_)):
                        px_, py_ = int(x + sgn * ax * q), int(y + sgn * ay * q)
                        if 0 <= px_ < W and 0 <= py_ < H:
                            glow[py_, px_] += 0.4 * (1 - q / len_) ** 2 * COLOURS["star"]
    beams = np.zeros((H, W, 3))
    pitch_y = c.horizon + 30
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    for (x, y, r, k, colour) in lamps:
        if colour != "star":
            continue
        for tx in np.linspace(c.w * 0.2, c.w * 0.8, 3):
            ax, ay = tx - x, pitch_y - y
            L = math.hypot(ax, ay)
            u = ((xx - x) * ax + (yy - y) * ay) / L
            v = np.abs((xx - x) * ay - (yy - y) * ax) / L
            width = 2 + u * 0.14
            m = (u > 0) & (u < L) & (v < width)
            beams += (m * np.clip(1 - u / L, 0, 1) * np.clip(1 - v / width, 0, 1) * 0.32)[..., None] * np.array([1.0, 0.86, 0.66])

    def to_img(a):
        a = np.clip(a, 0, 1)
        alpha = np.clip(a.max(axis=2), 0, 1)
        rgb = np.where(alpha[..., None] > 0, a / np.maximum(alpha[..., None], 1e-6), 0)
        return Image.fromarray(np.dstack([rgb * 255, alpha * 255]).astype(np.uint8), "RGBA")
    return to_img(glow), to_img(beams)


# ---------------------------------------------------------------- compositions
def wide() -> Comp:
    return Comp("wide", 640, 400, f=380, pitch=15.0, focus=(0.5, 0.6), seed=7, players=[
        Player(-3.7, 8.8, "A", +1, skin=0, hair=0, style="short"),
        Player(3.5, 10.2, "B", -1, skin=2, hair=1, style="swept")])


def tall() -> Comp:
    # Phones: a narrower slice of the same view, the far end and its goal in the middle; the content panel covers the
    # middle of the screen, so the roof, screens and crowd sit in the top band and the pitch fills the bottom.
    return Comp("tall", 300, 640, f=400, pitch=17.0, focus=(0.5, 0.42), seed=11, cam_x=-0.6, players=[
        Player(-2.9, 9.6, "A", +1, skin=0, hair=0, style="short"),
        Player(2.0, 10.6, "B", -1, skin=2, hair=1, style="swept")])


def save(arr: np.ndarray, path: Path, mode: str | None = None):
    Image.fromarray(arr, mode).save(path, optimize=True)


def build(c: Comp) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(c.seed)
    img, sky_img, clouds, stars, depth, mat, X, Y, Z, Dd, SU, SV, ribbon_masks = render(c)
    ground = mat == M_GROUND
    sky = mat == M_SKY
    back = img.copy()
    back[ground] = APRON[1]
    lamps = draw_steel(back, depth, c)
    lamps += draw_lamps(back, mat, c)
    draw_banners(back, mat, X, Z, rnd)
    fans, flags, flares = crowd(c, rnd)
    frames = []
    for k in range(5):
        fr = back.copy()
        draw_fans(fr, depth, fans, k)
        draw_flags(fr, depth, c, flags, k)
        frames.append(fr)
    name = c.name

    # LEDs: the map says which board (or screen) each LED pixel belongs to, and its texel there
    ledmap = np.zeros((c.h, c.w, 3), dtype=np.uint8)
    strips, leds, sy = [], [], 0
    boards = [(mat == M_BOARD, BOARD_D, (0.0, BOARD_H))] + [(m, b.d, b.ribbon) for m, b in zip(ribbon_masks, BANDS)]
    for k, ((mask, d, (y0, y1)), (words, cols, speed)) in enumerate(zip(boards, LED_TEXT)):
        strip = led_strip(words, cols)
        texel = (y1 - y0) / LED_ROWS
        S = np.mod(contour_s(X, Z, d), perimeter(d))
        u = np.floor(S / texel).astype(int) % strip.shape[1]
        v = np.clip(np.floor((y1 - Y) / texel).astype(int), 0, LED_ROWS - 1)
        ledmap[mask, 0] = (u & 255)[mask]
        ledmap[mask, 1] = (((u >> 8) & 15) | (v << 4))[mask]
        ledmap[mask, 2] = k + 1
        strips.append(strip)
        leds.append(dict(sy=sy, rows=LED_ROWS, period=int(strip.shape[1]), speed=speed))
        sy += LED_ROWS
    screens, scr_imgs, ssy = [], [], sy
    for k, sc in enumerate(SCREENS):
        tw, th = sc.texels
        m = (mat == M_SCREEN + k) & (SU >= 0.025) & (SU <= 0.975) & (SV >= 0.04) & (SV <= 0.96)
        u = np.clip(((SU - 0.025) / 0.95 * tw).astype(int), 0, tw - 1)
        v = np.clip(((SV - 0.04) / 0.92 * th).astype(int), 0, th - 1)
        ledmap[m, 0] = u[m]
        ledmap[m, 1] = v[m]
        ledmap[m, 2] = 101 + k
        scr = screen_frames(k, tw, th)
        scr_imgs.append(scr)
        screens.append(dict(sy=ssy, w=tw, h=th, frames=int(scr.shape[1] // tw)))
        ssy += th
    sheet = np.zeros((ssy, max(max(s.shape[1] for s in strips), max(s.shape[1] for s in scr_imgs)), 3), dtype=np.uint8)
    for s, l in zip(strips, leds):
        sheet[l["sy"]:l["sy"] + l["rows"], :s.shape[1]] = s
    for s, l in zip(scr_imgs, screens):
        sheet[l["sy"]:l["sy"] + l["h"], :s.shape[1]] = s
    save(sheet, OUT / f"{name}-strips.png")
    save(ledmap, OUT / f"{name}-ledmap.png")
    led_any = ledmap[:, :, 2] > 0
    covered = np.any(frames[0] != back, axis=2)                    # supporters and flags in front of an LED stay opaque

    base = np.dstack([frames[0], np.full((c.h, c.w), 255, dtype=np.uint8)])
    base[(sky | led_any) & ~covered, 3] = 0
    steel = sky & np.any(back != img, axis=2)                      # masts and lamps drawn into the sky: keep them
    base[steel & ~covered, 3] = 255
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
    draw_goal(pitch, depth, c)
    save(pitch, OUT / f"{name}-pitch.png", "RGBA")
    boxes = []
    for k in range(2):
        layer, boxes = players_layer(c, k)
        layer.save(OUT / f"{name}-players-{k + 1}.png", optimize=True)
    fsheet, fld = field_sheet(c)
    fsheet.save(OUT / f"{name}-field.png", optimize=True)
    for k in range(2):
        front_layer(c, k, c.seed * 31).save(OUT / f"{name}-front-{k + 1}.png", optimize=True)
    glow, beams = light_layers(c, lamps)
    glow.save(OUT / f"{name}-glow.png", optimize=True); beams.save(OUT / f"{name}-beams.png", optimize=True)
    seats = [(f.x, f.y, f.w) for f in fans]
    sample = random.Random(c.seed + 99).sample(seats, min(600, len(seats)))
    meta = {"w": c.w, "h": c.h, "view": [c.margin[0], c.margin[1], c.view_w, c.view_h], "focus": list(c.focus),
            "margin": list(c.margin), "horizon": round(c.horizon, 1),
            "lamps": [[round(float(a), 1), round(float(b), 1), round(float(r), 1), k] for a, b, r, k, _ in lamps if r >= 9][:60],
            "seats": [[int(x), int(y), int(w)] for x, y, w in sample], "players": boxes, "stars": stars, "leds": leds,
            "screens": screens, "flares": [[int(x), int(y)] for x, y in flares], "field": fld}
    (OUT / f"{name}.json").write_text(json.dumps(meta, separators=(",", ":")))
    still(c, meta).save(OUT / f"{name}-still.png", optimize=True)
    return meta


def paint_leds(c: Comp, meta: dict) -> Image.Image:
    """The LEDs at rest (no scrolling, the screens' first picture), as the site paints them."""
    lm = np.asarray(Image.open(OUT / f"{c.name}-ledmap.png").convert("RGB")).astype(int)
    sheet = np.asarray(Image.open(OUT / f"{c.name}-strips.png").convert("RGB"))
    out = np.zeros((c.h, c.w, 4), dtype=np.uint8)
    which = lm[:, :, 2]
    u = lm[:, :, 0] | ((lm[:, :, 1] & 15) << 8)
    v = lm[:, :, 1] >> 4
    for k, l in enumerate(meta["leds"]):
        m = which == k + 1
        out[m, :3] = sheet[l["sy"] + v[m], u[m] % l["period"]]
        out[m, 3] = 255
    for k, s in enumerate(meta["screens"]):
        m = which == 101 + k
        out[m, :3] = sheet[s["sy"] + lm[:, :, 1][m], lm[:, :, 0][m]]
        out[m, 3] = 255
    return Image.fromarray(out, "RGBA")


def still(c: Comp, meta: dict, crowd_frame: int = 0) -> Image.Image:
    """The scene at rest, as one picture: what the site shows before anything moves (and the tunnel's walkout)."""
    L = lambda n: Image.open(OUT / f"{c.name}-{n}.png").convert("RGBA")
    im = L("sky")
    px = im.load()
    for x, y, b in meta["stars"]:
        px[x, y] = tuple(int(v) for v in STAR[b]) + (255,)
    im.alpha_composite(L("clouds"))
    im.alpha_composite(paint_leds(c, meta))
    im.alpha_composite(L("back"))
    if crowd_frame:
        im.alpha_composite(L(f"crowd-{crowd_frame}"))
    im.alpha_composite(L("pitch"))
    sheet = L("field")
    for p in meta["field"]:
        x, y, w, h = p["cell"]
        cell = sheet.crop((x, y, x + w, y + h))
        im.paste(cell, (int(round(p["feet"][0] - p["anchor"][0])), p["feet"][1] - p["anchor"][1]), cell)
    im.alpha_composite(L("players-1"))
    return im


def composite(c: Comp, meta: dict, k: int = 0) -> Image.Image:
    """The scene as the site shows it (for previews): the still picture plus the grass in front and the light."""
    im = still(c, meta, k)
    im.alpha_composite(Image.open(OUT / f"{c.name}-front-1.png"))
    base = np.asarray(im).astype(float)
    for layer, strength in (("glow", 0.9), ("beams", 0.45)):
        L = np.asarray(Image.open(OUT / f"{c.name}-{layer}.png")).astype(float)
        base[..., :3] += L[..., :3] * (L[..., 3:] / 255) * strength
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def social_preview(meta: dict):
    """og.png (1200x630) for link previews: the wide scene, cropped, with the logo on the sky."""
    from make_art import logo
    c = wide()
    im = composite(c, meta, 1).resize((c.w * 2, c.h * 2), Image.NEAREST)
    lg = logo().im
    big = lg.resize((lg.width * 5, lg.height * 5), Image.NEAREST)
    x0 = (im.width - 1200) // 2
    y0 = int(max(0, min(c.margin[1] * 2 + 40, im.height - 630)))
    og = im.crop((x0, y0, x0 + 1200, y0 + 630)).convert("RGBA")
    og.alpha_composite(big, ((1200 - big.width) // 2, 24))
    og.convert("RGB").save(ROOT / "web" / "public" / "art" / "og.png")


def main():
    metas = {}
    for c in (wide(), tall()):
        metas[c.name] = build(c)
        k = 3 if c.name == "wide" else 2
        composite(c, metas[c.name]).resize((c.w * k, c.h * k), Image.NEAREST).save(ROOT / "art" / f"scene-{c.name}-preview.png")
    social_preview(metas["wide"])
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
