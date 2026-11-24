"""Математика · Радикалы, выражения, уравнения, системы, системы неравенств, векторы.
Казахский текст — черновик, нужна вычитка носителем языка."""
from fractions import Fraction as F
from math import gcd, isqrt

from engine import INF, Template, fmt, frac, iv, lead, pt, term

RAD = dict(subject="math", topic="radicals-and-expressions")
ALG = dict(subject="math", topic="algebraic-expressions")
EQ = dict(subject="math", topic="linear-quadratic-rational-equations")
SYS = dict(subject="math", topic="linear-nonlinear-systems")
SPEC = dict(subject="math", topic="special-equation-systems")
ISYS = dict(subject="math", topic="inequality-systems")
VPLANE = dict(subject="math", topic="metric-relations-plane")
VSPACE = dict(subject="math", topic="vectors-in-space")


def sq(n: int) -> bool:
    return n >= 0 and isqrt(n) ** 2 == n


QUADS = [(1, 2, 2, 3), (2, 3, 6, 7), (1, 4, 8, 9), (4, 4, 7, 9), (2, 6, 9, 11), (6, 6, 7, 11), (2, 10, 11, 15), (3, 4, 12, 13)]
TRIPLES = [(3, 4, 5), (6, 8, 10), (5, 12, 13), (8, 15, 17), (9, 12, 15), (7, 24, 25), (12, 16, 20)]

