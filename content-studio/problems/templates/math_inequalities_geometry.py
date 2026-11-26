"""Математика · Неравенства, планиметрия, стереометрия.
Казахский текст — черновик, нужна вычитка носителем языка."""
from math import isqrt

from engine import INF, Template, fmt, iv, lead, pi_ans, term, union

INEQ = dict(subject="math", topic="inequalities")
PLANE = dict(subject="math", topic="plane-figures")
METRIC = dict(subject="math", topic="metric-relations-plane")
SOLID = dict(subject="math", topic="metric-relations-space")

TRIPLES = [(3, 4, 5), (6, 8, 10), (5, 12, 13), (9, 12, 15), (8, 15, 17), (12, 16, 20), (7, 24, 25), (15, 20, 25)]

TEMPLATES = [
    # Квадратное неравенство x² − sx + p < 0  →  (r1; r2)
    Template(
        id="math.ineq.quadratic-less",
        level="easy",
        **INEQ,
        params={"r1": range(-7, 6), "r2": range(-5, 9), "strict": [1, 0]},
        derived=lambda p: {
            "bt": term(-(p.r1 + p.r2), "x"),
            "ct": term(p.r1 * p.r2),
            "sign": "<" if p.strict else "\\leq",
            "how": "меньше нуля между корнями" if p.strict else "не больше нуля между корнями и в самих корнях (поэтому скобки квадратные)",
            "howk": "түбірлердің арасында нөлден кіші" if p.strict else "түбірлердің арасында және түбірлердің өзінде нөлден артық емес (сондықтан жақшалар квадрат)",
        },
        where=lambda p: p.r1 < p.r2 and p.r1 + p.r2 != 0 and p.r1 * p.r2 != 0,
        answer=lambda p: iv(p.r1, p.r2) if p.strict else iv(p.r1, p.r2, "[", "]"),
        distractors=[
            lambda p: union(iv(-INF, p.r1), iv(p.r2, INF)),  # взял промежутки вне корней
            lambda p: iv(p.r1, p.r2, "[", "]") if p.strict else iv(p.r1, p.r2),  # перепутал строгость
            lambda p: iv(-p.r2, -p.r1),  # корни с обратным знаком
            lambda p: iv(p.r2, INF),
            lambda p: union(iv(-INF, p.r1, right="]"), iv(p.r2, INF, "[")),
        ],
        text={
            "ru": "Решите неравенство: $x^2 [[bt]] [[ct]] [[sign]] 0$.",
            "kk": "Теңсіздікті шешіңіз: $x^2 [[bt]] [[ct]] [[sign]] 0$.",
        },
        solution={
            "ru": "Корни трёхчлена: $[[r1]]$ и $[[r2]]$. Ветви параболы вверх, поэтому выражение [[how]]. Ответ: [[ans]].",
            "kk": "Үшмүшенің түбірлері: $[[r1]]$ және $[[r2]]$. Парабола тармақтары жоғары, сондықтан өрнек [[howk]]. Жауабы: [[ans]].",
        },
    ),
    # Линейное неравенство с отрицательным коэффициентом: смена знака
    Template(
        id="math.ineq.linear-negative",
        level="easy",
        **INEQ,
        params={"k": [-2, -3, -4, -5], "x0": range(-6, 8), "m": range(-9, 10)},
        derived=lambda p: {"lhs": lead(p.k, "x") + (f" {term(p.m)}" if p.m else ""), "rhs": p.k * p.x0 + p.m},
        where=lambda p: p.x0 != 0 and p.m != 0,
        answer=lambda p: iv(-INF, p.x0),
        distractors=[
            lambda p: iv(p.x0, INF),  # не поменял знак при делении на отрицательное
            lambda p: iv(-INF, p.x0, right="]"),
            lambda p: iv(-INF, -p.x0),
            lambda p: iv(-p.x0, INF),
        ],
        text={
            "ru": "Решите неравенство: $[[lhs]] > [[rhs]]$.",
            "kk": "Теңсіздікті шешіңіз: $[[lhs]] > [[rhs]]$.",
        },
        solution={
            "ru": "$[[k]]x > [[rk]]$. Делим на отрицательное число $[[k]]$ и меняем знак неравенства: $x < [[x0]]$. Это главная ловушка задачи.",
            "kk": "$[[k]]x > [[rk]]$. Теріс $[[k]]$ санына бөлеміз де, теңсіздік таңбасын өзгертеміз: $x < [[x0]]$. Есептің басты қақпаны осы.",
        },
    ),
    # Площадь части треугольника: AK:KC = m:n → S(ABK) = S·m/(m+n)
    Template(
        id="math.plane.triangle-area-ratio",
        level="medium",
        **METRIC,
        params={"S": range(12, 121, 6), "m": [1, 2, 3, 4], "n": [1, 2, 3, 5]},
        where=lambda p: p.m != p.n and (p.S * p.m) % (p.m + p.n) == 0,
        answer=lambda p: p.S * p.m // (p.m + p.n),
        distractors=[
            lambda p: p.S * p.n / (p.m + p.n),  # взял другую часть
            lambda p: p.S / 2,  # решил, что медиана
            lambda p: p.S * p.m / p.n,  # отношение частей вместо доли
            lambda p: p.S * p.m / (p.m + p.n) / 2,
        ],
        decimals=1,
        text={
            "ru": "Площадь треугольника $ABC$ равна $[[S]]$. На стороне $AC$ взята точка $K$ так, что $AK : KC = [[m]] : [[n]]$. Найдите площадь треугольника $ABK$.",
            "kk": "$ABC$ үшбұрышының ауданы $[[S]]$. $AC$ қабырғасынан $AK : KC = [[m]] : [[n]]$ болатындай $K$ нүктесі алынған. $ABK$ үшбұрышының ауданын табыңыз.",
        },
        solution={
            "ru": "У треугольников $ABK$ и $ABC$ общая высота из вершины $B$, поэтому их площади относятся как основания: $\\frac{AK}{AC} = \\frac{[[m]]}{[[mn]]}$. $S_{ABK} = [[S]] \\cdot \\frac{[[m]]}{[[mn]]} = [[ans]]$.",
            "kk": "$ABK$ және $ABC$ үшбұрыштарының $B$ төбесінен түсірілген биіктігі ортақ, сондықтан аудандары табандарына пропорционал: $\\frac{AK}{AC} = \\frac{[[m]]}{[[mn]]}$. $S_{ABK} = [[S]] \\cdot \\frac{[[m]]}{[[mn]]} = [[ans]]$.",
        },
    ),
    # Ромб: площадь по диагоналям и сторона
    Template(
        id="math.plane.rhombus-side",
        level="easy",
        **PLANE,
        params={"t": range(len(TRIPLES)), "k": [1, 2, 3]},
        derived=lambda p: {"d1": 2 * p.k * TRIPLES[p.t][0], "d2": 2 * p.k * TRIPLES[p.t][1], "a": p.k * TRIPLES[p.t][2]},
        answer=lambda p: p.a,
        distractors=[
            lambda p: (p.d1 + p.d2) / 2,  # среднее диагоналей
            lambda p: p.d1 * p.d2 / 2,  # нашёл площадь
            lambda p: 2 * p.a,  # не поделил диагонали пополам
            lambda p: p.a * 4,  # нашёл периметр
            lambda p: p.d2,
        ],
        decimals=0,
        text={
            "ru": "Диагонали ромба равны $[[d1]]$ и $[[d2]]$. Найдите сторону ромба.",
            "kk": "Ромбтың диагональдары $[[d1]]$ және $[[d2]]$. Ромбтың қабырғасын табыңыз.",
        },
        solution={
            "ru": "Диагонали ромба перпендикулярны и делятся пополам. Половинки $[[h1]]$ и $[[h2]]$ — катеты, сторона — гипотенуза: $a = \\sqrt{[[h1]]^2 + [[h2]]^2} = [[ans]]$.",
            "kk": "Ромбтың диагональдары перпендикуляр және қақ бөлінеді. Жартылары $[[h1]]$ және $[[h2]]$ — катеттер, қабырға — гипотенуза: $a = \\sqrt{[[h1]]^2 + [[h2]]^2} = [[ans]]$.",
        },
    ),
    # Площадь круга по длине окружности
    Template(
        id="math.plane.circle-area-from-length",
        level="medium",
        **PLANE,
        params={"r": range(2, 26)},
        derived=lambda p: {"L": pi_ans(2 * p.r).strip("$")},
        answer=lambda p: pi_ans(p.r**2),
        distractors=[
            lambda p: pi_ans(2 * p.r),  # повторил длину окружности
            lambda p: pi_ans(4 * p.r**2),  # подставил диаметр вместо радиуса
            lambda p: pi_ans(p.r),
            lambda p: pi_ans(2 * p.r**2),
        ],
        text={
            "ru": "Длина окружности равна $[[L]]$. Найдите площадь круга, ограниченного этой окружностью.",
            "kk": "Шеңбердің ұзындығы $[[L]]$-ге тең. Осы шеңбермен шектелген дөңгелектің ауданын табыңыз.",
        },
        solution={
            "ru": "$L = 2\\pi r$, поэтому $r = [[r]]$. Площадь круга $S = \\pi r^2 = [[ans]]$.",
            "kk": "$L = 2\\pi r$, сондықтан $r = [[r]]$. Дөңгелектің ауданы $S = \\pi r^2 = [[ans]]$.",
        },
    ),
    # Правильная четырёхугольная призма: боковая и полная поверхности → высота
    Template(
        id="math.solid.prism-height",
        level="medium",
        **SOLID,
        params={"a": range(2, 11), "h": range(2, 16)},
        derived=lambda p: {"L": 4 * p.a * p.h, "T": 4 * p.a * p.h + 2 * p.a * p.a, "B": p.a * p.a},
        where=lambda p: p.h != p.a,
        answer=lambda p: p.h,
        distractors=[
            lambda p: p.a,  # нашёл сторону основания и остановился
            lambda p: p.L / p.a,  # забыл, что боковых граней четыре
            lambda p: (p.T - p.L),  # площадь двух оснований
            lambda p: p.L / (2 * p.a),
            lambda p: p.h + 1,
        ],
        decimals=0,
        unit="см",
        text={
            "ru": "Боковая поверхность правильной четырёхугольной призмы равна $[[L]]$ см², а полная поверхность — $[[T]]$ см². Найдите высоту призмы.",
            "kk": "Дұрыс төртбұрышты призманың бүйір бетінің ауданы $[[L]]$ см², ал толық бетінің ауданы $[[T]]$ см². Призманың биіктігін табыңыз.",
        },
        solution={
            "ru": "Два основания дают $[[T]] - [[L]] = [[twoB]]$ см², одно — $[[B]]$ см², сторона основания $a = [[a]]$ см. Боковая поверхность $4ah = [[L]]$, отсюда $h = \\frac{[[L]]}{4 \\cdot [[a]]} = [[ans]]$ см.",
            "kk": "Екі табанның ауданы $[[T]] - [[L]] = [[twoB]]$ см², біреуі — $[[B]]$ см², табан қабырғасы $a = [[a]]$ см. Бүйір беті $4ah = [[L]]$, бұдан $h = \\frac{[[L]]}{4 \\cdot [[a]]} = [[ans]]$ см.",
        },
    ),
    # Диагональ прямоугольного параллелепипеда
    Template(
        id="math.solid.box-diagonal",
        level="easy",
        **SOLID,
        params={"a": range(1, 25), "b": range(1, 25), "c": range(1, 41)},
        where=lambda p: p.a < p.b < p.c and isqrt(p.a**2 + p.b**2 + p.c**2) ** 2 == p.a**2 + p.b**2 + p.c**2,
        answer=lambda p: isqrt(p.a**2 + p.b**2 + p.c**2),
        distractors=[
            lambda p: p.a + p.b + p.c,  # сложил рёбра
            lambda p: (p.a**2 + p.b**2) ** 0.5,  # нашёл диагональ грани
            lambda p: p.a**2 + p.b**2 + p.c**2,  # забыл корень
            lambda p: (p.b**2 + p.c**2) ** 0.5,
            lambda p: isqrt(p.a**2 + p.b**2 + p.c**2) + 1,
        ],
        decimals=2,
        text={
            "ru": "Измерения прямоугольного параллелепипеда равны $[[a]]$, $[[b]]$ и $[[c]]$. Найдите его диагональ.",
            "kk": "Тікбұрышты параллелепипедтің өлшемдері $[[a]]$, $[[b]]$ және $[[c]]$. Оның диагоналін табыңыз.",
        },
        solution={
            "ru": "$d = \\sqrt{a^2 + b^2 + c^2} = \\sqrt{[[a]]^2 + [[b]]^2 + [[c]]^2} = [[ans]]$.",
            "kk": "$d = \\sqrt{a^2 + b^2 + c^2} = \\sqrt{[[a]]^2 + [[b]]^2 + [[c]]^2} = [[ans]]$.",
        },
    ),
    # Объём цилиндра (ответ через π)
    Template(
        id="math.solid.cylinder-volume",
        level="easy",
        **SOLID,
        params={"r": range(1, 11), "h": range(2, 16)},
        answer=lambda p: pi_ans(p.r**2 * p.h),
        distractors=[
            lambda p: pi_ans(2 * p.r * p.h),  # боковая поверхность
            lambda p: pi_ans(p.r * p.h),  # радиус не в квадрате
            lambda p: pi_ans((2 * p.r) ** 2 * p.h),  # подставил диаметр
            lambda p: pi_ans(p.r**2 * p.h / 3),  # формула конуса
            lambda p: pi_ans(p.r**2 * p.h * 2),
        ],
        text={
            "ru": "Радиус основания цилиндра равен $[[r]]$, высота — $[[h]]$. Найдите объём цилиндра.",
            "kk": "Цилиндр табанының радиусы $[[r]]$, биіктігі $[[h]]$. Цилиндрдің көлемін табыңыз.",
        },
        solution={
            "ru": "$V = \\pi r^2 h = \\pi \\cdot [[r]]^2 \\cdot [[h]] = [[ans]]$. Не путай с конусом: там ещё делить на 3.",
            "kk": "$V = \\pi r^2 h = \\pi \\cdot [[r]]^2 \\cdot [[h]] = [[ans]]$. Конуспен шатастырма: онда тағы 3-ке бөлінеді.",
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
    "math.ineq.linear-negative": lambda p: {"rk": p.k * p.x0},
    "math.plane.triangle-area-ratio": lambda p: {"mn": p.m + p.n},
    "math.plane.rhombus-side": lambda p: {"h1": p.d1 // 2, "h2": p.d2 // 2},
    "math.solid.prism-height": lambda p: {"twoB": 2 * p.B},
}
for _t in TEMPLATES:
    if _t.id in _EXTRA:
        _t.derived = _chain(_t.derived, _EXTRA[_t.id])
_ = fmt
