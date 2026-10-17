"""The matchday scene behind the whole site (spec: docs/superpowers/specs/2026-10-16-matchday-scene-design.md).

A small 3D stadium, ray-cast one ray per pixel: the camera sits low on the halfway line a few metres behind the centre
spot, looking across the pitch at the main stand (two tiers, an overhang, a roof with a lamp row, LED ribbons) with two
floodlight pylons behind it. Every surface is shaded from a hand-picked colour ramp with ordered dithering, so the
result reads as pixel art rather than a render. Supporters, flags and the two (invented, generic) players are pixel
sprites placed with the same camera, so all layers and animation frames line up exactly.

Run:  ~/.venvs/cadquery/bin/python art/scene.py      (numpy + Pillow; writes web/public/art/scene/)

Layers per composition (wide 480x270 for desktop, tall 270x480 for phones), each drawn with a margin for parallax:
  back            sky, pylons, roof, stands and crowd (frame 0), boards; opaque
  crowd-1..3      only the pixels that change in each crowd frame (jumping, arms up, scarves, flags waving)
  pitch           the ground: grass, markings, shadows; transparent above the far boards
  players-1..2    the two players and the ball (breathing in / out)
  front-1..2      grass blades along the bottom edge (swaying)
  glow, beams     soft light (lamp halos, light shafts) drawn additively by the site
  <name>.json     sizes, the visible window, a focus point, lamp and seat positions for the site's effects
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

TEAM_A = {"shirt": hexes("#22568e", "#3b7ec4", "#68aee8", "#a4d4ff"), "alt": hexes("#8e9ab8", "#c6d0e0", "#eef2fa", "#ffffff"),
          "shorts": hexes("#8e9ab8", "#c6d0e0", "#eef2fa", "#ffffff"), "socks": hexes("#8e9ab8", "#c6d0e0", "#eef2fa", "#ffffff")}
TEAM_B = {"shirt": hexes("#5a1022", "#9a1f34", "#d23a46", "#f2706a"), "alt": hexes("#0c2a1c", "#16482c", "#1f6a3a", "#3a8a54"),
          "shorts": hexes("#0c2a1c", "#16482c", "#1f6a3a", "#3a8a54"), "socks": hexes("#5a1022", "#9a1f34", "#d23a46", "#f2706a")}
NEUTRAL = [hexes("#0e1224", "#1a2038", "#2a3150"), hexes("#1c1c22", "#2e2e38", "#45454f"), hexes("#2a2416", "#4a3e22", "#6c5a30")]
SKINS = [hexes("#7a4c30", "#a8714c", "#d9a57a", "#f2c9a0"), hexes("#4a2c1a", "#70452a", "#9a6440", "#c08458"),
         hexes("#5c3a24", "#8a5a3a", "#b8805a", "#e0ac80"), hexes("#2e1a10", "#4a2c1a", "#6c4228", "#8e5c3a")]
HAIRS = [hexes("#120c0a", "#24160e", "#3a2418"), hexes("#2e1c10", "#5a3a20", "#8a5a32"), hexes("#0c0a0e", "#18141a", "#2a2430"),
         hexes("#5a4a2a", "#8a7440", "#b89c5a")]
BOOT = hexes("#05060c", "#141826", "#2a3048")

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


# ---------------------------------------------------------------- the stadium (metres; camera at x=0, z=0, looking +z)
SPOT_Z = 6.5            # the centre spot
HALF_W = 34.0           # touchline to halfway along z
HALF_L = 52.5           # goal line to halfway along x
BOARD_Z, BOARD_H = 43.5, 0.95
WALL_Z, WALL_H = 46.0, 1.4
LOWER = dict(z0=46.0, z1=60.0, y0=1.4, k=math.tan(math.radians(30)))
MID_Z = 60.0            # back of the lower tier, the ribbon board and the front of the upper tier
RIBBON = (12.8, 15.2)   # LED ribbon between the tiers (y)
UPPER = dict(z0=60.0, z1=78.0, y0=15.5, k=math.tan(math.radians(35)))
ROOF_Y, ROOF_Z0, ROOF_Z1, FASCIA_H = 28.0, 64.0, 80.0, 2.2
STAND_X = 90.0
ROW = 0.8               # row depth along z
SEAT = 0.55             # seat width along x
AISLE_EVERY, AISLE_W = 14.0, 1.2
VOM_EVERY, VOM_W, VOM_ROWS = 28.0, 3.2, (6, 9)


@dataclass
class Player:
    x: float
    z: float
    team: dict
    facing: int          # +1 faces right (+x), -1 faces left
    skin: int
    hair: int
    style: str           # hair style: "short", "swept"


@dataclass
class Comp:
    name: str
    view_w: int
    view_h: int
    f: float             # focal length in pixels
    horizon: float       # horizon row as a share of the view height
    eye: float = 1.2
    margin: tuple[int, int] = (16, 14)    # room for parallax (PARALLAX) and for the whole-number fit to crop into
    pylons: list[tuple[float, float]] = field(default_factory=list)   # (x, z) of the floodlight pylons
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
    mat = np.zeros((H, W), dtype=np.int16)   # 0 sky
    X = np.zeros((H, W)); Y = np.zeros((H, W))

    def take(t, valid, m):
        nonlocal best
        upd = valid & (t > 0.1) & (t < best)
        best = np.where(upd, t, best)
        mat[upd] = m
        X[upd] = (t * dx + c.cam_x)[upd]
        Y[upd] = (c.eye + t * dy)[upd]

    # ground (y=0)
    with np.errstate(divide="ignore", invalid="ignore"):
        tg = np.where(dy < 0, -c.eye / dy, np.inf)
    take(tg, (tg < WALL_Z), 1)
    # vertical planes facing the camera
    for z, ylo, yhi, m in ((BOARD_Z, 0.0, BOARD_H, 2), (WALL_Z, 0.0, WALL_H, 3), (ROOF_Z0, ROOF_Y, ROOF_Y + FASCIA_H, 8)):
        y = c.eye + z * dy
        take(np.full((H, W), z), (y >= ylo) & (y <= yhi) & (np.abs(z * dx + c.cam_x) < STAND_X), m)
    ymid_lo = LOWER["y0"] + (LOWER["z1"] - LOWER["z0"]) * LOWER["k"]
    y = c.eye + MID_Z * dy
    take(np.full((H, W), MID_Z), (y >= ymid_lo) & (y <= UPPER["y0"]) & (np.abs(MID_Z * dx + c.cam_x) < STAND_X), 5)
    # raked tiers
    for tier, m in ((LOWER, 4), (UPPER, 6)):
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (tier["y0"] - tier["z0"] * tier["k"] - c.eye) / (dy - tier["k"])
        take(t, (t >= tier["z0"]) & (t <= tier["z1"]) & (np.abs(t * dx + c.cam_x) < STAND_X), m)
    # roof underside
    with np.errstate(divide="ignore", invalid="ignore"):
        tr = np.where(dy > 0, (ROOF_Y - c.eye) / dy, np.inf)
    take(tr, (tr >= ROOF_Z0) & (tr <= ROOF_Z1) & (np.abs(tr * dx + c.cam_x) < STAND_X), 7)
    return best, mat, X, Y, px, py


def hash01(*a) -> np.ndarray:
    """Cheap deterministic noise in 0..1 from integer grids."""
    h = np.zeros_like(a[0], dtype=np.uint64)
    for i, v in enumerate(a):
        h ^= (v.astype(np.int64).astype(np.uint64) + np.uint64(0x9E3779B97F4A7C15 + i)) * np.uint64(0xBF58476D1CE4E5B9)
        h ^= h >> np.uint64(29)
    return (h % np.uint64(10007)).astype(float) / 10007


def render_back_and_pitch(c: Comp, rnd: random.Random):
    t, mat, X, Y, px, py = raycast(c)
    H, W = c.h, c.w
    T = threshold(H, W)
    img = np.zeros((H, W, 3), dtype=np.uint8)
    vy = (py - c.margin[1]) / c.view_h                      # 0 at the top of the view

    # --- sky: blue-hour gradient, warm stadium glow just above the roof, stars, a few lit clouds
    sky = mat == 0
    roof_row = c.project(0, ROOF_Y + FASCIA_H, ROOF_Z0)[1]
    sv = 1 - np.clip(py / max(roof_row, 1), 0, 1)           # 1 at the top
    glow = np.exp(-((py - roof_row) / (0.22 * c.view_h)) ** 2)
    v = np.clip(0.1 + 0.55 * (1 - sv) + 0.35 * glow, 0, 1)
    img[sky] = ramp(SKY, v, T)[sky]
    n1 = hash01((px // 1).astype(int), (py // 1).astype(int))
    stars = sky & (n1 > 0.993) & (glow < 0.35)
    img[stars] = STAR[np.where(n1[stars] > 0.998, 2, np.where(n1[stars] > 0.996, 1, 0))]
    # clouds: soft bands made of a few sine octaves, lit from below by the stadium
    # thin wisps of cloud, lit from below by the stadium: long horizontal streaks, never blobs
    wisps = []
    for k in range(5):
        wy = roof_row * (0.16 + 0.15 * k) + rnd.uniform(-6, 6)
        wisps.append((rnd.uniform(0, W), wy, rnd.uniform(40, 140), rnd.uniform(0.8, 1.8), rnd.uniform(0, 6.28)))
    for (wx, wy, ln, th, ph) in wisps:
        dxw = (px - wx) / ln
        prof = np.exp(-dxw * dxw * 2) * np.exp(-((py - wy - 2.5 * np.sin(dxw * 3 + ph)) / th) ** 2)
        m = sky & (prof > 0.35 + 0.3 * T)
        lv = np.clip(0.22 + 0.55 * glow + 0.2 * (py > wy), 0, 1)
        img[m] = ramp(CLOUD, lv, T)[m]

    # --- ground: grass with mowing stripes, light pools, markings, shadows
    g = mat == 1
    Z = np.where(g, t, 0)
    on_pitch = g & (np.abs(X) <= HALF_L) & (Z >= SPOT_Z - HALF_W) & (Z <= SPOT_Z + HALF_W)
    light = (0.40 + 0.34 * np.exp(-((Z - 24) / 22) ** 2) - 0.10 * np.clip((np.abs(X) - 18) / 40, 0, 1)
             - 0.16 * np.clip((9 - Z) / 9, 0, 1))
    stripe = ((np.floor((Z - SPOT_Z) / 5.25) % 2) == 0) * 0.075 + ((np.floor(X / 5.25) % 2) == 0) * 0.025
    fx = Z / c.f                                            # metres per pixel across
    fz = Z * Z / (c.f * c.eye)                             # metres per pixel row along the ground
    texel = hash01(np.floor(X / 0.35).astype(int), np.floor(Z / 0.35).astype(int))
    grain = (texel - 0.5) * 0.12 * np.clip(0.35 / np.maximum(fx, 1e-6), 0, 1)
    gv = np.clip(light + stripe + grain, 0, 1)
    shadows = player_shadows(c, X, Z)
    gv = gv - shadows
    img[on_pitch] = ramp(GRASS, gv, T)[on_pitch]
    off = g & ~on_pitch
    img[off] = ramp(APRON, np.clip(gv * 0.9, 0, 1), T)[off]
    # markings (widened to at least ~half a pixel so they never break up in the distance)
    hw = 0.06
    lines = np.zeros_like(g)
    lines |= on_pitch & (np.abs(X) < np.maximum(hw, 0.55 * fx))                                      # halfway line
    rr = np.hypot(X, Z - SPOT_Z)
    lines |= g & (rr < np.maximum(0.2, 0.5 * fx))                                                     # centre spot
    lv = np.clip(gv + 0.25, 0, 1) - shadows * 0.6
    img[lines] = ramp(LINE, lv, T)[lines]
    # the centre circle and the far touchline as projected curves, a little thicker near the camera
    def mark(xw, zw):
        if zw < 0.8:
            return
        sx, sy = c.project(xw, 0, zw)
        ix, iy = int(sx), int(sy)
        th = max(1, int(round(c.f * 0.12 / zw)))
        for yy in range(iy, iy + max(1, th // 2 + (1 if zw < 12 else 0))):
            for xx in range(ix - th // 2, ix - th // 2 + th):
                if 0 <= xx < W and 0 <= yy < H and mat[yy, xx] == 1:
                    img[yy, xx] = ramp(LINE, np.array([[lv[yy, xx]]]), T[yy:yy + 1, xx:xx + 1])[0, 0]
    for a in np.linspace(0, 2 * math.pi, 6000, endpoint=False):
        mark(9.15 * math.cos(a), SPOT_Z + 9.15 * math.sin(a))
    for xw in np.linspace(-HALF_L, HALF_L, 3000):
        mark(xw, SPOT_Z + HALF_W)

    # --- LED boards, the wall below the lower tier, the stands, the ribbon, the roof
    b = mat == 2
    img[b] = LED_BG[0]
    w3 = mat == 3
    img[w3] = ramp(CONCRETE, np.full((H, W), 0.35) + (Y - WALL_H + 0.25 > 0) * 0.35, T)[w3]
    for m, tier in ((4, LOWER), (6, UPPER)):
        s = mat == m
        Zs = np.where(s, t, 0)
        row = np.floor((Zs - tier["z0"]) / ROW)
        rf = (Zs - tier["z0"]) / ROW - row                   # position within the row: riser at the front
        depth_v = 1 - (Zs - tier["z0"]) / (tier["z1"] - tier["z0"])
        base = 0.5 + 0.3 * depth_v if m == 4 else 0.42 + 0.3 * depth_v
        if m == 6:
            base = base - 0.25 * np.clip((Zs - ROOF_Z0) / (tier["z1"] - ROOF_Z0), 0, 1)   # under the roof
        if m == 4:
            base = base - 0.25 * np.clip((Zs - (MID_Z - 4)) / 4, 0, 1)                    # under the upper tier
        sv_ = np.clip(base - 0.12 * (rf < 0.25), 0, 1)
        aisle = (np.abs(((X + AISLE_EVERY / 2) % AISLE_EVERY) - AISLE_EVERY / 2) < AISLE_W / 2)
        img[s] = ramp(SEAT_RAMP, sv_, T)[s]
        a = s & aisle
        img[a] = ramp(CONCRETE, np.clip(sv_ + 0.1 * (rf > 0.5), 0, 1), T)[a]
        if m == 4:
            vom = s & (np.abs(((X + VOM_EVERY / 2) % VOM_EVERY) - VOM_EVERY / 2) < VOM_W / 2) & (row >= VOM_ROWS[0]) & (row < VOM_ROWS[1])
            img[vom] = ROOF[0]
            inner = vom & (row == VOM_ROWS[1] - 1) & (rf > 0.6)
            img[inner] = CONCRETE[2]
    mid = mat == 5
    ry = np.where(mid, Y, 0)
    img[mid] = ramp(CONCRETE, np.full((H, W), 0.12), T)[mid]
    ribbon_px = mid & (ry >= RIBBON[0]) & (ry <= RIBBON[1])
    img[ribbon_px] = LED_BG[1]
    rail = mid & (ry > RIBBON[1])
    img[rail] = CONCRETE[3]
    # tiny concourse lights in the dark gap under the upper tier
    gap_rows = np.where((mid & (ry < RIBBON[0] - 0.3)).any(axis=1))[0]
    if len(gap_rows):
        gy = int(gap_rows[len(gap_rows) // 2])
        for gx in range(rnd.randrange(9), W, 9 + rnd.randrange(5)):
            if mid[gy, gx] and rnd.random() < 0.7:
                img[gy, gx] = LAMP[0]
    roof = mat == 7
    Zr = np.where(roof, t, 0)
    truss = (np.abs(((X + 4) % 8) - 4) < np.maximum(0.25, 0.6 * Zr / c.f)) | (np.abs(((Zr - ROOF_Z0 + 2) % 4) - 2) < np.maximum(0.15, 0.5 * Zr * Zr / (c.f * (ROOF_Y - c.eye))))
    rv = 0.2 + 0.25 * np.clip((ROOF_Z0 + 3 - Zr) / 3, 0, 1) + truss * 0.25
    img[roof] = ramp(ROOF, np.clip(rv, 0, 1), T)[roof]
    fas = mat == 8
    img[fas] = ramp(STEEL, np.clip(0.35 + 0.3 * (Y - ROOF_Y) / FASCIA_H, 0, 1), T)[fas]

    # distance haze over the stands
    hz = (mat >= 3) & (mat <= 8)
    fog = np.clip((t - 50) / 60, 0, 0.5)
    hazemask = hz & (T < fog)
    img[hazemask] = HAZE[1]
    return img, t, mat, X, Y


def player_shadows(c: Comp, X, Z) -> np.ndarray:
    """Floodlit players cast a dark contact shadow and four faint crossed shadows; the ball a small one."""
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
    "F": ["###", "#..", "##.", "#..", "#.."], "U": ["#.#", "#.#", "#.#", "#.#", "###"], "T": ["###", ".#.", ".#.", ".#.", ".#."],
    "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "R": ["##.", "#.#", "##.", "#.#", "#.#"], "I": ["###", ".#.", ".#.", ".#.", "###"],
    "L": ["#..", "#..", "#..", "#..", "###"], "M": ["#.#", "###", "#.#", "#.#", "#.#"], "A": [".#.", "#.#", "###", "#.#", "#.#"],
    "C": ["###", "#..", "#..", "#..", "###"], "H": ["#.#", "#.#", "###", "#.#", "#.#"], "D": ["##.", "#.#", "#.#", "#.#", "##."],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "G": ["###", "#..", "#.#", "#.#", "###"], "O": ["###", "#.#", "#.#", "#.#", "###"],
    "N": ["#.#", "###", "###", "#.#", "#.#"], "E": ["###", "#..", "##.", "#..", "###"], "S": ["###", "#..", "###", "..#", "###"],
    "B": ["##.", "#.#", "##.", "#.#", "##."], "W": ["#.#", "#.#", "#.#", "###", "#.#"], "7": ["###", "..#", ".#.", ".#.", ".#."],
    " ": ["...", "...", "...", "...", "..."], "*": ["...", ".#.", "###", ".#.", "..."],
}


def led_text(img, x0, x1, ytop, rows, words, colours, rnd, mat=None, m=None):
    """Glyphs across an LED board: words in FONT3, an unlit LED dot grid between them."""
    x = x0 + rnd.randrange(8)
    k = 0
    gy = ytop + max(0, (rows - 5) // 2)
    for yy in range(ytop, ytop + rows):                           # faint dot grid
        for xx in range(x0, x1, 2):
            if 0 <= yy < img.shape[0] and 0 <= xx < img.shape[1] and (mat is None or mat[yy, xx] == m):
                img[yy, xx] = LED_BG[1]
    while x < x1:
        word = words[k % len(words)]
        col = LED[colours[k % len(colours)]]
        for ch in word:
            glyph = FONT3[ch]
            for j, row in enumerate(glyph):
                for i, bit in enumerate(row):
                    xx, yy = x + i, gy + j
                    if bit == "#" and 0 <= yy < img.shape[0] and 0 <= xx < min(x1, img.shape[1]) and (mat is None or mat[yy, xx] == m):
                        img[yy, xx] = col[1] if j < 4 else col[0] if rows < 6 else col[1]
            x += 4
        x += 9
        k += 1


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
    act: list     # per frame: "", "jump", "arms", "scarf"


def crowd(c: Comp, rnd: random.Random, depth: np.ndarray, mat: np.ndarray):
    """Every supporter in both tiers as a tiny sprite, back rows first. Returns the fans, flags and seat samples."""
    fans: list[Fan] = []
    flags = []
    for m, tier, rows_light in ((6, UPPER, (0.5, 0.2)), (4, LOWER, (0.62, 0.36))):
        nrows = int((tier["z1"] - tier["z0"]) / ROW)
        for r in reversed(range(nrows)):
            z = tier["z0"] + (r + 0.55) * ROW
            if m == 6 and z > ROOF_Z1:
                continue
            yfloor = tier["y0"] + (z - tier["z0"]) * tier["k"]
            sw = c.f * SEAT / z                                     # pixels per seat
            w = 1 if sw < 1.9 else 2 if sw < 3.2 else 3
            span = c.view_w * z / c.f / 2 + 4
            x = c.cam_x - span + rnd.random() * SEAT
            while x < c.cam_x + span:
                x += SEAT
                if abs(((x + AISLE_EVERY / 2) % AISLE_EVERY) - AISLE_EVERY / 2) < AISLE_W / 2 + 0.2:
                    continue
                if m == 4 and abs(((x + VOM_EVERY / 2) % VOM_EVERY) - VOM_EVERY / 2) < VOM_W / 2 + 0.2 and VOM_ROWS[0] - 1 <= r < VOM_ROWS[1]:
                    continue
                if rnd.random() > 0.9:
                    continue
                sx, sy = c.project(x, yfloor + 1.25, z)
                ix, iy = int(round(sx)), int(round(sy))
                if not (0 <= ix < c.w and 1 <= iy < c.h):
                    continue
                side = x / 30
                team = "A" if rnd.random() < 0.5 - 0.42 * max(-1, min(1, side)) else "B"
                kit = TEAM_A if team == "A" else TEAM_B
                pick = rnd.random()
                if pick < 0.12:
                    shirt = NEUTRAL[rnd.randrange(len(NEUTRAL))]
                elif pick < 0.32:
                    shirt = kit["alt"][1:]
                else:
                    shirt = kit["shirt"][1:]
                light = rows_light[0] + (rows_light[1] - rows_light[0]) * (r / max(nrows - 1, 1))
                if m == 6:
                    light -= 0.22 * max(0.0, min(1.0, (z - ROOF_Z0) / (tier["z1"] - ROOF_Z0)))
                light += (rnd.random() - 0.5) * 0.14 - 0.12 * min(1, abs(x) / 70)
                acts = [""]
                for _ in range(3):
                    q = rnd.random()
                    acts.append("jump" if q < 0.22 else "arms" if q < 0.36 and w >= 2 else "scarf" if q < 0.43 else "")
                fans.append(Fan(ix, iy, w, max(1, round(sw * 0.75)), shirt, SKINS[rnd.randrange(4)], HAIRS[rnd.randrange(4)],
                                light, z, team, acts))
                if rnd.random() < 0.012 and abs(x) > 3:
                    flags.append((x, yfloor + 3.4, z, team, rnd.random()))
    seats = [(f.x, f.y, f.w) for f in fans]
    return fans, flags, seats


def draw_fans(img, depth, c: Comp, fans: list[Fan], frame: int):
    H, W = img.shape[:2]

    def put(x, y, col, z):
        if 0 <= x < W and 0 <= y < H and depth[y, x] >= z - 0.6:
            img[y, x] = col

    for f in fans:
        a = f.act[frame]
        y = f.y - (1 if a == "jump" else 0)
        sh = shade1(f.shirt, f.v)
        sk = f.skin[1 + (f.v > 0.55)]
        for dy in range(f.rows):
            for dx in range(f.w):
                put(f.x + dx, y + dy, sh if not (dx == 0 and f.w > 1) else shade1(f.shirt, f.v - 0.35), f.depth)
        hx = f.x + (f.w - 1) // 2
        put(hx, y - 1, sk, f.depth)
        if f.w >= 3:
            put(hx + 1, y - 1, sk, f.depth)
            put(hx, y - 2, f.hair[1], f.depth)
            put(hx + 1, y - 2, f.hair[0], f.depth)
        if a == "arms":
            put(f.x - 1, y - 1, sh, f.depth); put(f.x - 1, y - 2, sk, f.depth)
            put(f.x + f.w, y - 1, sh, f.depth); put(f.x + f.w, y - 2, sk, f.depth)
        elif a == "scarf":
            kit = TEAM_A if f.team == "A" else TEAM_B
            for dx in range(-1, f.w + 1):
                put(f.x + dx, y - 2, (kit["shirt"][1] if (dx % 2) else kit["alt"][1]), f.depth)


def draw_flags(img, depth, c: Comp, flags, frame: int):
    H, W = img.shape[:2]
    for (x, y, z, team, phase) in flags:
        kit = TEAM_A if team == "A" else TEAM_B
        x0, y0 = c.project(x, y, z)
        fw = max(4, int(c.f * 2.2 / z)); fh = max(3, int(c.f * 1.4 / z))
        x0, y0 = int(x0), int(y0)
        # pole
        for yy in range(y0, y0 + fh + int(c.f * 1.8 / z)):
            if 0 <= x0 < W and 0 <= yy < H and depth[yy, x0] >= z - 0.6:
                img[yy, x0] = STEEL[3]
        for i in range(fw):
            wave = int(round(math.sin(i * 0.9 + phase * 6 + frame * 1.7) * (0.6 + i / fw)))
            for j in range(fh):
                xx, yy = x0 + 1 + i, y0 + j + wave
                if 0 <= xx < W and 0 <= yy < H and depth[yy, xx] >= z - 0.6:
                    stripe = (j * 3 // fh) == 1 if team == "A" else (i * 3 // fw) == 1
                    base = kit["alt"] if stripe else kit["shirt"]
                    img[yy, xx] = base[2 if (i + wave) % 3 else 1]


def draw_pylons(img, depth, c: Comp):
    """Lattice floodlight pylons behind the stand, with a lamp bank on top. Returns lamp positions for the glow."""
    lamps = []
    H, W = img.shape[:2]
    for (x, z) in c.pylons:
        top = 62.0
        for yy in range(H):
            pass
        bx0, by0 = c.project(x - 1.6, 0, z); bx1, _ = c.project(x + 1.6, 0, z)
        tx0, ty0 = c.project(x - 0.9, top - 7, z); tx1, _ = c.project(x + 0.9, top - 7, z)
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
        # lamp bank
        hx0, hy0 = c.project(x - 4.2, top, z); hx1, hy1 = c.project(x + 4.2, top - 5.2, z)
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


def draw_fascia_lamps(img, depth, mat, c: Comp):
    lamps = []
    H, W = img.shape[:2]
    y_mid = ROOF_Y + 0.55
    for i in range(-30, 31):
        x = i * 3.0
        sx, sy = c.project(x, y_mid, ROOF_Z0 - 0.05)
        ix, iy = int(sx), int(sy)
        if 0 <= ix < W - 1 and 0 <= iy < H and mat[iy, ix] == 8:
            img[iy, ix] = LAMP[2]; img[iy, ix + 1] = LAMP[1]
            if iy + 1 < H and mat[iy + 1, ix] == 8:
                img[iy + 1, ix] = LAMP[0]
            lamps.append((sx, sy, 7.0, 0.55))
    return lamps


def boards(img, mat, c: Comp, rnd):
    """Words on the pitch-side boards and the LED ribbon between the tiers, in screen space."""
    H, W = img.shape[:2]
    for m, words, cols in ((2, ["FUTKRILL", "MATCHDAY", "*", "GAME ON", "*"], ["gold", "cyan", "white", "red", "white"]),
                           (5, ["FUTKRILL", "*", "DAILY 7", "*", "MATCHDAY", "*"], ["cyan", "gold", "white", "gold", "red", "gold"])):
        ys = np.where((mat == m).any(axis=1))[0]
        if m == 5:
            rows = [y for y in ys if (lambda yy: RIBBON[0] <= c.eye + (c.cy - (yy + 0.5)) / c.f * MID_Z <= RIBBON[1])(y)]
            ys = np.array(rows)
        if len(ys) == 0:
            continue
        y0, y1 = int(ys.min()), int(ys.max())
        led_text(img, 0, W, y0, y1 - y0 + 1, words, cols, rnd, mat, m)


# ---------------------------------------------------------------- the two players
def capsule(buf, zb, nb, p0, p1, r0, r1, part, order):
    """Rasterise a tapered capsule into the part buffer, keeping the higher `order` on top, and store each pixel's
    surface normal (as if the capsule were a rounded 3D limb) for shading."""
    H, W = buf.shape
    x0 = int(min(p0[0] - r0, p1[0] - r1)) - 1; x1 = int(max(p0[0] + r0, p1[0] + r1)) + 2
    y0 = int(min(p0[1] - r0, p1[1] - r1)) - 1; y1 = int(max(p0[1] + r0, p1[1] + r1)) + 2
    ax, ay = p0; bx, by = p1
    vx, vy = bx - ax, by - ay
    L2 = vx * vx + vy * vy or 1e-6
    for y in range(max(0, y0), min(H, y1)):
        for x in range(max(0, x0), min(W, x1)):
            qx, qy = x + 0.5 - ax, y + 0.5 - ay
            s = max(0.0, min(1.0, (qx * vx + qy * vy) / L2))
            r = r0 + (r1 - r0) * s
            dx, dy = qx - vx * s, qy - vy * s
            d = math.hypot(dx, dy)
            if d <= r and order >= zb[y, x]:
                buf[y, x] = part; zb[y, x] = order
                nz = math.sqrt(max(0.0, 1 - (d / r) ** 2))
                nb[y, x] = (dx / r, dy / r, nz)


KEY = np.array([-0.12, -0.62, 0.78]) / np.linalg.norm([-0.12, -0.62, 0.78])     # floodlights: above, towards the camera


def footballer(h: int, p: Player, breath: int) -> Image.Image:
    """An invented footballer in a ready stance, about `h` pixels tall, facing right (mirrored to face left).
    Every body part is a tapered capsule with a 3D normal; shading is a key light from the upper left in four banded
    tones (no dithering, as a pixel artist would), a cool rim light from behind, contact shade where one part meets
    another in front of it, then an ink outline. `breath` lifts the upper body by a pixel."""
    W = int(h * 0.66)
    H2 = h + 2
    buf = np.zeros((H2, W), dtype=np.int16)
    zb = np.full((H2, W), -1, dtype=np.int16)
    nb = np.zeros((H2, W, 3))
    u = h / 64.0
    up = breath * max(1, round(u * 0.8))
    cx = W * 0.44

    def P(x, y, lift=True):
        return (cx + x * u, y * u - (up if lift else 0))

    def cap(a, b, r0, r1, part, order):
        capsule(buf, zb, nb, a, b, r0 * u, r1 * u, part, order)

    SKIN, HAIR, SHIRT, SHORTS, LEG, BOOT_, COLLAR, ARM = 1, 2, 3, 4, 5, 6, 7, 8
    # far side (drawn first, so the near side overlaps it)
    cap(P(-2.2, 36.5, False), P(-3.4, 46.5, False), 3.3, 2.6, LEG, 1)              # far thigh / knee
    cap(P(-3.4, 46.5, False), P(-3.8, 58.5, False), 2.6, 1.8, LEG, 1)              # far shin
    cap(P(-4.8, 60.3, False), P(-0.8, 61.2, False), 1.8, 1.9, BOOT_, 2)           # far boot
    cap(P(-4.2, 15.0), P(-5.6, 23.5), 2.5, 2.1, ARM, 2)                            # far upper arm
    cap(P(-5.6, 23.5), P(-4.6, 31.0), 2.0, 1.6, ARM, 2)                            # far forearm
    cap(P(-4.4, 32.4), P(-4.2, 33.2), 1.8, 1.7, SKIN, 2)                           # far hand
    # body
    cap(P(0.4, 15.5), P(0.1, 27.5), 7.0, 5.9, SHIRT, 4)                            # chest and waist
    cap(P(-4.6, 14.8), P(5.0, 14.8), 3.0, 3.0, SHIRT, 3)                           # shoulders (under the chest)
    cap(P(0.0, 29.5), P(0.0, 33.0), 6.2, 6.2, SHORTS, 5)                           # shorts
    cap(P(-2.6, 33.5, False), P(-3.0, 37.0, False), 3.5, 3.3, SHORTS, 5)          # far leg of the shorts
    # near side
    cap(P(2.6, 37.0, False), P(4.4, 46.5, False), 3.6, 2.8, LEG, 6)                # near thigh / knee
    cap(P(4.4, 46.5, False), P(3.8, 58.4, False), 2.8, 2.0, LEG, 6)                # near shin
    cap(P(3.2, 60.2, False), P(8.3, 61.2, False), 2.0, 2.0, BOOT_, 7)             # near boot
    cap(P(2.7, 33.5, False), P(3.6, 37.2, False), 3.7, 3.4, SHORTS, 7)            # near leg of the shorts
    cap(P(1.0, 8.5), P(1.3, 12.8), 2.3, 2.4, SKIN, 8)                              # neck
    cap(P(1.4, 3.6), P(1.9, 7.0), 5.1, 4.3, SKIN, 9)                               # head
    cap(P(5.6, 5.8), P(5.9, 6.3), 1.0, 0.8, SKIN, 9)                               # nose
    if p.style == "short":
        cap(P(0.6, 1.0), P(-1.6, 3.4), 4.6, 3.6, HAIR, 10)
        cap(P(-2.6, 3.2), P(-2.4, 6.4), 2.6, 2.0, HAIR, 10)
        cap(P(2.6, 0.2), P(5.0, 1.6), 2.4, 1.6, HAIR, 10)
    else:
        cap(P(1.0, 0.0), P(-2.0, 2.6), 4.8, 4.0, HAIR, 10)
        cap(P(-2.8, 2.8), P(-3.0, 7.6), 2.8, 2.2, HAIR, 10)
        cap(P(3.4, -0.2), P(6.2, 1.8), 2.4, 1.5, HAIR, 10)
    cap(P(3.6, 14.8), P(5.4, 23.4), 2.7, 2.2, ARM, 11)                             # near upper arm
    cap(P(5.4, 23.4), P(6.6, 31.0), 2.0, 1.6, ARM, 11)                             # near forearm
    cap(P(6.8, 32.4), P(7.0, 33.4), 2.0, 1.9, SKIN, 11)                            # near hand
    cap(P(-1.4, 11.9), P(3.4, 12.3), 1.3, 1.3, COLLAR, 12)                          # collar

    team = p.team
    skin = SKINS[p.skin]; hair = np.vstack([HAIRS[p.hair][:1], HAIRS[p.hair]])
    sock_top, sleeve_end = 49.0 * u, 20.2 * u - up
    out = np.zeros((H2, W, 4), dtype=np.uint8)
    for y in range(H2):
        for x in range(W):
            part = buf[y, x]
            if part == 0:
                continue
            n = nb[y, x]
            v = 0.12 + 0.88 * max(0.0, float(n @ KEY))
            # contact shade: a neighbour that belongs to another part drawn in front of this one
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + ox, y + oy
                if 0 <= xx < W and 0 <= yy < H2 and buf[yy, xx] not in (0, part) and zb[yy, xx] > zb[y, x]:
                    v -= 0.22
                    break
            if part == LEG:
                r = skin if y < sock_top else team["socks"]
                if sock_top <= y < sock_top + max(1, round(u * 1.3)):
                    r = team["alt"] if team is TEAM_B else TEAM_A["shirt"]
            elif part == ARM:
                r = team["shirt"] if y < sleeve_end else skin
                if sleeve_end - max(1, round(u)) <= y < sleeve_end:
                    r = team["alt"]
            else:
                r = {SKIN: skin, HAIR: hair, SHIRT: team["shirt"], SHORTS: team["shorts"], BOOT_: BOOT, COLLAR: team["alt"]}[part]
            k = 0 if v < 0.3 else 1 if v < 0.55 else 2 if v < 0.8 else 3
            col = r[min(k, len(r) - 1)].astype(int)
            if abs(n[0]) > 0.82 and n[1] < 0.35 and part != BOOT_:            # cool rim light from the lamps behind
                col = np.minimum(255, col + np.array([18, 48, 70]))
            out[y, x, :3] = col; out[y, x, 3] = 255
    # face, on the near side: eye (white and pupil), brow, mouth, ear, and a sole highlight on the boots
    def px(xr, yr, col, lift=True):
        xx, yy = int(cx + xr * u), int(yr * u - (up if lift else 0))
        if 0 <= xx < W and 0 <= yy < H2 and out[yy, xx, 3]:
            out[yy, xx, :3] = col
    px(3.9, 4.6, INK); px(3.0, 4.6, hexes("#e8ecf4")[0]) if u > 0.9 else None
    px(3.4, 3.2, hair[1]); px(4.4, 3.2, hair[1])
    px(4.3, 8.0, skin[0]); px(-0.4, 5.4, skin[0]); px(-0.4, 6.4, skin[1])
    for bx_ in (np.arange(3.6, 8.4, 0.8)):
        px(bx_, 62.6, team["alt"][3] if team is TEAM_A else team["shirt"][2], False)
    # shorts side stripe on the near leg
    for yy_ in np.arange(34.0, 37.6, 0.8):
        px(6.6, yy_, team["alt"][2] if team is TEAM_B else TEAM_A["shirt"][2], False)
    # ink outline
    alpha = out[:, :, 3] > 0
    ring = np.zeros_like(alpha)
    ring[1:, :] |= alpha[:-1, :]; ring[:-1, :] |= alpha[1:, :]; ring[:, 1:] |= alpha[:, :-1]; ring[:, :-1] |= alpha[:, 1:]
    ring &= ~alpha
    out[ring, :3] = INK; out[ring, 3] = 255
    im = Image.fromarray(out, "RGBA")
    return im if p.facing > 0 else im.transpose(Image.FLIP_LEFT_RIGHT)


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
    layer = Image.new("RGBA", (c.w, c.h), (0, 0, 0, 0))
    boxes = []
    items = []
    for p in c.players:
        hpx = c.f * 1.8 / p.z
        sprite = footballer(max(24, int(round(hpx))), p, breath)
        fx, fy = c.project(p.x, 0, p.z)
        items.append((p.z, sprite, int(round(fx - sprite.width / 2)), int(round(fy - sprite.height + 1))))
    bz = SPOT_Z
    bd = max(5, int(round(c.f * 0.22 / bz)))
    bx, by = c.project(0, 0.11, bz)
    items.append((bz, ball_sprite(bd), int(round(bx - (bd + 2) / 2)), int(round(by - (bd + 2) / 2))))
    for z, sprite, x, y in sorted(items, key=lambda it: -it[0]):
        layer.alpha_composite(sprite, (x, y))
        boxes.append([x, y, sprite.width, sprite.height])
    return layer, boxes


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
            # a thin wedge from the lamp to a point on the pitch, fading with distance from the lamp
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
    return Comp("wide", 480, 300, f=240, horizon=0.62, pylons=[(-78, 92), (78, 92)], focus=(0.5, 0.6), seed=7, players=[
        Player(-2.95, 5.0, TEAM_A, +1, skin=0, hair=0, style="short"),
        Player(3.0, 4.8, TEAM_B, -1, skin=2, hair=1, style="swept")])


def tall() -> Comp:
    # Phones: the content panel covers the middle of the screen, so the floodlights, roof and crowd sit in the top
    # band and the pitch fills the bottom; the camera is a step left of the halfway line, so it runs diagonally.
    return Comp("tall", 234, 506, f=170, horizon=0.36, pylons=[(-44, 92), (44, 92)], focus=(0.5, 0.4), seed=11, cam_x=-1.1,
                players=[Player(-3.4, 5.2, TEAM_A, +1, skin=0, hair=0, style="short"),
                         Player(1.4, 4.9, TEAM_B, -1, skin=2, hair=1, style="swept")])


def build(c: Comp) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(c.seed)
    img, depth, mat, X, Y = render_back_and_pitch(c, rnd)
    ground = mat == 1
    # back layer: everything but the ground; below the boards, keep the dark apron so parallax never shows a hole
    back = img.copy()
    back[ground] = APRON[1]
    lamps = draw_pylons(back, depth, c)
    lamps += draw_fascia_lamps(back, depth, mat, c)
    boards(back, mat, c, rnd)
    fans, flags, seats = crowd(c, rnd, depth, mat)
    frames = []
    for k in range(4):
        fr = back.copy()
        draw_fans(fr, depth, c, fans, k)
        draw_flags(fr, depth, c, flags, k)
        frames.append(fr)
    name = c.name
    Image.fromarray(frames[0]).save(OUT / f"{name}-back.png")
    for k in range(1, 4):
        diff = np.any(frames[k] != frames[0], axis=2)
        rgba = np.zeros((c.h, c.w, 4), dtype=np.uint8)
        rgba[diff, :3] = frames[k][diff]; rgba[diff, 3] = 255
        Image.fromarray(rgba, "RGBA").save(OUT / f"{name}-crowd-{k}.png")
    pitch = np.zeros((c.h, c.w, 4), dtype=np.uint8)
    pitch[ground, :3] = img[ground]; pitch[ground, 3] = 255
    Image.fromarray(pitch, "RGBA").save(OUT / f"{name}-pitch.png")
    boxes = []
    for k in range(2):
        layer, boxes = players_layer(c, k)
        layer.save(OUT / f"{name}-players-{k + 1}.png")
    for k in range(2):
        front_layer(c, k, c.seed * 31).save(OUT / f"{name}-front-{k + 1}.png")
    glow, beams = light_layers(c, lamps)
    glow.save(OUT / f"{name}-glow.png"); beams.save(OUT / f"{name}-beams.png")
    rs = random.Random(c.seed + 99)
    sample = rs.sample(seats, min(500, len(seats)))
    meta = {"w": c.w, "h": c.h, "view": [c.margin[0], c.margin[1], c.view_w, c.view_h], "focus": list(c.focus),
            "margin": list(c.margin),
            "horizon": c.cy, "lamps": [[round(a, 1), round(b, 1), round(r, 1), k] for a, b, r, k in lamps],
            "seats": [[x, y, w] for x, y, w in sample], "players": boxes}
    (OUT / f"{name}.json").write_text(json.dumps(meta, separators=(",", ":")))
    return {"frames": frames, "pitch": pitch, "meta": meta}


def composite(c: Comp, k: int = 0) -> Image.Image:
    """The scene as the site shows it (for previews): back, crowd frame k, pitch, players, front, light."""
    im = Image.open(OUT / f"{c.name}-back.png").convert("RGBA")
    if k:
        im.alpha_composite(Image.open(OUT / f"{c.name}-crowd-{k}.png"))
    for layer in ("pitch", "players-1", "front-1"):
        im.alpha_composite(Image.open(OUT / f"{c.name}-{layer}.png"))
    base = np.asarray(im).astype(float)
    for layer, strength in (("glow", 0.9), ("beams", 0.5)):
        L = np.asarray(Image.open(OUT / f"{c.name}-{layer}.png")).astype(float)
        base[..., :3] += L[..., :3] * (L[..., 3:] / 255) * strength
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def social_preview():
    """og.png (1200x630) for link previews: the wide scene at 3x, cropped, with the logo on the sky."""
    from make_art import logo
    c = wide()
    im = composite(c, 1).resize((c.w * 3, c.h * 3), Image.NEAREST)
    x0 = (im.width - 1200) // 2
    roof = c.project(0, ROOF_Y + FASCIA_H, ROOF_Z0)[1]
    y0 = int((roof - 44) * 3)                                   # keep a band of sky above the roof for the logo
    og = im.crop((x0, y0, x0 + 1200, y0 + 630)).convert("RGBA")
    lg = logo().im
    big = lg.resize((lg.width * 5, lg.height * 5), Image.NEAREST)
    og.alpha_composite(big, ((1200 - big.width) // 2, 14))
    og.convert("RGB").save(ROOT / "web" / "public" / "art" / "og.png")


def main():
    for c in (wide(), tall()):
        build(c)
        k = 4 if c.name == "wide" else 3
        composite(c).resize((c.w * k, c.h * k), Image.NEAREST).save(ROOT / "art" / f"scene-{c.name}-preview.png")
    social_preview()
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