TEMPLATES = [
    # √a · √b, где a·b — точный квадрат
    Template(
        id="math.rad.product-of-roots",
        level="easy",
        **RAD,
        params={"a": range(2, 51), "b": range(2, 51)},
        where=lambda p: p.a < p.b and not sq(p.a) and not sq(p.b) and sq(p.a * p.b),
        answer=lambda p: isqrt(p.a * p.b),
        distractors=[
            lambda p: p.a * p.b,  # забыл извлечь корень
            lambda p: isqrt(p.a * p.b) + 1,
            lambda p: (p.a + p.b) ** 0.5,  # сложил под корнем
            lambda p: isqrt(p.a * p.b) * 2,
            lambda p: p.a + p.b,
        ],
        decimals=2,
        text={"ru": "Вычислите: $\\sqrt{[[a]]} \\cdot \\sqrt{[[b]]}$.", "kk": "Есептеңіз: $\\sqrt{[[a]]} \\cdot \\sqrt{[[b]]}$."},
        solution={
            "ru": "$\\sqrt{a} \\cdot \\sqrt{b} = \\sqrt{ab} = \\sqrt{[[ab]]} = [[ans]]$.",
            "kk": "$\\sqrt{a} \\cdot \\sqrt{b} = \\sqrt{ab} = \\sqrt{[[ab]]} = [[ans]]$.",
        },
        derived=lambda p: {"ab": p.a * p.b},
    ),
    # Сумма дробей
    Template(
        id="math.rad.fraction-sum",
        level="easy",
        **RAD,
        params={"a": range(1, 8), "b": range(2, 13), "c": range(1, 8), "d": range(2, 13)},
        where=lambda p: p.a < p.b and p.c < p.d and p.b != p.d and gcd(p.a, p.b) == 1 and gcd(p.c, p.d) == 1,
        answer=lambda p: frac(F(p.a, p.b) + F(p.c, p.d)),
        distractors=[
            lambda p: frac(F(p.a + p.c, p.b + p.d)),  # сложил числители и знаменатели
            lambda p: frac(F(p.a * p.c, p.b * p.d)),  # перемножил
            lambda p: frac(F(p.a + p.c, p.b * p.d)),  # общий знаменатель без домножения числителей
            lambda p: frac(F(p.a, p.b) - F(p.c, p.d)),
        ],
        text={
            "ru": "Вычислите: $\\frac{[[a]]}{[[b]]} + \\frac{[[c]]}{[[d]]}$.",
            "kk": "Есептеңіз: $\\frac{[[a]]}{[[b]]} + \\frac{[[c]]}{[[d]]}$.",
        },
        solution={
            "ru": "Приводим к общему знаменателю и складываем числители: $\\frac{[[a]]}{[[b]]} + \\frac{[[c]]}{[[d]]} = [[ans]]$. Складывать знаменатели нельзя.",
            "kk": "Ортақ бөлімге келтіріп, алымдарын қосамыз: $\\frac{[[a]]}{[[b]]} + \\frac{[[c]]}{[[d]]} = [[ans]]$. Бөлімдерді қосуға болмайды.",
        },
    ),
    # Разность квадратов: a² − b² = (a − b)(a + b)
    Template(
        id="math.alg.difference-of-squares",
        level="easy",
        **ALG,
        params={"m": [20, 30, 40, 50, 60, 70, 80, 100], "k": [1, 2, 3, 4, 5]},
        derived=lambda p: {"a": p.m + p.k, "b": p.m - p.k},
        answer=lambda p: 4 * p.m * p.k,
        distractors=[
            lambda p: (2 * p.k) ** 2,  # (a − b)²
            lambda p: 2 * p.m * p.k,  # забыл двойку
            lambda p: 2 * p.k,  # разность оснований
            lambda p: 4 * p.m * p.k + (2 * p.k) ** 2,
        ],
        decimals=0,
        text={"ru": "Вычислите: $[[a]]^2 - [[b]]^2$.", "kk": "Есептеңіз: $[[a]]^2 - [[b]]^2$."},
        solution={
            "ru": "Разность квадратов: $a^2 - b^2 = (a - b)(a + b) = ([[a]] - [[b]]) \\cdot ([[a]] + [[b]]) = [[ans]]$. Так считать намного быстрее, чем возводить в квадрат.",
            "kk": "Квадраттар айырымы: $a^2 - b^2 = (a - b)(a + b) = ([[a]] - [[b]]) \\cdot ([[a]] + [[b]]) = [[ans]]$. Квадратқа шығарғаннан әлдеқайда тез.",
        },
    ),
    # Значение выражения (a + b)² − (a − b)² = 4ab при заданных a, b
    Template(
        id="math.alg.square-identity",
        level="medium",
        **ALG,
        params={"x": range(-6, 9), "y": range(-6, 9)},
        where=lambda p: p.x != 0 and p.y != 0 and p.x != p.y,
        answer=lambda p: 4 * p.x * p.y,
        distractors=[
            lambda p: 2 * p.x * p.y,
            lambda p: 2 * p.y * p.y + 2 * p.x * p.x,  # раскрыл со знаком «+»
            lambda p: -4 * p.x * p.y,
            lambda p: 0,  # «квадраты сократились»
        ],
        decimals=0,
        text={
            "ru": "Найдите значение выражения $(a + b)^2 - (a - b)^2$ при $a = [[x]]$, $b = [[y]]$.",
            "kk": "$a = [[x]]$, $b = [[y]]$ болғанда $(a + b)^2 - (a - b)^2$ өрнегінің мәнін табыңыз.",
        },
        solution={
            "ru": "Сначала упростим: $(a + b)^2 - (a - b)^2 = 4ab$. Тогда $4 \\cdot ([[x]]) \\cdot ([[y]]) = [[ans]]$.",
            "kk": "Алдымен ықшамдаймыз: $(a + b)^2 - (a - b)^2 = 4ab$. Онда $4 \\cdot ([[x]]) \\cdot ([[y]]) = [[ans]]$.",
        },
    ),
    # Больший корень квадратного уравнения
    Template(
        id="math.eq.quadratic-larger-root",
        level="easy",
        **EQ,
        params={"r1": range(-9, 10), "r2": range(-9, 10)},
        derived=lambda p: {"bt": term(-(p.r1 + p.r2), "x"), "ct": term(p.r1 * p.r2)},
        where=lambda p: p.r1 < p.r2 and p.r1 + p.r2 != 0 and p.r1 * p.r2 != 0,
        answer=lambda p: p.r2,
        distractors=[
            lambda p: p.r1,  # меньший корень
            lambda p: -p.r2,  # ошибка знака в теореме Виета
            lambda p: -p.r1,
            lambda p: p.r1 + p.r2,  # сумма корней
            lambda p: p.r1 * p.r2,
        ],
        decimals=0,
        text={
            "ru": "Найдите больший корень уравнения $x^2 [[bt]] [[ct]] = 0$.",
            "kk": "$x^2 [[bt]] [[ct]] = 0$ теңдеуінің үлкен түбірін табыңыз.",
        },
        solution={
            "ru": "По теореме Виета сумма корней $[[s]]$, произведение $[[pr]]$: это числа $[[r1]]$ и $[[r2]]$. Больший — $[[r2]]$.",
            "kk": "Виет теоремасы бойынша түбірлердің қосындысы $[[s]]$, көбейтіндісі $[[pr]]$: бұл $[[r1]]$ және $[[r2]]$ сандары. Үлкені — $[[r2]]$.",
        },
    ),
    # Дробно-рациональное уравнение (x + a)/(x − b) = c
    Template(
        id="math.eq.rational-linear",
        level="medium",
        **EQ,
        params={"x0": range(-8, 13), "b": range(1, 8), "c": [2, 3, 4, 5, -1, -2]},
        derived=lambda p: {"a": p.c * (p.x0 - p.b) - p.x0},
        where=lambda p: p.x0 != p.b and p.a != 0,
        answer=lambda p: p.x0,
        distractors=[
            lambda p: p.b,  # корень, при котором знаменатель равен нулю
            lambda p: -p.x0,
            lambda p: p.x0 + p.b,
            lambda p: (p.a - p.b * p.c) / (p.c - 1) if p.c != 1 else float("nan"),  # ошибка знака при переносе
            lambda p: p.x0 - 1,
        ],
        decimals=2,
        text={
            "ru": "Решите уравнение: $\\frac{x [[at]]}{x - [[b]]} = [[c]]$.",
            "kk": "Теңдеуді шешіңіз: $\\frac{x [[at]]}{x - [[b]]} = [[c]]$.",
        },
        solution={
            "ru": "ОДЗ: $x \\neq [[b]]$. Умножаем на знаменатель: $x [[at]] = [[c]](x - [[b]])$, откуда $x = [[x0]]$. Корень входит в ОДЗ.",
            "kk": "МЖА: $x \\neq [[b]]$. Бөлімге көбейтеміз: $x [[at]] = [[c]](x - [[b]])$, бұдан $x = [[x0]]$. Түбір МЖА-ға кіреді.",
        },
    ),
    # Система x + y = s, x − y = d
    Template(
        id="math.sys.sum-difference",
        level="easy",
        **SYS,
        params={"x": range(-6, 13), "y": range(-6, 13)},
        derived=lambda p: {"s": p.x + p.y, "d": p.x - p.y},
        where=lambda p: p.x != p.y and p.x != -p.y and p.d != 0,
        answer=lambda p: pt(p.x, p.y),
        distractors=[
            lambda p: pt(p.y, p.x),  # перепутал x и y
            lambda p: pt(-p.x, -p.y),
            lambda p: pt(p.s, p.d),  # выписал правые части
            lambda p: pt(p.x, -p.y),
            lambda p: pt(p.x + 1, p.y - 1),
        ],
        text={
            "ru": "Решите систему: $\\begin{cases} x + y = [[s]] \\\\ x - y = [[d]] \\end{cases}$",
            "kk": "Жүйені шешіңіз: $\\begin{cases} x + y = [[s]] \\\\ x - y = [[d]] \\end{cases}$",
        },
        solution={
            "ru": "Складываем уравнения: $2x = [[s2]]$, $x = [[x]]$. Тогда $y = [[s]] - ([[x]]) = [[y]]$. Ответ: [[ans]].",
            "kk": "Теңдеулерді қосамыз: $2x = [[s2]]$, $x = [[x]]$. Онда $y = [[s]] - ([[x]]) = [[y]]$. Жауабы: [[ans]].",
        },
    ),
    # Нелинейная система x + y = s, xy = p — две пары решений
    Template(
        id="math.sys.vieta-pairs",
        level="medium",
        **SYS,
        params={"x": range(-5, 10), "y": range(-5, 10)},
        derived=lambda p: {"s": p.x + p.y, "pr": p.x * p.y},
        where=lambda p: p.x < p.y and p.x * p.y != 0 and p.x + p.y != 0,
        answer=lambda p: f"{pt(p.x, p.y)}; {pt(p.y, p.x)}",
        distractors=[
            lambda p: pt(p.x, p.y),  # потерял вторую пару
            lambda p: f"{pt(-p.x, -p.y)}; {pt(-p.y, -p.x)}",
            lambda p: f"{pt(p.s, p.pr)}",
            lambda p: f"{pt(p.x, -p.y)}; {pt(-p.y, p.x)}",
        ],
        text={
            "ru": "Решите систему: $\\begin{cases} x + y = [[s]] \\\\ xy = [[pr]] \\end{cases}$",
            "kk": "Жүйені шешіңіз: $\\begin{cases} x + y = [[s]] \\\\ xy = [[pr]] \\end{cases}$",
        },
        solution={
            "ru": "$x$ и $y$ — корни уравнения $t^2 - ([[s]])t + ([[pr]]) = 0$: $t = [[x]]$ и $t = [[y]]$. Система симметрична, поэтому решений два: [[ans]].",
            "kk": "$x$ пен $y$ — $t^2 - ([[s]])t + ([[pr]]) = 0$ теңдеуінің түбірлері: $t = [[x]]$ және $t = [[y]]$. Жүйе симметриялы, сондықтан шешімі екеу: [[ans]].",
        },
    ),
    # Показательная система: 2ˣ·2ʸ = 2ˢ, x − y = d
    Template(
        id="math.spec.exp-system",
        level="medium",
        **SPEC,
        params={"x": range(-3, 8), "y": range(-3, 8), "base": [2, 3]},
        derived=lambda p: {"s": p.x + p.y, "d": p.x - p.y, "N": p.base ** (p.x + p.y)},
        where=lambda p: p.x != p.y and 0 < p.x + p.y <= (10 if p.base == 2 else 6),
        answer=lambda p: pt(p.x, p.y),
        distractors=[
            lambda p: pt(p.y, p.x),
            lambda p: pt(p.N, p.d),  # не перешёл к показателям
            lambda p: pt(-p.x, -p.y),
            lambda p: pt(p.s, p.d),
        ],
        text={
            "ru": "Решите систему: $\\begin{cases} [[base]]^x \\cdot [[base]]^y = [[N]] \\\\ x - y = [[d]] \\end{cases}$",
            "kk": "Жүйені шешіңіз: $\\begin{cases} [[base]]^x \\cdot [[base]]^y = [[N]] \\\\ x - y = [[d]] \\end{cases}$",
        },
        solution={
            "ru": "$[[base]]^{x+y} = [[N]] = [[base]]^{[[s]]}$, значит $x + y = [[s]]$. Вместе с $x - y = [[d]]$: $x = [[x]]$, $y = [[y]]$.",
            "kk": "$[[base]]^{x+y} = [[N]] = [[base]]^{[[s]]}$, яғни $x + y = [[s]]$. $x - y = [[d]]$ теңдеуімен бірге: $x = [[x]]$, $y = [[y]]$.",
        },
    ),
    # Система линейных неравенств: число целых решений
    Template(
        id="math.isys.integer-count",
        level="medium",
        **ISYS,
        params={"k": [2, 3], "a": range(-6, 6), "b": range(-3, 12)},
        derived=lambda p: {"lhs1": lead(p.k, "x"), "r1": p.k * p.a, "r2": p.b + 1},
        where=lambda p: p.b - p.a >= 2,
        answer=lambda p: p.b - p.a,
        distractors=[
            lambda p: p.b - p.a + 1,  # посчитал левую границу
            lambda p: p.b - p.a - 1,  # не посчитал правую границу
            lambda p: p.b - p.a + 2,
            lambda p: p.b + p.a if p.b + p.a != p.b - p.a else p.b,
        ],
        decimals=0,
        text={
            "ru": "Сколько целых решений имеет система $\\begin{cases} [[lhs1]] > [[r1]] \\\\ x - 1 \\leq [[b1]] \\end{cases}$?",
            "kk": "$\\begin{cases} [[lhs1]] > [[r1]] \\\\ x - 1 \\leq [[b1]] \\end{cases}$ жүйесінің неше бүтін шешімі бар?",
        },
        solution={
            "ru": "Первое неравенство: $x > [[a]]$, второе: $x \\leq [[b]]$. Решение: $([[a]]; [[b]]]$. Целые числа от $[[a1]]$ до $[[b]]$ включительно — их $[[ans]]$.",
            "kk": "Бірінші теңсіздік: $x > [[a]]$, екіншісі: $x \\leq [[b]]$. Шешімі: $([[a]]; [[b]]]$. $[[a1]]$-ден $[[b]]$-ге дейінгі бүтін сандар — олар $[[ans]]$.",
        },
    ),
    # Длина вектора на плоскости
    Template(
        id="math.vec.length-2d",
        level="easy",
        **VPLANE,
        params={"t": range(len(TRIPLES)), "sx": [1, -1], "sy": [1, -1], "swap": [0, 1]},
        derived=lambda p: {
            "vx": p.sx * TRIPLES[p.t][1 if p.swap else 0],
            "vy": p.sy * TRIPLES[p.t][0 if p.swap else 1],
            "L": TRIPLES[p.t][2],
        },
        answer=lambda p: p.L,
        distractors=[
            lambda p: abs(p.vx) + abs(p.vy),  # сложил координаты
            lambda p: p.L**2,  # забыл корень
            lambda p: p.vx + p.vy,
            lambda p: abs(abs(p.vx) - abs(p.vy)),
        ],
        decimals=0,
        text={
            "ru": "Найдите длину вектора $\\vec{a}([[vx]]; [[vy]])$.",
            "kk": "$\\vec{a}([[vx]]; [[vy]])$ векторының ұзындығын табыңыз.",
        },
        solution={
            "ru": "$|\\vec{a}| = \\sqrt{x^2 + y^2} = \\sqrt{([[vx]])^2 + ([[vy]])^2} = [[ans]]$.",
            "kk": "$|\\vec{a}| = \\sqrt{x^2 + y^2} = \\sqrt{([[vx]])^2 + ([[vy]])^2} = [[ans]]$.",
        },
    ),
    # Перпендикулярность векторов: найти параметр
    Template(
        id="math.vec.perpendicular-param",
        level="medium",
        **VPLANE,
        params={"a1": range(-5, 7), "a2": range(-5, 7), "b1": range(-6, 7)},
        derived=lambda p: {"m": F(-p.a1 * p.b1, p.a2) if p.a2 else None},
        where=lambda p: p.a2 != 0 and p.a1 != 0 and p.b1 != 0 and p.m is not None and p.m.denominator == 1 and p.m != 0,
        answer=lambda p: int(p.m),
        distractors=[
            lambda p: -int(p.m),  # ошибка знака
            lambda p: p.a1 * p.b1 / p.a2 if p.a1 * p.b1 / p.a2 != -int(p.m) else int(p.m) + 2,
            lambda p: p.b1 * p.a2 / p.a1 if p.a1 else float("nan"),  # перепутал координаты
            lambda p: int(p.m) + 1,
            lambda p: 0,
        ],
        decimals=2,
        text={
            "ru": "При каком значении $m$ векторы $\\vec{a}([[a1]]; [[a2]])$ и $\\vec{b}([[b1]]; m)$ перпендикулярны?",
            "kk": "$m$-нің қандай мәнінде $\\vec{a}([[a1]]; [[a2]])$ және $\\vec{b}([[b1]]; m)$ векторлары перпендикуляр болады?",
        },
        solution={
            "ru": "Векторы перпендикулярны, когда скалярное произведение равно нулю: $[[a1]] \\cdot ([[b1]]) + [[a2]]m = 0$, $m = [[ans]]$.",
            "kk": "Скаляр көбейтінді нөлге тең болғанда векторлар перпендикуляр: $[[a1]] \\cdot ([[b1]]) + [[a2]]m = 0$, $m = [[ans]]$.",
        },
    ),
    # Длина вектора в пространстве
    Template(
        id="math.vec.length-3d",
        level="easy",
        **VSPACE,
        params={"t": range(len(QUADS)), "sx": [1, -1], "sy": [1, -1], "sz": [1, -1]},
        derived=lambda p: {"vx": p.sx * QUADS[p.t][0], "vy": p.sy * QUADS[p.t][1], "vz": p.sz * QUADS[p.t][2], "L": QUADS[p.t][3]},
        answer=lambda p: p.L,
        distractors=[
            lambda p: abs(p.vx) + abs(p.vy) + abs(p.vz),
            lambda p: p.L**2,
            lambda p: (p.vx**2 + p.vy**2) ** 0.5,  # потерял третью координату
            lambda p: p.vx + p.vy + p.vz,
            lambda p: p.L + 1,
            lambda p: 2 * p.L,
        ],
        decimals=2,
        text={
            "ru": "Найдите длину вектора $\\vec{a}([[vx]]; [[vy]]; [[vz]])$.",
            "kk": "$\\vec{a}([[vx]]; [[vy]]; [[vz]])$ векторының ұзындығын табыңыз.",
        },
        solution={
            "ru": "$|\\vec{a}| = \\sqrt{x^2 + y^2 + z^2} = \\sqrt{[[sumsq]]} = [[ans]]$.",
            "kk": "$|\\vec{a}| = \\sqrt{x^2 + y^2 + z^2} = \\sqrt{[[sumsq]]} = [[ans]]$.",
        },
    ),
    # Скалярное произведение в пространстве
    Template(
        id="math.vec.dot-3d",
        level="easy",
        **VSPACE,
        params={"a1": range(-3, 5), "a2": range(-3, 5), "a3": range(-3, 5), "b1": [1, 2, -1], "b2": [2, -2, 3], "b3": [1, -1, 2]},
        where=lambda p: p.a1 * p.a2 * p.a3 != 0,
        answer=lambda p: p.a1 * p.b1 + p.a2 * p.b2 + p.a3 * p.b3,
        distractors=[
            lambda p: abs(p.a1 * p.b1) + abs(p.a2 * p.b2) + abs(p.a3 * p.b3),  # потерял знаки
            lambda p: p.a1 * p.b1 + p.a2 * p.b2,  # забыл третью координату
            lambda p: (p.a1 + p.a2 + p.a3) * (p.b1 + p.b2 + p.b3),
            lambda p: p.a1 * p.b1 + p.a2 * p.b2 + p.a3 * p.b3 + 1,
            lambda p: -(p.a1 * p.b1 + p.a2 * p.b2 + p.a3 * p.b3),
        ],
        decimals=0,
        text={
            "ru": "Найдите скалярное произведение векторов $\\vec{a}([[a1]]; [[a2]]; [[a3]])$ и $\\vec{b}([[b1]]; [[b2]]; [[b3]])$.",
            "kk": "$\\vec{a}([[a1]]; [[a2]]; [[a3]])$ және $\\vec{b}([[b1]]; [[b2]]; [[b3]])$ векторларының скаляр көбейтіндісін табыңыз.",
        },
        solution={
            "ru": "$\\vec{a} \\cdot \\vec{b} = a_1 b_1 + a_2 b_2 + a_3 b_3 = [[ans]]$.",
            "kk": "$\\vec{a} \\cdot \\vec{b} = a_1 b_1 + a_2 b_2 + a_3 b_3 = [[ans]]$.",
        },
    ),
]


def _chain(base, more):
    def derived(p):
        if base is not None:
            p.update(base(p))
        return more(p)

    return derived


_EXTRA = {
    "math.eq.quadratic-larger-root": lambda p: {"s": p.r1 + p.r2, "pr": p.r1 * p.r2},
    "math.eq.rational-linear": lambda p: {"at": term(p.a)},
    "math.sys.sum-difference": lambda p: {"s2": 2 * p.x},
    "math.isys.integer-count": lambda p: {"b1": p.b - 1, "a1": p.a + 1},
    "math.vec.length-3d": lambda p: {"sumsq": p.L**2},
}
for _t in TEMPLATES:
    if _t.id in _EXTRA:
        _t.derived = _chain(_t.derived, _EXTRA[_t.id])
_ = (INF, iv, fmt)
