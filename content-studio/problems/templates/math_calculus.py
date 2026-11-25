"""Математика · Производная и её применение (тема calculus-and-modeling).
Казахский текст — черновик, нужна вычитка носителем языка."""
from engine import INF, Template, fmt_tex, iv, lead, lin, pt, term

TOPIC = dict(subject="math", topic="calculus-and-modeling")


def poly3(a, b, c, d=0):
    """ax³ + bx² + cx + d для формулы."""
    s = lead(a, "x^3")
    s += f" {term(b, 'x^2')}" if b else ""
    s += f" {term(c, 'x')}" if c else ""
    s += f" {term(d)}" if d else ""
    return s


TEMPLATES = [
    # f'(x0) для кубического многочлена
    Template(
        id="math.calc.derivative-at-point",
        level="easy",
        **TOPIC,
        params={"a": [1, 2, -1, 3], "b": range(-4, 5), "c": range(-6, 7), "x0": [-2, -1, 1, 2, 3]},
        derived=lambda p: {"f": poly3(p.a, p.b, p.c)},
        where=lambda p: p.b != 0 and p.c != 0,
        answer=lambda p: 3 * p.a * p.x0**2 + 2 * p.b * p.x0 + p.c,
        distractors=[
            lambda p: p.a * p.x0**2 + p.b * p.x0 + p.c,  # понизил степень, но не умножил на показатель
            lambda p: 3 * p.a * p.x0**2 + 2 * p.b * p.x0,  # потерял производную от cx
            lambda p: p.a * p.x0**3 + p.b * p.x0**2 + p.c * p.x0,  # посчитал f(x0), а не f'(x0)
            lambda p: 3 * p.a * p.x0**2 + p.b * p.x0 + p.c,  # забыл двойку у bx²
            lambda p: 3 * p.a * p.x0 + 2 * p.b + p.c,
        ],
        decimals=0,
        text={
            "ru": "Найдите значение производной функции $f(x) = [[f]]$ в точке $x_0 = [[x0]]$.",
            "kk": "$f(x) = [[f]]$ функциясы туындысының $x_0 = [[x0]]$ нүктесіндегі мәнін табыңыз.",
        },
        solution={
            "ru": "$f'(x) = [[fp]]$, поэтому $f'([[x0]]) = [[ans]]$. Частая ошибка — посчитать само значение функции $f([[x0]])$ вместо производной.",
            "kk": "$f'(x) = [[fp]]$, сондықтан $f'([[x0]]) = [[ans]]$. Жиі қате — туындының орнына функцияның өз мәнін $f([[x0]])$ есептеу.",
        },
    ),
    # Точка, где угловой коэффициент касательной к y = x² + bx равен k
    Template(
        id="math.calc.tangent-slope-point",
        level="medium",
        **TOPIC,
        params={"b": range(-9, 10), "x0": range(-5, 7)},
        derived=lambda p: {"k": 2 * p.x0 + p.b, "fx": lead(1, "x^2") + (f" {term(p.b, 'x')}" if p.b else "")},
        where=lambda p: p.b != 0 and p.k != 0,
        answer=lambda p: pt(p.x0, p.x0**2 + p.b * p.x0),
        distractors=[
            lambda p: pt(p.k, p.k**2 + p.b * p.k),  # подставил k вместо x
            lambda p: pt(p.x0, p.k),  # взял y = k
            lambda p: pt(-p.x0, p.x0**2 - p.b * p.x0),  # ошибка знака при решении 2x + b = k
            lambda p: pt(p.x0 + 1, (p.x0 + 1) ** 2 + p.b * (p.x0 + 1)),
            lambda p: pt(p.x0**2 + p.b * p.x0, p.x0),  # перепутал координаты местами
        ],
        text={
            "ru": "Угловой коэффициент касательной к графику функции $f(x) = [[fx]]$ в точке $A$ равен $[[k]]$. Найдите координаты точки $A$.",
            "kk": "$f(x) = [[fx]]$ функциясының графигіне $A$ нүктесінде жүргізілген жанаманың бұрыштық коэффициенті $[[k]]$-ге тең. $A$ нүктесінің координаталарын табыңыз.",
        },
        solution={
            "ru": "Угловой коэффициент — это $f'(x) = 2x [[bt]]$. Из $2x [[bt]] = [[k]]$ получаем $x = [[x0]]$, тогда $y = f([[x0]]) = [[y0]]$.",
            "kk": "Бұрыштық коэффициент — бұл $f'(x) = 2x [[bt]]$. $2x [[bt]] = [[k]]$ теңдеуінен $x = [[x0]]$, онда $y = f([[x0]]) = [[y0]]$.",
        },
    ),
    # Уравнение касательной к y = x² + bx + c в точке x0
    Template(
        id="math.calc.tangent-line",
        level="medium",
        **TOPIC,
        params={"b": range(-5, 6), "c": range(-6, 7), "x0": [-2, -1, 1, 2, 3]},
        derived=lambda p: {
            "fx": "x^2" + (f" {term(p.b, 'x')}" if p.b else "") + (f" {term(p.c)}" if p.c else ""),
            "k": 2 * p.x0 + p.b,
            "y0": p.x0**2 + p.b * p.x0 + p.c,
        },
        where=lambda p: p.k != 0,
        answer=lambda p: lin(p.k, p.y0 - p.k * p.x0),
        distractors=[
            lambda p: lin(p.k, p.y0),  # забыл сдвиг: y = f(x0) + f'(x0)·x
            lambda p: lin(p.y0, p.k - p.y0 * p.x0) if p.y0 != 0 else lin(p.k + 1, p.y0 - (p.k + 1) * p.x0),  # перепутал f(x0) и f'(x0)
            lambda p: lin(p.k, p.y0 + p.k * p.x0),  # ошибка знака в (x − x0)
            lambda p: lin(p.x0 + p.b, p.y0 - (p.x0 + p.b) * p.x0),  # производная x² как x
            lambda p: lin(-p.k, p.y0 + p.k * p.x0),
        ],
        text={
            "ru": "Напишите уравнение касательной к графику функции $f(x) = [[fx]]$ в точке с абсциссой $x_0 = [[x0]]$.",
            "kk": "$f(x) = [[fx]]$ функциясының графигіне абсциссасы $x_0 = [[x0]]$ нүктесінде жүргізілген жанаманың теңдеуін жазыңыз.",
        },
        solution={
            "ru": "$f([[x0]]) = [[y0]]$, $f'(x) = 2x [[bt]]$, $f'([[x0]]) = [[k]]$. Касательная: $y = f(x_0) + f'(x_0)(x - x_0)$, то есть $[[line]]$.",
            "kk": "$f([[x0]]) = [[y0]]$, $f'(x) = 2x [[bt]]$, $f'([[x0]]) = [[k]]$. Жанама: $y = f(x_0) + f'(x_0)(x - x_0)$, яғни $[[line]]$.",
        },
    ),
    # Точки экстремума f = x³ − (3/2)(r1+r2)x² + 3·r1·r2·x: f' = 3(x − r1)(x − r2)
    Template(
        id="math.calc.extrema",
        level="medium",
        **TOPIC,
        params={"r1": range(-7, 7), "r2": range(-5, 10)},
        derived=lambda p: {"f": poly3(1, -3 * (p.r1 + p.r2) // 2, 3 * p.r1 * p.r2)},
        where=lambda p: p.r1 < p.r2 and (p.r1 + p.r2) % 2 == 0 and p.r1 * p.r2 != 0 and p.r1 + p.r2 != 0,
        answer=lambda p: f"$x_{{\\max}} = {fmt_tex(p.r1)}$, $x_{{\\min}} = {fmt_tex(p.r2)}$",
        distractors=[
            lambda p: f"$x_{{\\max}} = {fmt_tex(p.r2)}$, $x_{{\\min}} = {fmt_tex(p.r1)}$",  # перепутал максимум и минимум
            lambda p: f"$x_{{\\max}} = {fmt_tex(-p.r2)}$, $x_{{\\min}} = {fmt_tex(-p.r1)}$",  # корни с обратным знаком
            lambda p: f"$x_{{\\max}} = {fmt_tex(p.r1)}$, $x_{{\\min}} = {fmt_tex(p.r1 + p.r2)}$",
            lambda p: "точек экстремума нет",
            lambda p: f"$x_{{\\min}} = {fmt_tex(p.r1)}$",
        ],
        text={
            "ru": "Найдите точки экстремума функции $f(x) = [[f]]$.",
            "kk": "$f(x) = [[f]]$ функциясының экстремум нүктелерін табыңыз.",
        },
        solution={
            "ru": "$f'(x) = 3x^2 [[b2]] [[c2]] = 3(x [[m1]])(x [[m2]])$. Производная меняет знак с «+» на «−» в точке $[[r1]]$ (максимум) и с «−» на «+» в точке $[[r2]]$ (минимум).",
            "kk": "$f'(x) = 3x^2 [[b2]] [[c2]] = 3(x [[m1]])(x [[m2]])$. Туынды $[[r1]]$ нүктесінде таңбасын «+»-тен «−»-ке (максимум), ал $[[r2]]$ нүктесінде «−»-тен «+»-ке (минимум) өзгертеді.",
        },
    ),
    # Промежуток возрастания параболы y = x² − 2ax + c — несколько верных записей
    Template(
        id="math.calc.increasing-multi",
        level="medium",
        kind="multi",
        **TOPIC,
        params={"a": range(-6, 7), "c": range(-5, 6)},
        derived=lambda p: {"fx": "x^2" + (f" {term(-2 * p.a, 'x')}" if p.a else "") + (f" {term(p.c)}" if p.c else "")},
        where=lambda p: p.a != 0,
        answers=[
            lambda p: iv(p.a, INF, "["),
            lambda p: f"$x \\geq {fmt_tex(p.a)}$",
        ],
        distractors=[
            lambda p: iv(-INF, p.a, right="]"),  # спутал возрастание с убыванием
            lambda p: f"$x \\leq {fmt_tex(p.a)}$",
            lambda p: iv(-p.a, INF, "["),  # ошибка знака в вершине
            lambda p: iv(2 * p.a, INF, "["),  # не поделил на 2
        ],
        text={
            "ru": "Найдите промежуток возрастания функции $y = [[fx]]$. Выберите все верные записи.",
            "kk": "$y = [[fx]]$ функциясының өсу аралығын табыңыз. Барлық дұрыс жазуларды таңдаңыз.",
        },
        solution={
            "ru": "$y' = 2x [[bt]] \\geq 0$ при $x \\geq [[a]]$. Это одно и то же множество, записанное двумя способами: промежутком и неравенством.",
            "kk": "$y' = 2x [[bt]] \\geq 0$, егер $x \\geq [[a]]$. Бұл — екі түрлі жазылған бір жиын: аралық және теңсіздік.",
        },
    ),
]

# Переменные для разборов (зависят от уже посчитанных величин)
_extra = {
    "math.calc.derivative-at-point": lambda p: {"fp": lead(3 * p.a, "x^2") + f" {term(2 * p.b, 'x')} {term(p.c)}"},
    "math.calc.tangent-slope-point": lambda p: {"bt": term(p.b), "y0": p.x0**2 + p.b * p.x0},
    "math.calc.tangent-line": lambda p: {"bt": term(p.b) if p.b else "", "line": lin(p.k, p.y0 - p.k * p.x0).replace("−", "-")},
    "math.calc.extrema": lambda p: {
        "b2": term(-3 * (p.r1 + p.r2), "x"),
        "c2": term(3 * p.r1 * p.r2),
        "m1": term(-p.r1),
        "m2": term(-p.r2),
    },
    "math.calc.increasing-multi": lambda p: {"bt": term(-2 * p.a)},
}


def _chain(base, more):
    """Сначала основные вычисляемые переменные, потом те, что на них опираются."""

    def derived(p):
        p.update(base(p))
        return more(p)

    return derived


for _t in TEMPLATES:
    _t.derived = _chain(_t.derived, _extra[_t.id])
