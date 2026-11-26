"""Математика · Последовательности (арифметическая и геометрическая прогрессии).
Казахский текст — черновик, нужна вычитка носителем языка."""
from engine import Context, Template

TOPIC = dict(subject="math", topic="progressions")

TEMPLATES = [
    # a_i + a_j = S, i + j = n + 1 → S_n = n·S/2
    Template(
        id="math.prog.arith-sum-symmetric",
        level="medium",
        **TOPIC,
        params={"n": [9, 11, 13, 15, 17], "i": range(2, 9), "S": range(4, 41, 2)},
        derived=lambda p: {"j": p.n + 1 - p.i},
        where=lambda p: p.i < p.j,
        answer=lambda p: p.n * p.S / 2,
        distractors=[
            lambda p: p.n * p.S,  # забыл поделить на 2
            lambda p: p.S / 2,  # нашёл только среднее
            lambda p: (p.n - 1) * p.S / 2,  # ошибка на единицу в числе членов
            lambda p: (p.n + 1) * p.S / 2,
            lambda p: p.S * p.i,
        ],
        text={
            "ru": "Сумма $[[i]]$-го и $[[j]]$-го членов арифметической прогрессии равна $[[S]]$. Найдите сумму первых $[[n]]$ членов.",
            "kk": "Арифметикалық прогрессияның $a_{[[i]]}$ және $a_{[[j]]}$ мүшелерінің қосындысы $[[S]]$. Алғашқы $[[n]]$ мүшесінің қосындысын табыңыз.",
        },
        solution={
            "ru": "Номера $[[i]]$ и $[[j]]$ в сумме дают $[[n]] + 1$, поэтому $a_{[[i]]} + a_{[[j]]} = a_1 + a_{[[n]]} = [[S]]$. Тогда $S_{[[n]]} = \\frac{(a_1 + a_{[[n]]}) \\cdot [[n]]}{2} = [[ans]]$.",
            "kk": "$[[i]]$ және $[[j]]$ нөмірлерінің қосындысы $[[n]] + 1$, сондықтан $a_{[[i]]} + a_{[[j]]} = a_1 + a_{[[n]]} = [[S]]$. Онда $S_{[[n]]} = \\frac{(a_1 + a_{[[n]]}) \\cdot [[n]]}{2} = [[ans]]$.",
        },
    ),
    # Знаменатель: каждый член равен 1/m суммы двух следующих → q² + q − m = 0, q > 0
    Template(
        id="math.prog.geom-ratio-next-two",
        level="hard",
        **TOPIC,
        params={"q": [2, 3, 4, 5]},
        derived=lambda p: {"m": p.q * p.q + p.q},
        answer=lambda p: p.q,
        distractors=[
            lambda p: -(p.q + 1),  # оставил отрицательный корень
            lambda p: p.m,
            lambda p: p.q + 1,
            lambda p: 1 / p.q,
            lambda p: p.q - 1,
        ],
        decimals=2,
        text={
            "ru": "Каждый член геометрической прогрессии с положительными членами равен $\\frac{1}{[[m]]}$ суммы двух следующих за ним членов. Найдите знаменатель прогрессии.",
            "kk": "Мүшелері оң геометриялық прогрессияның әр мүшесі өзінен кейінгі екі мүшенің қосындысының $\\frac{1}{[[m]]}$ бөлігіне тең. Прогрессияның еселігін табыңыз.",
        },
        solution={
            "ru": "$b = \\frac{bq + bq^2}{[[m]]}$, то есть $q^2 + q - [[m]] = 0$. Корни: $[[q]]$ и $-[[q1]]$. Члены положительные, поэтому $q = [[q]]$.",
            "kk": "$b = \\frac{bq + bq^2}{[[m]]}$, яғни $q^2 + q - [[m]] = 0$. Түбірлері: $[[q]]$ және $-[[q1]]$. Мүшелері оң, сондықтан $q = [[q]]$.",
        },
    ),
]
TEMPLATES[1].derived = lambda p: {"m": p.q * p.q + p.q, "q1": p.q + 1}
TEMPLATES[1].variants = 4


