"""Задания на соответствие (ЕНТ, задания 31–35): одно условие, две строки, к каждой — вариант из общего списка.
Ответ одной строки служит неверным вариантом для другой — как в настоящем тесте.
Казахский текст — черновик, нужна вычитка носителем языка."""
from engine import Template


def M(subject: str, topic: str, level: str = "medium") -> dict:
    return dict(subject=subject, topic=topic, level=level, kind="match")


def _sgn(x: int) -> str:
    return f"+ {x}" if x >= 0 else f"- {-x}"


TEMPLATES = [
    # ---------- Математика ----------
    Template(
        id="math.match.vieta-squares",
        **M("math", "linear-quadratic-rational-equations"),
        params={"q": [-6, -4, -3, -2, 2, 3, 4, 5, 6, 8, 10, 12], "a1": [5, 6, 7, 8, 9, 10], "a2": [2, 3, 4, 5, 6, 7]},
        where=lambda p: p.a1 != p.a2 and p.a1**2 > 4 * p.q and p.a2**2 > 4 * p.q,
        derived=lambda p: {"Q": _sgn(p.q)},
        answers=[lambda p: p.a1**2 - 2 * p.q, lambda p: p.a2**2 - 2 * p.q],
        distractors=[
            lambda p: p.a1**2,  # забыл −2q
            lambda p: p.a2**2 + 2 * p.q,  # знак перед 2q
            lambda p: p.a1**2 + 2 * p.q,
            lambda p: p.a2**2,
        ],
        decimals=0,
        text={
            "ru": "$x_1$ и $x_2$ — корни квадратного уравнения $x^2 - ax [[Q]] = 0$.",
            "kk": "$x_1$ және $x_2$ — $x^2 - ax [[Q]] = 0$ квадрат теңдеуінің түбірлері.",
        },
        rows={
            "ru": ["если $a = [[a1]]$, то $x_1^2 + x_2^2$ равно", "если $a = [[a2]]$, то $x_1^2 + x_2^2$ равно"],
            "kk": ["егер $a = [[a1]]$ болса, $x_1^2 + x_2^2$ неге тең?", "егер $a = [[a2]]$ болса, $x_1^2 + x_2^2$ неге тең?"],
        },
        solution={
            "ru": "По теореме Виета $x_1 + x_2 = a$, $x_1 x_2 = [[q]]$, поэтому $x_1^2 + x_2^2 = a^2 - 2x_1x_2$. При $a = [[a1]]$: $[[ans1]]$; при $a = [[a2]]$: $[[ans2]]$.",
            "kk": "Виет теоремасы бойынша $x_1 + x_2 = a$, $x_1 x_2 = [[q]]$, сондықтан $x_1^2 + x_2^2 = a^2 - 2x_1x_2$. $a = [[a1]]$ болғанда: $[[ans1]]$; $a = [[a2]]$ болғанда: $[[ans2]]$.",
        },
    ),
    Template(
        id="math.match.ap-term-sum",
        **M("math", "progressions"),
        params={"a1": [-5, -3, -2, 1, 2, 3, 4, 5], "d": [2, 3, 4, 5], "n": [8, 10, 12]},
        answers=[lambda p: p.a1 + (p.n - 1) * p.d, lambda p: (2 * p.a1 + (p.n - 1) * p.d) * p.n // 2],
        distractors=[
            lambda p: p.a1 + p.n * p.d,  # aₙ = a₁ + nd
            lambda p: (2 * p.a1 + p.n * p.d) * p.n // 2,
            lambda p: p.n * (p.a1 + (p.n - 1) * p.d),  # n·aₙ
            lambda p: p.a1 + (p.n - 2) * p.d,
        ],
        where=lambda p: (2 * p.a1 + (p.n - 1) * p.d) * p.n % 2 == 0,
        decimals=0,
        text={
            "ru": "Арифметическая прогрессия: $a_1 = [[a1]]$, $d = [[d]]$.",
            "kk": "Арифметикалық прогрессия: $a_1 = [[a1]]$, $d = [[d]]$.",
        },
        rows={
            "ru": ["$a_{[[n]]}$ равно", "сумма первых $[[n]]$ членов $S_{[[n]]}$ равна"],
            "kk": ["$a_{[[n]]}$ неге тең?", "алғашқы $[[n]]$ мүшенің қосындысы $S_{[[n]]}$ неге тең?"],
        },
        solution={
            "ru": "$a_{[[n]]} = a_1 + ([[n]] - 1)d = [[ans1]]$. $S_{[[n]]} = \\frac{a_1 + a_{[[n]]}}{2} \\cdot [[n]] = [[ans2]]$.",
            "kk": "$a_{[[n]]} = a_1 + ([[n]] - 1)d = [[ans1]]$. $S_{[[n]]} = \\frac{a_1 + a_{[[n]]}}{2} \\cdot [[n]] = [[ans2]]$.",
        },
    ),
    Template(
        id="math.match.derivative-at-points",
        **M("math", "calculus-and-modeling"),
        params={"k": [1, 2, 3, 4], "b": [-5, -3, -2, 1, 2, 4, 6], "x1": [1, 2], "x2": [-1, 3]},
        derived=lambda p: {"k3": "" if p.k == 1 else str(p.k), "B": ("+ " if p.b > 0 else "- ") + ("" if abs(p.b) == 1 else str(abs(p.b))), "d3": str(3 * p.k), "Bc": _sgn(p.b)},
        answers=[lambda p: 3 * p.k * p.x1**2 + p.b, lambda p: 3 * p.k * p.x2**2 + p.b],
        distractors=[
            lambda p: p.k * p.x1**3 + p.b * p.x1,  # подставил в саму функцию
            lambda p: 3 * p.k * p.x2**2,  # потерял производную от bx
            lambda p: 3 * p.k * p.x1 + p.b,  # (x³)′ = 3x
            lambda p: p.k * p.x2**3 + p.b * p.x2,
        ],
        decimals=0,
        text={
            "ru": "Дана функция $f(x) = [[k3]]x^3 [[B]]x$.",
            "kk": "$f(x) = [[k3]]x^3 [[B]]x$ функциясы берілген.",
        },
        rows={
            "ru": ["$f'([[x1]])$ равно", "$f'([[x2]])$ равно"],
            "kk": ["$f'([[x1]])$ неге тең?", "$f'([[x2]])$ неге тең?"],
        },
        solution={
            "ru": "$f'(x) = [[d3]]x^2 [[Bc]]$. $f'([[x1]]) = [[ans1]]$, $f'([[x2]]) = [[ans2]]$.",
            "kk": "$f'(x) = [[d3]]x^2 [[Bc]]$. $f'([[x1]]) = [[ans1]]$, $f'([[x2]]) = [[ans2]]$.",
        },
    ),
    # ---------- Физика ----------
    Template(
        id="phys.match.accel-v-s",
        **M("physics", "kinematics"),
        params={"a": [0.5, 1, 1.5, 2, 2.5, 3, 4, 5], "t": [2, 3, 4, 5, 6]},
        spread=30.0,
        answers=[lambda p: p.a * p.t, lambda p: p.a * p.t**2 / 2],
        distractors=[
            lambda p: p.a * p.t**2,  # забыл ½
            lambda p: p.a * p.t / 2,
            lambda p: p.a * p.t**2 / 4,
            lambda p: 2 * p.a * p.t,
        ],
        where=lambda p: p.a * p.t != p.a * p.t**2 / 2,
        decimals=2,
        text={
            "ru": "Тело начинает двигаться из состояния покоя с ускорением $[[a]]$ м/с².",
            "kk": "Дене тыныштық күйінен $[[a]]$ м/с² үдеумен қозғала бастайды.",
        },
        rows={
            "ru": ["скорость через $[[t]]$ с (м/с)", "путь за $[[t]]$ с (м)"],
            "kk": ["$[[t]]$ с-тан кейінгі жылдамдық (м/с)", "$[[t]]$ с ішіндегі жол (м)"],
        },
        solution={
            "ru": "$v = at = [[a]] \\cdot [[t]] = [[ans1]]$ м/с. $s = \\frac{at^2}{2} = \\frac{[[a]] \\cdot [[t]]^2}{2} = [[ans2]]$ м.",
            "kk": "$v = at = [[a]] \\cdot [[t]] = [[ans1]]$ м/с. $s = \\frac{at^2}{2} = \\frac{[[a]] \\cdot [[t]]^2}{2} = [[ans2]]$ м.",
        },
    ),
    Template(
        id="phys.match.series-circuit",
        **M("physics", "direct-current"),
        params={"U": [6, 12, 18, 24, 36], "R1": [1, 2, 3, 4, 6], "R2": [2, 3, 4, 6, 8]},
        where=lambda p: p.R1 != p.R2 and p.U % (p.R1 + p.R2) == 0,
        derived=lambda p: {"I": p.U // (p.R1 + p.R2)},
        answers=[lambda p: p.U // (p.R1 + p.R2), lambda p: p.U // (p.R1 + p.R2) * p.R1],
        distractors=[
            lambda p: p.U / p.R1,  # забыл второй резистор
            lambda p: p.U // (p.R1 + p.R2) * p.R2,  # напряжение на другом
            lambda p: p.U * (p.R1 + p.R2),
            lambda p: p.U / (p.R1 * p.R2 / (p.R1 + p.R2)),  # посчитал как параллельное
        ],
        decimals=2,
        text={
            "ru": "Резисторы $R_1 = [[R1]]$ Ом и $R_2 = [[R2]]$ Ом соединены последовательно и подключены к напряжению $[[U]]$ В.",
            "kk": "$R_1 = [[R1]]$ Ом және $R_2 = [[R2]]$ Ом резисторлары тізбектей жалғанып, $[[U]]$ В кернеуге қосылған.",
        },
        rows={
            "ru": ["сила тока в цепи (А)", "напряжение на $R_1$ (В)"],
            "kk": ["тізбектегі ток күші (А)", "$R_1$-дегі кернеу (В)"],
        },
        solution={
            "ru": "$R = R_1 + R_2 = [[R1]] + [[R2]]$ Ом, $I = \\frac{U}{R} = [[ans1]]$ А. $U_1 = IR_1 = [[ans2]]$ В.",
            "kk": "$R = R_1 + R_2 = [[R1]] + [[R2]]$ Ом, $I = \\frac{U}{R} = [[ans1]]$ А. $U_1 = IR_1 = [[ans2]]$ В.",
        },
    ),
    Template(
        id="phys.match.lens",
        **M("physics", "geometric-optics"),
        params={"F": [10, 20, 25, 40, 50], "k": [2, 3, 5]},
        derived=lambda p: {"d": p.k * p.F},
        answers=[lambda p: p.k * p.F / (p.k - 1), lambda p: 100 / p.F],
        distractors=[
            lambda p: p.k * p.F,  # f = d
            lambda p: p.F / p.k,
            lambda p: p.F / 10,  # D в 1/см вместо дптр
            lambda p: p.k * p.F / (p.k + 1),  # сложил вместо вычитания
        ],
        decimals=2,
        text={
            "ru": "Предмет находится на расстоянии $[[d]]$ см от собирающей линзы с фокусным расстоянием $[[F]]$ см.",
            "kk": "Зат фокус аралығы $[[F]]$ см жинағыш линзадан $[[d]]$ см қашықтықта орналасқан.",
        },
        rows={
            "ru": ["расстояние от линзы до изображения (см)", "оптическая сила линзы (дптр)"],
            "kk": ["линзадан кескінге дейінгі қашықтық (см)", "линзаның оптикалық күші (дптр)"],
        },
        solution={
            "ru": "$\\frac{1}{F} = \\frac{1}{d} + \\frac{1}{f}$, $f = \\frac{dF}{d - F} = [[ans1]]$ см. $D = \\frac{1}{F}$, где $F$ в метрах: $D = \\frac{100}{[[F]]} = [[ans2]]$ дптр.",
            "kk": "$\\frac{1}{F} = \\frac{1}{d} + \\frac{1}{f}$, $f = \\frac{dF}{d - F} = [[ans1]]$ см. $D = \\frac{1}{F}$, мұнда $F$ метрмен: $D = \\frac{100}{[[F]]} = [[ans2]]$ дптр.",
        },
        spread=40.0,
    ),
    # ---------- Информатика ----------
    Template(
        id="inf.match.divmod",
        **M("informatics", "python-programming", "easy"),
        params={"x": [17, 23, 29, 38, 47, 53, 61, 74, 89, 97], "y": [3, 4, 5, 6, 7]},
        where=lambda p: p.x % p.y != 0 and p.x // p.y != p.x % p.y,
        answers=[lambda p: p.x // p.y, lambda p: p.x % p.y],
        distractors=[
            lambda p: round(p.x / p.y, 2) if round(p.x / p.y, 2) != p.x // p.y else p.x // p.y + 1,  # обычное деление
            lambda p: p.x // p.y + 1,
            lambda p: p.y - p.x % p.y,
            lambda p: p.x % p.y + 1,
        ],
        decimals=2,
        spread=None,
        text={
            "ru": "Дана переменная `x = [[x]]`.",
            "kk": "`x = [[x]]` айнымалысы берілген.",
        },
        rows={
            "ru": ["значение `x // [[y]]`", "значение `x % [[y]]`"],
            "kk": ["`x // [[y]]` мәні", "`x % [[y]]` мәні"],
        },
        solution={
            "ru": "`//` — целая часть от деления, `%` — остаток: $[[x]] = [[y]] \\cdot [[ans1]] + [[ans2]]$.",
            "kk": "`//` — бөлудің бүтін бөлігі, `%` — қалдық: $[[x]] = [[y]] \\cdot [[ans1]] + [[ans2]]$.",
        },
    ),
    Template(
        id="inf.match.base-convert",
        **M("informatics", "number-systems"),
        params={"n": list(range(20, 128))},
        where=lambda p: bin(p.n)[2:] != bin(p.n)[2:][::-1] and oct(p.n)[2:] != oct(p.n)[2:][::-1],
        answers=[lambda p: bin(p.n)[2:], lambda p: oct(p.n)[2:]],
        distractors=[
            lambda p: bin(p.n)[2:][::-1],  # остатки прочитаны сверху вниз
            lambda p: oct(p.n)[2:][::-1],
            lambda p: bin(p.n + 1)[2:],
            lambda p: oct(p.n - 1)[2:],
        ],
        variants=40,
        text={
            "ru": "Дано десятичное число $[[n]]$.",
            "kk": "$[[n]]$ ондық саны берілген.",
        },
        rows={
            "ru": ["запись в двоичной системе", "запись в восьмеричной системе"],
            "kk": ["екілік жүйедегі жазуы", "сегіздік жүйедегі жазуы"],
        },
        solution={
            "ru": "Делим на основание и читаем остатки снизу вверх: $[[n]] = [[ans1]]_2 = [[ans2]]_8$. Проверка: двоичную запись делим на тройки справа.",
            "kk": "Негізге бөліп, қалдықтарды төменнен жоғары оқимыз: $[[n]] = [[ans1]]_2 = [[ans2]]_8$. Тексеру: екілік жазуды оңнан үштікке бөлеміз.",
        },
    ),
]
