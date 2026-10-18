"""The footballers and the ball for the matchday scene (art/scene.py): invented, generic players drawn from tapered
capsules with 3D normals, shaded in banded tones with a rim light and an ink outline. Small players are drawn at 4x and
reduced part by part, so they stay crisp. No crests, logos or readable numbers."""
from __future__ import annotations

import math

import numpy as np
from PIL import Image


def hexes(*codes: str) -> np.ndarray:
    return np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in codes], dtype=np.uint8)


def shade1(colors: np.ndarray, v: float) -> np.ndarray:
    return colors[int(round(min(1.0, max(0.0, v)) * (len(colors) - 1)))]


INK = hexes("#070a18")[0]
SKYBLUE = hexes("#22568e", "#3b7ec4", "#68aee8", "#a4d4ff")
WHITE = hexes("#8e9ab8", "#c6d0e0", "#eef2fa", "#ffffff")
CRIMSON = hexes("#5a1022", "#9a1f34", "#d23a46", "#f2706a")
GREEN = hexes("#0c2a1c", "#16482c", "#1f6a3a", "#3a8a54")
LIME = hexes("#4a5410", "#8a9a18", "#c6dc30", "#eeff7a")
BLACK = hexes("#05060c", "#10131e", "#1c2132", "#2c3348")
ORANGE = hexes("#6a2c08", "#b8520e", "#ee8a22", "#ffc060")
# a kit: shirt, alt (collar, sleeve trim), shorts, socks, the band at the top of the socks, the boot sole and the
# stripe down the shorts
TEAM_A = dict(shirt=SKYBLUE, alt=WHITE, shorts=WHITE, socks=WHITE, band=SKYBLUE, sole=WHITE[3], stripe=SKYBLUE[2])
TEAM_B = dict(shirt=CRIMSON, alt=GREEN, shorts=GREEN, socks=CRIMSON, band=GREEN, sole=CRIMSON[2], stripe=GREEN[2])
REF = dict(shirt=LIME, alt=BLACK, shorts=BLACK, socks=BLACK, band=LIME, sole=BLACK[3], stripe=LIME[2])
KEEPER = dict(shirt=ORANGE, alt=BLACK, shorts=BLACK, socks=ORANGE, band=BLACK, sole=ORANGE[2], stripe=ORANGE[2])
KITS = {"A": TEAM_A, "B": TEAM_B, "REF": REF, "AR": REF, "GK": KEEPER}
SKINS = [hexes("#7a4c30", "#a8714c", "#d9a57a", "#f2c9a0"), hexes("#4a2c1a", "#70452a", "#9a6440", "#c08458"),
         hexes("#5c3a24", "#8a5a3a", "#b8805a", "#e0ac80"), hexes("#2e1a10", "#4a2c1a", "#6c4228", "#8e5c3a")]
HAIRS = [hexes("#120c0a", "#24160e", "#3a2418"), hexes("#2e1c10", "#5a3a20", "#8a5a32"), hexes("#0c0a0e", "#18141a", "#2a2430"),
         hexes("#5a4a2a", "#8a7440", "#b89c5a")]
BOOT = hexes("#05060c", "#141826", "#2a3048")
FLAG_AR = hexes("#e8d020", "#d83020")


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