def _gq(question_ru, question_kk, answer, distractors, solution_ru, solution_kk, decimals=0):
    return Template(
        id="", subject="", topic="", level="", params={},
        text={"ru": question_ru, "kk": question_kk},
        solution={"ru": solution_ru, "kk": solution_kk},
        answer=answer, distractors=distractors, decimals=decimals,
    )


CONTEXTS = [
    # b1 + b3 = A, b2 + b4 = B  →  q = B/A, b1 = A/(1 + q²)
    Context(
        id="math.prog.geom-context",
        level="medium",
        **TOPIC,
        params={"b1": range(1, 7), "q": [2, 3, -2, -3]},
        derived=lambda p: {
            "A": p.b1 * (1 + p.q**2),
            "B": p.b1 * p.q * (1 + p.q**2),
            "b5": p.b1 * p.q**4,
            "S5": p.b1 * (p.q**5 - 1) // (p.q - 1),
        },
        context={
            "ru": "Дана геометрическая прогрессия, в которой $b_1 + b_3 = [[A]]$ и $b_2 + b_4 = [[B]]$.",
            "kk": "$b_1 + b_3 = [[A]]$ және $b_2 + b_4 = [[B]]$ болатын геометриялық прогрессия берілген.",
        },
        questions=[
            _gq(
                "Найдите знаменатель прогрессии.", "Прогрессияның еселігін табыңыз.",
                lambda p: p.q,
                [lambda p: p.A / p.B if p.B else float("nan"), lambda p: p.B - p.A, lambda p: -p.q, lambda p: p.q + 1, lambda p: p.q * 2],
                "$b_2 + b_4 = q(b_1 + b_3)$, поэтому $q = \\frac{[[B]]}{[[A]]} = [[q]]$.",
                "$b_2 + b_4 = q(b_1 + b_3)$, сондықтан $q = \\frac{[[B]]}{[[A]]} = [[q]]$.",
                decimals=2,
            ),
            _gq(
                "Найдите первый член прогрессии.", "Прогрессияның бірінші мүшесін табыңыз.",
                lambda p: p.b1,
                [lambda p: p.A / (1 + p.q), lambda p: p.A / p.q, lambda p: p.A, lambda p: p.b1 * p.q, lambda p: p.b1 + 1],
                "$b_1 + b_3 = b_1(1 + q^2) = [[A]]$, откуда $b_1 = \\frac{[[A]]}{1 + [[q2]]} = [[b1]]$.",
                "$b_1 + b_3 = b_1(1 + q^2) = [[A]]$, бұдан $b_1 = \\frac{[[A]]}{1 + [[q2]]} = [[b1]]$.",
                decimals=2,
            ),
            _gq(
                "Найдите пятый член прогрессии.", "Прогрессияның бесінші мүшесін табыңыз.",
                lambda p: p.b5,
                [lambda p: p.b1 * p.q**5, lambda p: p.b1 * p.q**3, lambda p: p.b1 * 5 * p.q, lambda p: -p.b5, lambda p: p.q**5],
                "$b_5 = b_1 q^4 = [[b1]] \\cdot ([[q]])^4 = [[b5]]$. Ловушка: показатель степени на единицу меньше номера.",
                "$b_5 = b_1 q^4 = [[b1]] \\cdot ([[q]])^4 = [[b5]]$. Абай болыңыз: дәреже көрсеткіші нөмірден бір кем.",
            ),
            _gq(
                "Найдите сумму первых пяти членов прогрессии.", "Прогрессияның алғашқы бес мүшесінің қосындысын табыңыз.",
                lambda p: p.S5,
                [lambda p: p.b5, lambda p: p.b1 * (p.q**4 - 1) // (p.q - 1), lambda p: p.b1 * (p.q**6 - 1) // (p.q - 1), lambda p: 5 * p.b1, lambda p: -p.S5],
                "$S_5 = \\frac{b_1(q^5 - 1)}{q - 1} = \\frac{[[b1]] \\cdot (([[q]])^5 - 1)}{[[q]] - 1} = [[S5]]$.",
                "$S_5 = \\frac{b_1(q^5 - 1)}{q - 1} = \\frac{[[b1]] \\cdot (([[q]])^5 - 1)}{[[q]] - 1} = [[S5]]$.",
            ),
        ],
        variants=12,
    ),
]
_d = CONTEXTS[0].derived
CONTEXTS[0].derived = lambda p: {**_d(p), "q2": p.q**2}
