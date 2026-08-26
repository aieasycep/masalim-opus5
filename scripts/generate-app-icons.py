#!/usr/bin/env python3
"""Draw the app icon, the Android adaptive foreground and the splash mark.

The images are committed, but the source of them is this file rather than a
designer's export nobody can reproduce. Change a colour or a proportion here and
re-run; the alternative is three binaries whose provenance is a shrug.

    pip install Pillow
    python3 scripts/generate-app-icons.py

The mark is a crescent moon with three stars. It has to survive being 48 px on a
home screen next to thirty other icons, which rules out anything with fine
detail, a wordmark, or more than two colours doing real work. Gold on deep
indigo is the app's night palette and reads as bedtime without a caption.

Every colour below is quoted from packages/ui/src/tokens/colors.ts. That file is
the only place in the repository allowed to hold a hex literal, and this script
is not TypeScript, so the values are duplicated here — deliberately, and with
the names kept identical so a change there is greppable to here.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

# --- palette (mirrors packages/ui/src/tokens/colors.ts) ----------------------
NIGHT_DEEP = (26, 15, 60)  # #1A0F3C  night.deep
NIGHT_INDIGO = (45, 27, 105)  # #2D1B69  night.indigo
GOLD = (255, 217, 125)  # #FFD97D  palette.gold
CREAM = (250, 248, 244)  # #FAF8F4  palette.cream

# Drawn at 4× and reduced, which is the cheapest antialiasing there is and the
# only one that keeps the crescent's inner edge from stair-stepping.
SUPERSAMPLE = 4

ASSETS = Path(__file__).resolve().parent.parent / "apps" / "mobile" / "assets"


def night_gradient(size: int) -> Image.Image:
    """The 160° night gradient, flattened to a vertical ramp.

    A true 160° sweep costs a per-pixel rotation for a difference no one can see
    at icon scale, so the angle is approximated by its dominant axis.
    """
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / max(1, size - 1)
        draw.line(
            [(0, y), (size, y)],
            fill=tuple(
                round(a + (b - a) * t) for a, b in zip(NIGHT_DEEP, NIGHT_INDIGO)
            ),
        )
    return image


def crescent(size: int, diameter: float, centre: tuple[float, float]) -> Image.Image:
    """A crescent as one disc minus a second, offset disc.

    The bite is 78% of the diameter and pushed right and up. A bite the same size
    as the disc gives a lens rather than a moon; much smaller gives a
    gibbous shape that reads as a coin.
    """
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)

    cx, cy = centre
    r = diameter / 2
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)

    bite = diameter * 0.78
    br = bite / 2
    bx = cx + diameter * 0.26
    by = cy - diameter * 0.12
    draw.ellipse([bx - br, by - br, bx + br, by + br], fill=0)

    return mask


def star(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, fill) -> None:
    """A four-pointed sparkle rather than a five-pointed star.

    Five points need line weight to be legible and turn to mush when the icon is
    scaled down; a four-pointed sparkle keeps its shape at any size.
    """
    points = []
    for index in range(8):
        angle = math.pi / 2 * (index / 2) - math.pi / 2
        radius = r if index % 2 == 0 else r * 0.28
        points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    draw.polygon(points, fill=fill)


def draw_mark(size: int, background: Image.Image | None, scale: float) -> Image.Image:
    """The moon and its stars, over `background` or over transparency."""
    s = size * SUPERSAMPLE

    if background is None:
        canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    else:
        canvas = background.resize((s, s), Image.LANCZOS).convert("RGBA")

    diameter = s * scale
    centre = (s * 0.43, s * 0.48)

    moon = Image.new("RGBA", (s, s), GOLD + (255,))
    canvas.paste(moon, (0, 0), crescent(s, diameter, centre))

    stars = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(stars)
    # Placed inside the space the crescent's bite opens up, so they read as part
    # of the mark rather than as debris around it. None may touch the gold: a
    # cream star overlapping the moon looks like a printing fault, not a star.
    # Offsets are from the disc's centre in units of its diameter, and each is
    # checked against the bite in the assertion below.
    for dx, dy, dr in ((0.30, -0.30, 0.062), (0.47, -0.02, 0.040), (0.28, 0.13, 0.034)):
        # The bite is a circle of radius 0.39d at (+0.26d, -0.12d). A star clears
        # the gold when it fits entirely inside that circle. Cheap to assert, and
        # it turns a nudged constant into a failed run instead of a shipped icon
        # with a blemish on it.
        reach = math.hypot(dx - 0.26, dy + 0.12) + dr / scale
        assert reach < 0.39, f"star at ({dx}, {dy}) overlaps the moon: {reach:.3f}"

        star(draw, centre[0] + diameter * dx, centre[1] + diameter * dy, s * dr, CREAM)
    canvas = Image.alpha_composite(canvas, stars)

    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    # The store icon: full bleed, its own background, no transparency.
    icon = draw_mark(1024, night_gradient(1024), scale=0.56)
    icon.convert("RGB").save(ASSETS / "icon.png")

    # Android draws the foreground layer over its own background colour and then
    # crops it to whatever shape the launcher wants — a circle, a squircle, a
    # teardrop. Only the middle ~66% is guaranteed to survive, so the mark is
    # drawn small enough to sit inside that.
    draw_mark(1024, None, scale=0.38).save(ASSETS / "adaptive-icon.png")

    # The splash sits on the configured background colour, so it is transparent
    # and generous: nothing crops it.
    draw_mark(1024, None, scale=0.52).save(ASSETS / "splash-icon.png")

    for name in ("icon.png", "adaptive-icon.png", "splash-icon.png"):
        print(f"{name}: {(ASSETS / name).stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
