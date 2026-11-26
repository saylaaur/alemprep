"""Математика · новые типы задач (ночь 2): степени, корни, выражения, иррациональные и тригонометрические
уравнения, системы, неравенства, прогрессии, планиметрия, стереометрия, векторы, анализ, контекстные блоки.
Ответы считаются в коде (перебором или по формуле), неверные варианты — типичные ошибки ученика.
Казахский текст — черновик, нужна вычитка носителем языка."""
import math
from fractions import Fraction as F

from ctx import Q
from engine import INF, Context, P, Template, fmt, fmt_tex, frac, iv, lead, pi_ans, term
from figures import pyramid, right_triangle, trapezoid


def T(topic: str, level: str = "medium") -> dict:
    return dict(subject="math", topic=topic, level=level)


def sq(k: int, m: int) -> str:
    """k√m в LaTeX как вариант ответа."""
    r = math.isqrt(m)
    if r * r == m:  # √4 → 2: неупрощённый корень ученик отбросит сразу
        return f"${k * r}$"
    return f"$\\sqrt{{{m}}}$" if k == 1 else f"${k}\\sqrt{{{m}}}$"


def fac(r1: int, r2: int) -> str:
    """(x − r1)(x − r2) в LaTeX."""
    def one(r):
        return "x" if r == 0 else f"(x {'-' if r > 0 else '+'} {abs(r)})"
    a, b = one(r1), one(r2)
    return f"${a}{b}$" if a != "x" else f"$x{b}$"


def tex_iv(s: str) -> str:
    return s


_BASE = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29), (9, 40, 41)]
TRIPLES = sorted({(a * k, b * k, c * k) for a, b, c in _BASE for k in (1, 2, 3) if c * k <= 60})
HERON = [(13, 14, 15, 84), (5, 5, 6, 12), (5, 5, 8, 12), (10, 13, 13, 60), (9, 10, 17, 36), (11, 13, 20, 66), (7, 15, 20, 42), (13, 20, 21, 126), (10, 17, 21, 84), (12, 17, 25, 90)]

# Тригонометрические уравнения: (уравнение, верный ответ, ошибки)
TRIG_EQ = [
    ("\\sin x = \\frac{1}{2}", "(-1)^n \\frac{\\pi}{6} + \\pi n", ["\\pm \\frac{\\pi}{6} + 2\\pi n", "\\frac{\\pi}{6} + \\pi n", "(-1)^n \\frac{\\pi}{3} + \\pi n"]),
    ("\\cos x = \\frac{1}{2}", "\\pm \\frac{\\pi}{3} + 2\\pi n", ["(-1)^n \\frac{\\pi}{3} + \\pi n", "\\pm \\frac{\\pi}{6} + 2\\pi n", "\\frac{\\pi}{3} + \\pi n"]),
    ("\\operatorname{tg} x = 1", "\\frac{\\pi}{4} + \\pi n", ["\\frac{\\pi}{4} + 2\\pi n", "\\pm \\frac{\\pi}{4} + 2\\pi n", "\\frac{\\pi}{2} + \\pi n"]),
    ("\\operatorname{tg} x = \\sqrt{3}", "\\frac{\\pi}{3} + \\pi n", ["\\frac{\\pi}{6} + \\pi n", "\\frac{\\pi}{3} + 2\\pi n", "\\pm \\frac{\\pi}{3} + 2\\pi n"]),
    ("\\sin x = 0", "\\pi n", ["\\frac{\\pi}{2} + \\pi n", "2\\pi n", "\\frac{\\pi}{2} + 2\\pi n"]),
    ("\\cos x = 0", "\\frac{\\pi}{2} + \\pi n", ["\\pi n", "\\frac{\\pi}{2} + 2\\pi n", "2\\pi n"]),
    ("\\sin x = 1", "\\frac{\\pi}{2} + 2\\pi n", ["\\frac{\\pi}{2} + \\pi n", "\\pi n", "2\\pi n"]),
    ("\\cos x = -1", "\\pi + 2\\pi n", ["\\pi n", "-\\frac{\\pi}{2} + 2\\pi n", "2\\pi n"]),
    ("\\cos x = \\frac{\\sqrt{2}}{2}", "\\pm \\frac{\\pi}{4} + 2\\pi n", ["(-1)^n \\frac{\\pi}{4} + \\pi n", "\\frac{\\pi}{4} + \\pi n", "\\pm \\frac{\\pi}{3} + 2\\pi n"]),
    ("\\sin x = \\frac{\\sqrt{3}}{2}", "(-1)^n \\frac{\\pi}{3} + \\pi n", ["\\pm \\frac{\\pi}{3} + 2\\pi n", "(-1)^n \\frac{\\pi}{6} + \\pi n", "\\frac{\\pi}{3} + 2\\pi n"]),
    ("\\operatorname{ctg} x = 1", "\\frac{\\pi}{4} + \\pi n", ["\\frac{3\\pi}{4} + \\pi n", "\\frac{\\pi}{4} + 2\\pi n", "\\pm \\frac{\\pi}{4} + 2\\pi n"]),
    ("\\operatorname{tg} x = -1", "-\\frac{\\pi}{4} + \\pi n", ["\\frac{\\pi}{4} + \\pi n", "-\\frac{\\pi}{4} + 2\\pi n", "\\pm \\frac{\\pi}{4} + 2\\pi n"]),
]

# sin x = c / cos x = c: значения и подпись
TRIG_C = [(F(1, 2), "\\frac{1}{2}"), (F(-1, 2), "-\\frac{1}{2}"), (math.sqrt(2) / 2, "\\frac{\\sqrt{2}}{2}"), (math.sqrt(3) / 2, "\\frac{\\sqrt{3}}{2}"), (-math.sqrt(3) / 2, "-\\frac{\\sqrt{3}}{2}")]


def count_roots(fn: str, c: float, n: int) -> int:
    """Число корней sin x = c или cos x = c на отрезке [0; nπ] — точный подсчёт по формулам решений."""
    base = math.asin(c) if fn == "sin" else math.acos(c)
    cands = set()
    for k in range(-3, n + 4):
        if fn == "sin":
            xs = (base + 2 * math.pi * k, math.pi - base + 2 * math.pi * k)
        else:
            xs = (base + 2 * math.pi * k, -base + 2 * math.pi * k)
        for x in xs:
            if -1e-9 <= x <= n * math.pi + 1e-9:
                cands.add(round(x, 9))
    return len(cands)


def int_count(lo: F, lo_inc: bool, hi: F, hi_inc: bool) -> int:
    return sum(1 for x in range(-60, 61) if (x > lo or (lo_inc and x == lo)) and (x < hi or (hi_inc and x == hi)))


def ru_years(n: int) -> str:
    return "год" if n % 10 == 1 and n % 100 != 11 else "года" if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else "лет"


