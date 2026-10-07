"""Draws the toolbar icons: a graphite glass tile holding a white ring (the hand cursor) and a
green dot (ready). Pure Python, so no imaging library is needed."""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
SS = 4  # supersampling per axis


def png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def rounded_rect(x, y, s, r):
    dx = max(abs(x - s / 2) - (s / 2 - r), 0)
    dy = max(abs(y - s / 2) - (s / 2 - r), 0)
    return math.hypot(dx, dy) <= r


def sample(x, y, s):
    """Colour (r, g, b, a) at a point of an s-by-s icon."""
    if not rounded_rect(x, y, s, s * 0.235):
        return (0, 0, 0, 0)
    t = y / s  # graphite, a touch lighter at the top
    base = (int(52 - 22 * t), int(52 - 22 * t), int(58 - 22 * t))
    cx, cy = s * 0.5, s * 0.5
    d = math.hypot(x - cx, y - cy)
    ring_r, ring_w = s * 0.27, max(s * 0.085, 1.6)
    if abs(d - ring_r) <= ring_w / 2:
        return (255, 255, 255, 255)
    dot = math.hypot(x - s * 0.5, y - s * 0.5)
    if dot <= s * 0.1:
        return (93, 202, 165, 255)
    return (*base, 255)


def render(size):
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    r, g, b, a = sample(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, size)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            a = acc[3]
            n = SS * SS
            row += [acc[0] // a, acc[1] // a, acc[2] // a, a // n] if a else [0, 0, 0, 0]
        rows.append(row)
    png(OUT / f"icon{size}.png", size, size, rows)


for size in (16, 32, 48, 128):
    render(size)
print("icons written to", OUT)
