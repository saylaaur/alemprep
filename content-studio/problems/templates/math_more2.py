"""Математика · новые типы задач (ночь 3): тригонометрия, тригонометрические и иррациональные уравнения,
особые системы, системы неравенств, планиметрия, стереометрия, степени, корни, выражения, векторы.
Ответы считаются в коде; неверные варианты — типичные ошибки. Казахский текст — черновик для вычитки."""
import math
from fractions import Fraction as F

from ctx import Q
from engine import INF, Context, P, Template, fmt, frac, iv, lead, pi_ans, term
from figures import right_triangle


def T(topic: str, level: str = "medium") -> dict:
    return dict(subject="math", topic=topic, level=level)


def ft(x) -> str:
    """Дробь или число без долларов — для вставки внутрь формулы."""
    return frac(F(x)).strip("$")


def sq(k, m) -> str:
    r = math.isqrt(m)
    if r * r == m:
        return f"${fmt(k * r)}$"
    k = F(k)
    if k == 1:
        return f"$\\sqrt{{{m}}}$"
    if k.denominator != 1:
        return f"$\\frac{{{k.numerator}\\sqrt{{{m}}}}}{{{k.denominator}}}$"
    return f"${k.numerator}\\sqrt{{{m}}}$"


_BASE = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29)]
TRIPLES = sorted({(a * k, b * k, c * k) for a, b, c in _BASE for k in (1, 2, 3) if c * k <= 60})
PRIM = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29), (9, 40, 41)]
QUADS = [(1, 2, 2, 3), (2, 3, 6, 7), (1, 4, 8, 9), (2, 6, 9, 11), (4, 4, 7, 9), (6, 6, 7, 11), (2, 10, 11, 15), (3, 4, 12, 13), (2, 5, 14, 15), (8, 9, 12, 17)]

# формулы приведения: (запись, функция ответа, знак), α — острый угол
RED = [("\\sin\\left(\\frac{\\pi}{2} - \\alpha\\right)", "cos", 1), ("\\cos\\left(\\frac{\\pi}{2} - \\alpha\\right)", "sin", 1),
       ("\\sin\\left(\\frac{\\pi}{2} + \\alpha\\right)", "cos", 1), ("\\cos\\left(\\frac{\\pi}{2} + \\alpha\\right)", "sin", -1),
       ("\\sin(\\pi - \\alpha)", "sin", 1), ("\\cos(\\pi - \\alpha)", "cos", -1), ("\\sin(\\pi + \\alpha)", "sin", -1),
       ("\\cos(\\pi + \\alpha)", "cos", -1), ("\\sin\\left(\\frac{3\\pi}{2} - \\alpha\\right)", "cos", -1), ("\\cos\\left(\\frac{3\\pi}{2} + \\alpha\\right)", "sin", 1),
       ("\\cos(2\\pi - \\alpha)", "cos", 1), ("\\sin(2\\pi - \\alpha)", "sin", -1)]

# уравнения a·t² + b·t + c = 0 с корнями t1, t2 (t = sin x или cos x)
TQ = [(F(1, 2), F(-1)), (F(1, 2), F(1)), (F(-1, 2), F(1)), (F(0), F(1, 2)), (F(0), F(-1)), (F(1, 2), F(-1, 2)), (F(0), F(1)), (F(-1, 2), F(-1)), (F(1, 2), F(2)), (F(-1, 2), F(3, 2))]


def roots_on(fn: str, ts, a: float, b: float) -> int:
    xs = set()
    for t in ts:
        t = float(t)
        if abs(t) > 1 + 1e-12:
            continue
        base = math.asin(t) if fn == "sin" else math.acos(t)
        for k in range(-3, 6):
            cands = (base + 2 * math.pi * k, math.pi - base + 2 * math.pi * k) if fn == "sin" else (base + 2 * math.pi * k, -base + 2 * math.pi * k)
            for x in cands:
                if a - 1e-9 <= x <= b + 1e-9:
                    xs.add(round(x, 9))
    return len(xs)


def quad_tex(t1: F, t2: F, var: str) -> str:
    """Уравнение с корнями t1, t2 и целыми коэффициентами: q·(t − t1)(t − t2) = 0."""
    q = math.lcm(t1.denominator, t2.denominator)
    a, b, c = q, -q * (t1 + t2), q * t1 * t2
    a, b, c = int(a), int(b), int(c)
    g = math.gcd(math.gcd(a, abs(b)), abs(c)) or 1
    a, b, c = a // g, b // g, c // g
    return (lead(a, var + "^2") + " " + term(b, var) + " " + term(c)).strip()


def int_count(pred, lo=-60, hi=60) -> int:
    return sum(1 for x in range(lo, hi + 1) if pred(x))


def _chain(old, add):
    def d(p):
        q = old(p) if old else {}
        return {**q, **add(P({**p, **q}))}
    return d