TEMPLATES = [
    # ---------- степени ----------
    Template(
        id="math.m.pow.same-base-value", **T("powers", "easy"),
        params={"a": [2, 3, 5], "m": [2, 3, 4, 5, 6, 7], "n": [-2, -1, 2, 3, 4], "k": [3, 4, 5, 6, 7, 8]},
        derived=lambda p: {"e": p.m + p.n - p.k},
        where=lambda p: 0 <= p.m + p.n - p.k <= (4 if p.a == 2 else 3) and p.m + p.n - p.k != p.m * p.n - p.k,
        answer=lambda p: p.a ** (p.m + p.n - p.k),
        distractors=[lambda p: F(p.a) ** (p.m * p.n - p.k), lambda p: p.a ** (p.m + p.n + p.k) if p.m + p.n + p.k < 9 else p.a ** (p.m + p.n - p.k + 1),
                     lambda p: p.a ** (p.m + p.n - p.k) * p.a, lambda p: (p.m + p.n - p.k) * p.a],
        spread=None, valid=lambda p, x: x >= 1 and float(x).is_integer(),
        text={"ru": "Вычислите: $\\dfrac{[[a]]^{[[m]]} \\cdot [[a]]^{[[n]]}}{[[a]]^{[[k]]}}$.", "kk": "Есептеңіз: $\\dfrac{[[a]]^{[[m]]} \\cdot [[a]]^{[[n]]}}{[[a]]^{[[k]]}}$."},
        solution={"ru": "При умножении показатели складываются, при делении вычитаются: $[[a]]^{[[m]] + ([[n]]) - [[k]]} = [[a]]^{[[e]]} = [[ans]]$.",
                  "kk": "Көбейткенде дәреже көрсеткіштері қосылады, бөлгенде азаяды: $[[a]]^{[[m]] + ([[n]]) - [[k]]} = [[a]]^{[[e]]} = [[ans]]$."},
    ),
    Template(
        id="math.m.pow.negative-fraction", **T("powers", "medium"),
        params={"p_": [1, 2, 3, 4, 5], "q": [2, 3, 4, 5, 7], "n": [1, 2, 3]},
        where=lambda p: p.p_ < p.q and math.gcd(p.p_, p.q) == 1 and (p.q / p.p_) ** p.n <= 130,
        answer=lambda p: frac(F(p.q, p.p_) ** p.n),
        distractors=[lambda p: frac(-F(p.q, p.p_) ** p.n), lambda p: frac(F(p.p_, p.q) ** p.n), lambda p: frac(F(p.q, p.p_) * p.n),
                     lambda p: frac(F(p.q ** p.n, p.p_ * p.n))],
        text={"ru": "Вычислите: $\\left(\\frac{[[p_]]}{[[q]]}\\right)^{-[[n]]}$.", "kk": "Есептеңіз: $\\left(\\frac{[[p_]]}{[[q]]}\\right)^{-[[n]]}$."},
        solution={"ru": "Отрицательный показатель переворачивает дробь: $\\left(\\frac{[[p_]]}{[[q]]}\\right)^{-[[n]]} = \\left(\\frac{[[q]]}{[[p_]]}\\right)^{[[n]]} = [[ans]]$. Знак не меняется.",
                  "kk": "Теріс дәреже көрсеткіші бөлшекті төңкереді: $\\left(\\frac{[[p_]]}{[[q]]}\\right)^{-[[n]]} = \\left(\\frac{[[q]]}{[[p_]]}\\right)^{[[n]]} = [[ans]]$. Таңба өзгермейді."},
    ),
    Template(
        id="math.m.pow.fractional", **T("powers", "medium"),
        params={"b": [2, 3, 4, 5], "n": [2, 3, 4], "m": [1, 2, 3, 5]},
        derived=lambda p: {"A": p.b ** p.n},
        where=lambda p: p.m != p.n and math.gcd(p.m, p.n) == 1 and p.b ** p.m <= 300 and p.b ** p.n <= 700,
        answer=lambda p: p.b ** p.m,
        distractors=[lambda p: frac(F(p.b ** p.n * p.m, p.n)), lambda p: p.b ** p.n if p.b ** p.n != p.b ** p.m else p.b ** p.m * 2, lambda p: p.b * p.m, lambda p: p.b ** (p.m + 1)],
        decimals=0, spread=None,
        text={"ru": "Вычислите: $[[A]]^{\\frac{[[m]]}{[[n]]}}$.", "kk": "Есептеңіз: $[[A]]^{\\frac{[[m]]}{[[n]]}}$."},
        solution={"ru": "$[[A]] = [[b]]^{[[n]]}$, поэтому $[[A]]^{\\frac{[[m]]}{[[n]]}} = [[b]]^{[[m]]} = [[ans]]$ (корень степени $[[n]]$, затем степень $[[m]]$).",
                  "kk": "$[[A]] = [[b]]^{[[n]]}$, сондықтан $[[A]]^{\\frac{[[m]]}{[[n]]}} = [[b]]^{[[m]]} = [[ans]]$ ($[[n]]$-дәрежелі түбір, сосын $[[m]]$-дәреже)."},
    ),
    Template(
        id="math.m.pow.standard-form", **T("powers", "easy"),
        params={"a": [1.2, 2.5, 3.6, 4.8, 7.5], "e": [3, 4, 5, 6], "b": [2, 4, 5], "f": [-2, -1, 2]},
        derived=lambda p: {"m": round(p.a * p.b, 4), "E": p.e + p.f, "M": fmt_tex(round(p.a * p.b, 4)), "Ma": fmt_tex(round(p.a + p.b, 4))},
        where=lambda p: 1 <= p.a * p.b < 10 and p.e + p.f > 0 and p.e * p.f != p.e + p.f + 1,
        answer=lambda p: f"${p.M} \\cdot 10^{{{p.e + p.f}}}$",
        distractors=[lambda p: f"${p.M} \\cdot 10^{{{p.e * p.f}}}$",
                     lambda p: f"${p.Ma} \\cdot 10^{{{p.e + p.f}}}$",
                     lambda p: f"${p.M} \\cdot 10^{{{p.e + p.f + 1}}}$"],
        text={"ru": "Вычислите: $([[a]] \\cdot 10^{[[e]]}) \\cdot ([[b]] \\cdot 10^{[[f]]})$.", "kk": "Есептеңіз: $([[a]] \\cdot 10^{[[e]]}) \\cdot ([[b]] \\cdot 10^{[[f]]})$."},
        solution={"ru": "Множители перемножаем отдельно: $[[a]] \\cdot [[b]] = [[m]]$, $10^{[[e]]} \\cdot 10^{[[f]]} = 10^{[[E]]}$. Ответ: [[ans]].",
                  "kk": "Көбейткіштерді бөлек көбейтеміз: $[[a]] \\cdot [[b]] = [[m]]$, $10^{[[e]]} \\cdot 10^{[[f]]} = 10^{[[E]]}$. Жауабы: [[ans]]."},
    ),

    # ---------- корни ----------
    Template(
        id="math.m.rad.take-out", **T("radicals-and-expressions", "easy"),
        params={"k": [2, 3, 4, 5, 6, 7], "m": [2, 3, 5, 6, 7]},
        derived=lambda p: {"N": p.k * p.k * p.m},
        answer=lambda p: sq(p.k, p.m),
        distractors=[lambda p: sq(p.m, p.k) if p.m != p.k else sq(p.k + 1, p.m), lambda p: sq(p.k * p.k, p.m), lambda p: sq(p.k * p.m, 1) if p.k * p.m != p.k else sq(2, p.m), lambda p: sq(p.k, p.m * p.k)],
        text={"ru": "Вынесите множитель из-под знака корня: $\\sqrt{[[N]]}$.", "kk": "Көбейткішті түбір белгісінің астынан шығарыңыз: $\\sqrt{[[N]]}$."},
        solution={"ru": "$[[N]] = [[k]]^2 \\cdot [[m]]$, поэтому $\\sqrt{[[N]]} = [[ans]]$.", "kk": "$[[N]] = [[k]]^2 \\cdot [[m]]$, сондықтан $\\sqrt{[[N]]} = [[ans]]$."},
        variants=25,
    ),
    Template(
        id="math.m.rad.sum-like", **T("radicals-and-expressions", "medium"),
        params={"a": [1, 2, 3, 4, 5], "b": [1, 2, 3, 4, 5, 6], "m": [2, 3, 5, 6, 7], "s": [1, -1]},
        derived=lambda p: {"A": p.a * p.a * p.m, "B": p.b * p.b * p.m, "op": "+" if p.s > 0 else "-"},
        where=lambda p: p.a != p.b and (p.a + p.s * p.b) > 0 and p.a * p.a * p.m <= 200 and p.b * p.b * p.m <= 200,
        answer=lambda p: sq(p.a + p.s * p.b, p.m),
        distractors=[lambda p: sq(1, p.a * p.a * p.m + p.s * p.b * p.b * p.m) if p.a * p.a + p.s * p.b * p.b > 0 else sq(p.a + p.b + 1, p.m),
                     lambda p: sq(p.a - p.s * p.b, p.m) if p.a - p.s * p.b > 0 else sq(p.a + p.b + 2, p.m),
                     lambda p: sq(p.a + p.s * p.b, 2 * p.m), lambda p: sq(p.a * p.b, p.m)],
        text={"ru": "Упростите: $\\sqrt{[[A]]} [[op]] \\sqrt{[[B]]}$.", "kk": "Ықшамдаңыз: $\\sqrt{[[A]]} [[op]] \\sqrt{[[B]]}$."},
        solution={"ru": "$\\sqrt{[[A]]} = [[a]]\\sqrt{[[m]]}$, $\\sqrt{[[B]]} = [[b]]\\sqrt{[[m]]}$. Подобные корни складываем как одночлены: [[ans]]. Складывать подкоренные выражения нельзя.",
                  "kk": "$\\sqrt{[[A]]} = [[a]]\\sqrt{[[m]]}$, $\\sqrt{[[B]]} = [[b]]\\sqrt{[[m]]}$. Ұқсас түбірлерді бірмүшелер сияқты қосамыз: [[ans]]. Түбір астындағы өрнектерді қосуға болмайды."},
    ),
    Template(
        id="math.m.rad.conjugate", **T("radicals-and-expressions", "medium"),
        params={"a": [2, 3, 4, 5, 6, 7, 8], "m": [2, 3, 5, 6, 7, 10, 11, 13]},
        where=lambda p: p.a * p.a != p.m,
        answer=lambda p: p.a * p.a - p.m,
        distractors=[lambda p: p.a * p.a + p.m, lambda p: p.a - p.m, lambda p: p.a * p.a - p.m * p.m, lambda p: 2 * p.a],
        decimals=0, spread=None,
        text={"ru": "Вычислите: $([[a]] - \\sqrt{[[m]]})([[a]] + \\sqrt{[[m]]})$.", "kk": "Есептеңіз: $([[a]] - \\sqrt{[[m]]})([[a]] + \\sqrt{[[m]]})$."},
        solution={"ru": "Разность квадратов: $[[a]]^2 - (\\sqrt{[[m]]})^2 = [[a]]^2 - [[m]] = [[ans]]$.", "kk": "Квадраттар айырымы: $[[a]]^2 - (\\sqrt{[[m]]})^2 = [[a]]^2 - [[m]] = [[ans]]$."},
    ),

    # ---------- алгебраические выражения ----------
    Template(
        id="math.m.alg.factor-trinomial", **T("algebraic-expressions", "medium"),
        params={"r1": range(-7, 8), "r2": range(-7, 8)},
        derived=lambda p: {"bt": term(-(p.r1 + p.r2), "x"), "ct": term(p.r1 * p.r2)},
        where=lambda p: p.r1 < p.r2 and p.r1 != 0 and p.r2 != 0 and p.r1 != -p.r2,
        answer=lambda p: fac(p.r1, p.r2),
        distractors=[lambda p: fac(-p.r1, -p.r2), lambda p: fac(-p.r1, p.r2), lambda p: fac(p.r1, -p.r2), lambda p: fac(p.r1 + p.r2, 1) if p.r1 + p.r2 not in (0, 1) else fac(p.r1 * p.r2, 1)],
        text={"ru": "Разложите на множители: $x^2 [[bt]] [[ct]]$.", "kk": "Көбейткіштерге жіктеңіз: $x^2 [[bt]] [[ct]]$."},
        solution={"ru": "Корни трёхчлена: $[[r1]]$ и $[[r2]]$ (по теореме Виета их сумма равна $-b$, а произведение — $c$). Тогда $x^2 + bx + c = (x - x_1)(x - x_2) =$ [[ans]].",
                  "kk": "Үшмүшенің түбірлері: $[[r1]]$ және $[[r2]]$ (Виет теоремасы бойынша олардың қосындысы $-b$, көбейтіндісі $c$). Онда $x^2 + bx + c = (x - x_1)(x - x_2) =$ [[ans]]."},
    ),
    Template(
        id="math.m.alg.reduce-fraction", **T("algebraic-expressions", "medium"),
        params={"a": [1, 2, 3, 4, 5, 6, 7, 8, 9], "x": [-3, -2, 2, 3, 5, 10, 12]},
        derived=lambda p: {"A2": p.a * p.a},
        where=lambda p: p.x != p.a and p.x != -p.a,
        answer=lambda p: p.x + p.a,
        distractors=[lambda p: p.x - p.a, lambda p: p.x * p.x + p.a * p.a, lambda p: p.x, lambda p: (p.x + p.a) * 2],
        decimals=0, spread=None,
        text={"ru": "Найдите значение выражения $\\dfrac{x^2 - [[A2]]}{x - [[a]]}$ при $x = [[x]]$.", "kk": "$x = [[x]]$ болғанда $\\dfrac{x^2 - [[A2]]}{x - [[a]]}$ өрнегінің мәнін табыңыз."},
        solution={"ru": "Сократим: $\\dfrac{(x - [[a]])(x + [[a]])}{x - [[a]]} = x + [[a]]$. При $x = [[x]]$: $[[ans]]$.",
                  "kk": "Қысқартамыз: $\\dfrac{(x - [[a]])(x + [[a]])}{x - [[a]]} = x + [[a]]$. $x = [[x]]$ болғанда: $[[ans]]$."},
    ),
    Template(
        id="math.m.alg.percent-twice", **T("algebraic-expressions", "medium"),
        params={"p_": [10, 20, 25, 30, 40, 50], "dir": [0, 1]},
        derived=lambda p: {"sq": p.p_ * p.p_ / 100, "ru1": "повысили" if p.dir == 0 else "понизили", "ru2": "понизили" if p.dir == 0 else "повысили",
                           "kk1": "көтерді" if p.dir == 0 else "төмендетті", "kk2": "төмендетті" if p.dir == 0 else "көтерді"},
        answer=lambda p: f"уменьшилась на ${p.p_ * p.p_ // 100 if p.p_ * p.p_ % 100 == 0 else p.p_ * p.p_ / 100}\\%$".replace(".", "{,}"),
        distractors=[lambda p: "не изменилась", lambda p: f"увеличилась на ${p.p_ * p.p_ // 100 if p.p_ * p.p_ % 100 == 0 else p.p_ * p.p_ / 100}\\%$".replace(".", "{,}"),
                     lambda p: f"уменьшилась на ${2 * p.p_}\\%$"],
        options_kk={**{f"уменьшилась на ${v}\\%$".replace(".", "{,}"): f"${v}\\%$-ға кеміді".replace(".", "{,}") for v in [1, 4, 6.25, 9, 16, 25, 20, 40, 50, 60, 80, 100]},
                    **{f"увеличилась на ${v}\\%$".replace(".", "{,}"): f"${v}\\%$-ға артты".replace(".", "{,}") for v in [1, 4, 6.25, 9, 16, 25]},
                    "не изменилась": "өзгерген жоқ"},
        text={"ru": "Цену товара сначала [[ru1]] на $[[p_]]\\%$, а затем [[ru2]] на $[[p_]]\\%$. Как изменилась цена по сравнению с первоначальной?",
              "kk": "Тауар бағасын алдымен $[[p_]]\\%$-ға [[kk1]], сосын $[[p_]]\\%$-ға [[kk2]]. Бастапқы бағамен салыстырғанда баға қалай өзгерді?"},
        solution={"ru": "Множители: $(1 + 0{,}01p)(1 - 0{,}01p) = 1 - (0{,}01p)^2$. Цена всегда уменьшается на $\\frac{p^2}{100}\\%$, порядок не важен: $\\frac{[[p_]]^2}{100} = [[sq]]$.",
                  "kk": "Көбейткіштер: $(1 + 0{,}01p)(1 - 0{,}01p) = 1 - (0{,}01p)^2$. Реті маңызды емес, баға әрқашан $\\frac{p^2}{100}\\%$-ға кемиді: $\\frac{[[p_]]^2}{100} = [[sq]]$."},
    ),

    # ---------- уравнения ----------
    Template(
        id="math.m.eq.abs-roots", kind="multi", **T("linear-quadratic-rational-equations", "medium"),
        params={"a": range(-6, 7), "b": range(1, 9)},
        where=lambda p: p.a != 0 and p.a != p.b and p.a != -p.b,
        answers=[lambda p: p.a - p.b, lambda p: p.a + p.b],
        distractors=[lambda p: -p.a - p.b, lambda p: -p.a + p.b, lambda p: p.b, lambda p: p.a, lambda p: p.b - 2 * p.a if p.b - 2 * p.a not in (p.a - p.b, p.a + p.b) else p.a + p.b + 1],
        derived=lambda p: {"xa": lead(1, "x") + " " + term(-p.a)},
        decimals=0, spread=None,
        text={"ru": "Найдите все корни уравнения $|[[xa]]| = [[b]]$.", "kk": "$|[[xa]]| = [[b]]$ теңдеуінің барлық түбірін табыңыз."},
        solution={"ru": "$[[xa]] = [[b]]$ или $[[xa]] = -[[b]]$, то есть $x = [[a]] \\pm [[b]]$.", "kk": "$[[xa]] = [[b]]$ немесе $[[xa]] = -[[b]]$, яғни $x = [[a]] \\pm [[b]]$."},
    ),
    Template(
        id="math.m.eq.irrational", **T("trig-irrational-equations", "hard"),
        params={"b": range(0, 6), "r": range(1, 12)},
        derived=lambda p: {"s": 2 * p.b + 1 - p.r, "a": p.b * p.b - p.r * (2 * p.b + 1 - p.r)},
        where=lambda p: p.r >= p.b and p.s < p.b and p.a != 0 and abs(p.a) <= 40 and p.s != p.r,
        answer=lambda p: str(p.r),
        distractors=[lambda p: str(p.s).replace("-", "−"), lambda p: f"{min(p.r, p.s)}; {max(p.r, p.s)}".replace("-", "−"), lambda p: "корней нет"],
        options_kk={"корней нет": "түбірі жоқ"},
        text={"ru": "Решите уравнение $\\sqrt{x [[at]]} = x [[bt]]$.", "kk": "$\\sqrt{x [[at]]} = x [[bt]]$ теңдеуін шешіңіз."},
        solution={"ru": "Возводим в квадрат: $x [[at]] = (x [[bt]])^2$, корни $[[r]]$ и $[[s]]$. Проверка: правая часть $x [[bt]]$ не может быть отрицательной, поэтому $x = [[s]]$ — посторонний корень. Ответ: $[[ans]]$.",
                  "kk": "Квадраттаймыз: $x [[at]] = (x [[bt]])^2$, түбірлері $[[r]]$ және $[[s]]$. Тексеру: оң жағы $x [[bt]]$ теріс бола алмайды, сондықтан $x = [[s]]$ — бөгде түбір. Жауабы: $[[ans]]$."},
    ),
    Template(
        id="math.m.treq.general", **T("trig-irrational-equations", "medium"),
        params={"i": range(len(TRIG_EQ))},
        derived=lambda p: {"eq": TRIG_EQ[p.i][0]},
        answer=lambda p: f"${TRIG_EQ[p.i][1]}, \\; n \\in \\mathbb{{Z}}$",
        distractors=[(lambda p, j=j: f"${TRIG_EQ[p.i][2][j]}, \\; n \\in \\mathbb{{Z}}$") for j in range(3)],
        variants=12,
        text={"ru": "Решите уравнение $[[eq]]$.", "kk": "$[[eq]]$ теңдеуін шешіңіз."},
        solution={"ru": "Формулы: $\\sin x = a \\Rightarrow x = (-1)^n \\arcsin a + \\pi n$; $\\cos x = a \\Rightarrow x = \\pm \\arccos a + 2\\pi n$; $\\operatorname{tg} x = a \\Rightarrow x = \\operatorname{arctg} a + \\pi n$; $\\operatorname{ctg} x = a \\Rightarrow x = \\operatorname{arcctg} a + \\pi n$. Для $a = 0, \\pm 1$ у синуса и косинуса — частные формулы (например, $\\sin x = 1 \\Rightarrow x = \\frac{\\pi}{2} + 2\\pi n$). Ответ: [[ans]].",
                  "kk": "Формулалар: $\\sin x = a \\Rightarrow x = (-1)^n \\arcsin a + \\pi n$; $\\cos x = a \\Rightarrow x = \\pm \\arccos a + 2\\pi n$; $\\operatorname{tg} x = a \\Rightarrow x = \\operatorname{arctg} a + \\pi n$; $\\operatorname{ctg} x = a \\Rightarrow x = \\operatorname{arcctg} a + \\pi n$. $a = 0, \\pm 1$ болғанда синус пен косинусқа дербес формулалар бар (мысалы, $\\sin x = 1 \\Rightarrow x = \\frac{\\pi}{2} + 2\\pi n$). Жауабы: [[ans]]."},
    ),
    Template(
        id="math.m.treq.count-on-segment", **T("trig-irrational-equations", "hard"),
        params={"fn": ["sin", "cos"], "c": range(len(TRIG_C)), "n": [1, 2, 3, 4, 5]},
        derived=lambda p: {"ct": TRIG_C[p.c][1], "k": count_roots(p.fn, float(TRIG_C[p.c][0]), p.n), "seg": "\\pi" if p.n == 1 else f"{p.n}\\pi"},
        answer=lambda p: p.k,
        distractors=[lambda p: 2 * p.n, lambda p: p.k + 1, lambda p: p.k - 1 if p.k > 1 else p.k + 2, lambda p: p.n],
        decimals=0, spread=None, variants=40,
        text={"ru": "Сколько корней имеет уравнение $\\[[fn]] x = [[ct]]$ на отрезке $[0; [[seg]]]$?", "kk": "$\\[[fn]] x = [[ct]]$ теңдеуінің $[0; [[seg]]]$ кесіндісінде неше түбірі бар?"},
        solution={"ru": "Отмечаем решения на единичной окружности или на графике: на каждом периоде $2\\pi$ уравнение имеет два корня. Перебираем серии решений, попадающие в $[0; [[seg]]]$: $[[ans]]$.",
                  "kk": "Шешімдерді бірлік шеңберде немесе графикте белгілейміз: әр $2\\pi$ периодта теңдеудің екі түбірі бар. $[0; [[seg]]]$ кесіндісіне түсетін шешімдерді санаймыз: $[[ans]]$."},
    ),
    Template(
        id="math.m.expeq.substitution-sum", **T("exponential-log-equations", "hard"),
        params={"a": [2, 3], "m": [0, 1, 2, 3], "n": [1, 2, 3, 4]},
        derived=lambda p: {"S": p.a ** p.m + p.a ** p.n, "P": p.a ** (p.m + p.n), "A2": p.a * p.a},
        where=lambda p: p.m < p.n and p.a ** (p.m + p.n) <= 200,
        answer=lambda p: p.m + p.n,
        distractors=[lambda p: p.S, lambda p: p.m * p.n if p.m * p.n != p.m + p.n else p.m + p.n + 2, lambda p: p.n, lambda p: p.P],
        decimals=0, spread=None,
        text={"ru": "Найдите сумму корней уравнения $[[A2]]^x - [[S]] \\cdot [[a]]^x + [[P]] = 0$.", "kk": "$[[A2]]^x - [[S]] \\cdot [[a]]^x + [[P]] = 0$ теңдеуінің түбірлерінің қосындысын табыңыз."},
        solution={"ru": "Замена $t = [[a]]^x > 0$: $t^2 - [[S]]t + [[P]] = 0$, $t = [[a]]^{[[m]]}$ или $t = [[a]]^{[[n]]}$. Значит $x = [[m]]$ или $x = [[n]]$, сумма $[[ans]]$.",
                  "kk": "$t = [[a]]^x > 0$ алмастыруы: $t^2 - [[S]]t + [[P]] = 0$, $t = [[a]]^{[[m]]}$ немесе $t = [[a]]^{[[n]]}$. Демек $x = [[m]]$ немесе $x = [[n]]$, қосындысы $[[ans]]$."},
    ),
    Template(
        id="math.m.logeq.simple", **T("exponential-log-equations", "easy"),
        params={"a": [2, 3, 5], "k": [1, 2, 3, 4], "c": [-5, -3, -1, 1, 2, 4, 7]},
        derived=lambda p: {"xc": lead(1, "x") + " " + term(p.c)},
        where=lambda p: p.a ** p.k <= 125,
        answer=lambda p: p.a ** p.k - p.c,
        distractors=[lambda p: p.a * p.k - p.c, lambda p: p.a ** p.k + p.c, lambda p: p.k ** p.a - p.c if p.k ** p.a - p.c != p.a ** p.k - p.c else p.a ** p.k, lambda p: p.a ** p.k],
        decimals=0, spread=None,
        text={"ru": "Решите уравнение $\\log_{[[a]]}([[xc]]) = [[k]]$.", "kk": "$\\log_{[[a]]}([[xc]]) = [[k]]$ теңдеуін шешіңіз."},
        solution={"ru": "По определению логарифма: $[[xc]] = [[a]]^{[[k]]}$, $x = [[ans]]$. Проверка ОДЗ: $[[xc]] > 0$ — выполнено.",
                  "kk": "Логарифм анықтамасы бойынша: $[[xc]] = [[a]]^{[[k]]}$, $x = [[ans]]$. ММО-ны тексереміз: $[[xc]] > 0$ — орындалды."},
    ),

    # ---------- системы ----------
    Template(
        id="math.m.sys.linear-sum", **T("linear-nonlinear-systems", "medium"),
        params={"x": range(-4, 6), "y": range(-4, 6), "a": [1, 2, 3], "b": [1, 2, -1, -3], "c": [1, 2, 3], "d": [-2, -1, 1, 4]},
        derived=lambda p: {"e1": lead(p.a, "x") + " " + term(p.b, "y"), "e2": lead(p.c, "x") + " " + term(p.d, "y"), "r1": p.a * p.x + p.b * p.y, "r2": p.c * p.x + p.d * p.y},
        where=lambda p: p.a * p.d - p.b * p.c != 0 and p.x != p.y and p.x + p.y != 0 and p.x != 0 and p.y != 0,
        answer=lambda p: p.x + p.y,
        distractors=[lambda p: p.x - p.y, lambda p: p.x * p.y, lambda p: p.x, lambda p: p.y, lambda p: p.y - p.x],
        decimals=0, spread=None,
        text={"ru": "Решите систему $\\begin{cases} [[e1]] = [[r1]] \\\\ [[e2]] = [[r2]] \\end{cases}$ и найдите $x + y$.", "kk": "$\\begin{cases} [[e1]] = [[r1]] \\\\ [[e2]] = [[r2]] \\end{cases}$ жүйесін шешіп, $x + y$ мәнін табыңыз."},
        solution={"ru": "Сложением или подстановкой получаем $x = [[x]]$, $y = [[y]]$. Проверка подстановкой в оба уравнения. $x + y = [[ans]]$.",
                  "kk": "Қосу немесе алмастыру тәсілімен $x = [[x]]$, $y = [[y]]$ шығады. Екі теңдеуге қойып тексереміз. $x + y = [[ans]]$."},
    ),
    Template(
        id="math.m.sys.diff-product", **T("linear-nonlinear-systems", "medium"),
        params={"x": range(-6, 9), "y": range(-6, 9)},
        derived=lambda p: {"d": p.x - p.y, "pr": p.x * p.y},
        where=lambda p: p.x > p.y and p.x * p.y > 0 and p.x != 0,
        answer=lambda p: p.x ** 2 + p.y ** 2,
        distractors=[lambda p: p.d ** 2 - 2 * p.pr, lambda p: p.d ** 2, lambda p: p.d ** 2 + p.pr, lambda p: (p.x + p.y) ** 2],
        decimals=0, spread=None, valid=lambda p, x: x > 0,
        text={"ru": "Известно, что $x - y = [[d]]$ и $xy = [[pr]]$. Найдите $x^2 + y^2$.", "kk": "$x - y = [[d]]$ және $xy = [[pr]]$ екені белгілі. $x^2 + y^2$ мәнін табыңыз."},
        solution={"ru": "$(x - y)^2 = x^2 - 2xy + y^2$, значит $x^2 + y^2 = (x - y)^2 + 2xy = [[d]]^2 + 2 \\cdot [[pr]] = [[ans]]$.",
                  "kk": "$(x - y)^2 = x^2 - 2xy + y^2$, демек $x^2 + y^2 = (x - y)^2 + 2xy = [[d]]^2 + 2 \\cdot [[pr]] = [[ans]]$."},
    ),
    Template(
        id="math.m.sys.exp-system", **T("special-equation-systems", "hard"),
        params={"a": [2, 3, 5], "x": range(-2, 6), "y": range(-2, 6)},
        derived=lambda p: {"s": p.x + p.y, "d": p.x - p.y},
        where=lambda p: p.x != p.y and p.x + p.y > 0 and p.a ** (p.x + p.y) <= 3125,
        answer=lambda p: p.x,
        distractors=[lambda p: p.y, lambda p: p.s, lambda p: p.d, lambda p: p.x + 1],
        decimals=0, spread=None,
        text={"ru": "Решите систему $\\begin{cases} [[a]]^x \\cdot [[a]]^y = [[a]]^{[[s]]} \\\\ x - y = [[d]] \\end{cases}$. В ответе укажите $x$.",
              "kk": "$\\begin{cases} [[a]]^x \\cdot [[a]]^y = [[a]]^{[[s]]} \\\\ x - y = [[d]] \\end{cases}$ жүйесін шешіңіз. Жауапқа $x$ мәнін жазыңыз."},
        solution={"ru": "$[[a]]^{x + y} = [[a]]^{[[s]]}$, значит $x + y = [[s]]$. Складываем с $x - y = [[d]]$: $2x = [[s]] + ([[d]])$, $x = [[ans]]$.",
                  "kk": "$[[a]]^{x + y} = [[a]]^{[[s]]}$, демек $x + y = [[s]]$. $x - y = [[d]]$ теңдеуімен қосамыз: $2x = [[s]] + ([[d]])$, $x = [[ans]]$."},
    ),
    Template(
        id="math.m.sys.log-system", **T("special-equation-systems", "hard"),
        params={"x": [2, 3, 4, 5, 6, 8, 9, 10, 12, 16], "y": [1, 2, 3, 4, 5, 6, 8]},
        derived=lambda p: {"s": p.x + p.y, "pr": p.x * p.y},
        where=lambda p: p.x > p.y and math.log2(p.x * p.y).is_integer(),
        answer=lambda p: p.x,
        distractors=[lambda p: p.y, lambda p: p.s, lambda p: p.x - p.y, lambda p: p.pr // 2],
        decimals=0, spread=None,
        text={"ru": "Решите систему $\\begin{cases} x + y = [[s]] \\\\ \\log_2 x + \\log_2 y = \\log_2 [[pr]] \\end{cases}$, $x > y$. В ответе укажите $x$.",
              "kk": "$\\begin{cases} x + y = [[s]] \\\\ \\log_2 x + \\log_2 y = \\log_2 [[pr]] \\end{cases}$ жүйесін шешіңіз, $x > y$. Жауапқа $x$ мәнін жазыңыз."},
        solution={"ru": "Второе уравнение: $xy = [[pr]]$ (при $x, y > 0$). По теореме Виета $x$ и $y$ — корни $t^2 - [[s]]t + [[pr]] = 0$: $[[x]]$ и $[[y]]$. Так как $x > y$, $x = [[ans]]$.",
                  "kk": "Екінші теңдеу: $xy = [[pr]]$ ($x, y > 0$). Виет теоремасы бойынша $x$ пен $y$ — $t^2 - [[s]]t + [[pr]] = 0$ теңдеуінің түбірлері: $[[x]]$ және $[[y]]$. $x > y$ болғандықтан, $x = [[ans]]$."},
    ),

    # ---------- неравенства ----------
    Template(
        id="math.m.isys.count", **T("inequality-systems", "medium"),
        params={"a": [2, 3, 4], "b": range(-6, 7), "c": [2, 3, 5], "d": range(3, 20)},
        derived=lambda p: {"lo": F(-p.b, p.a), "hi": F(p.d, p.c), "e1": lead(p.a, "x") + " " + term(p.b), "lot": frac(F(-p.b, p.a)).strip("$"), "hit": frac(F(p.d, p.c)).strip("$")},
        where=lambda p: p.b != 0 and 2 <= int_count(F(-p.b, p.a), False, F(p.d, p.c), True) <= 8 and F(-p.b, p.a).denominator != 1,
        answer=lambda p: int_count(p.lo, False, p.hi, True),
        distractors=[lambda p: int_count(p.lo, True, p.hi, True) if int_count(p.lo, True, p.hi, True) != int_count(p.lo, False, p.hi, True) else int_count(p.lo, False, p.hi, True) + 1,
                     lambda p: int_count(p.lo, False, p.hi, False) if int_count(p.lo, False, p.hi, False) != int_count(p.lo, False, p.hi, True) else int_count(p.lo, False, p.hi, True) - 1,
                     lambda p: int_count(p.lo, False, p.hi, True) + 2, lambda p: int_count(-p.hi, False, -p.lo, True) + 3],
        decimals=0, spread=None,
        text={"ru": "Сколько целых решений имеет система $\\begin{cases} [[e1]] > 0 \\\\ [[c]]x \\le [[d]] \\end{cases}$?", "kk": "$\\begin{cases} [[e1]] > 0 \\\\ [[c]]x \\le [[d]] \\end{cases}$ жүйесінің неше бүтін шешімі бар?"},
        solution={"ru": "Первое неравенство: $x > [[lot]]$, второе: $x \\le [[hit]]$. Целые числа на промежутке $\\left([[lot]]; [[hit]]\\right]$: всего $[[ans]]$.",
                  "kk": "Бірінші теңсіздік: $x > [[lot]]$, екіншісі: $x \\le [[hit]]$. $\\left([[lot]]; [[hit]]\\right]$ аралығындағы бүтін сандар: барлығы $[[ans]]$."},
    ),
    Template(
        id="math.m.isys.interval", **T("inequality-systems", "easy"),
        params={"a": range(-5, 6), "b": range(-4, 9), "s": [0, 1]},
        derived=lambda p: {"t1": "x > " + str(p.a).replace("-", "-"), "t2": ("x \\le " if p.s else "x < ") + str(p.b)},
        where=lambda p: p.a < p.b,
        answer=lambda p: iv(p.a, p.b, "(", "]" if p.s else ")"),
        distractors=[lambda p: iv(-INF, p.a) + " ∪ " + iv(p.b, INF, "[" if not p.s else "("), lambda p: iv(p.a, p.b, "[", "]" if p.s else ")"), lambda p: iv(p.a, INF), lambda p: iv(-INF, p.b, right="]" if p.s else ")")],
        text={"ru": "Решите систему неравенств $\\begin{cases} [[t1]] \\\\ [[t2]] \\end{cases}$.", "kk": "$\\begin{cases} [[t1]] \\\\ [[t2]] \\end{cases}$ теңсіздіктер жүйесін шешіңіз."},
        solution={"ru": "Решение системы — пересечение решений: числа больше $[[a]]$ и одновременно не больше (или меньше) $[[b]]$: [[ans]].",
                  "kk": "Жүйенің шешімі — шешімдердің қиылысуы: $[[a]]$ санынан үлкен және бір мезгілде $[[b]]$ санынан аспайтын (немесе кіші) сандар: [[ans]]."},
    ),
    Template(
        id="math.m.ineq.log", **T("inequalities", "medium"),
        params={"a": range(-4, 6), "k": [1, 2, 3, 4]},
        derived=lambda p: {"xa": lead(1, "x") + " " + term(-p.a), "top": p.a + 2 ** p.k},
        where=lambda p: p.a != 0,
        answer=lambda p: iv(p.a, p.a + 2 ** p.k),
        distractors=[lambda p: iv(-INF, p.a + 2 ** p.k), lambda p: iv(p.a, p.a + 2 * p.k), lambda p: iv(p.a + 2 ** p.k, INF), lambda p: iv(p.a, p.a + 2 ** p.k, "[")],
        text={"ru": "Решите неравенство $\\log_2([[xa]]) < [[k]]$.", "kk": "$\\log_2([[xa]]) < [[k]]$ теңсіздігін шешіңіз."},
        solution={"ru": "ОДЗ: $[[xa]] > 0$, то есть $x > [[a]]$. Основание $2 > 1$, знак сохраняется: $[[xa]] < 2^{[[k]]}$, $x < [[top]]$. С учётом ОДЗ: [[ans]].",
                  "kk": "ММО: $[[xa]] > 0$, яғни $x > [[a]]$. Негізі $2 > 1$, таңба сақталады: $[[xa]] < 2^{[[k]]}$, $x < [[top]]$. ММО-ны ескерсек: [[ans]]."},
    ),
    Template(
        id="math.m.ineq.exp-small-base", **T("inequalities", "medium"),
        params={"q": [2, 3, 5], "k": range(-3, 6), "c": range(-3, 4)},
        derived=lambda p: {"xc": lead(1, "x") + " " + term(p.c), "r": p.k - p.c},
        where=lambda p: p.c != 0 and p.k != 0,
        answer=lambda p: iv(p.k - p.c, INF),
        distractors=[lambda p: iv(-INF, p.k - p.c), lambda p: iv(p.k + p.c, INF), lambda p: iv(-INF, p.k + p.c), lambda p: iv(p.k - p.c, INF, "[")],
        text={"ru": "Решите неравенство $\\left(\\frac{1}{[[q]]}\\right)^{[[xc]]} < \\left(\\frac{1}{[[q]]}\\right)^{[[k]]}$.", "kk": "$\\left(\\frac{1}{[[q]]}\\right)^{[[xc]]} < \\left(\\frac{1}{[[q]]}\\right)^{[[k]]}$ теңсіздігін шешіңіз."},
        solution={"ru": "Основание $\\frac{1}{[[q]]} < 1$ — функция убывает, знак меняется: $[[xc]] > [[k]]$, $x > [[r]]$. Ответ: [[ans]].",
                  "kk": "Негізі $\\frac{1}{[[q]]} < 1$ — функция кемімелі, таңба өзгереді: $[[xc]] > [[k]]$, $x > [[r]]$. Жауабы: [[ans]]."},
    ),

    # ---------- прогрессии ----------
    Template(
        id="math.m.prog.geom-sum", **T("progressions", "medium"),
        params={"b": [1, 2, 3, 4, 5], "q": [2, 3, -2], "n": [3, 4, 5, 6]},
        derived=lambda p: {"b2": p.b * p.q, "qp": f"({p.q})" if p.q < 0 else str(p.q)},
        where=lambda p: abs(p.b * p.q ** p.n) <= 1500,
        answer=lambda p: p.b * (p.q ** p.n - 1) // (p.q - 1),
        distractors=[lambda p: p.b * p.q ** (p.n - 1), lambda p: p.b * (p.q ** (p.n + 1) - 1) // (p.q - 1), lambda p: p.b * (p.q ** (p.n - 1) - 1) // (p.q - 1), lambda p: p.b * p.n * p.q],
        decimals=0, spread=None,
        text={"ru": "Первый член геометрической прогрессии $b_1 = [[b]]$, второй $b_2 = [[b2]]$. Найдите сумму первых $[[n]]$ членов.",
              "kk": "Геометриялық прогрессияның бірінші мүшесі $b_1 = [[b]]$, екіншісі $b_2 = [[b2]]$. Алғашқы $[[n]]$ мүшенің қосындысын табыңыз."},
        solution={"ru": "$q = \\frac{b_2}{b_1} = [[q]]$. $S_n = \\frac{b_1(q^n - 1)}{q - 1} = \\frac{[[b]]([[qp]]^{[[n]]} - 1)}{[[q]] - 1} = [[ans]]$.",
                  "kk": "$q = \\frac{b_2}{b_1} = [[q]]$. $S_n = \\frac{b_1(q^n - 1)}{q - 1} = \\frac{[[b]]([[qp]]^{[[n]]} - 1)}{[[q]] - 1} = [[ans]]$."},
    ),
    Template(
        id="math.m.prog.positive-terms", **T("progressions", "medium"),
        params={"a": range(10, 60, 3), "d": [-2, -3, -4, -5, -7]},
        where=lambda p: p.a % (-p.d) != 0,
        answer=lambda p: sum(1 for k in range(200) if p.a + k * p.d > 0),
        distractors=[lambda p: sum(1 for k in range(200) if p.a + k * p.d > 0) + 1, lambda p: sum(1 for k in range(200) if p.a + k * p.d > 0) - 1, lambda p: p.a // (-p.d) + 2, lambda p: p.a // 2],
        decimals=0, spread=None,
        text={"ru": "Арифметическая прогрессия: $a_1 = [[a]]$, $d = [[d]]$. Сколько в ней положительных членов?", "kk": "Арифметикалық прогрессия: $a_1 = [[a]]$, $d = [[d]]$. Онда неше оң мүше бар?"},
        solution={"ru": "$a_n = [[a]] + (n - 1)([[d]]) > 0$, откуда $n - 1 < \\frac{[[a]]}{[[absd]]}$. Наибольшее целое $n$: $[[ans]]$.",
                  "kk": "$a_n = [[a]] + (n - 1)([[d]]) > 0$, осыдан $n - 1 < \\frac{[[a]]}{[[absd]]}$. Ең үлкен бүтін $n$: $[[ans]]$."},
    ),

    # ---------- планиметрия ----------
    Template(
        id="math.m.plane.trapezoid-area", **T("plane-figures", "medium"),
        params={"t": range(len(TRIPLES)), "b": [2, 4, 5, 6, 8, 10, 12]},
        derived=lambda p: (lambda h, x, c: {"h": h, "x": x, "c": c, "a": p.b + 2 * x})(*TRIPLES[p.t]),
        where=lambda p: p.a <= 70,
        answer=lambda p: (p.a + p.b) * p.h // 2 if (p.a + p.b) * p.h % 2 == 0 else (p.a + p.b) * p.h / 2,
        distractors=[lambda p: (p.a + p.b) * p.c / 2, lambda p: (p.a + p.b) * p.h, lambda p: p.a * p.h, lambda p: (p.a + p.b) * p.x / 2],
        figure=lambda p: trapezoid(f"{p.a}", f"{p.b}", "h", f"{p.c}", p.b / p.a),
        decimals=1,
        text={"ru": "Основания равнобедренной трапеции равны $[[a]]$ и $[[b]]$, боковая сторона $[[c]]$. Найдите площадь трапеции.",
              "kk": "Теңбүйірлі трапецияның табандары $[[a]]$ және $[[b]]$, бүйір қабырғасы $[[c]]$. Трапецияның ауданын табыңыз."},
        solution={"ru": "Высота отсекает отрезок $\\frac{[[a]] - [[b]]}{2} = [[x]]$. $h = \\sqrt{[[c]]^2 - [[x]]^2} = [[h]]$. $S = \\frac{[[a]] + [[b]]}{2} \\cdot [[h]] = [[ans]]$.",
                  "kk": "Биіктік $\\frac{[[a]] - [[b]]}{2} = [[x]]$ кесіндіні қияды. $h = \\sqrt{[[c]]^2 - [[x]]^2} = [[h]]$. $S = \\frac{[[a]] + [[b]]}{2} \\cdot [[h]] = [[ans]]$."},
    ),
    Template(
        id="math.m.plane.polygon-angle", **T("plane-figures", "easy"),
        params={"n": [5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36]},
        answer=lambda p: fmt(180 * (p.n - 2) / p.n, 1) + "°",
        distractors=[lambda p: fmt(360 / p.n, 1) + "°", lambda p: fmt(180 * (p.n - 2)) + "°", lambda p: fmt(180 * (p.n - 1) / p.n, 1) + "°", lambda p: fmt(180 * p.n / (p.n + 2), 1) + "°"],
        where=lambda p: all(abs(v * 10 - round(v * 10)) < 1e-9 for v in (180 * (p.n - 2) / p.n, 360 / p.n, 180 * (p.n - 1) / p.n, 180 * p.n / (p.n + 2))),
        variants=12,
        text={"ru": "Найдите внутренний угол правильного $[[n]]$-угольника.", "kk": "Дұрыс $[[n]]$-бұрыштың ішкі бұрышын табыңыз."},
        solution={"ru": "Сумма углов $n$-угольника $180^\\circ(n - 2) = 180^\\circ \\cdot [[n2]]$. У правильного все углы равны: $\\frac{180^\\circ \\cdot [[n2]]}{[[n]]} =$ [[ans]].",
                  "kk": "$n$-бұрыштың бұрыштарының қосындысы $180^\\circ(n - 2) = 180^\\circ \\cdot [[n2]]$. Дұрыс көпбұрыштың барлық бұрышы тең: $\\frac{180^\\circ \\cdot [[n2]]}{[[n]]} =$ [[ans]]."},
    ),
    Template(
        id="math.m.plane.polygon-sides", **T("plane-figures", "medium"),
        params={"n": [5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45]},
        derived=lambda p: {"ang": 180 * (p.n - 2) // p.n},
        where=lambda p: 180 * (p.n - 2) % p.n == 0,
        answer=lambda p: p.n,
        distractors=[lambda p: p.n + 2, lambda p: p.n - 2, lambda p: 360 // p.n if 360 // p.n != p.n else p.n + 4, lambda p: 2 * p.n],
        decimals=0, spread=None, variants=14,
        text={"ru": "Внутренний угол правильного многоугольника равен $[[ang]]^\\circ$. Сколько у него сторон?", "kk": "Дұрыс көпбұрыштың ішкі бұрышы $[[ang]]^\\circ$. Оның неше қабырғасы бар?"},
        solution={"ru": "Внешний угол $180^\\circ - [[ang]]^\\circ$, сумма внешних углов $360^\\circ$: $n = \\frac{360^\\circ}{180^\\circ - [[ang]]^\\circ} = [[ans]]$.",
                  "kk": "Сыртқы бұрыш $180^\\circ - [[ang]]^\\circ$, сыртқы бұрыштардың қосындысы $360^\\circ$: $n = \\frac{360^\\circ}{180^\\circ - [[ang]]^\\circ} = [[ans]]$."},
    ),
    Template(
        id="math.m.plane.chord", **T("metric-relations-plane", "medium"),
        params={"t": range(len(TRIPLES))},
        derived=lambda p: (lambda d, half, R: {"d": d, "half": half, "R": R})(*TRIPLES[p.t]),
        answer=lambda p: 2 * p.half,
        distractors=[lambda p: p.half, lambda p: 2 * (p.R - p.d), lambda p: 2 * p.R, lambda p: p.R + p.d],
        decimals=0, spread=None,
        text={"ru": "Радиус окружности $[[R]]$, расстояние от центра до хорды $[[d]]$. Найдите длину хорды.", "kk": "Шеңбердің радиусы $[[R]]$, центрден хордаға дейінгі қашықтық $[[d]]$. Хорданың ұзындығын табыңыз."},
        solution={"ru": "Перпендикуляр из центра делит хорду пополам: $\\frac{l}{2} = \\sqrt{[[R]]^2 - [[d]]^2} = [[half]]$, $l = [[ans]]$.",
                  "kk": "Центрден түсірілген перпендикуляр хорданы қақ бөледі: $\\frac{l}{2} = \\sqrt{[[R]]^2 - [[d]]^2} = [[half]]$, $l = [[ans]]$."},
    ),
    Template(
        id="math.m.plane.heron", **T("metric-relations-plane", "hard"),
        params={"i": range(len(HERON)), "k": [1, 2, 3]},
        derived=lambda p: (lambda a, b, c, s: {"a": a * p.k, "b": b * p.k, "c": c * p.k, "S": s * p.k * p.k, "pp": (a + b + c) * p.k // 2})(*HERON[p.i]),
        where=lambda p: p.c <= 60,
        answer=lambda p: p.S,
        distractors=[lambda p: p.a * p.b // 2, lambda p: p.S * 2, lambda p: p.pp * p.k * 4 if p.pp * p.k * 4 != p.S else p.S + p.a, lambda p: p.a * p.b * p.c // (4 * p.pp)],
        decimals=0,
        text={"ru": "Стороны треугольника равны $[[a]]$, $[[b]]$ и $[[c]]$. Найдите его площадь.", "kk": "Үшбұрыштың қабырғалары $[[a]]$, $[[b]]$ және $[[c]]$. Оның ауданын табыңыз."},
        solution={"ru": "Формула Герона: $p = \\frac{[[a]] + [[b]] + [[c]]}{2} = [[pp]]$, $S = \\sqrt{p(p - a)(p - b)(p - c)} = [[ans]]$.",
                  "kk": "Герон формуласы: $p = \\frac{[[a]] + [[b]] + [[c]]}{2} = [[pp]]$, $S = \\sqrt{p(p - a)(p - b)(p - c)} = [[ans]]$."},
    ),
    Template(
        id="math.m.plane.incircle-right", **T("metric-relations-plane", "medium"),
        params={"t": range(len(TRIPLES))},
        derived=lambda p: (lambda a, b, c: {"a": a, "b": b, "c": c})(*TRIPLES[p.t]),
        answer=lambda p: (p.a + p.b - p.c) / 2,
        distractors=[lambda p: p.c / 2, lambda p: (p.a + p.b + p.c) / 2, lambda p: p.a * p.b / p.c, lambda p: (p.a + p.b - p.c)],
        figure=lambda p: right_triangle(f"{p.a}", f"{p.b}", f"{p.c}", ratio=p.a / p.b),
        decimals=1,
        text={"ru": "Катеты прямоугольного треугольника $[[a]]$ и $[[b]]$, гипотенуза $[[c]]$. Найдите радиус вписанной окружности.", "kk": "Тікбұрышты үшбұрыштың катеттері $[[a]]$ және $[[b]]$, гипотенузасы $[[c]]$. Іштей сызылған шеңбердің радиусын табыңыз."},
        solution={"ru": "Для прямоугольного треугольника $r = \\frac{a + b - c}{2} = \\frac{[[a]] + [[b]] - [[c]]}{2} = [[ans]]$. (Половина гипотенузы — радиус **описанной** окружности.)",
                  "kk": "Тікбұрышты үшбұрыш үшін $r = \\frac{a + b - c}{2} = \\frac{[[a]] + [[b]] - [[c]]}{2} = [[ans]]$. (Гипотенузаның жартысы — **сырттай** сызылған шеңбердің радиусы.)"},
    ),

    # ---------- стереометрия ----------
    Template(
        id="math.m.solid.prism-diagonals", **T("solid-figures", "easy"),
        params={"n": [3, 4, 5, 6, 7, 8, 9, 10, 12]},
        answer=lambda p: p.n * (p.n - 3),
        distractors=[lambda p: p.n * (p.n - 3) // 2, lambda p: p.n * (p.n - 1), lambda p: 2 * p.n, lambda p: p.n * (p.n - 3) + 2],
        decimals=0, spread=None, variants=9,
        valid=lambda p, x: x > 0,
        text={"ru": "Сколько диагоналей у $[[n]]$-угольной призмы? (Диагональ призмы соединяет вершины, не лежащие в одной грани.)",
              "kk": "$[[n]]$-бұрышты призманың неше диагоналі бар? (Призманың диагоналі бір жақта жатпайтын төбелерді қосады.)"},
        solution={"ru": "Из каждой вершины нижнего основания диагонали идут ко всем вершинам верхнего, кроме вершины над ней и двух соседних с той: $[[n]] - 3$. Всего $[[n]]([[n]] - 3) = [[ans]]$.",
                  "kk": "Төменгі табанның әр төбесінен диагональдар жоғарғы табанның өзінің үстіндегі төбеден және оның екі көршісінен басқа барлық төбесіне жүргізіледі: $[[n]] - 3$. Барлығы $[[n]]([[n]] - 3) = [[ans]]$."},
    ),
    Template(
        id="math.m.space.pyramid-volume", **T("metric-relations-space", "hard"),
        params={"t": range(len(TRIPLES))},
        derived=lambda p: (lambda h, half, f: {"h": h, "a": 2 * half, "f": f, "half": half})(*TRIPLES[p.t]),
        where=lambda p: p.a <= 48,
        answer=lambda p: F(p.a * p.a * p.h, 3) if (p.a * p.a * p.h) % 3 else p.a * p.a * p.h // 3,
        distractors=[lambda p: p.a * p.a * p.h, lambda p: F(p.a * p.a * p.f, 3) if (p.a * p.a * p.f) % 3 else p.a * p.a * p.f // 3, lambda p: F(p.a * p.h, 3), lambda p: F(p.a * p.a * p.h, 6)],
        figure=lambda p: pyramid(f"a = {p.a}", "h", f"f = {p.f}"),
        decimals=2,
        text={"ru": "В правильной четырёхугольной пирамиде сторона основания $[[a]]$, апофема (высота боковой грани) $[[f]]$. Найдите объём пирамиды.",
              "kk": "Дұрыс төртбұрышты пирамиданың табан қабырғасы $[[a]]$, апофемасы (бүйір жағының биіктігі) $[[f]]$. Пирамиданың көлемін табыңыз."},
        solution={"ru": "Высота, апофема и половина стороны основания образуют прямоугольный треугольник: $h = \\sqrt{[[f]]^2 - [[half]]^2} = [[h]]$. $V = \\frac{1}{3}a^2h = \\frac{[[a]]^2 \\cdot [[h]]}{3} = [[ans]]$.",
                  "kk": "Биіктік, апофема және табан қабырғасының жартысы тікбұрышты үшбұрыш құрайды: $h = \\sqrt{[[f]]^2 - [[half]]^2} = [[h]]$. $V = \\frac{1}{3}a^2h = \\frac{[[a]]^2 \\cdot [[h]]}{3} = [[ans]]$."},
    ),
    Template(
        id="math.m.space.sphere-volume", **T("metric-relations-space", "medium"),
        params={"r": [1, 2, 3, 4, 5, 6, 9, 12]},
        derived=lambda p: {"S": 4 * p.r * p.r},
        answer=lambda p: pi_ans(F(4 * p.r ** 3, 3)),
        distractors=[lambda p: pi_ans(4 * p.r * p.r), lambda p: pi_ans(F(4 * p.r ** 2, 3)), lambda p: pi_ans(p.r ** 3), lambda p: pi_ans(F(4 * (2 * p.r) ** 3, 3))],
        variants=8,
        text={"ru": "Площадь поверхности шара равна $[[S]]\\pi$. Найдите объём шара.", "kk": "Шар бетінің ауданы $[[S]]\\pi$. Шардың көлемін табыңыз."},
        solution={"ru": "$S = 4\\pi r^2 = [[S]]\\pi$, значит $r = [[r]]$. $V = \\frac{4}{3}\\pi r^3 = [[ans]]$.", "kk": "$S = 4\\pi r^2 = [[S]]\\pi$, демек $r = [[r]]$. $V = \\frac{4}{3}\\pi r^3 = [[ans]]$."},
    ),
    Template(
        id="math.m.space.cylinder-surface", **T("metric-relations-space", "medium"),
        params={"r": [1, 2, 3, 4, 5, 6], "h": [2, 3, 4, 5, 7, 8, 10]},
        where=lambda p: p.r != p.h,
        answer=lambda p: pi_ans(2 * p.r * (p.r + p.h)),
        distractors=[lambda p: pi_ans(2 * p.r * p.h), lambda p: pi_ans(p.r * (p.r + p.h)), lambda p: pi_ans(p.r * p.r * p.h), lambda p: pi_ans(2 * p.r * p.h + p.r * p.r)],
        text={"ru": "Радиус основания цилиндра $[[r]]$, высота $[[h]]$. Найдите площадь полной поверхности цилиндра.", "kk": "Цилиндр табанының радиусы $[[r]]$, биіктігі $[[h]]$. Цилиндрдің толық бетінің ауданын табыңыз."},
        solution={"ru": "$S = 2\\pi rh + 2\\pi r^2 = 2\\pi r(r + h) = 2\\pi \\cdot [[r]] \\cdot ([[r]] + [[h]]) = [[ans]]$. Два основания — не забываем!",
                  "kk": "$S = 2\\pi rh + 2\\pi r^2 = 2\\pi r(r + h) = 2\\pi \\cdot [[r]] \\cdot ([[r]] + [[h]]) = [[ans]]$. Екі табанды ұмытпаймыз!"},
    ),

    # ---------- векторы и координаты ----------
    Template(
        id="math.m.vsp.collinear", **T("vectors-in-space", "medium"),
        params={"x": [1, 2, 3, -1, -2], "y": [1, 2, 3, 4, -2], "z": [2, 3, 5, -1], "k": [2, 3, -2, 4]},
        derived=lambda p: {"X": p.k * p.x, "Z": p.k * p.z},
        where=lambda p: p.y != 0,
        answer=lambda p: p.k * p.y,
        distractors=[lambda p: p.y * p.x, lambda p: -p.k * p.y, lambda p: p.k + p.y, lambda p: p.y],
        decimals=0, spread=None,
        text={"ru": "При каком $m$ векторы $\\vec{a}([[x]]; [[y]]; [[z]])$ и $\\vec{b}([[X]]; m; [[Z]])$ коллинеарны?", "kk": "$m$-нің қандай мәнінде $\\vec{a}([[x]]; [[y]]; [[z]])$ және $\\vec{b}([[X]]; m; [[Z]])$ векторлары коллинеар болады?"},
        solution={"ru": "Координаты коллинеарных векторов пропорциональны: $\\frac{[[X]]}{[[x]]} = \\frac{[[Z]]}{[[z]]} = [[k]]$. Значит $m = [[k]] \\cdot [[y]] = [[ans]]$.",
                  "kk": "Коллинеар векторлардың координаталары пропорционал: $\\frac{[[X]]}{[[x]]} = \\frac{[[Z]]}{[[z]]} = [[k]]$. Демек $m = [[k]] \\cdot [[y]] = [[ans]]$."},
    ),
    Template(
        id="math.m.vsp.distance", **T("vectors-in-space", "easy"),
        params={"q": [(1, 2, 2, 3), (2, 3, 6, 7), (1, 4, 8, 9), (2, 6, 9, 11), (4, 4, 7, 9), (6, 6, 7, 11), (2, 10, 11, 15), (3, 4, 12, 13)], "x1": [-2, 0, 1, 3], "y1": [-1, 2, 4], "z1": [0, -3, 5]},
        derived=lambda p: {"x2": p.x1 + p.q[0], "y2": p.y1 - p.q[1], "z2": p.z1 + p.q[2], "L": p.q[3]},
        answer=lambda p: p.L,
        distractors=[lambda p: p.q[0] + p.q[1] + p.q[2], lambda p: p.L ** 2, lambda p: abs(p.q[0] - p.q[1] + p.q[2]) or p.L + 2, lambda p: p.L + 1],
        decimals=0,
        text={"ru": "Найдите расстояние между точками $A([[x1]]; [[y1]]; [[z1]])$ и $B([[x2]]; [[y2]]; [[z2]])$.", "kk": "$A([[x1]]; [[y1]]; [[z1]])$ және $B([[x2]]; [[y2]]; [[z2]])$ нүктелерінің арасындағы қашықтықты табыңыз."},
        solution={"ru": "$AB = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2 + (z_2 - z_1)^2} = \\sqrt{[[Lsq]]} = [[ans]]$.", "kk": "$AB = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2 + (z_2 - z_1)^2} = \\sqrt{[[Lsq]]} = [[ans]]$."},
    ),
    Template(
        id="math.m.vsp.midpoint", **T("vectors-in-space", "easy"),
        params={"x1": [-4, -2, 1, 3], "x2": [2, 6, 8], "y1": [-3, 0, 5], "y2": [1, 7, -5], "z1": [2, -6], "z2": [4, 0, 8]},
        where=lambda p: (p.x1 + p.x2) % 2 == 0 and (p.y1 + p.y2) % 2 == 0 and (p.z1 + p.z2) % 2 == 0,
        answer=lambda p: f"({(p.x1 + p.x2) // 2}; {(p.y1 + p.y2) // 2}; {(p.z1 + p.z2) // 2})".replace("-", "−"),
        distractors=[lambda p: f"({p.x1 + p.x2}; {p.y1 + p.y2}; {p.z1 + p.z2})".replace("-", "−"),
                     lambda p: f"({(p.x2 - p.x1) // 2}; {(p.y2 - p.y1) // 2}; {(p.z2 - p.z1) // 2})".replace("-", "−"),
                     lambda p: f"({p.x2 - p.x1}; {p.y2 - p.y1}; {p.z2 - p.z1})".replace("-", "−")],
        text={"ru": "Найдите координаты середины отрезка $AB$, если $A([[x1]]; [[y1]]; [[z1]])$, $B([[x2]]; [[y2]]; [[z2]])$.", "kk": "$A([[x1]]; [[y1]]; [[z1]])$, $B([[x2]]; [[y2]]; [[z2]])$ болса, $AB$ кесіндісінің ортасының координаталарын табыңыз."},
        solution={"ru": "Координаты середины — полусуммы координат концов: [[ans]].", "kk": "Ортасының координаталары — ұштарының координаталарының жарты қосындысы: [[ans]]."},
    ),

    # ---------- анализ ----------
    Template(
        id="math.m.calc.integral-poly", **T("calculus-and-modeling", "medium"),
        params={"a": [0, 1], "b": [2, 3, 4], "k": [1, 2, 3], "m": [-4, -2, 1, 2, 3, 5]},
        derived=lambda p: {"f": lead(3 * p.k, "x^2") + " " + term(p.m)},
        answer=lambda p: p.k * (p.b ** 3 - p.a ** 3) + p.m * (p.b - p.a),
        distractors=[lambda p: 6 * p.k * (p.b - p.a), lambda p: 3 * p.k * (p.b ** 3 - p.a ** 3) + p.m * (p.b - p.a), lambda p: p.k * (p.b ** 3 - p.a ** 3), lambda p: p.k * p.b ** 3 + p.m * p.b + 1],
        decimals=0, spread=None,
        text={"ru": "Вычислите интеграл $\\displaystyle\\int_{[[a]]}^{[[b]]} ([[f]])\\,dx$.", "kk": "$\\displaystyle\\int_{[[a]]}^{[[b]]} ([[f]])\\,dx$ интегралын есептеңіз."},
        solution={"ru": "Первообразная: $[[F]]$. По формуле Ньютона — Лейбница $F([[b]]) - F([[a]]) = [[ans]]$.", "kk": "Алғашқы функция: $[[F]]$. Ньютон — Лейбниц формуласы бойынша $F([[b]]) - F([[a]]) = [[ans]]$."},
    ),
    Template(
        id="math.m.calc.velocity", **T("calculus-and-modeling", "easy"),
        params={"a": [1, 2], "b": [-3, 2, 4, 5], "c": [1, 3, 6], "t": [1, 2, 3, 4]},
        derived=lambda p: {"s": lead(p.a, "t^3") + " " + term(p.b, "t^2") + " " + term(p.c, "t")},
        answer=lambda p: 3 * p.a * p.t ** 2 + 2 * p.b * p.t + p.c,
        distractors=[lambda p: p.a * p.t ** 3 + p.b * p.t ** 2 + p.c * p.t, lambda p: 6 * p.a * p.t + 2 * p.b, lambda p: 3 * p.a * p.t ** 2 + p.b * p.t + p.c, lambda p: 3 * p.a * p.t ** 2 + 2 * p.b * p.t],
        decimals=0, spread=None, unit="м/с",
        valid=lambda p, x: x > 0,
        where=lambda p: 3 * p.a * p.t ** 2 + 2 * p.b * p.t + p.c > 0,
        text={"ru": "Точка движется по закону $s(t) = [[s]]$ ($s$ — в метрах, $t$ — в секундах). Найдите скорость в момент $t = [[t]]$ с.", "kk": "Нүкте $s(t) = [[s]]$ заңымен қозғалады ($s$ — метрмен, $t$ — секундпен). $t = [[t]]$ с кезіндегі жылдамдықты табыңыз."},
        solution={"ru": "Скорость — производная пути: $v(t) = s'(t)$. Подставляем $t = [[t]]$: $v = [[ans]]$ м/с. (Значение $s([[t]])$ — это путь, а не скорость.)",
                  "kk": "Жылдамдық — жолдың туындысы: $v(t) = s'(t)$. $t = [[t]]$ мәнін қоямыз: $v = [[ans]]$ м/с. ($s([[t]])$ мәні — жол, жылдамдық емес.)"},
    ),
    Template(
        id="math.m.calc.max-on-segment", **T("calculus-and-modeling", "hard"),
        params={"r": [1, 2, 3], "c": range(-5, 6), "b": [3, 4, 5]},
        derived=lambda p: {"k": 3 * p.r * p.r, "ct": term(p.c), "fmax": -2 * p.r ** 3 + p.c, "fb": p.b ** 3 - 3 * p.r * p.r * p.b + p.c, "fa": p.c},
        where=lambda p: p.b > p.r,
        answer=lambda p: max(p.fa, p.fb, -2 * p.r ** 3 + p.c),
        distractors=[lambda p: -2 * p.r ** 3 + p.c, lambda p: 2 * p.r ** 3 + p.c, lambda p: p.fa if p.fa != max(p.fa, p.fb) else p.fb - 1, lambda p: p.b ** 3 + p.c],
        decimals=0, spread=None,
        text={"ru": "Найдите наибольшее значение функции $f(x) = x^3 - [[k]]x [[ct]]$ на отрезке $[0; [[b]]]$.", "kk": "$f(x) = x^3 - [[k]]x [[ct]]$ функциясының $[0; [[b]]]$ кесіндісіндегі ең үлкен мәнін табыңыз."},
        solution={"ru": "$f'(x) = 3x^2 - [[k]] = 0$ при $x = [[r]]$ (это минимум, $f([[r]]) = [[fmax]]$). Сравниваем значения на концах: $f(0) = [[fa]]$, $f([[b]]) = [[fb]]$. Наибольшее: $[[ans]]$.",
                  "kk": "$x = [[r]]$ болғанда $f'(x) = 3x^2 - [[k]] = 0$ (бұл минимум, $f([[r]]) = [[fmax]]$). Ұштарындағы мәндерді салыстырамыз: $f(0) = [[fa]]$, $f([[b]]) = [[fb]]$. Ең үлкені: $[[ans]]$."},
    ),

    # ---------- соответствие ----------
    Template(
        id="math.m.match.circle", kind="match", **T("plane-figures", "easy"),
        params={"r": [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]},
        rows={"ru": ["длина окружности радиуса $[[r]]$", "площадь круга радиуса $[[r]]$"], "kk": ["радиусы $[[r]]$ шеңбердің ұзындығы", "радиусы $[[r]]$ дөңгелектің ауданы"]},
        answers=[lambda p: pi_ans(2 * p.r), lambda p: pi_ans(p.r * p.r)],
        distractors=[lambda p: pi_ans(p.r), lambda p: pi_ans(2 * p.r * p.r), lambda p: pi_ans(4 * p.r * p.r)],
        where=lambda p: p.r != 2,
        variants=9,
        text={"ru": "Установите соответствие между величиной и её значением.", "kk": "Шама мен оның мәнінің сәйкестігін анықтаңыз."},
        solution={"ru": "$C = 2\\pi r$ = [[ans1]], $S = \\pi r^2$ = [[ans2]].", "kk": "$C = 2\\pi r$ = [[ans1]], $S = \\pi r^2$ = [[ans2]]."},
    ),
    Template(
        id="math.m.match.log-values", kind="match", **T("exponential-log-equations", "easy"),
        params={"a": [2, 3, 5], "m": [2, 3, 4], "n": [-2, -1, 0]},
        derived=lambda p: {"A": p.a ** p.m, "B": frac(F(1, p.a ** -p.n)) if p.n < 0 else "1"},
        where=lambda p: p.a ** p.m <= 125,
        rows={"ru": ["$\\log_{[[a]]} [[A]]$", "$\\log_{[[a]]} [[B]]$"], "kk": ["$\\log_{[[a]]} [[A]]$", "$\\log_{[[a]]} [[B]]$"]},
        answers=[lambda p: p.m, lambda p: p.n],
        distractors=[lambda p: -p.m, lambda p: p.m + 1, lambda p: -p.n if p.n else 1],
        decimals=0,
        text={"ru": "Установите соответствие между выражением и его значением.", "kk": "Өрнек пен оның мәнінің сәйкестігін анықтаңыз."},
        solution={"ru": "$[[a]]^{[[m]]} = [[A]]$, поэтому первый логарифм равен $[[ans1]]$; $[[a]]^{[[n]]} = [[B]]$, поэтому второй равен $[[ans2]]$.",
                  "kk": "$[[a]]^{[[m]]} = [[A]]$, сондықтан бірінші логарифм: $[[ans1]]$; $[[a]]^{[[n]]} = [[B]]$, сондықтан екіншісі: $[[ans2]]$."},
    ),
]

# дополнительные переменные, которые проще посчитать отдельно
_EXTRA = {
    "math.m.plane.polygon-angle": lambda p: {"n2": p.n - 2},
    "math.m.prog.positive-terms": lambda p: {"absd": -p.d},
    "math.m.vsp.distance": lambda p: {"Lsq": p.q[3] ** 2},
    "math.m.calc.integral-poly": lambda p: {"F": lead(p.k, "x^3") + " " + term(p.m, "x")},
    "math.m.eq.irrational": lambda p: {"at": term(p.a), "bt": term(-p.b)},
}
def _chain(old, add):
    def d(p):
        q = old(p) if old else {}
        return {**q, **add(P({**p, **q}))}
    return d


for _t in TEMPLATES:
    if _t.id in _EXTRA:
        _t.derived = _chain(_t.derived, _EXTRA[_t.id])


CONTEXTS = [
    Context(
        id="math.ctx.deposit", **T("calculus-and-modeling"),
        params={"S": [100000, 200000, 250000, 400000, 500000], "r": [5, 8, 10, 12, 15, 20]},
        derived=lambda p: {"y1": p.S * (100 + p.r) // 100, "y2": p.S * (100 + p.r) ** 2 // 10000, "simple": p.S * (100 + 2 * p.r) // 100},
        where=lambda p: p.S * (100 + p.r) ** 2 % 10000 == 0,
        context={"ru": "Айгерим положила в банк $[[S]]$ тенге под $[[r]]\\%$ годовых. Каждый год банк начисляет проценты на всю сумму на счёте (сложные проценты). Деньги со счёта не снимают.",
                 "kk": "Айгерім банкке жылдық $[[r]]\\%$-бен $[[S]]$ теңге салды. Банк жыл сайын шоттағы бүкіл сомаға пайыз есептейді (күрделі пайыз). Шоттан ақша алынбайды."},
        questions=[
            Q("Сколько тенге будет на счёте через год?", "Бір жылдан кейін шотта неше теңге болады?",
              lambda p: p.y1, [lambda p: p.S * p.r // 100, lambda p: p.S + p.r * 1000, lambda p: p.S * (100 + 2 * p.r) // 100],
              "$[[S]] \\cdot (1 + 0{,}01 \\cdot [[r]]) = [[ans]]$ тенге.", "$[[S]] \\cdot (1 + 0{,}01 \\cdot [[r]]) = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("Сколько тенге будет на счёте через два года?", "Екі жылдан кейін шотта неше теңге болады?",
              lambda p: p.y2, [lambda p: p.simple, lambda p: p.y1, lambda p: p.y2 + p.S * p.r // 100],
              "Проценты второго года начисляются на новую сумму: $[[y1]] \\cdot (1 + 0{,}01 \\cdot [[r]]) = [[ans]]$ тенге.",
              "Екінші жылдың пайызы жаңа сомаға есептеледі: $[[y1]] \\cdot (1 + 0{,}01 \\cdot [[r]]) = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("На сколько тенге доход за два года больше, чем при простых процентах (когда проценты каждый год начисляют только на первоначальную сумму)?",
              "Екі жылдағы табыс жай пайыз кезіндегі табыстан (пайыз жыл сайын тек бастапқы сомаға есептелгенде) неше теңгеге көп?",
              lambda p: p.y2 - p.simple, [lambda p: p.y2 - p.y1, lambda p: p.S * p.r // 100, lambda p: 2 * (p.y2 - p.simple)],
              "Простые проценты: $[[S]] \\cdot (1 + 2 \\cdot 0{,}01 \\cdot [[r]]) = [[simple]]$. Разница: $[[y2]] - [[simple]] = [[ans]]$ тенге — это «проценты на проценты».",
              "Жай пайыз: $[[S]] \\cdot (1 + 2 \\cdot 0{,}01 \\cdot [[r]]) = [[simple]]$. Айырмасы: $[[y2]] - [[simple]] = [[ans]]$ теңге — бұл «пайызға пайыз».", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("На сколько процентов выросла сумма за два года?", "Екі жылда сома неше пайызға өсті?",
              lambda p: (100 + p.r) ** 2 / 100 - 100, [lambda p: 2 * p.r, lambda p: p.r * p.r / 100, lambda p: p.r],
              "Множитель за два года $(1 + 0{,}01 \\cdot [[r]])^2$. Рост: $[[ans]]\\%$ — больше, чем $2 \\cdot [[r]]\\%$.",
              "Екі жылдағы көбейткіш $(1 + 0{,}01 \\cdot [[r]])^2$. Өсім: $[[ans]]\\%$ — $2 \\cdot [[r]]\\%$-дан көп.", decimals=2, unit="%"),
        ],
        variants=12,
    ),
    Context(
        id="math.ctx.cyclists", **T("linear-quadratic-rational-equations"),
        params={"v1": [12, 15, 18, 20], "v2": [8, 10, 12, 16, 24], "t": [1, 2, 3]},
        derived=lambda p: {"S": (p.v1 + p.v2) * p.t, "s1": p.v1 * p.t, "s2": p.v2 * p.t},
        where=lambda p: p.v1 != p.v2 and p.v1 > p.v2,
        context={"ru": "Из сёл Акжар и Талдыбулак, расстояние между которыми $[[S]]$ км, одновременно навстречу друг другу выехали два велосипедиста. Скорость первого $[[v1]]$ км/ч, второго — $[[v2]]$ км/ч.",
                 "kk": "Арақашықтығы $[[S]]$ км болатын Ақжар және Талдыбұлақ ауылдарынан бір мезгілде бір-біріне қарсы екі велосипедші шықты. Біріншісінің жылдамдығы $[[v1]]$ км/сағ, екіншісінікі — $[[v2]]$ км/сағ."},
        questions=[
            Q("С какой скоростью велосипедисты сближаются?", "Велосипедшілер қандай жылдамдықпен жақындасады?",
              lambda p: p.v1 + p.v2, [lambda p: p.v1 - p.v2, lambda p: (p.v1 + p.v2) / 2, lambda p: p.v1 * p.v2 // 4],
              "При движении навстречу скорости складываются: $[[v1]] + [[v2]] = [[ans]]$ км/ч.", "Қарсы қозғалғанда жылдамдықтар қосылады: $[[v1]] + [[v2]] = [[ans]]$ км/сағ.", decimals=1, unit="км/ч", unit_kk="км/сағ"),
            Q("Через сколько часов они встретятся?", "Олар неше сағаттан кейін кездеседі?",
              lambda p: p.t, [lambda p: p.S / (p.v1 - p.v2), lambda p: p.S / p.v1, lambda p: 2 * p.t],
              "$t = \\frac{[[S]]}{[[v1]] + [[v2]]} = [[ans]]$ ч.", "$t = \\frac{[[S]]}{[[v1]] + [[v2]]} = [[ans]]$ сағ.", decimals=2, unit="ч", unit_kk="сағ"),
            Q("Сколько километров до встречи проедет первый велосипедист?", "Кездескенге дейін бірінші велосипедші неше километр жүреді?",
              lambda p: p.s1, [lambda p: p.s2, lambda p: p.S / 2, lambda p: p.S - p.v2],
              "$s_1 = [[v1]] \\cdot [[t]] = [[ans]]$ км.", "$s_1 = [[v1]] \\cdot [[t]] = [[ans]]$ км.", decimals=1, unit="км"),
            Q("На каком расстоянии от середины пути произойдёт встреча?", "Кездесу жолдың ортасынан қандай қашықтықта болады?",
              lambda p: p.s1 - p.S / 2, [lambda p: p.s1 - p.s2, lambda p: p.S / 2, lambda p: (p.v1 - p.v2)],
              "Середина пути — $\\frac{[[S]]}{2}$ км от Акжара. Первый проехал $[[s1]]$ км, то есть дальше середины на $[[ans]]$ км.",
              "Жолдың ортасы Ақжардан $\\frac{[[S]]}{2}$ км. Бірінші велосипедші $[[s1]]$ км жүрді, яғни ортадан $[[ans]]$ км асты.", decimals=1, unit="км"),
        ],
        variants=12,
    ),
    Context(
        id="math.ctx.pyramid", **T("metric-relations-space", "hard"),
        params={"t": range(len(TRIPLES))},
        derived=lambda p: (lambda h, half, f: {"h": h, "half": half, "a": 2 * half, "f": f})(*TRIPLES[p.t]),
        where=lambda p: p.a <= 40 and (4 * p.half * p.half * p.h) % 3 == 0,
        figure=lambda p: pyramid(f"a = {p.a}", f"h = {p.h}", "f"),
        context={"ru": "Правильная четырёхугольная пирамида: сторона основания $a = [[a]]$, высота $h = [[h]]$ (см. рисунок).",
                 "kk": "Дұрыс төртбұрышты пирамида: табан қабырғасы $a = [[a]]$, биіктігі $h = [[h]]$ (суретті қараңыз)."},
        questions=[
            Q("Найдите апофему $f$ (высоту боковой грани).", "$f$ апофемасын (бүйір жағының биіктігін) табыңыз.",
              lambda p: p.f, [lambda p: p.h + p.half, lambda p: p.a, lambda p: p.f + 1],
              "Высота, апофема и половина стороны основания — прямоугольный треугольник: $f = \\sqrt{[[h]]^2 + [[half]]^2} = [[ans]]$.",
              "Биіктік, апофема және табан қабырғасының жартысы — тікбұрышты үшбұрыш: $f = \\sqrt{[[h]]^2 + [[half]]^2} = [[ans]]$.", decimals=0),
            Q("Найдите площадь основания.", "Табан ауданын табыңыз.",
              lambda p: p.a * p.a, [lambda p: 4 * p.a, lambda p: p.a * p.a // 2, lambda p: p.half * p.half],
              "Основание — квадрат: $S = a^2 = [[a]]^2 = [[ans]]$.", "Табаны — шаршы: $S = a^2 = [[a]]^2 = [[ans]]$.", decimals=0),
            Q("Найдите площадь боковой поверхности.", "Бүйір бетінің ауданын табыңыз.",
              lambda p: 2 * p.a * p.f, [lambda p: 4 * p.a * p.f, lambda p: p.a * p.f, lambda p: 2 * p.a * p.h],
              "Четыре треугольника: $S_{\\text{бок}} = 4 \\cdot \\frac{1}{2} a f = 2 \\cdot [[a]] \\cdot [[f]] = [[ans]]$.",
              "Төрт үшбұрыш: $S_{\\text{бүйір}} = 4 \\cdot \\frac{1}{2} a f = 2 \\cdot [[a]] \\cdot [[f]] = [[ans]]$.", decimals=0),
            Q("Найдите объём пирамиды.", "Пирамиданың көлемін табыңыз.",
              lambda p: p.a * p.a * p.h // 3, [lambda p: p.a * p.a * p.h, lambda p: p.a * p.a * p.f // 3 if (p.a * p.a * p.f) % 3 == 0 else p.a * p.a * p.h // 2, lambda p: p.a * p.a * p.h // 6 if (p.a * p.a * p.h) % 6 == 0 else 2 * p.a * p.a * p.h // 3],
              "$V = \\frac{1}{3} S_{\\text{осн}} h = \\frac{[[a]]^2 \\cdot [[h]]}{3} = [[ans]]$.", "$V = \\frac{1}{3} S_{\\text{таб}} h = \\frac{[[a]]^2 \\cdot [[h]]}{3} = [[ans]]$.", decimals=0),
        ],
        variants=12,
    ),
    Context(
        id="math.ctx.cubic", **T("calculus-and-modeling", "hard"),
        params={"r": [1, 2, 3], "c": range(-6, 7)},
        derived=lambda p: {"k": 3 * p.r * p.r, "ct": term(p.c), "fmin": -2 * p.r ** 3 + p.c, "fmx": 2 * p.r ** 3 + p.c, "f0": p.c},
        where=lambda p: p.c != 0 and p.c not in (2 * p.r ** 3, -2 * p.r ** 3),
        context={"ru": "Дана функция $f(x) = x^3 - [[k]]x [[ct]]$.", "kk": "$f(x) = x^3 - [[k]]x [[ct]]$ функциясы берілген."},
        questions=[
            Q("Найдите $f'(x)$ в точке $x = 0$.", "$x = 0$ нүктесіндегі $f'(x)$ мәнін табыңыз.",
              lambda p: -p.k, [lambda p: p.k, lambda p: p.c, lambda p: 0],
              "$f'(x) = 3x^2 - [[k]]$, $f'(0) = [[ans]]$.", "$f'(x) = 3x^2 - [[k]]$, $f'(0) = [[ans]]$.", decimals=0),
            Q("Найдите точку максимума функции.", "Функцияның максимум нүктесін табыңыз.",
              lambda p: -p.r, [lambda p: p.r, lambda p: 0, lambda p: p.k],
              "$f'(x) = 0$ при $x = \\pm [[r]]$. Производная меняет знак с «+» на «−» в точке $x = [[ans]]$ — это максимум.",
              "$x = \\pm [[r]]$ болғанда $f'(x) = 0$. Туынды $x = [[ans]]$ нүктесінде таңбасын плюстан минусқа өзгертеді — бұл максимум.", decimals=0),
            Q("Найдите значение функции в точке минимума.", "Минимум нүктесіндегі функцияның мәнін табыңыз.",
              lambda p: p.fmin, [lambda p: p.fmx, lambda p: p.f0, lambda p: p.fmin - p.k],
              "Минимум в $x = [[r]]$: $f([[r]]) = [[r]]^3 - [[k]] \\cdot [[r]] [[ct]] = [[ans]]$.", "Минимум $x = [[r]]$ нүктесінде: $f([[r]]) = [[r]]^3 - [[k]] \\cdot [[r]] [[ct]] = [[ans]]$.", decimals=0),
            Q("Найдите значение функции в точке максимума.", "Максимум нүктесіндегі функцияның мәнін табыңыз.",
              lambda p: p.fmx, [lambda p: p.fmin, lambda p: p.f0, lambda p: p.fmx + p.k],
              "Максимум в $x = -[[r]]$: $f(-[[r]]) = -[[r]]^3 + [[k]] \\cdot [[r]] [[ct]] = [[ans]]$.", "Максимум $x = -[[r]]$ нүктесінде: $f(-[[r]]) = -[[r]]^3 + [[k]] \\cdot [[r]] [[ct]] = [[ans]]$.", decimals=0),
        ],
        variants=12,
    ),
]


# ---------- несколько верных ответов (ЕНТ 36–40) ----------
TEMPLATES += [
    Template(
        id="math.m.multi.quadratic-roots", kind="multi", **T("linear-quadratic-rational-equations", "medium"),
        params={"r1": range(-6, 7), "r2": range(-6, 7), "a": [1, 2]},
        derived=lambda p: {"eq": lead(p.a, "x^2") + " " + term(-p.a * (p.r1 + p.r2), "x") + " " + term(p.a * p.r1 * p.r2)},
        where=lambda p: p.r1 < p.r2 and p.r1 != 0 and p.r2 != 0 and p.r1 != -p.r2,
        answers=[lambda p: p.r1, lambda p: p.r2],
        distractors=[lambda p: -p.r1, lambda p: -p.r2, lambda p: p.r1 + p.r2, lambda p: p.r1 * p.r2],
        decimals=0, spread=None,
        text={"ru": "Выберите все корни уравнения $[[eq]] = 0$.", "kk": "$[[eq]] = 0$ теңдеуінің барлық түбірін таңдаңыз."},
        solution={"ru": "Делим на старший коэффициент и применяем теорему Виета (или дискриминант): корни $[[r1]]$ и $[[r2]]$. Проверка подстановкой.",
                  "kk": "Бас коэффициентке бөліп, Виет теоремасын (немесе дискриминантты) қолданамыз: түбірлері $[[r1]]$ және $[[r2]]$. Қойып тексереміз."},
    ),
    Template(
        id="math.m.multi.points-on-line", kind="multi", **T("calculus-and-modeling", "easy"),
        params={"k": [-3, -2, -1, 2, 3], "b": [-4, -1, 2, 5], "x1": [-2, 0, 1], "x2": [2, 3, 4]},
        derived=lambda p: {"f": lead(p.k, "x") + " " + term(p.b), "y1": p.k * p.x1 + p.b, "y2": p.k * p.x2 + p.b},
        # ни одна «неверная» точка случайно не должна лежать на прямой
        where=lambda p: all(y != p.k * x + p.b for x, y in [(p.k * p.x1 + p.b, p.x1), (p.x2, p.k * p.x2 - p.b), (-p.x2, p.k * p.x2 + p.b)]),
        answers=[lambda p: f"({p.x1}; {p.k * p.x1 + p.b})".replace("-", "−"), lambda p: f"({p.x2}; {p.k * p.x2 + p.b})".replace("-", "−")],
        distractors=[lambda p: f"({p.k * p.x1 + p.b}; {p.x1})".replace("-", "−"), lambda p: f"({p.x2}; {p.k * p.x2 - p.b})".replace("-", "−"),
                     lambda p: f"({p.x1}; {p.k * p.x1 + p.b + 1})".replace("-", "−"), lambda p: f"({-p.x2}; {p.k * p.x2 + p.b})".replace("-", "−")],
        text={"ru": "Какие из точек лежат на графике функции $y = [[f]]$? Выберите все верные ответы.", "kk": "Қай нүктелер $y = [[f]]$ функциясының графигінде жатыр? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "Подставляем абсциссу точки в формулу и сравниваем с ординатой: $y([[x1]]) = [[y1]]$, $y([[x2]]) = [[y2]]$. Подходят точки $([[x1]]; [[y1]])$ и $([[x2]]; [[y2]])$.", "kk": "Нүктенің абсциссасын формулаға қойып, ординатасымен салыстырамыз: $y([[x1]]) = [[y1]]$, $y([[x2]]) = [[y2]]$. $([[x1]]; [[y1]])$ және $([[x2]]; [[y2]])$ нүктелері жарайды."},
    ),
]
