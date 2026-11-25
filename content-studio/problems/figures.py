"""Рисунки к задачам: маленькие SVG из кода. Показываются на белой плашке, поэтому цвета тёмные.
Подписи — латиница, цифры и единицы СИ, одинаковые для ru и kk."""
from __future__ import annotations

import math

INK = "#1f2937"
ACCENT = "#059669"
MUTED = "#9ca3af"
FONT = "font-family='Inter,Arial,sans-serif'"


def _fmt(x: float) -> str:
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return s.replace(".", ",") if "." in s else s


def svg(w: int, h: int, body: str) -> str:
    return (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' width='{w}' height='{h}'>"
            f"<rect width='{w}' height='{h}' fill='white'/>{body}</svg>")


def text(x: float, y: float, s: str, size: int = 14, color: str = INK, anchor: str = "middle", italic: bool = False) -> str:
    st = " font-style='italic'" if italic else ""
    return f"<text x='{x:.1f}' y='{y:.1f}' font-size='{size}' fill='{color}' text-anchor='{anchor}' {FONT}{st}>{s}</text>"


def line(x1, y1, x2, y2, color=INK, w=2, dash=False) -> str:
    d = " stroke-dasharray='5 4'" if dash else ""
    return f"<line x1='{x1:.1f}' y1='{y1:.1f}' x2='{x2:.1f}' y2='{y2:.1f}' stroke='{color}' stroke-width='{w}'{d}/>"


def poly(points, color=INK, w=2, fill="none", closed=True) -> str:
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    tag = "polygon" if closed else "polyline"
    return f"<{tag} points='{pts}' fill='{fill}' stroke='{color}' stroke-width='{w}' stroke-linejoin='round'/>"


# ---------- геометрия ----------

def right_triangle(a_label: str, b_label: str, c_label: str, angle_label: str | None = None, ratio: float = 0.75) -> str:
    """Прямоугольный треугольник: катет a — вертикальный, b — горизонтальный, c — гипотенуза. ratio = a / b."""
    w, h = (220.0, 220.0 * ratio) if ratio <= 140 / 220 else (140.0 / ratio, 140.0)
    w, h = max(w, 70.0), max(h, 50.0)
    x0, y0 = 90.0, 170.0
    A, B, C = (x0, y0 - h), (x0, y0), (x0 + w, y0)
    body = poly([A, B, C], fill="#ecfdf5")
    body += poly([(x0, y0 - 15), (x0 + 15, y0 - 15), (x0 + 15, y0)], w=1.5, closed=False)  # прямой угол
    body += text(x0 - 10, y0 - h / 2 + 5, a_label, anchor="end")
    body += text(x0 + w / 2, y0 + 22, b_label)
    body += text(x0 + w / 2 + 12, y0 - h / 2 - 6, c_label, anchor="start")
    if angle_label:
        ang = math.atan2(h, w)
        ex, ey = x0 + w - 30 * math.cos(ang), y0 - 30 * math.sin(ang)
        body += f"<path d='M {x0 + w - 30:.1f} {y0} A 30 30 0 0 0 {ex:.1f} {ey:.1f}' fill='none' stroke='{ACCENT}' stroke-width='2'/>"
        body += text(x0 + w - 42, y0 - 8, angle_label, size=13, color=ACCENT)
    return svg(int(x0 + w + 40), 205, body)


def cone(r_label: str, h_label: str, l_label: str | None = None) -> str:
    """Конус в разрезе: высота, радиус основания, образующая."""
    top, cx, cy, rx = (150, 25), 150, 165, 90
    body = f"<ellipse cx='{cx}' cy='{cy}' rx='{rx}' ry='18' fill='#ecfdf5' stroke='{INK}' stroke-width='2'/>"
    body += line(cx - rx, cy, *top) + line(cx + rx, cy, *top)
    body += line(*top, cx, cy, dash=True, color=MUTED) + line(cx, cy, cx + rx, cy, dash=True, color=MUTED)
    body += text(cx + 6, 132, h_label, anchor="start") + text(cx + rx / 2, cy + 38, r_label)
    if l_label:
        body += text(cx + rx / 2 + 14, (top[1] + cy) / 2, l_label, anchor="start", italic=True)
    return svg(300, 215, body)