TEMPLATES = [
    # ---------- тригонометрия ----------
    Template(
        id="math.n.trig.reduction", **T("trigonometry", "medium"),
        params={"r": range(len(RED)), "t": range(len(PRIM)), "g": ["sin", "cos"]},
        derived=lambda p: (lambda a, b, c: {"f": RED[p.r][0], "val": F(a, c) if p.g == "sin" else F(b, c), "other": F(b, c) if p.g == "sin" else F(a, c),
                                            "gtex": "\\sin" if p.g == "sin" else "\\cos"})(*PRIM[p.t]),
        answer=lambda p: frac(RED[p.r][2] * (p.val if RED[p.r][1] == p.g else p.other)),
        distractors=[lambda p: frac(-RED[p.r][2] * (p.val if RED[p.r][1] == p.g else p.other)),
                     lambda p: frac(RED[p.r][2] * (p.other if RED[p.r][1] == p.g else p.val)),
                     lambda p: frac(-RED[p.r][2] * (p.other if RED[p.r][1] == p.g else p.val))],
        text={"ru": "Известно, что $[[gtex]]\\alpha = [[valt]]$, $0 < \\alpha < \\frac{\\pi}{2}$. Найдите $[[f]]$.",
              "kk": "$[[gtex]]\\alpha = [[valt]]$, $0 < \\alpha < \\frac{\\pi}{2}$ екені белгілі. $[[f]]$ мәнін табыңыз."},
        solution={"ru": "По формуле приведения выражение сводится к $\\pm\\sin\\alpha$ или $\\pm\\cos\\alpha$: при $\\frac{\\pi}{2}$ и $\\frac{3\\pi}{2}$ функция меняется на кофункцию, знак — как у исходной функции в нужной четверти. Вторую функцию находим из $\\sin^2\\alpha + \\cos^2\\alpha = 1$. Ответ: [[ans]].",
                  "kk": "Келтіру формуласы бойынша өрнек $\\pm\\sin\\alpha$ немесе $\\pm\\cos\\alpha$ түріне келеді: $\\frac{\\pi}{2}$ мен $\\frac{3\\pi}{2}$ болғанда функция кофункцияға ауысады, таңбасы — бастапқы функцияның тиісті ширектегі таңбасы. Екінші функцияны $\\sin^2\\alpha + \\cos^2\\alpha = 1$ арқылы табамыз. Жауабы: [[ans]]."},
    ),
    Template(
        id="math.n.trig.tan-quadrant", **T("trigonometry", "medium"),
        params={"t": range(len(PRIM)), "q": [2, 3, 4]},
        derived=lambda p: (lambda a, b, c: {"a": a, "b": b, "c": c,
                                            "ct": ft(F(-a, c)) if p.q in (2, 3) else ft(F(a, c)),
                                            "qt": {2: "\\frac{\\pi}{2} < \\alpha < \\pi", 3: "\\pi < \\alpha < \\frac{3\\pi}{2}", 4: "\\frac{3\\pi}{2} < \\alpha < 2\\pi"}[p.q]})(*PRIM[p.t]),
        answer=lambda p: frac(F(p.b, p.a) * (-1 if p.q in (2, 4) else 1)),
        distractors=[lambda p: frac(F(p.b, p.a) * (1 if p.q in (2, 4) else -1)), lambda p: frac(F(p.a, p.b) * (-1 if p.q in (2, 4) else 1)), lambda p: frac(F(p.b, p.c) * (-1 if p.q in (2, 4) else 1))],
        text={"ru": "Найдите $\\operatorname{tg}\\alpha$, если $\\cos\\alpha = [[ct]]$ и $[[qt]]$.", "kk": "$\\cos\\alpha = [[ct]]$ және $[[qt]]$ болса, $\\operatorname{tg}\\alpha$ мәнін табыңыз."},
        solution={"ru": "$\\sin^2\\alpha = 1 - \\cos^2\\alpha$, $|\\sin\\alpha| = \\frac{[[b]]}{[[c]]}$. Знак синуса и тангенса определяем по четверти. $\\operatorname{tg}\\alpha = \\frac{\\sin\\alpha}{\\cos\\alpha} =$ [[ans]].",
                  "kk": "$\\sin^2\\alpha = 1 - \\cos^2\\alpha$, $|\\sin\\alpha| = \\frac{[[b]]}{[[c]]}$. Синус пен тангенстің таңбасын ширек бойынша анықтаймыз. $\\operatorname{tg}\\alpha = \\frac{\\sin\\alpha}{\\cos\\alpha} =$ [[ans]]."},
    ),
    Template(
        id="math.n.trig.cos-double", **T("trigonometry", "medium"),
        params={"p_": [1, 2, 3, 4, 5], "q": [3, 4, 5, 6, 7, 9, 10]},
        where=lambda p: p.p_ < p.q and math.gcd(p.p_, p.q) == 1,
        derived=lambda p: {"st": ft(F(p.p_, p.q))},
        answer=lambda p: frac(1 - 2 * F(p.p_, p.q) ** 2),
        distractors=[lambda p: frac(1 - F(p.p_, p.q) ** 2), lambda p: frac(2 * F(p.p_, p.q) ** 2 - 1), lambda p: frac(1 - 2 * F(p.p_, p.q))],
        text={"ru": "Вычислите $\\cos 2\\alpha$, если $\\sin\\alpha = [[st]]$.", "kk": "$\\sin\\alpha = [[st]]$ болса, $\\cos 2\\alpha$ мәнін есептеңіз."},
        solution={"ru": "$\\cos 2\\alpha = 1 - 2\\sin^2\\alpha = 1 - 2 \\cdot \\left([[st]]\\right)^2 =$ [[ans]]. Четверть не нужна: в формулу входит только $\\sin^2\\alpha$.",
                  "kk": "$\\cos 2\\alpha = 1 - 2\\sin^2\\alpha = 1 - 2 \\cdot \\left([[st]]\\right)^2 =$ [[ans]]. Ширек керек емес: формулаға тек $\\sin^2\\alpha$ кіреді."},
    ),
    Template(
        id="math.n.trig.period", **T("trigonometry", "easy"),
        params={"fn": ["sin", "cos", "tg"], "k": [2, 3, 4, 5, 6, F(1, 2), F(1, 3)], "b": ["", " + 1", " - 3"]},
        derived=lambda p: {"kt": ("" if p.k == 1 else ft(p.k)), "fx": {"sin": "\\sin", "cos": "\\cos", "tg": "\\operatorname{tg}"}[p.fn], "T0": "\\pi" if p.fn == "tg" else "2\\pi"},
        answer=lambda p: pi_ans((F(1) if p.fn == "tg" else F(2)) / p.k),
        distractors=[lambda p: pi_ans((F(2) if p.fn == "tg" else F(1)) / p.k), lambda p: pi_ans((F(1) if p.fn == "tg" else F(2)) * p.k), lambda p: pi_ans(F(1) if p.fn == "tg" else F(2))],
        variants=40,
        text={"ru": "Найдите наименьший положительный период функции $y = [[fx]]\\left([[kt]]x\\right)[[b]]$.", "kk": "$y = [[fx]]\\left([[kt]]x\\right)[[b]]$ функциясының ең кіші оң периодын табыңыз."},
        solution={"ru": "Период $[[fx]]\\,x$ равен $[[T0]]$; при аргументе $kx$ период делится на $k$: $T = \\frac{[[T0]]}{[[kt]]} =$ [[ans]]. Слагаемое снаружи период не меняет.",
                  "kk": "$[[fx]]\\,x$ функциясының периоды $[[T0]]$; аргумент $kx$ болғанда период $k$ санына бөлінеді: $T = \\frac{[[T0]]}{[[kt]]} =$ [[ans]]. Сырттағы қосылғыш периодты өзгертпейді."},
    ),
    Template(
        id="math.n.trig.range", **T("trigonometry", "easy"),
        params={"a": [-4, -3, -2, 2, 3, 5], "b": range(-4, 5), "fn": ["sin", "cos"]},
        derived=lambda p: {"f": lead(p.a, "\\" + p.fn + " x") + " " + term(p.b)},
        answer=lambda p: iv(p.b - abs(p.a), p.b + abs(p.a), "[", "]"),
        distractors=[lambda p: iv(-abs(p.a), abs(p.a), "[", "]") if p.b else iv(p.b - abs(p.a) + 1, p.b + abs(p.a) + 1, "[", "]"), lambda p: iv(p.b - 1, p.b + 1, "[", "]"), lambda p: iv(p.b - abs(p.a), p.b + abs(p.a))],
        text={"ru": "Найдите множество значений функции $y = [[f]]$.", "kk": "$y = [[f]]$ функциясының мәндер жиынын табыңыз."},
        solution={"ru": "$-1 \\le \\[[fn]] x \\le 1$, поэтому $[[f]]$ меняется от $[[b]] - [[absa]]$ до $[[b]] + [[absa]]$ (знак $a$ не важен). Ответ: [[ans]].",
                  "kk": "$-1 \\le \\[[fn]] x \\le 1$, сондықтан $[[f]]$ өрнегі $[[b]] - [[absa]]$ мәнінен $[[b]] + [[absa]]$ мәніне дейін өзгереді ($a$ таңбасы маңызды емес). Жауабы: [[ans]]."},
    ),
    Template(
        id="math.n.treq.quadratic-count", **T("trig-irrational-equations", "hard"),
        params={"i": range(len(TQ)), "fn": ["sin", "cos"], "seg": [1, 2]},
        derived=lambda p: {"eq": quad_tex(*TQ[p.i], "\\" + p.fn + " x").replace("\\sin x^2", "\\sin^2 x").replace("\\cos x^2", "\\cos^2 x"),
                           "k": roots_on(p.fn, TQ[p.i], 0, p.seg * math.pi), "st": "\\pi" if p.seg == 1 else "2\\pi",
                           "t1": ft(TQ[p.i][0]), "t2": ft(TQ[p.i][1])},
        answer=lambda p: p.k,
        distractors=[lambda p: p.k + 1, lambda p: p.k - 1 if p.k > 1 else p.k + 2, lambda p: 4 if p.k != 4 else 2, lambda p: 2 * p.k if p.k > 1 else 3],
        decimals=0, spread=None,
        text={"ru": "Сколько корней имеет уравнение $[[eq]] = 0$ на отрезке $[0; [[st]]]$?", "kk": "$[[eq]] = 0$ теңдеуінің $[0; [[st]]]$ кесіндісінде неше түбірі бар?"},
        solution={"ru": "Замена $t = \\[[fn]] x$: корни квадратного уравнения $t = [[t1]]$ и $t = [[t2]]$. Значения вне $[-1; 1]$ отбрасываем, для остальных отмечаем решения на отрезке $[0; [[st]]]$. Всего: $[[ans]]$.",
                  "kk": "$t = \\[[fn]] x$ алмастыруы: квадрат теңдеудің түбірлері $t = [[t1]]$ және $t = [[t2]]$. $[-1; 1]$ аралығынан тыс мәндерді алып тастаймыз, қалғандары үшін $[0; [[st]]]$ кесіндісіндегі шешімдерді белгілейміз. Барлығы: $[[ans]]$."},
    ),
    Template(
        id="math.n.irr.equal-roots", **T("trig-irrational-equations", "medium"),
        params={"a": [1, 2, 3, 4, 5], "c": [1, 2, 3, 6], "x": range(-6, 9), "b": range(-9, 10)},
        derived=lambda p: {"d": p.a * p.x + p.b - p.c * p.x, "v": p.a * p.x + p.b},
        where=lambda p: p.a != p.c and p.b != 0 and p.a * p.x + p.b - p.c * p.x != 0 and abs(p.a * p.x + p.b - p.c * p.x) <= 15,
        answer=lambda p: str(p.x).replace("-", "−") if p.v >= 0 else "корней нет",
        distractors=[lambda p: "корней нет" if p.v >= 0 else str(p.x).replace("-", "−"), lambda p: str(-p.x).replace("-", "−") if p.x else "1", lambda p: str(p.x + 1).replace("-", "−")],
        options_kk={"корней нет": "түбірі жоқ"},
        text={"ru": "Решите уравнение $\\sqrt{[[l]]} = \\sqrt{[[r]]}$.", "kk": "$\\sqrt{[[l]]} = \\sqrt{[[r]]}$ теңдеуін шешіңіз."},
        solution={"ru": "Приравниваем подкоренные выражения: $[[l]] = [[r]]$, $x = [[x]]$. Проверка: подкоренное выражение при $x = [[x]]$ равно $[[v]]$ — [[chk_ru]]",
                  "kk": "Түбір астындағы өрнектерді теңестіреміз: $[[l]] = [[r]]$, $x = [[x]]$. Тексеру: $x = [[x]]$ болғанда түбір астындағы өрнек $[[v]]$ — [[chk_kk]]"},
    ),

    # ---------- особые системы ----------
    Template(
        id="math.n.sys.symmetric-product", **T("special-equation-systems", "medium"),
        params={"x": range(-6, 10), "y": range(-6, 10)},
        derived=lambda p: {"s": p.x + p.y, "q": p.x ** 2 + p.y ** 2, "sp": f"({p.x + p.y})" if p.x + p.y < 0 else str(p.x + p.y)},
        where=lambda p: p.x < p.y and p.x + p.y != 0 and p.x * p.y != 0,
        answer=lambda p: p.x * p.y,
        distractors=[lambda p: p.s ** 2 - p.q, lambda p: (p.q - p.s ** 2) // 2 if p.q != p.s ** 2 else p.x * p.y + 1, lambda p: p.q - p.s, lambda p: p.s ** 2],
        decimals=0, spread=None,
        text={"ru": "Известно, что $x + y = [[s]]$ и $x^2 + y^2 = [[q]]$. Найдите $xy$.", "kk": "$x + y = [[s]]$ және $x^2 + y^2 = [[q]]$ екені белгілі. $xy$ мәнін табыңыз."},
        solution={"ru": "$(x + y)^2 = x^2 + y^2 + 2xy$, откуда $xy = \\frac{[[sp]]^2 - [[q]]}{2} = [[ans]]$.", "kk": "$(x + y)^2 = x^2 + y^2 + 2xy$, осыдан $xy = \\frac{[[sp]]^2 - [[q]]}{2} = [[ans]]$."},
    ),
    Template(
        id="math.n.sys.log-difference", **T("special-equation-systems", "hard"),
        params={"a": [2, 3], "k": [1, 2], "y": [1, 2, 3, 4, 5, 6, 8, 10]},
        derived=lambda p: {"m": p.a ** p.k, "x": p.a ** p.k * p.y, "d": p.a ** p.k * p.y - p.y},
        answer=lambda p: p.x,
        distractors=[lambda p: p.y, lambda p: p.d, lambda p: p.x + p.y, lambda p: p.m * p.d],
        decimals=0, spread=None,
        text={"ru": "Решите систему $\\begin{cases} \\log_{[[a]]} x - \\log_{[[a]]} y = [[k]] \\\\ x - y = [[d]] \\end{cases}$. В ответе укажите $x$.",
              "kk": "$\\begin{cases} \\log_{[[a]]} x - \\log_{[[a]]} y = [[k]] \\\\ x - y = [[d]] \\end{cases}$ жүйесін шешіңіз. Жауапқа $x$ мәнін жазыңыз."},
        solution={"ru": "Первое уравнение: $\\log_{[[a]]}\\frac{x}{y} = [[k]]$, $x = [[m]]y$ ($x, y > 0$). Подставляем: $[[m]]y - y = [[d]]$, $y = [[y]]$, $x = [[ans]]$.",
                  "kk": "Бірінші теңдеу: $\\log_{[[a]]}\\frac{x}{y} = [[k]]$, $x = [[m]]y$ ($x, y > 0$). Орнына қоямыз: $[[m]]y - y = [[d]]$, $y = [[y]]$, $x = [[ans]]$."},
    ),
    Template(
        id="math.n.sys.sum-cubes", **T("algebraic-expressions", "hard"),
        params={"x": range(-5, 8), "y": range(-5, 8)},
        derived=lambda p: {"s": p.x + p.y, "pr": p.x * p.y, "pp": f"({p.x * p.y})" if p.x * p.y < 0 else str(p.x * p.y)},
        where=lambda p: p.x < p.y and p.x * p.y != 0 and p.x + p.y > 0,
        answer=lambda p: p.x ** 3 + p.y ** 3,
        distractors=[lambda p: p.s ** 3, lambda p: p.s ** 3 + 3 * p.pr * p.s, lambda p: p.s ** 3 - p.pr * p.s, lambda p: p.s ** 3 - 3 * p.pr],
        decimals=0, spread=None,
        text={"ru": "Известно, что $a + b = [[s]]$, $ab = [[pr]]$. Найдите $a^3 + b^3$.", "kk": "$a + b = [[s]]$, $ab = [[pr]]$ екені белгілі. $a^3 + b^3$ мәнін табыңыз."},
        solution={"ru": "$a^3 + b^3 = (a + b)^3 - 3ab(a + b) = [[s]]^3 - 3 \\cdot [[pp]] \\cdot [[s]] = [[ans]]$.", "kk": "$a^3 + b^3 = (a + b)^3 - 3ab(a + b) = [[s]]^3 - 3 \\cdot [[pp]] \\cdot [[s]] = [[ans]]$."},
    ),
    Template(
        id="math.n.alg.reciprocal-square", **T("algebraic-expressions", "medium"),
        params={"k": [3, 4, 5, 6, 7, 8, 9, 10, -3, -4, -5]},
        answer=lambda p: p.k ** 2 - 2,
        distractors=[lambda p: p.k ** 2, lambda p: p.k ** 2 + 2, lambda p: 2 * p.k - 2, lambda p: p.k ** 2 - 1],
        decimals=0, spread=None, variants=11,
        text={"ru": "Известно, что $a + \\frac{1}{a} = [[k]]$. Найдите $a^2 + \\frac{1}{a^2}$.", "kk": "$a + \\frac{1}{a} = [[k]]$ екені белгілі. $a^2 + \\frac{1}{a^2}$ мәнін табыңыз."},
        solution={"ru": "Возводим в квадрат: $a^2 + 2 + \\frac{1}{a^2} = [[k]]^2$, откуда $a^2 + \\frac{1}{a^2} = [[ans]]$.", "kk": "Квадраттаймыз: $a^2 + 2 + \\frac{1}{a^2} = [[k]]^2$, осыдан $a^2 + \\frac{1}{a^2} = [[ans]]$."},
    ),
    Template(
        id="math.n.sys.line-parabola", **T("linear-nonlinear-systems", "medium"),
        params={"c": range(-5, 6), "k": range(-4, 5), "m": range(-6, 7)},
        derived=lambda p: {"D": p.k ** 2 + 4 * (p.m - p.c), "pf": "x^2 " + term(p.c), "lf": (lead(p.k, "x") + " " + term(p.m)).strip() if p.k else str(p.m)},
        where=lambda p: p.c != 0,
        answer=lambda p: 2 if p.D > 0 else 1 if p.D == 0 else 0,
        distractors=[lambda p: 0 if p.D > 0 else 2, lambda p: 1 if p.D != 0 else 2 if p.D == 0 else 0, lambda p: 3],
        decimals=0, spread=None,
        text={"ru": "Сколько общих точек имеют графики $y = [[pf]]$ и $y = [[lf]]$?", "kk": "$y = [[pf]]$ және $y = [[lf]]$ графиктерінің неше ортақ нүктесі бар?"},
        solution={"ru": "Приравниваем: $x^2 [[ct]] = [[lf]]$, то есть $[[lhs]] = 0$. Дискриминант $D = [[D]]$: при $D > 0$ — две точки, $D = 0$ — одна, $D < 0$ — ни одной. Ответ: $[[ans]]$.",
                  "kk": "Теңестіреміз: $x^2 [[ct]] = [[lf]]$, яғни $[[lhs]] = 0$. Дискриминант $D = [[D]]$: $D > 0$ болса — екі нүкте, $D = 0$ — бір, $D < 0$ — бірде-бір нүкте жоқ. Жауабы: $[[ans]]$."},
    ),

    # ---------- неравенства и системы неравенств ----------
    Template(
        id="math.n.isys.quadratic-linear", **T("inequality-systems", "hard"),
        params={"a": range(-5, 3), "b": range(1, 9), "c": range(-4, 6)},
        derived=lambda p: {"q": "x^2 " + term(-(p.a + p.b), "x") + " " + term(p.a * p.b), "n": int_count(lambda x: (x - p.a) * (x - p.b) <= 0 and x > p.c)},
        where=lambda p: p.a < p.c < p.b and p.a + p.b != 0 and p.a * p.b != 0,
        answer=lambda p: p.n,
        distractors=[lambda p: p.b - p.a + 1, lambda p: p.n + 1, lambda p: p.n - 1 if p.n > 1 else p.n + 2, lambda p: p.c - p.a + 1],
        decimals=0, spread=None,
        text={"ru": "Сколько целых решений имеет система $\\begin{cases} [[q]] \\le 0 \\\\ x > [[c]] \\end{cases}$?", "kk": "$\\begin{cases} [[q]] \\le 0 \\\\ x > [[c]] \\end{cases}$ жүйесінің неше бүтін шешімі бар?"},
        solution={"ru": "Корни трёхчлена $[[a]]$ и $[[b]]$, первое неравенство: $[[a]] \\le x \\le [[b]]$. Вместе со вторым: $[[c]] < x \\le [[b]]$. Целых чисел: $[[ans]]$.",
                  "kk": "Үшмүшенің түбірлері $[[a]]$ және $[[b]]$, бірінші теңсіздік: $[[a]] \\le x \\le [[b]]$. Екіншісімен бірге: $[[c]] < x \\le [[b]]$. Бүтін сандар саны: $[[ans]]$."},
    ),
    Template(
        id="math.n.ineq.rational", **T("inequalities", "medium"),
        params={"a": range(-6, 7), "b": range(-6, 7), "s": [0, 1]},
        derived=lambda p: {"num": "x " + term(-p.a), "den": "x " + term(-p.b), "sg": "\\le" if p.s else "<"},
        where=lambda p: p.a < p.b and p.a != 0 and p.b != 0,
        answer=lambda p: iv(p.a, p.b, "[" if p.s else "(", ")"),
        distractors=[lambda p: iv(p.a, p.b, "[", "]"), lambda p: iv(p.a, p.b) if p.s else iv(p.a, p.b, "[", ")"), lambda p: iv(-INF, p.a, right="]" if p.s else ")") + " ∪ " + iv(p.b, INF)],
        text={"ru": "Решите неравенство $\\dfrac{[[num]]}{[[den]]} [[sg]] 0$.", "kk": "$\\dfrac{[[num]]}{[[den]]} [[sg]] 0$ теңсіздігін шешіңіз."},
        solution={"ru": "Метод интервалов: нуль числителя $x = [[a]]$, нуль знаменателя $x = [[b]]$. Дробь отрицательна между ними; $x = [[b]]$ исключаем всегда (делить на ноль нельзя). Ответ: [[ans]].",
                  "kk": "Аралықтар әдісі: алымының нөлі $x = [[a]]$, бөлімінің нөлі $x = [[b]]$. Бөлшек олардың арасында теріс; $x = [[b]]$ мәні әрқашан алынып тасталады (нөлге бөлуге болмайды). Жауабы: [[ans]]."},
    ),

    # ---------- планиметрия ----------
    Template(
        id="math.n.plane.parallelogram-area", **T("plane-figures", "easy"),
        params={"a": [4, 5, 6, 8, 10, 12], "b": [3, 5, 7, 9, 10, 14], "ang": [30, 150, 90]},
        where=lambda p: p.a != p.b,
        answer=lambda p: p.a * p.b if p.ang == 90 else F(p.a * p.b, 2),
        distractors=[lambda p: p.a * p.b if p.ang != 90 else F(p.a * p.b, 2), lambda p: F(p.a * p.b, 4), lambda p: 2 * (p.a + p.b), lambda p: p.a + p.b],
        decimals=1,
        text={"ru": "Стороны параллелограмма $[[a]]$ и $[[b]]$, угол между ними $[[ang]]^\\circ$. Найдите площадь.", "kk": "Параллелограмның қабырғалары $[[a]]$ және $[[b]]$, олардың арасындағы бұрыш $[[ang]]^\\circ$. Ауданын табыңыз."},
        solution={"ru": "$S = ab\\sin\\alpha = [[a]] \\cdot [[b]] \\cdot \\sin [[ang]]^\\circ = [[ans]]$ ($\\sin 30^\\circ = \\sin 150^\\circ = \\frac{1}{2}$).", "kk": "$S = ab\\sin\\alpha = [[a]] \\cdot [[b]] \\cdot \\sin [[ang]]^\\circ = [[ans]]$ ($\\sin 30^\\circ = \\sin 150^\\circ = \\frac{1}{2}$)."},
    ),
    Template(
        id="math.n.plane.sector", **T("plane-figures", "medium"),
        params={"r": [2, 3, 4, 5, 6, 8, 9, 10, 12], "ang": [30, 45, 60, 90, 120, 135, 150, 240, 270]},
        where=lambda p: (p.r * p.r * p.ang) % 360 == 0 or F(p.r * p.r * p.ang, 360).denominator <= 4,
        answer=lambda p: pi_ans(F(p.r * p.r * p.ang, 360)),
        distractors=[lambda p: pi_ans(F(p.r * p.ang, 180)), lambda p: pi_ans(F(p.r * p.r * p.ang, 180)), lambda p: pi_ans(F(p.r * p.r * (360 - p.ang), 360))],
        text={"ru": "Найдите площадь кругового сектора радиуса $[[r]]$ с центральным углом $[[ang]]^\\circ$.", "kk": "Радиусы $[[r]]$, центрлік бұрышы $[[ang]]^\\circ$ дөңгелек сектордың ауданын табыңыз."},
        solution={"ru": "Сектор — часть круга: $S = \\pi r^2 \\cdot \\frac{\\alpha}{360^\\circ} = \\pi \\cdot [[r]]^2 \\cdot \\frac{[[ang]]}{360} =$ [[ans]]. (Длина дуги — $\\frac{\\pi r \\alpha}{180^\\circ}$.)",
                  "kk": "Сектор — дөңгелектің бөлігі: $S = \\pi r^2 \\cdot \\frac{\\alpha}{360^\\circ} = \\pi \\cdot [[r]]^2 \\cdot \\frac{[[ang]]}{360} =$ [[ans]]. (Доғаның ұзындығы — $\\frac{\\pi r \\alpha}{180^\\circ}$.)"},
    ),
    Template(
        id="math.n.plane.inscribed-angle", **T("plane-figures", "easy"),
        params={"c": [40, 50, 60, 70, 80, 100, 110, 120, 130, 140, 150, 160, 170]},
        answer=lambda p: F(p.c, 2),
        distractors=[lambda p: p.c, lambda p: 180 - p.c, lambda p: F(180 - p.c, 2), lambda p: 2 * p.c if 2 * p.c < 360 else 360 - p.c],
        decimals=1, spread=None, variants=13,
        text={"ru": "Центральный угол окружности равен $[[c]]^\\circ$. Найдите вписанный угол, опирающийся на ту же дугу (в градусах).",
              "kk": "Шеңбердің центрлік бұрышы $[[c]]^\\circ$. Сол доғаға тірелетін іштей сызылған бұрышты (градуспен) табыңыз."},
        solution={"ru": "Вписанный угол равен половине центрального, опирающегося на ту же дугу: $\\frac{[[c]]^\\circ}{2} = [[ans]]^\\circ$.", "kk": "Іштей сызылған бұрыш сол доғаға тірелетін центрлік бұрыштың жартысына тең: $\\frac{[[c]]^\\circ}{2} = [[ans]]^\\circ$."},
    ),
    Template(
        id="math.n.plane.isosceles-angle", **T("plane-figures", "easy"),
        params={"v": [20, 30, 36, 40, 44, 50, 56, 60, 70, 80, 90, 100, 110, 120, 130, 140]},
        answer=lambda p: F(180 - p.v, 2),
        distractors=[lambda p: 180 - p.v, lambda p: F(p.v, 2), lambda p: 180 - 2 * p.v if 180 - 2 * p.v > 0 else 90 - p.v // 4],
        decimals=1, spread=None, variants=16,
        text={"ru": "Угол при вершине равнобедренного треугольника равен $[[v]]^\\circ$. Найдите угол при основании (в градусах).",
              "kk": "Теңбүйірлі үшбұрыштың төбесіндегі бұрышы $[[v]]^\\circ$. Табанындағы бұрышты (градуспен) табыңыз."},
        solution={"ru": "Углы при основании равны, сумма углов $180^\\circ$: $\\frac{180^\\circ - [[v]]^\\circ}{2} = [[ans]]^\\circ$.", "kk": "Табанындағы бұрыштар тең, бұрыштардың қосындысы $180^\\circ$: $\\frac{180^\\circ - [[v]]^\\circ}{2} = [[ans]]^\\circ$."},
    ),
    Template(
        id="math.n.plane.rhombus-diagonals", **T("metric-relations-plane", "medium"),
        params={"t": range(len(TRIPLES))},
        derived=lambda p: (lambda a, b, c: {"d1": 2 * a, "d2": 2 * b, "s": c})(*TRIPLES[p.t]),
        answer=lambda p: p.s,
        distractors=[lambda p: p.d1 * p.d2 // 2, lambda p: (p.d1 + p.d2) // 2, lambda p: p.s * 2, lambda p: p.s + 1],
        decimals=0,
        text={"ru": "Диагонали ромба равны $[[d1]]$ и $[[d2]]$. Найдите сторону ромба.", "kk": "Ромбтың диагональдары $[[d1]]$ және $[[d2]]$. Ромбтың қабырғасын табыңыз."},
        solution={"ru": "Диагонали ромба перпендикулярны и делятся пополам: сторона — гипотенуза треугольника с катетами $\\frac{[[d1]]}{2}$ и $\\frac{[[d2]]}{2}$: $a = [[ans]]$.",
                  "kk": "Ромбтың диагональдары перпендикуляр және қақ бөлінеді: қабырғасы — катеттері $\\frac{[[d1]]}{2}$ және $\\frac{[[d2]]}{2}$ үшбұрыштың гипотенузасы: $a = [[ans]]$."},
    ),

    # ---------- стереометрия ----------
    Template(
        id="math.n.solid.cuboid-diagonal", **T("solid-figures", "medium"),
        params={"q": range(len(QUADS)), "k": [1, 2]},
        derived=lambda p: (lambda a, b, c, d: {"a": a * p.k, "b": b * p.k, "c": c * p.k, "d": d * p.k})(*QUADS[p.q]),
        answer=lambda p: p.d,
        distractors=[lambda p: p.a + p.b + p.c, lambda p: p.d * p.d, lambda p: p.d + 1, lambda p: math.isqrt(p.a * p.a + p.b * p.b) if math.isqrt(p.a * p.a + p.b * p.b) != p.d else p.d - 2],
        decimals=0,
        text={"ru": "Измерения прямоугольного параллелепипеда равны $[[a]]$, $[[b]]$ и $[[c]]$. Найдите его диагональ.", "kk": "Тікбұрышты параллелепипедтің өлшемдері $[[a]]$, $[[b]]$ және $[[c]]$. Оның диагоналін табыңыз."},
        solution={"ru": "$d = \\sqrt{a^2 + b^2 + c^2} = \\sqrt{[[a]]^2 + [[b]]^2 + [[c]]^2} = [[ans]]$.", "kk": "$d = \\sqrt{a^2 + b^2 + c^2} = \\sqrt{[[a]]^2 + [[b]]^2 + [[c]]^2} = [[ans]]$."},
    ),
    Template(
        id="math.n.solid.cube-diagonal", **T("solid-figures", "easy"),
        params={"a": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12], "w": [0, 1]},
        derived=lambda p: {"dt": sq(p.a, 3).strip("$")},
        answer=lambda p: sq(p.a, 3) if p.w == 0 else f"${p.a}$",
        distractors=[lambda p: sq(p.a, 2) if p.w == 0 else f"${p.a * 3}$", lambda p: f"${3 * p.a}$" if p.w == 0 else sq(p.a, 3), lambda p: sq(p.a * p.a, 3) if p.w == 0 else sq(p.a, 2)],
        variants=22,
        text={"ru": "[[q_ru]]", "kk": "[[q_kk]]"},
        solution={"ru": "Диагональ куба $d = a\\sqrt{3}$. Ответ: [[ans]].", "kk": "Текшенің (кубтың) диагоналі $d = a\\sqrt{3}$. Жауабы: [[ans]]."},
    ),
    Template(
        id="math.n.solid.sphere-section", **T("metric-relations-space", "medium"),
        params={"t": range(len(TRIPLES))},
        derived=lambda p: (lambda d, r, R: {"d": d, "r": r, "R": R})(*TRIPLES[p.t]),
        answer=lambda p: pi_ans(p.r * p.r),
        distractors=[lambda p: pi_ans(p.R * p.R), lambda p: pi_ans(p.R * p.R - p.d), lambda p: pi_ans(2 * p.r), lambda p: pi_ans((p.R - p.d) ** 2)],
        text={"ru": "Шар радиуса $[[R]]$ пересечён плоскостью на расстоянии $[[d]]$ от центра. Найдите площадь сечения.", "kk": "Радиусы $[[R]]$ шар центрінен $[[d]]$ қашықтықтағы жазықтықпен қиылған. Қиманың ауданын табыңыз."},
        solution={"ru": "Сечение — круг радиуса $r = \\sqrt{R^2 - d^2} = \\sqrt{[[R]]^2 - [[d]]^2} = [[r]]$. $S = \\pi r^2 =$ [[ans]].", "kk": "Қима — радиусы $r = \\sqrt{R^2 - d^2} = \\sqrt{[[R]]^2 - [[d]]^2} = [[r]]$ дөңгелек. $S = \\pi r^2 =$ [[ans]]."},
    ),
    Template(
        id="math.n.solid.cone-from-sector", **T("metric-relations-space", "hard"),
        params={"l": [6, 8, 9, 10, 12, 15, 18, 20, 24], "ang": [60, 90, 120, 150, 180, 240, 270]},
        where=lambda p: (p.l * p.ang) % 360 == 0,
        answer=lambda p: p.l * p.ang // 360,
        distractors=[lambda p: p.l * p.ang // 180, lambda p: p.l, lambda p: p.l * (360 - p.ang) // 360, lambda p: p.ang // p.l if p.ang // p.l else p.l // 2],
        decimals=0,
        text={"ru": "Развёртка боковой поверхности конуса — сектор радиуса $[[l]]$ с центральным углом $[[ang]]^\\circ$. Найдите радиус основания конуса.",
              "kk": "Конустың бүйір бетінің жазбасы — радиусы $[[l]]$, центрлік бұрышы $[[ang]]^\\circ$ сектор. Конус табанының радиусын табыңыз."},
        solution={"ru": "Длина дуги сектора равна длине окружности основания: $\\frac{\\pi l \\alpha}{180^\\circ} = 2\\pi r$, $r = \\frac{l\\alpha}{360^\\circ} = \\frac{[[l]] \\cdot [[ang]]}{360} = [[ans]]$.",
                  "kk": "Сектор доғасының ұзындығы табан шеңберінің ұзындығына тең: $\\frac{\\pi l \\alpha}{180^\\circ} = 2\\pi r$, $r = \\frac{l\\alpha}{360^\\circ} = \\frac{[[l]] \\cdot [[ang]]}{360} = [[ans]]$."},
    ),

    # ---------- степени и корни ----------
    Template(
        id="math.n.pow.compare-largest", **T("powers", "medium"),
        params={"e": [(60, 40, 24), (30, 20, 12), (90, 60, 36), (100, 60, 40), (40, 30, 20), (300, 200, 120), (21, 14, 9), (48, 30, 20)]},
        derived=lambda p: {"vals": [(f"$2^{{{p.e[0]}}}$", p.e[0] * math.log(2)), (f"$3^{{{p.e[1]}}}$", p.e[1] * math.log(3)), (f"$5^{{{p.e[2]}}}$", p.e[2] * math.log(5))]},
        where=lambda p: (lambda v: sorted(v)[-1] - sorted(v)[-2] > 0.02)([x[1] for x in p.vals]),
        answer=lambda p: max(p.vals, key=lambda v: v[1])[0],
        distractors=[lambda p: sorted(p.vals, key=lambda v: v[1])[1][0], lambda p: sorted(p.vals, key=lambda v: v[1])[0][0], lambda p: "все числа равны"],
        options_kk={"все числа равны": "барлық сандар тең"},
        variants=8,
        text={"ru": "Какое из чисел $2^{[[e0]]}$, $3^{[[e1]]}$, $5^{[[e2]]}$ наибольшее?", "kk": "$2^{[[e0]]}$, $3^{[[e1]]}$, $5^{[[e2]]}$ сандарының қайсысы ең үлкен?"},
        solution={"ru": "Приводим к одному показателю: вынесем общий делитель показателей и сравним основания в этой степени. Наибольшее: [[ans]].",
                  "kk": "Бір көрсеткішке келтіреміз: көрсеткіштердің ортақ бөлгішін шығарып, негіздерді сол дәрежеде салыстырамыз. Ең үлкені: [[ans]]."},
    ),
    Template(
        id="math.n.pow.exponent-equation", **T("powers", "easy"),
        params={"a": [2, 3, 5], "m": [2, 3, 4], "k": [1, 2, 3, 4, 5, 6, 8, 9, 10, 12]},
        where=lambda p: p.k % p.m != 0 or p.k // p.m != p.k - p.m,
        answer=lambda p: frac(F(p.k, p.m)),
        distractors=[lambda p: frac(F(p.k - p.m)), lambda p: frac(F(p.k * p.m)), lambda p: frac(F(p.m, p.k))],
        text={"ru": "Решите уравнение $\\left([[a]]^{[[m]]}\\right)^x = [[a]]^{[[k]]}$.", "kk": "$\\left([[a]]^{[[m]]}\\right)^x = [[a]]^{[[k]]}$ теңдеуін шешіңіз."},
        solution={"ru": "$\\left([[a]]^{[[m]]}\\right)^x = [[a]]^{[[m]]x}$, значит $[[m]]x = [[k]]$, $x =$ [[ans]].", "kk": "$\\left([[a]]^{[[m]]}\\right)^x = [[a]]^{[[m]]x}$, демек $[[m]]x = [[k]]$, $x =$ [[ans]]."},
    ),
    Template(
        id="math.n.rad.rationalize", **T("radicals-and-expressions", "medium"),
        params={"a": [2, 3, 5, 6, 7, 10, 11], "b": [1, 2, 3, 5, 6]},
        where=lambda p: p.a > p.b and math.isqrt(p.a) ** 2 != p.a,
        derived=lambda p: {"bt": "1" if p.b == 1 else f"\\sqrt{{{p.b}}}", "d": p.a - p.b},
        answer=lambda p: (f"$\\frac{{\\sqrt{{{p.a}}} + {p.bt}}}{{{p.d}}}$" if p.d != 1 else f"$\\sqrt{{{p.a}}} + {p.bt}$"),
        distractors=[lambda p: (f"$\\frac{{\\sqrt{{{p.a}}} - {p.bt}}}{{{p.d}}}$" if p.d != 1 else f"$\\sqrt{{{p.a}}} - {p.bt}$"),
                     lambda p: f"$\\frac{{\\sqrt{{{p.a}}} + {p.bt}}}{{{p.a + p.b}}}$", lambda p: f"$\\sqrt{{{p.a}}} + {p.bt}$" if p.d != 1 else f"$\\frac{{\\sqrt{{{p.a}}} + {p.bt}}}{{2}}$"],
        text={"ru": "Избавьтесь от иррациональности в знаменателе: $\\dfrac{1}{\\sqrt{[[a]]} - [[bt]]}$.", "kk": "Бөлімдегі иррационалдықтан құтылыңыз: $\\dfrac{1}{\\sqrt{[[a]]} - [[bt]]}$."},
        solution={"ru": "Домножаем числитель и знаменатель на сопряжённое $\\sqrt{[[a]]} + [[bt]]$: в знаменателе $[[a]] - [[b]] = [[d]]$. Ответ: [[ans]].",
                  "kk": "Алымы мен бөлімін түйіндес $\\sqrt{[[a]]} + [[bt]]$ өрнегіне көбейтеміз: бөлімде $[[a]] - [[b]] = [[d]]$. Жауабы: [[ans]]."},
    ),
    Template(
        id="math.n.rad.square-of-sum", **T("radicals-and-expressions", "medium"),
        params={"a": [2, 3, 5, 6, 7], "k": [2, 3, 4], "l": [1, 2, 3]},
        derived=lambda p: {"A": p.a * p.k * p.k, "B": p.a * p.l * p.l},
        where=lambda p: p.k != p.l,
        answer=lambda p: p.a * (p.k + p.l) ** 2,
        distractors=[lambda p: p.A + p.B, lambda p: p.a * (p.k ** 2 + p.l ** 2) + p.a * p.k * p.l, lambda p: p.a * (p.k - p.l) ** 2, lambda p: (p.A + p.B) * 2],
        decimals=0, spread=None,
        text={"ru": "Вычислите $\\left(\\sqrt{[[A]]} + \\sqrt{[[B]]}\\right)^2$.", "kk": "$\\left(\\sqrt{[[A]]} + \\sqrt{[[B]]}\\right)^2$ мәнін есептеңіз."},
        solution={"ru": "$(\\sqrt{A} + \\sqrt{B})^2 = A + B + 2\\sqrt{AB}$; $\\sqrt{[[A]] \\cdot [[B]]} = [[sab]]$. Итого $[[A]] + [[B]] + 2 \\cdot [[sab]] = [[ans]]$. Ловушка — забыть удвоенное произведение.",
                  "kk": "$(\\sqrt{A} + \\sqrt{B})^2 = A + B + 2\\sqrt{AB}$; $\\sqrt{[[A]] \\cdot [[B]]} = [[sab]]$. Барлығы $[[A]] + [[B]] + 2 \\cdot [[sab]] = [[ans]]$. Абай болыңыз: екі еселенген көбейтіндіні ұмытпаңыз."},
    ),

    # ---------- векторы ----------
    Template(
        id="math.n.vsp.angle-cos", **T("vectors-in-space", "hard"),
        params={"i": range(len(QUADS)), "j": range(len(QUADS)), "s": [1, -1]},
        derived=lambda p: (lambda u, v: {"u": u[:3], "v": (v[0] * p.s, v[2], v[1]), "lu": u[3], "lv": v[3]})(QUADS[p.i], QUADS[p.j]),
        where=lambda p: p.i < p.j and sum(a * b for a, b in zip(p.u, p.v)) != 0,
        answer=lambda p: frac(F(sum(a * b for a, b in zip(p.u, p.v)), p.lu * p.lv)),
        distractors=[lambda p: frac(-F(sum(a * b for a, b in zip(p.u, p.v)), p.lu * p.lv)), lambda p: frac(F(sum(a * b for a, b in zip(p.u, p.v)), p.lu + p.lv)), lambda p: frac(F(sum(a * b for a, b in zip(p.u, p.v))))],
        text={"ru": "Найдите косинус угла между векторами $\\vec a([[u0]]; [[u1]]; [[u2]])$ и $\\vec b([[v0]]; [[v1]]; [[v2]])$.",
              "kk": "$\\vec a([[u0]]; [[u1]]; [[u2]])$ және $\\vec b([[v0]]; [[v1]]; [[v2]])$ векторларының арасындағы бұрыштың косинусын табыңыз."},
        solution={"ru": "$\\cos\\varphi = \\frac{\\vec a \\cdot \\vec b}{|\\vec a| \\cdot |\\vec b|}$: скалярное произведение $[[dot]]$, длины $[[lu]]$ и $[[lv]]$. Ответ: [[ans]].",
                  "kk": "$\\cos\\varphi = \\frac{\\vec a \\cdot \\vec b}{|\\vec a| \\cdot |\\vec b|}$: скаляр көбейтінді $[[dot]]$, ұзындықтары $[[lu]]$ және $[[lv]]$. Жауабы: [[ans]]."},
    ),
    Template(
        id="math.n.vsp.dot-from-angle", **T("vectors-in-space", "easy"),
        params={"m": [2, 3, 4, 5, 6, 8], "n": [1, 2, 3, 4, 5, 10], "ang": [60, 120, 90, 0, 180]},
        answer=lambda p: F(p.m * p.n * {60: 1, 120: -1, 90: 0, 0: 2, 180: -2}[p.ang], 2),
        distractors=[lambda p: F(-p.m * p.n * {60: 1, 120: -1, 90: 0, 0: 2, 180: -2}[p.ang], 2) if p.ang != 90 else p.m * p.n, lambda p: p.m * p.n if p.ang not in (0,) else F(p.m * p.n, 2), lambda p: p.m + p.n, lambda p: F(p.m * p.n, 4)],
        decimals=1, spread=None,
        text={"ru": "$|\\vec a| = [[m]]$, $|\\vec b| = [[n]]$, угол между векторами $[[ang]]^\\circ$. Найдите $\\vec a \\cdot \\vec b$.", "kk": "$|\\vec a| = [[m]]$, $|\\vec b| = [[n]]$, векторлардың арасындағы бұрыш $[[ang]]^\\circ$. $\\vec a \\cdot \\vec b$ мәнін табыңыз."},
        solution={"ru": "$\\vec a \\cdot \\vec b = |\\vec a| \\cdot |\\vec b| \\cdot \\cos [[ang]]^\\circ = [[m]] \\cdot [[n]] \\cdot \\cos [[ang]]^\\circ = [[ans]]$.", "kk": "$\\vec a \\cdot \\vec b = |\\vec a| \\cdot |\\vec b| \\cdot \\cos [[ang]]^\\circ = [[m]] \\cdot [[n]] \\cdot \\cos [[ang]]^\\circ = [[ans]]$."},
    ),

    # ---------- соответствие ----------
    Template(
        id="math.n.match.periods", kind="match", **T("trigonometry", "easy"),
        params={"k": [2, 3, 4, 5, 6, 8]},
        rows={"ru": ["период $y = \\sin [[k]]x$", "период $y = \\operatorname{tg} [[k]]x$"], "kk": ["$y = \\sin [[k]]x$ периоды", "$y = \\operatorname{tg} [[k]]x$ периоды"]},
        answers=[lambda p: pi_ans(F(2, p.k)), lambda p: pi_ans(F(1, p.k))],
        distractors=[lambda p: pi_ans(2 * p.k), lambda p: pi_ans(p.k), lambda p: pi_ans(F(4, p.k))],
        text={"ru": "Установите соответствие между функцией и её наименьшим положительным периодом.", "kk": "Функция мен оның ең кіші оң периодының сәйкестігін анықтаңыз."},
        solution={"ru": "Период синуса $2\\pi$, тангенса $\\pi$; при аргументе $kx$ делим на $k$: [[ans1]] и [[ans2]].", "kk": "Синустың периоды $2\\pi$, тангенстікі $\\pi$; аргумент $kx$ болғанда $k$ санына бөлеміз: [[ans1]] және [[ans2]]."},
    ),
    Template(
        id="math.n.match.cuboid", kind="match", **T("solid-figures", "medium"),
        params={"q": range(len(QUADS))},
        derived=lambda p: (lambda a, b, c, d: {"a": a, "b": b, "c": c, "d": d})(*QUADS[p.q]),
        rows={"ru": ["диагональ параллелепипеда", "площадь полной поверхности"], "kk": ["параллелепипедтің диагоналі", "толық бетінің ауданы"]},
        answers=[lambda p: p.d, lambda p: 2 * (p.a * p.b + p.b * p.c + p.a * p.c)],
        distractors=[lambda p: p.a * p.b * p.c, lambda p: p.a + p.b + p.c, lambda p: p.a * p.b + p.b * p.c + p.a * p.c],
        decimals=0,
        text={"ru": "Измерения прямоугольного параллелепипеда $[[a]]$, $[[b]]$, $[[c]]$. Установите соответствие.", "kk": "Тікбұрышты параллелепипедтің өлшемдері $[[a]]$, $[[b]]$, $[[c]]$. Сәйкестікті анықтаңыз."},
        solution={"ru": "$d = \\sqrt{a^2 + b^2 + c^2} = [[ans1]]$; $S = 2(ab + bc + ac) = [[ans2]]$.", "kk": "$d = \\sqrt{a^2 + b^2 + c^2} = [[ans1]]$; $S = 2(ab + bc + ac) = [[ans2]]$."},
    ),

    # ---------- несколько верных ответов ----------
    Template(
        id="math.n.multi.range-values", kind="multi", **T("trigonometry", "medium"),
        params={"a": [2, 3, 4], "b": range(-3, 4), "fn": ["sin", "cos"]},
        derived=lambda p: {"f": lead(p.a, "\\" + p.fn + " x") + " " + term(p.b), "lo": p.b - p.a, "hi": p.b + p.a},
        answers=[lambda p: p.lo, lambda p: p.b, lambda p: p.hi],
        distractors=[lambda p: p.hi + 1, lambda p: p.lo - 1, lambda p: p.hi + p.a],
        decimals=0, spread=None,
        text={"ru": "Какие из чисел принадлежат множеству значений функции $y = [[f]]$? Выберите все верные ответы.", "kk": "Қай сандар $y = [[f]]$ функциясының мәндер жиынына тиісті? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "Множество значений $[[[lo]]; [[hi]]]$ — концы входят. Подходят числа из этого отрезка.", "kk": "Мәндер жиыны $[[[lo]]; [[hi]]]$ — ұштары кіреді. Осы кесіндідегі сандар жарайды."},
    ),
    Template(
        id="math.n.multi.ineq-integers", kind="multi", **T("inequalities", "easy"),
        params={"a": range(-5, 4), "w": [2, 3, 4]},
        derived=lambda p: {"b": p.a + p.w + 1, "q": "x^2 " + term(-(2 * p.a + p.w + 1), "x") + " " + term(p.a * (p.a + p.w + 1))},
        where=lambda p: p.a != 0 and p.a + p.w + 1 != 0 and 2 * p.a + p.w + 1 != 0,
        answers=[lambda p: p.a + 1, lambda p: p.a + 2, lambda p: p.a + 3 if p.w >= 3 else p.a + 1],
        distractors=[lambda p: p.a, lambda p: p.b, lambda p: p.b + 1, lambda p: p.a - 1],
        decimals=0, spread=None,
        text={"ru": "Какие из чисел являются решениями неравенства $[[q]] < 0$? Выберите все верные ответы.", "kk": "Қай сандар $[[q]] < 0$ теңсіздігінің шешімі болады? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "Корни трёхчлена $[[a]]$ и $[[b]]$; неравенство строгое, поэтому решения — числа строго между корнями.", "kk": "Үшмүшенің түбірлері $[[a]]$ және $[[b]]$; теңсіздік қатаң, сондықтан шешімдері — түбірлердің арасындағы сандар (түбірлердің өзі кірмейді)."},
    ),
]

_EXTRA = {
    "math.n.trig.reduction": lambda p: {"valt": ft(p.val)},
    "math.n.trig.range": lambda p: {"absa": abs(p.a)},
    "math.n.irr.equal-roots": lambda p: {"l": (lead(p.a, "x") + " " + term(p.b)).strip(), "r": (lead(p.c, "x") + " " + term(p.a * p.x + p.b - p.c * p.x)).strip(),
                                          "chk_ru": "неотрицательно, корень подходит." if p.v >= 0 else "отрицательно, корень посторонний, корней нет.",
                                          "chk_kk": "теріс емес, түбір жарайды." if p.v >= 0 else "теріс, бұл бөгде түбір, теңдеудің түбірі жоқ."},
    "math.n.sys.line-parabola": lambda p: {"ct": term(p.c), "lhs": " ".join(x for x in ("x^2", term(-p.k, "x"), term(p.c - p.m)) if x)},
    "math.n.solid.cube-diagonal": lambda p: {"q_ru": f"Ребро куба равно ${p.a}$. Найдите диагональ куба." if p.w == 0 else f"Диагональ куба равна ${p.dt}$. Найдите ребро куба.",
                                             "q_kk": f"Кубтың қыры ${p.a}$. Кубтың диагоналін табыңыз." if p.w == 0 else f"Кубтың диагоналі ${p.dt}$. Кубтың қырын табыңыз."},
    "math.n.pow.compare-largest": lambda p: {"e0": p.e[0], "e1": p.e[1], "e2": p.e[2]},
    "math.n.rad.square-of-sum": lambda p: {"sab": math.isqrt(p.A * p.B)},
    "math.n.vsp.angle-cos": lambda p: {"u0": p.u[0], "u1": p.u[1], "u2": p.u[2], "v0": p.v[0], "v1": p.v[1], "v2": p.v[2], "dot": sum(a * b for a, b in zip(p.u, p.v))},
}
for _t in TEMPLATES:
    if _t.id in _EXTRA:
        _t.derived = _chain(_t.derived, _EXTRA[_t.id])


CONTEXTS = [
    Context(
        id="math.ctx.water-tank", **T("metric-relations-space"),
        params={"r": [1, 2, 3], "h": [2, 3, 4, 5], "q": [100, 150, 200, 250]},
        derived=lambda p: {"V": p.r * p.r * p.h, "L": round(3.14 * p.r * p.r * p.h * 1000), "t": round(3.14 * p.r * p.r * p.h * 1000 / p.q)},
        context={"ru": "На ферме стоит цилиндрический бак для воды: радиус основания $[[r]]$ м, высота $[[h]]$ м. Насос подаёт $[[q]]$ л воды в минуту. Принять $\\pi \\approx 3{,}14$, $1$ м³ $= 1000$ л.",
                 "kk": "Фермада су құятын цилиндр пішінді бак тұр: табанының радиусы $[[r]]$ м, биіктігі $[[h]]$ м. Сорап минутына $[[q]]$ л су береді. $\\pi \\approx 3{,}14$, $1$ м³ $= 1000$ л деп алыңыз."},
        questions=[
            Q("Найдите объём бака (в м³, выразите через $\\pi$).", "Бактың көлемін табыңыз (м³-пен, $\\pi$ арқылы өрнектеңіз).",
              lambda p: pi_ans(p.V), [lambda p: pi_ans(2 * p.r * p.h), lambda p: pi_ans(p.r * p.h), lambda p: pi_ans(2 * p.V)],
              "$V = \\pi r^2 h = \\pi \\cdot [[r]]^2 \\cdot [[h]] =$ [[ans]] м³.", "$V = \\pi r^2 h = \\pi \\cdot [[r]]^2 \\cdot [[h]] =$ [[ans]] м³."),
            Q("Сколько литров воды вмещает бак?", "Бакқа неше литр су сыяды?",
              lambda p: p.L, [lambda p: round(p.L / 1000), lambda p: round(3.14 * 2 * p.r * p.h * 1000), lambda p: p.V * 1000],
              "$V \\approx 3{,}14 \\cdot [[V]]$ м³, то есть $[[ans]]$ л.", "$V \\approx 3{,}14 \\cdot [[V]]$ м³, яғни $[[ans]]$ л.", decimals=0, unit="л"),
            Q("За сколько минут насос наполнит пустой бак?", "Сорап бос бакты неше минутта толтырады?",
              lambda p: p.t, [lambda p: round(p.L * p.q / 1000), lambda p: round(p.t / 60), lambda p: round(p.V * 1000 / p.q)],
              "$t = \\frac{[[L]]}{[[q]]} \\approx [[ans]]$ мин.", "$t = \\frac{[[L]]}{[[q]]} \\approx [[ans]]$ мин.", decimals=0, unit="мин"),
            Q("Бак красят снаружи: боковую поверхность и крышку. Найдите площадь покраски (выразите через $\\pi$).", "Бакты сыртынан бояйды: бүйір бетін және қақпағын. Боялатын ауданды табыңыз ($\\pi$ арқылы өрнектеңіз).",
              lambda p: pi_ans(2 * p.r * p.h + p.r * p.r), [lambda p: pi_ans(2 * p.r * p.h + 2 * p.r * p.r), lambda p: pi_ans(2 * p.r * p.h), lambda p: pi_ans(p.r * p.h + p.r * p.r)],
              "$S = 2\\pi rh + \\pi r^2 = 2\\pi \\cdot [[r]] \\cdot [[h]] + \\pi \\cdot [[r]]^2 =$ [[ans]] м². Дно не красят.", "$S = 2\\pi rh + \\pi r^2 = 2\\pi \\cdot [[r]] \\cdot [[h]] + \\pi \\cdot [[r]]^2 =$ [[ans]] м². Түбі боялмайды."),
        ],
        variants=12,
    ),
    Context(
        id="math.ctx.taxi", **T("linear-quadratic-rational-equations"),
        params={"a1": [300, 400, 500, 600], "b1": [120, 150, 180], "a2": [0, 100, 200], "b2": [200, 220, 250, 300]},
        derived=lambda p: {"x0": F(p.a1 - p.a2, p.b2 - p.b1)},
        where=lambda p: p.b2 > p.b1 and p.a1 > p.a2 and F(p.a1 - p.a2, p.b2 - p.b1).denominator == 1 and 2 <= F(p.a1 - p.a2, p.b2 - p.b1) <= 10,
        context={"ru": "Два такси в Шымкенте: «Жол» — посадка $[[a1]]$ тенге и $[[b1]]$ тенге за каждый километр; «Сапар» — посадка $[[a2]]$ тенге и $[[b2]]$ тенге за километр.",
                 "kk": "Шымкенттегі екі такси: «Жол» — отырғызу $[[a1]]$ теңге және әр километрге $[[b1]]$ теңге; «Сапар» — отырғызу $[[a2]]$ теңге және километріне $[[b2]]$ теңге."},
        questions=[
            Q("Сколько стоит поездка на 8 км в такси «Жол»?", "«Жол» таксиімен 8 км жүру неше теңге тұрады?",
              lambda p: p.a1 + 8 * p.b1, [lambda p: 8 * p.b1, lambda p: 8 * (p.a1 + p.b1), lambda p: p.a2 + 8 * p.b2],
              "$C = [[a1]] + [[b1]] \\cdot 8 = [[ans]]$ тенге.", "$C = [[a1]] + [[b1]] \\cdot 8 = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("При какой длине поездки (в км) обе поездки стоят одинаково?", "Жол ұзындығы қандай болғанда (км-мен) екі таксидің бағасы бірдей болады?",
              lambda p: p.x0, [lambda p: p.x0 + 1, lambda p: F(p.a1 + p.a2, p.b2 - p.b1) if F(p.a1 + p.a2, p.b2 - p.b1) != p.x0 else p.x0 * 2, lambda p: F(p.a1, p.b1)],
              "$[[a1]] + [[b1]]x = [[a2]] + [[b2]]x$, откуда $x = \\frac{[[a1]] - [[a2]]}{[[b2]] - [[b1]]} = [[ans]]$ км.", "$[[a1]] + [[b1]]x = [[a2]] + [[b2]]x$, осыдан $x = \\frac{[[a1]] - [[a2]]}{[[b2]] - [[b1]]} = [[ans]]$ км.", decimals=1, unit="км"),
            Q("На сколько тенге отличаются стоимости поездки на 15 км в этих двух такси?", "Осы екі таксидегі 15 км жолдың бағасы неше теңгеге ерекшеленеді?",
              lambda p: abs((p.a2 + 15 * p.b2) - (p.a1 + 15 * p.b1)), [lambda p: abs(p.b2 - p.b1) * 15, lambda p: abs(p.a1 - p.a2), lambda p: abs((p.a2 + 15 * p.b2) - (p.a1 + 15 * p.b1)) + abs(p.a1 - p.a2)],
              "«Жол»: $[[a1]] + 15 \\cdot [[b1]]$, «Сапар»: $[[a2]] + 15 \\cdot [[b2]]$. Разность: $[[ans]]$ тенге.", "«Жол»: $[[a1]] + 15 \\cdot [[b1]]$, «Сапар»: $[[a2]] + 15 \\cdot [[b2]]$. Айырмасы: $[[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("Сколько километров можно проехать в такси «Сапар» на $2000$ тенге (целое число)?", "«Сапар» таксиімен $2000$ теңгеге неше километр жүруге болады (бүтін сан)?",
              lambda p: (2000 - p.a2) // p.b2, [lambda p: 2000 // p.b2 if 2000 // p.b2 != (2000 - p.a2) // p.b2 else (2000 - p.a2) // p.b2 + 1, lambda p: (2000 - p.a1) // p.b1, lambda p: (2000 - p.a2) // p.b2 + 1 if 2000 // p.b2 == (2000 - p.a2) // p.b2 else (2000 - p.a2) // p.b2 - 1],
              "$[[a2]] + [[b2]]x \\le 2000$, $x \\le \\frac{2000 - [[a2]]}{[[b2]]}$, наибольшее целое: $[[ans]]$ км.", "$[[a2]] + [[b2]]x \\le 2000$, $x \\le \\frac{2000 - [[a2]]}{[[b2]]}$, ең үлкен бүтін сан: $[[ans]]$ км.", decimals=0, unit="км"),
        ],
        variants=12,
    ),
    Context(
        id="math.ctx.ladder", **T("metric-relations-plane"),
        params={"t": range(len(TRIPLES))},
        derived=lambda p: (lambda d, h, L: {"d": d, "h": h, "L": L})(*TRIPLES[p.t]),
        where=lambda p: p.h > p.d,
        figure=lambda p: right_triangle(f"{p.h} м", f"{p.d} м", f"{p.L} м", ratio=p.h / p.d),
        context={"ru": "Лестница длиной $[[L]]$ м приставлена к стене дома. Нижний конец лестницы стоит на расстоянии $[[d]]$ м от стены, стена вертикальна (см. рисунок).",
                 "kk": "Ұзындығы $[[L]]$ м баспалдақ үйдің қабырғасына сүйеп қойылған. Баспалдақтың төменгі ұшы қабырғадан $[[d]]$ м қашықтықта тұр, қабырға тік (суретті қараңыз)."},
        questions=[
            Q("На какой высоте верхний конец лестницы касается стены?", "Баспалдақтың жоғарғы ұшы қабырғаға қандай биіктікте тиеді?",
              lambda p: p.h, [lambda p: p.L - p.d, lambda p: p.L + p.d, lambda p: p.h + 1],
              "По теореме Пифагора: $h = \\sqrt{[[L]]^2 - [[d]]^2} = [[ans]]$ м.", "Пифагор теоремасы бойынша: $h = \\sqrt{[[L]]^2 - [[d]]^2} = [[ans]]$ м.", decimals=0, unit="м"),
            Q("Найдите косинус угла между лестницей и землёй.", "Баспалдақ пен жер арасындағы бұрыштың косинусын табыңыз.",
              lambda p: frac(F(p.d, p.L)), [lambda p: frac(F(p.h, p.L)), lambda p: frac(F(p.d, p.h)), lambda p: frac(F(p.L, p.d))],
              "Прилежащий катет — расстояние до стены, гипотенуза — лестница: $\\cos\\alpha =$ [[ans]].", "Іргелес катет — қабырғаға дейінгі қашықтық, гипотенуза — баспалдақ: $\\cos\\alpha =$ [[ans]]."),
            Q("Найдите площадь треугольника, образованного лестницей, стеной и землёй.", "Баспалдақ, қабырға және жер құрайтын үшбұрыштың ауданын табыңыз.",
              lambda p: F(p.d * p.h, 2), [lambda p: p.d * p.h, lambda p: F(p.L * p.h, 2), lambda p: F(p.d * p.L, 2)],
              "Прямоугольный треугольник: $S = \\frac{1}{2} \\cdot [[d]] \\cdot [[h]] = [[ans]]$ м².", "Тікбұрышты үшбұрыш: $S = \\frac{1}{2} \\cdot [[d]] \\cdot [[h]] = [[ans]]$ м².", decimals=1, unit="м²"),
            Q("Найдите высоту, опущенную из прямого угла на лестницу (в м).", "Тік бұрыштан баспалдаққа түсірілген биіктікті (м-мен) табыңыз.",
              lambda p: F(p.d * p.h, p.L), [lambda p: F(p.L, 2), lambda p: F(p.d + p.h, 2), lambda p: F(p.d * p.h, p.L + p.d)],
              "Площадь двумя способами: $\\frac{1}{2} d h = \\frac{1}{2} L \\cdot x$, $x = \\frac{[[d]] \\cdot [[h]]}{[[L]]} = [[ans]]$ м.", "Ауданды екі тәсілмен өрнектейміз: $\\frac{1}{2} d h = \\frac{1}{2} L \\cdot x$, $x = \\frac{[[d]] \\cdot [[h]]}{[[L]]} = [[ans]]$ м.", decimals=2, unit="м"),
        ],
        variants=12,
    ),
    Context(
        id="math.ctx.savings", **T("progressions"),
        params={"a": [500, 1000, 1500, 2000], "d": [100, 200, 250, 500], "n": [8, 10, 12, 15]},
        derived=lambda p: {"an": p.a + (p.n - 1) * p.d, "S": (2 * p.a + (p.n - 1) * p.d) * p.n // 2},
        where=lambda p: (2 * p.a + (p.n - 1) * p.d) * p.n % 2 == 0,
        context={"ru": "Ученица откладывает деньги на ноутбук: в первую неделю $[[a]]$ тенге, а каждую следующую неделю — на $[[d]]$ тенге больше, чем в предыдущую.",
                 "kk": "Оқушы қыз ноутбукке ақша жинайды: бірінші аптада $[[a]]$ теңге, ал әр келесі аптада алдыңғысынан $[[d]]$ теңге артық салады."},
        questions=[
            Q("Сколько тенге она отложит в $[[n]]$-ю неделю?", "Ол $[[n]]$-аптада неше теңге салады?",
              lambda p: p.an, [lambda p: p.a + p.n * p.d, lambda p: p.a * p.n, lambda p: p.an - p.d * 2],
              "$a_n = a_1 + (n - 1)d = [[a]] + ([[n]] - 1) \\cdot [[d]] = [[ans]]$ тенге.", "$a_n = a_1 + (n - 1)d = [[a]] + ([[n]] - 1) \\cdot [[d]] = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("Сколько тенге она накопит за $[[n]]$ недель?", "Ол $[[n]]$ аптада барлығы неше теңге жинайды?",
              lambda p: p.S, [lambda p: p.an * p.n, lambda p: p.a * p.n, lambda p: p.S - p.an],
              "$S_n = \\frac{a_1 + a_n}{2} \\cdot n = \\frac{[[a]] + [[an]]}{2} \\cdot [[n]] = [[ans]]$ тенге.", "$S_n = \\frac{a_1 + a_n}{2} \\cdot n = \\frac{[[a]] + [[an]]}{2} \\cdot [[n]] = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("В какую неделю сумма за неделю впервые превысит $5000$ тенге?", "Қай аптада апталық сома алғаш рет $5000$ теңгеден асады?",
              lambda p: next(k for k in range(1, 200) if p.a + (k - 1) * p.d > 5000), [lambda p: next(k for k in range(1, 200) if p.a + (k - 1) * p.d > 5000) - 1, lambda p: next(k for k in range(1, 200) if p.a + (k - 1) * p.d > 5000) + 1, lambda p: 5000 // p.d],
              "Решаем $[[a]] + (n - 1) \\cdot [[d]] > 5000$ и берём наименьшее целое $n$: $[[ans]]$.", "$[[a]] + (n - 1) \\cdot [[d]] > 5000$ теңсіздігін шешіп, ең кіші бүтін $n$ санын аламыз: $[[ans]]$.", decimals=0),
            Q("На сколько тенге сумма за последнюю, $[[n]]$-ю неделю больше, чем за первую?", "Соңғы, $[[n]]$-аптадағы сома біріншісінен неше теңгеге көп?",
              lambda p: (p.n - 1) * p.d, [lambda p: p.n * p.d, lambda p: p.an, lambda p: (p.n - 2) * p.d],
              "$a_n - a_1 = (n - 1)d = [[ans]]$ тенге.", "$a_n - a_1 = (n - 1)d = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
        ],
        variants=12,
    ),
]
