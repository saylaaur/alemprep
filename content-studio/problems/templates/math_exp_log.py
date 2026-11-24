"""Математика · Показательные и логарифмические уравнения, области определения с логарифмом.
Казахский текст — черновик, нужна вычитка носителем языка."""
from engine import INF, Template, fmt, iv, lead, term, union

TOPIC = dict(subject="math", topic="exponential-log-equations")

TEMPLATES = [
    # aˣ⁺ᵐ − aˣ = N  →  aˣ(aᵐ − 1) = N
    Template(
        id="math.explog.exp-factor",
        level="easy",
        **TOPIC,
        params={"a": [2, 3, 4, 5, 6, 7], "m": [1, 2, 3], "x0": range(1, 6)},
        derived=lambda p: {"N": p.a ** (p.x0 + p.m) - p.a**p.x0, "ax": p.a**p.x0},
        where=lambda p: p.a ** (p.x0 + p.m) <= 5000,
        answer=lambda p: p.x0,
        distractors=[
            lambda p: p.a**p.x0,  # нашёл aˣ, но не нашёл x
            lambda p: p.x0 + p.m,  # взял показатель первого слагаемого
            lambda p: p.x0 - 1,
            lambda p: p.x0 + 1,
            lambda p: p.m,
        ],
        decimals=0,
        text={
            "ru": "Решите уравнение: $[[a]]^{x+[[m]]} - [[a]]^{x} = [[N]]$.",
            "kk": "Теңдеуді шешіңіз: $[[a]]^{x+[[m]]} - [[a]]^{x} = [[N]]$.",
        },
        solution={
            "ru": "Выносим $[[a]]^{x}$ за скобки: $[[a]]^{x}([[a]]^{[[m]]} - 1) = [[N]]$, откуда $[[a]]^{x} = [[ax]]$, значит $x = [[ans]]$. Ловушка: ответ $[[ax]]$ — это $[[a]]^{x}$, а не $x$.",
            "kk": "$[[a]]^{x}$ көбейткішін жақша сыртына шығарамыз: $[[a]]^{x}([[a]]^{[[m]]} - 1) = [[N]]$, сондықтан $[[a]]^{x} = [[ax]]$, яғни $x = [[ans]]$. Абай болыңыз: $[[ax]]$ — бұл $x$ емес, $[[a]]^{x}$.",
        },
    ),
    # lg(x − b) + lg x = lg(x + c): корни r1 > b и r2 < 0, корень r2 посторонний
    Template(
        id="math.explog.log-sum-extraneous",
        level="medium",
        **TOPIC,
        params={"r1": range(3, 13), "r2": range(-6, 0)},
        derived=lambda p: {"b": p.r1 + p.r2 - 1, "s": p.r1 + p.r2, "c": -p.r1 * p.r2},
        where=lambda p: p.b >= 1,
        answer=lambda p: fmt(p.r1),
        distractors=[
            lambda p: f"{fmt(p.r1)}; {fmt(p.r2)}",  # не проверил область определения
            lambda p: fmt(p.r2),  # оставил посторонний корень
            lambda p: fmt(-p.r1),
            lambda p: "нет корней",
            lambda p: fmt(p.r1 + 1),
        ],
        text={
            "ru": "Решите уравнение: $\\lg(x - [[b]]) + \\lg x = \\lg(x + [[c]])$.",
            "kk": "Теңдеуді шешіңіз: $\\lg(x - [[b]]) + \\lg x = \\lg(x + [[c]])$.",
        },
        solution={
            "ru": "Область определения: $x > [[b]]$. Сумма логарифмов — логарифм произведения: $x(x - [[b]]) = x + [[c]]$, то есть $x^2 - [[s]]x - [[c]] = 0$, корни $[[r1]]$ и $[[r2]]$. Корень $[[r2]]$ не входит в область определения, ответ: $x = [[r1]]$.",
            "kk": "Анықталу облысы: $x > [[b]]$. Логарифмдердің қосындысы — көбейтіндінің логарифмі: $x(x - [[b]]) = x + [[c]]$, яғни $x^2 - [[s]]x - [[c]] = 0$, түбірлері $[[r1]]$ және $[[r2]]$. $[[r2]]$ түбірі анықталу облысына кірмейді, жауабы: $x = [[r1]]$.",
        },
    ),
    # Область определения lg(kx − b)
    Template(
        id="math.explog.log-domain-linear",
        level="easy",
        **TOPIC,
        params={"k": [1, 2, 3, 4, 5], "x0": range(-5, 9)},
        derived=lambda p: {"kx": lead(p.k, "x"), "bt": term(-p.k * p.x0)},
        where=lambda p: p.x0 != 0,
        answer=lambda p: iv(p.x0, INF),
        distractors=[
            lambda p: iv(p.x0, INF, "["),  # включил границу
            lambda p: iv(-INF, p.x0),  # перепутал знак неравенства
            lambda p: iv(-INF, p.x0, right="]"),
            lambda p: iv(-p.x0, INF),  # ошибся со знаком при переносе
            lambda p: iv(-INF, INF),
        ],
        text={
            "ru": "Найдите область определения функции: $f(x) = \\lg([[kx]] [[bt]])$.",
            "kk": "Функцияның анықталу облысын табыңыз: $f(x) = \\lg([[kx]] [[bt]])$.",
        },
        solution={
            "ru": "Под логарифмом должно быть положительное число: $[[kx]] [[bt]] > 0$, откуда $x > [[x0]]$. Неравенство строгое, поэтому скобка у $[[x0]]$ круглая.",
            "kk": "Логарифм астындағы өрнек оң болуы керек: $[[kx]] [[bt]] > 0$, бұдан $x > [[x0]]$. Теңсіздік қатаң, сондықтан $[[x0]]$ жанындағы жақша дөңгелек.",
        },
    ),
    # Область определения lg(x² − sx + p): вне корней
    Template(
        id="math.explog.log-domain-quadratic",
        level="medium",
        **TOPIC,
        params={"r1": range(-6, 7), "r2": range(-6, 9)},
        derived=lambda p: {"bt": term(-(p.r1 + p.r2), "x"), "ct": term(p.r1 * p.r2)},
        where=lambda p: p.r1 < p.r2,
        answer=lambda p: union(iv(-INF, p.r1), iv(p.r2, INF)),
        distractors=[
            lambda p: iv(p.r1, p.r2),  # взял промежуток между корнями
            lambda p: union(iv(-INF, p.r1, right="]"), iv(p.r2, INF, "[")),  # включил корни
            lambda p: union(iv(-INF, -p.r2), iv(-p.r1, INF)),  # корни с обратным знаком
            lambda p: iv(p.r2, INF),  # потерял левую часть
            lambda p: iv(-INF, INF),
        ],
        text={
            "ru": "Найдите область определения функции: $y = \\lg(x^2 [[bt]] [[ct]])$.",
            "kk": "Функцияның анықталу облысын табыңыз: $y = \\lg(x^2 [[bt]] [[ct]])$.",
        },
        solution={
            "ru": "Нужно $x^2 [[bt]] [[ct]] > 0$. Корни трёхчлена: $[[r1]]$ и $[[r2]]$. Ветви параболы направлены вверх, поэтому выражение положительно левее меньшего корня и правее большего.",
            "kk": "$x^2 [[bt]] [[ct]] > 0$ болуы керек. Үшмүшенің түбірлері: $[[r1]]$ және $[[r2]]$. Парабола тармақтары жоғары бағытталған, сондықтан өрнек кіші түбірден сол жақта және үлкен түбірден оң жақта оң.",
        },
    ),
]
