"""Математика · Тригонометрия и тригонометрические уравнения.
Казахский текст — черновик, нужна вычитка носителем языка."""
from fractions import Fraction as F

from engine import Template, fmt, frac

TRIG = dict(subject="math", topic="trigonometry")
EQ = dict(subject="math", topic="trig-irrational-equations")

# Пифагоровы тройки (катет, катет, гипотенуза): синус и косинус — «красивые» дроби
TRIPLES = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29)]
# Четверть: знаки (sin, cos) и как её назвать в условии
QUARTERS = {
    1: (1, 1, "0 < \\alpha < \\frac{\\pi}{2}"),
    2: (1, -1, "\\frac{\\pi}{2} < \\alpha < \\pi"),
    3: (-1, -1, "\\pi < \\alpha < \\frac{3\\pi}{2}"),
    4: (-1, 1, "\\frac{3\\pi}{2} < \\alpha < 2\\pi"),
}


def _sc(p):
    a, b, c = TRIPLES[p.t]
    if p.swap:
        a, b = b, a
    ss, cs, rng = QUARTERS[p.q]
    return {"sin": F(ss * a, c), "cos": F(cs * b, c), "rng": rng, "sin_tex": frac(F(ss * a, c)).strip("$")}


# Табличные значения: (запись в формуле, значение)
TABLE = [
    ("\\sin 30^\\circ", F(1, 2)),
    ("\\cos 60^\\circ", F(1, 2)),
    ("\\operatorname{tg} 45^\\circ", F(1)),
    ("\\cos 0^\\circ", F(1)),
    ("\\sin 90^\\circ", F(1)),
    ("\\cos 180^\\circ", F(-1)),
    ("\\sin 270^\\circ", F(-1)),
    ("\\operatorname{ctg} 45^\\circ", F(1)),
    ("\\cos 90^\\circ", F(0)),
    ("\\sin 150^\\circ", F(1, 2)),
    ("\\cos 120^\\circ", F(-1, 2)),
]

TEMPLATES = [
    # cos α по sin α и четверти
    Template(
        id="math.trig.cos-from-sin",
        level="easy",
        **TRIG,
        params={"t": range(len(TRIPLES)), "swap": [0, 1], "q": [1, 2, 3, 4]},
        derived=_sc,
        answer=lambda p: frac(p.cos),
        distractors=[
            lambda p: frac(-p.cos),  # не учёл знак в четверти
            lambda p: frac(p.sin),  # взял синус
            lambda p: frac(1 - abs(p.sin)),  # «cos = 1 − sin»
            lambda p: frac(F(p.cos.denominator, p.cos.numerator)),  # перевернул дробь
            lambda p: frac(-p.sin),
        ],
        text={
            "ru": "Известно, что $\\sin\\alpha = [[sin_tex]]$ и $[[rng]]$. Найдите $\\cos\\alpha$.",
            "kk": "$\\sin\\alpha = [[sin_tex]]$ және $[[rng]]$ екені белгілі. $\\cos\\alpha$ мәнін табыңыз.",
        },
        solution={
            "ru": "$\\cos^2\\alpha = 1 - \\sin^2\\alpha$, по модулю $|\\cos\\alpha| = [[cabs]]$. Знак берём по четверти: $\\cos\\alpha = [[ans]]$. Самая частая ошибка — забыть про знак.",
            "kk": "$\\cos^2\\alpha = 1 - \\sin^2\\alpha$, модулі бойынша $|\\cos\\alpha| = [[cabs]]$. Таңбасын ширек бойынша аламыз: $\\cos\\alpha = [[ans]]$. Ең жиі қате — таңбаны ұмыту.",
        },
    ),
    # sin 2α = 2 sin α cos α
    Template(
        id="math.trig.sin-double",
        level="medium",
        **TRIG,
        params={"t": range(len(TRIPLES)), "swap": [0, 1], "q": [1, 2, 3, 4]},
        derived=_sc,
        answer=lambda p: frac(2 * p.sin * p.cos),
        distractors=[
            lambda p: frac(p.sin * p.cos),  # забыл двойку
            lambda p: frac(-2 * p.sin * p.cos),  # ошибся в знаке косинуса
            lambda p: frac(2 * p.sin),  # «sin 2α = 2 sin α»
            lambda p: frac(p.cos**2 - p.sin**2),  # это cos 2α
            lambda p: frac(2 * abs(p.sin) * abs(p.cos)),
        ],
        text={
            "ru": "Известно, что $\\sin\\alpha = [[sin_tex]]$ и $[[rng]]$. Найдите $\\sin 2\\alpha$.",
            "kk": "$\\sin\\alpha = [[sin_tex]]$ және $[[rng]]$ екені белгілі. $\\sin 2\\alpha$ мәнін табыңыз.",
        },
        solution={
            "ru": "Сначала $\\cos\\alpha = [[cos_tex]]$ (знак — по четверти). Затем $\\sin 2\\alpha = 2\\sin\\alpha\\cos\\alpha = [[ans]]$.",
            "kk": "Алдымен $\\cos\\alpha = [[cos_tex]]$ (таңбасы — ширек бойынша). Содан кейін $\\sin 2\\alpha = 2\\sin\\alpha\\cos\\alpha = [[ans]]$.",
        },
    ),
    # Значение выражения из табличных значений
    Template(
        id="math.trig.table-values",
        level="easy",
        **TRIG,
        params={"i": range(len(TABLE)), "j": range(len(TABLE)), "a": [1, 2, 3, 4], "b": [1, 2, 3, -1, -2]},
        where=lambda p: p.i < p.j,
        derived=lambda p: {
            "e1": (f"{p.a}" if p.a != 1 else "") + TABLE[p.i][0],
            "e2": ("+ " if p.b > 0 else "- ") + (f"{abs(p.b)}" if abs(p.b) != 1 else "") + TABLE[p.j][0],
            "v1": TABLE[p.i][1],
            "v2": TABLE[p.j][1],
        },
        answer=lambda p: p.a * p.v1 + p.b * p.v2,
        distractors=[
            lambda p: p.a * p.v1 - p.b * p.v2,  # ошибся в знаке второго слагаемого
            lambda p: p.v1 + p.v2,  # забыл коэффициенты
            lambda p: p.a * p.v1 + p.b * p.v2 + 1,
            lambda p: p.a * p.v1 + p.b * (1 - p.v2),  # перепутал синус и косинус
            lambda p: p.a + p.b,
        ],
        decimals=2,
        text={
            "ru": "Вычислите: $[[e1]] [[e2]]$.",
            "kk": "Есептеңіз: $[[e1]] [[e2]]$.",
        },
        solution={
            "ru": "Подставляем табличные значения: $[[e1]] = [[w1]]$, второе слагаемое $= [[w2]]$. Сумма: $[[ans]]$.",
            "kk": "Кестелік мәндерді қоямыз: $[[e1]] = [[w1]]$, екінші қосылғыш $= [[w2]]$. Қосындысы: $[[ans]]$.",
        },
    ),
]

