"""
Generate ultra-HD 4K seamless dark-blue diagonal-stripe header background.
Output: header_bg_4k.png  (3840 x 1200)
"""

import math
from PIL import Image, ImageDraw, ImageFilter

# ---------- Config ----------
W, H = 3840, 1200
OUT = "header_bg_4k.png"

# Gradient endpoints (navy -> royal blue -> navy) for premium look
NAVY_DARK   = (8,  17,  36)    # very deep navy (edges)
NAVY_MID    = (12, 28,  58)    # mid
ROYAL       = (20, 48,  96)    # royal blue highlight band
CENTER_DARK = (6,  14,  30)    # darker center for text legibility

# Stripe settings
STRIPE_SPACING = 14            # px between stripe centers (fine, even)
STRIPE_WIDTH   = 1.0           # px line thickness
STRIPE_ALPHA   = 28            # 0-255 subtle
STRIPE_GLOW_ALPHA = 10         # soft glow layer
ANGLE_DEG = 135                # diagonal direction


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def build_gradient(w, h):
    """Vertical gradient + horizontal center-darkening vignette."""
    base = Image.new("RGB", (w, h), NAVY_DARK)
    px = base.load()

    for y in range(h):
        # vertical: dark -> royal mid -> dark (smooth)
        ty = y / (h - 1)
        if ty < 0.5:
            v_col = lerp(NAVY_DARK, ROYAL, ty / 0.5)
        else:
            v_col = lerp(ROYAL, NAVY_MID, (ty - 0.5) / 0.5)

        for x in range(w):
            tx = x / (w - 1)
            # horizontal vignette: darker in the center for text
            # parabolic factor: 0 at edges, 1 at center
            center_factor = 1.0 - abs(tx - 0.5) * 2.0
            center_factor = max(0.0, center_factor) ** 1.4
            col = lerp(v_col, CENTER_DARK, center_factor * 0.55)
            px[x, y] = col

    # Soft blur to ensure perfectly smooth gradient (no banding)
    base = base.filter(ImageFilter.GaussianBlur(radius=2))
    return base


def draw_diagonal_stripes(size, spacing, width, alpha, angle_deg):
    """Draw evenly spaced diagonal lines on transparent layer."""
    w, h = size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # 135 degrees -> lines going from top-right to bottom-left
    # Parametrize: line equation x + y = c  (for 135deg / -45deg slope)
    # spacing along the perpendicular (at 45deg) -> step in c is spacing*sqrt(2)
    step = spacing * math.sqrt(2)

    # Range of c values covering the canvas
    c_min = 0 - h
    c_max = w + h
    c = c_min
    color = (170, 200, 255, alpha)  # cool light-blue stripe

    while c <= c_max:
        # line from (c, 0) to (c - h, h)  i.e. x = c - y
        x1, y1 = c, 0
        x2, y2 = c - h, h
        draw.line([(x1, y1), (x2, y2)], fill=color, width=int(round(width)))
        c += step

    return layer


def main():
    print(f"Building gradient {W}x{H} ...")
    bg = build_gradient(W, H).convert("RGBA")

    print("Drawing diagonal stripe layer ...")
    stripes = draw_diagonal_stripes((W, H), STRIPE_SPACING, STRIPE_WIDTH,
                                    STRIPE_ALPHA, ANGLE_DEG)

    print("Drawing soft glow stripe layer ...")
    glow = draw_diagonal_stripes((W, H), STRIPE_SPACING, STRIPE_WIDTH * 3,
                                 STRIPE_GLOW_ALPHA, ANGLE_DEG)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=2.2))

    print("Compositing ...")
    composed = Image.alpha_composite(bg, glow)
    composed = Image.alpha_composite(composed, stripes)

    # Final very light blur on stripes already done; flatten to RGB
    final = composed.convert("RGB")

    print(f"Saving {OUT} ...")
    final.save(OUT, "PNG", optimize=True)
    print("Done.")


if __name__ == "__main__":
    main()