# ---------- графики ----------

def graph(points: list[tuple[float, float]], x_label: str, y_label: str, x_ticks: list[float], y_ticks: list[float]) -> str:
    """Ломаная по точкам с осями и сеткой (например, v(t))."""
    W, H, L, B, R, T = 350, 220, 46, 186, 296, 18
    xmax, ymax = max(x_ticks), max(y_ticks)
    ymin = min(0.0, min(y_ticks))
    X = lambda x: L + (R - L) * x / xmax
    Y = lambda y: B - (B - T) * (y - ymin) / (ymax - ymin)
    body = ""
    for t in x_ticks:
        body += line(X(t), T, X(t), B, color="#e5e7eb", w=1) + text(X(t), B + 16, _fmt(t), size=12, color="#4b5563")
    for t in y_ticks:
        body += line(L, Y(t), R, Y(t), color="#e5e7eb", w=1) + text(L - 6, Y(t) + 4, _fmt(t), size=12, color="#4b5563", anchor="end")
    body += line(L, Y(0), R + 12, Y(0)) + line(L, B, L, T - 8)
    body += text(R + 16, Y(0) + 5, x_label, size=13, italic=True, anchor="start") + text(L + 6, T - 2, y_label, size=13, italic=True, anchor="start")
    body += poly([(X(x), Y(y)) for x, y in points], color=ACCENT, w=3, closed=False)
    return svg(W, H + 8, body)


# ---------- электрические цепи ----------

def _resistor(x: float, y: float, label: str, vertical: bool = False) -> str:
    if vertical:
        return f"<rect x='{x - 9}' y='{y - 22}' width='18' height='44' fill='white' stroke='{INK}' stroke-width='2'/>" + text(x + 16, y + 5, label, anchor="start")
    return f"<rect x='{x - 22}' y='{y - 9}' width='44' height='18' fill='white' stroke='{INK}' stroke-width='2'/>" + text(x, y - 15, label)


def _battery(x: float, y: float, label: str) -> str:
    return (line(x - 4, y - 14, x - 4, y + 14, w=2) + line(x + 4, y - 8, x + 4, y + 8, w=4)
            + text(x, y + 32, label))


def circuit_series(labels: list[str], source: str) -> str:
    """Последовательная цепь: источник внизу, резисторы сверху в ряд."""
    n = len(labels)
    W, top, bottom = 80 + 90 * n, 50, 150
    body = line(30, top, W - 30, top) + line(30, top, 30, bottom) + line(W - 30, top, W - 30, bottom)
    mid = W / 2
    body += line(30, bottom, mid - 4, bottom) + line(mid + 4, bottom, W - 30, bottom)
    for i, lab in enumerate(labels):
        body += _resistor(75 + 90 * i, top, lab)
    body += _battery(mid, bottom, source)
    return svg(W, 195, body)


def circuit_parallel(labels: list[str], source: str) -> str:
    """Параллельное соединение: резисторы — вертикальные ветви между двумя шинами, источник — в левой ветви."""
    n = len(labels)
    gap, x0, top, bottom = 130, 130, 30, 170
    xr = x0 + gap * (n - 1)
    W = xr + 110
    body = line(40, top, xr, top) + line(40, bottom, xr, bottom)
    for i, lab in enumerate(labels):
        x = x0 + gap * i
        body += line(x, top, x, bottom) + _resistor(x, (top + bottom) / 2, lab, vertical=True)
    mid = (top + bottom) / 2
    body += line(40, top, 40, mid - 5) + line(40, mid + 5, 40, bottom)
    body += line(26, mid - 5, 54, mid - 5, w=2) + line(32, mid + 5, 48, mid + 5, w=4)
    body += text(40, bottom + 26, source)
    return svg(W, 210, body)