# Простейшие уравнения: (функция, значение, запись значения, верная серия, неверные серии)
EQ_CASES = [
    ("\\sin x", "\\frac{1}{2}", "$(-1)^n \\frac{\\pi}{6} + \\pi n$", ["$\\pm\\frac{\\pi}{3} + 2\\pi n$", "$\\frac{\\pi}{6} + 2\\pi n$", "$(-1)^n \\frac{\\pi}{3} + \\pi n$", "$\\frac{\\pi}{6} + \\pi n$"]),
    ("\\sin x", "\\frac{\\sqrt{2}}{2}", "$(-1)^n \\frac{\\pi}{4} + \\pi n$", ["$\\pm\\frac{\\pi}{4} + 2\\pi n$", "$\\frac{\\pi}{4} + \\pi n$", "$(-1)^n \\frac{\\pi}{4} + 2\\pi n$", "$\\frac{\\pi}{4} + 2\\pi n$"]),
    ("\\sin x", "\\frac{\\sqrt{3}}{2}", "$(-1)^n \\frac{\\pi}{3} + \\pi n$", ["$\\pm\\frac{\\pi}{6} + 2\\pi n$", "$(-1)^n \\frac{\\pi}{6} + \\pi n$", "$\\frac{\\pi}{3} + \\pi n$", "$\\pm\\frac{\\pi}{3} + 2\\pi n$"]),
    ("\\sin x", "-\\frac{1}{2}", "$(-1)^{n+1} \\frac{\\pi}{6} + \\pi n$", ["$(-1)^n \\frac{\\pi}{6} + \\pi n$", "$\\pm\\frac{2\\pi}{3} + 2\\pi n$", "$-\\frac{\\pi}{6} + \\pi n$", "$(-1)^{n+1} \\frac{\\pi}{3} + \\pi n$"]),
    ("\\cos x", "\\frac{1}{2}", "$\\pm\\frac{\\pi}{3} + 2\\pi n$", ["$(-1)^n \\frac{\\pi}{6} + \\pi n$", "$\\pm\\frac{\\pi}{6} + 2\\pi n$", "$\\frac{\\pi}{3} + \\pi n$", "$\\pm\\frac{\\pi}{3} + \\pi n$"]),
    ("\\cos x", "\\frac{\\sqrt{2}}{2}", "$\\pm\\frac{\\pi}{4} + 2\\pi n$", ["$(-1)^n \\frac{\\pi}{4} + \\pi n$", "$\\frac{\\pi}{4} + \\pi n$", "$\\pm\\frac{\\pi}{4} + \\pi n$", "$\\pm\\frac{3\\pi}{4} + 2\\pi n$"]),
    ("\\cos x", "\\frac{\\sqrt{3}}{2}", "$\\pm\\frac{\\pi}{6} + 2\\pi n$", ["$(-1)^n \\frac{\\pi}{3} + \\pi n$", "$\\pm\\frac{\\pi}{3} + 2\\pi n$", "$\\frac{\\pi}{6} + \\pi n$", "$\\pm\\frac{\\pi}{6} + \\pi n$"]),
    ("\\cos x", "-\\frac{1}{2}", "$\\pm\\frac{2\\pi}{3} + 2\\pi n$", ["$\\pm\\frac{\\pi}{3} + 2\\pi n$", "$(-1)^n \\frac{2\\pi}{3} + \\pi n$", "$-\\frac{\\pi}{3} + 2\\pi n$", "$\\pm\\frac{2\\pi}{3} + \\pi n$"]),
    ("\\operatorname{tg} x", "1", "$\\frac{\\pi}{4} + \\pi n$", ["$\\frac{\\pi}{4} + 2\\pi n$", "$\\pm\\frac{\\pi}{4} + 2\\pi n$", "$(-1)^n \\frac{\\pi}{4} + \\pi n$", "$\\frac{\\pi}{2} + \\pi n$"]),
    ("\\operatorname{tg} x", "\\sqrt{3}", "$\\frac{\\pi}{3} + \\pi n$", ["$\\frac{\\pi}{6} + \\pi n$", "$\\frac{\\pi}{3} + 2\\pi n$", "$\\pm\\frac{\\pi}{3} + 2\\pi n$", "$(-1)^n \\frac{\\pi}{3} + \\pi n$"]),
    ("\\operatorname{tg} x", "-1", "$-\\frac{\\pi}{4} + \\pi n$", ["$\\frac{\\pi}{4} + \\pi n$", "$\\frac{3\\pi}{4} + 2\\pi n$", "$\\pm\\frac{\\pi}{4} + \\pi n$", "$-\\frac{\\pi}{4} + 2\\pi n$"]),
]

TEMPLATES.append(
    Template(
        id="math.trig.simple-equation",
        level="medium",
        **EQ,
        params={"k": range(len(EQ_CASES))},
        derived=lambda p: {"f": EQ_CASES[p.k][0], "v": EQ_CASES[p.k][1]},
        answer=lambda p: EQ_CASES[p.k][2],
        distractors=[(lambda p, i=i: EQ_CASES[p.k][3][i]) for i in range(4)],
        text={
            "ru": "Решите уравнение: $[[f]] = [[v]]$ ($n \\in \\mathbb{Z}$).",
            "kk": "Теңдеуді шешіңіз: $[[f]] = [[v]]$ ($n \\in \\mathbb{Z}$).",
        },
        solution={
            "ru": "Общие формулы: $\\sin x = a \\Rightarrow x = (-1)^n \\arcsin a + \\pi n$; $\\cos x = a \\Rightarrow x = \\pm\\arccos a + 2\\pi n$; $\\operatorname{tg} x = a \\Rightarrow x = \\operatorname{arctg} a + \\pi n$. Ответ: [[ans]].",
            "kk": "Жалпы формулалар: $\\sin x = a \\Rightarrow x = (-1)^n \\arcsin a + \\pi n$; $\\cos x = a \\Rightarrow x = \\pm\\arccos a + 2\\pi n$; $\\operatorname{tg} x = a \\Rightarrow x = \\operatorname{arctg} a + \\pi n$. Жауабы: [[ans]].",
        },
    )
)


def _chain(base, more):
    def derived(p):
        p.update(base(p))
        return more(p)

    return derived


_EXTRA = {
    "math.trig.cos-from-sin": lambda p: {"cabs": frac(abs(p.cos)).strip("$")},
    "math.trig.sin-double": lambda p: {"cos_tex": frac(p.cos).strip("$")},
    "math.trig.table-values": lambda p: {"w1": fmt(p.a * p.v1).replace("−", "-"), "w2": fmt(p.b * p.v2).replace("−", "-")},
}
for _t in TEMPLATES:
    if _t.id in _EXTRA:
        _t.derived = _chain(_t.derived, _EXTRA[_t.id])