# ---------- рычаг ----------

def lever(l1_label: str, l2_label: str, f1_label: str, f2_label: str, ratio: float) -> str:
    """Рычаг на опоре: плечо l1 слева, l2 справа (ratio = l1 / (l1 + l2))."""
    L, R, y = 30, 290, 70
    px = L + (R - L) * ratio
    body = line(L, y, R, y, w=5) + poly([(px, y + 3), (px - 14, y + 30), (px + 14, y + 30)], fill="#ecfdf5")
    body += line(L, y + 8, L, y + 48, color=ACCENT, w=2.5) + poly([(L - 6, y + 40), (L + 6, y + 40), (L, y + 50)], color=ACCENT, fill=ACCENT)
    body += line(R, y + 8, R, y + 48, color=ACCENT, w=2.5) + poly([(R - 6, y + 40), (R + 6, y + 40), (R, y + 50)], color=ACCENT, fill=ACCENT)
    body += text(L + 14, y + 66, f1_label, anchor="start") + text(R - 14, y + 66, f2_label, anchor="end")
    body += text((L + px) / 2, y - 12, l1_label) + text((px + R) / 2, y - 12, l2_label)
    return svg(320, 150, body)


def angle_deg(rad: float) -> float:
    return rad * 180 / math.pi


def trapezoid(a_label: str, b_label: str, h_label: str, c_label: str | None = None, ratio: float = 0.5) -> str:
    """Равнобедренная трапеция: нижнее основание a, верхнее b (ratio = b / a), высота h пунктиром, боковая сторона c."""
    x0, y0, w, hh = 40.0, 165.0, 240.0, 110.0
    top = w * max(0.25, min(ratio, 0.8))
    off = (w - top) / 2
    A, B, C, D = (x0, y0), (x0 + w, y0), (x0 + w - off, y0 - hh), (x0 + off, y0 - hh)
    body = poly([A, B, C, D], fill="#ecfdf5")
    body += line(D[0], D[1], D[0], y0, dash=True, color=MUTED)
    body += poly([(D[0], y0 - 12), (D[0] + 12, y0 - 12), (D[0] + 12, y0)], w=1.2, color=MUTED, closed=False)
    body += text(x0 + w / 2, y0 + 22, a_label) + text(x0 + w / 2, y0 - hh - 10, b_label)
    body += text(D[0] + 6, y0 - hh / 2 + 5, h_label, anchor="start")
    if c_label:
        body += text(x0 + w - off / 2 + 10, y0 - hh / 2, c_label, anchor="start")
    return svg(320, 200, body)


def pyramid(a_label: str, h_label: str, f_label: str | None = None) -> str:
    """Правильная четырёхугольная пирамида: сторона основания a, высота h, апофема f."""
    A, B, C, D = (40, 175), (230, 175), (290, 130), (100, 130)
    O = ((A[0] + C[0]) / 2, (A[1] + C[1]) / 2)
    S = (O[0], 25)
    M = ((A[0] + B[0]) / 2, 175)
    body = poly([A, B, C, S], fill="#ecfdf5") + line(*A, *S) + line(*B, *S) + line(*C, *S)
    body += line(*A, *D, dash=True, color=MUTED) + line(*D, *C, dash=True, color=MUTED) + line(*D, *S, dash=True, color=MUTED)
    body += line(*S, *O, dash=True, color=ACCENT) + line(*O, *M, dash=True, color=MUTED)
    body += text((A[0] + B[0]) / 2, 196, a_label) + text(O[0] + 5, 108, h_label, size=13, anchor="start", color=ACCENT).replace("<text ", "<text stroke='white' stroke-width='4' paint-order='stroke' ")
    if f_label:
        body += line(*S, *M, color=ACCENT, w=1.5) + text(S[0] + 0.85 * (M[0] - S[0]) - 6, S[1] + 0.85 * (M[1] - S[1]) + 2, f_label, anchor="end", italic=True)
    return svg(320, 210, body)
