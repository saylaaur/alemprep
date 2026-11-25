"""Ещё задачи в 2–3 шага (уровень hard) по образцам ЕНТ.
Казахский текст — черновик, нужна вычитка носителем языка."""
from fractions import Fraction

from engine import Template, frac


def H(subject: str, topic: str, level: str = "hard") -> dict:
    return dict(subject=subject, topic=topic, level=level)


LOG_PAIRS = [(3, 1, 3), (5, 3, 4), (6, 2, 5), (9, 7, 5), (10, 6, 6), (17, 15, 6), (12, 4, 7), (18, 14, 7), (33, 31, 7),
             (20, 12, 8), (34, 30, 8), (65, 63, 8), (24, 8, 9), (36, 28, 9), (40, 24, 10)]

PIPES = [(2, 3), (3, 6), (4, 12), (6, 12), (6, 3), (10, 15), (12, 24), (4, 6), (5, 20), (8, 24), (15, 30), (9, 18), (12, 6), (20, 30)]

TEMPLATES = [
    Template(
        id="math.hard.log-sum-equation", **H("math", "exponential-log-equations"),
        params={"t": LOG_PAIRS}, derived=lambda p: {"x": p.t[0], "c": p.t[1], "k": p.t[2]},
        answer=lambda p: p.t[0],
        distractors=[lambda p: -p.t[0], lambda p: p.t[1], lambda p: 2 ** p.t[2]],
        decimals=0,
        text={"ru": "Решите уравнение $\\log_2(x + [[c]]) + \\log_2(x - [[c]]) = [[k]]$.",
              "kk": "$\\log_2(x + [[c]]) + \\log_2(x - [[c]]) = [[k]]$ теңдеуін шешіңіз."},
        solution={"ru": "ОДЗ: $x > [[c]]$. $\\log_2((x + [[c]])(x - [[c]])) = [[k]]$, $x^2 - [[c]]^2 = 2^{[[k]]}$, $x = \\pm[[x]]$. ОДЗ проходит только $x = [[ans]]$.",
                  "kk": "ММО: $x > [[c]]$. $\\log_2((x + [[c]])(x - [[c]])) = [[k]]$, $x^2 - [[c]]^2 = 2^{[[k]]}$, $x = \\pm[[x]]$. ММО-дан тек $x = [[ans]]$ өтеді."},
    ),
    Template(
        id="math.hard.exp-factor", **H("math", "exponential-log-equations"),
        params={"a": [2, 3, 4, 5], "k": [1, 2, 3, 4, 5], "s": [1, 2]},
        derived=lambda p: {"rhs": (p.a**p.s + 1) * p.a**p.k, "as": p.a**p.s + 1},
        answer=lambda p: p.k,
        distractors=[lambda p: p.k + p.s, lambda p: p.k - 1 if p.k > 1 else p.k + 2, lambda p: p.k + 1 if p.s == 2 else p.k + 3],
        decimals=0, spread=None,
        text={"ru": "Решите уравнение $[[a]]^{x + [[s]]} + [[a]]^x = [[rhs]]$.",
              "kk": "$[[a]]^{x + [[s]]} + [[a]]^x = [[rhs]]$ теңдеуін шешіңіз."},
        solution={"ru": "Выносим $[[a]]^x$: $[[a]]^x([[a]]^{[[s]]} + 1) = [[rhs]]$, $[[a]]^x = \\frac{[[rhs]]}{[[as]]}$, откуда $x = [[ans]]$.",
                  "kk": "$[[a]]^x$-ті жақша сыртына шығарамыз: $[[a]]^x([[a]]^{[[s]]} + 1) = [[rhs]]$, $[[a]]^x = \\frac{[[rhs]]}{[[as]]}$, бұдан $x = [[ans]]$."},
    ),
    Template(
        id="math.hard.pipes", **H("math", "calculus-and-modeling"),
        params={"t": PIPES, "w": [0, 1]},
        derived=lambda p: {"a": p.t[0], "b": p.t[1], "obj_ru": ["бассейн", "резервуар"][p.w], "obj_kk": ["бассейнді", "резервуарды"][p.w]},
        answer=lambda p: p.t[0] * p.t[1] / (p.t[0] + p.t[1]),
        distractors=[lambda p: (p.t[0] + p.t[1]) / 2, lambda p: abs(p.t[0] - p.t[1]), lambda p: p.t[0] + p.t[1]],
        decimals=2, unit="ч",
        text={"ru": "Первая труба наполняет [[obj_ru]] за $[[a]]$ ч, вторая — за $[[b]]$ ч. За сколько часов наполнят [[obj_ru]] обе трубы вместе?",
              "kk": "Бірінші құбыр [[obj_kk]] $[[a]]$ сағатта, екіншісі $[[b]]$ сағатта толтырады. Екі құбыр бірге [[obj_kk]] неше сағатта толтырады?"},
        solution={"ru": "Производительности складываются: $\\frac{1}{[[a]]} + \\frac{1}{[[b]]}$ в час. Время $t = \\frac{[[a]] \\cdot [[b]]}{[[a]] + [[b]]} = [[ans]]$ ч.",
                  "kk": "Өнімділіктер қосылады: сағатына $\\frac{1}{[[a]]} + \\frac{1}{[[b]]}$. Уақыт $t = \\frac{[[a]] \\cdot [[b]]}{[[a]] + [[b]]} = [[ans]]$ сағ."},
        unit_kk="сағ", variants=14,
    ),
    Template(
        id="math.hard.abs-ineq-count", **H("math", "inequalities", "medium"),
        params={"a": range(-6, 9), "b": [2, 3, 4, 5, 7]},
        derived=lambda p: {"A": f"- {p.a}" if p.a >= 0 else f"+ {-p.a}", "lo": p.a - p.b, "hi": p.a + p.b},
        where=lambda p: p.a != 0,
        answer=lambda p: 2 * p.b + 1,
        distractors=[lambda p: 2 * p.b, lambda p: 2 * p.b - 1, lambda p: p.b + 1],
        decimals=0, spread=None,
        text={"ru": "Сколько целых решений имеет неравенство $|x [[A]]| \\le [[b]]$?", "kk": "$|x [[A]]| \\le [[b]]$ теңсіздігінің неше бүтін шешімі бар?"},
        solution={"ru": "$-[[b]] \\le x [[A]] \\le [[b]]$, то есть $[[lo]] \\le x \\le [[hi]]$. Целых чисел на отрезке: $[[hi]] - ([[lo]]) + 1 = [[ans]]$.",
                  "kk": "$-[[b]] \\le x [[A]] \\le [[b]]$, яғни $[[lo]] \\le x \\le [[hi]]$. Кесіндідегі бүтін сандар: $[[hi]] - ([[lo]]) + 1 = [[ans]]$."},
    ),
    Template(
        id="math.hard.integral-area", **H("math", "calculus-and-modeling"),
        params={"a": [1, 2, 3, 4, 5, 6], "k": [1, 2, 3]},
        derived=lambda p: {"K": "" if p.k == 1 else str(p.k)},
        answer=lambda p: frac(Fraction(p.k * p.a**3, 3)),
        distractors=[lambda p: frac(Fraction(p.k * p.a**2, 2)), lambda p: frac(Fraction(p.k * p.a**3, 1)), lambda p: frac(Fraction(2 * p.k * p.a, 1))],
        text={"ru": "Найдите площадь фигуры, ограниченной графиком $y = [[K]]x^2$, осью $Ox$ и прямой $x = [[a]]$.",
              "kk": "$y = [[K]]x^2$ графигімен, $Ox$ осімен және $x = [[a]]$ түзуімен шектелген фигураның ауданын табыңыз."},
        solution={"ru": "$S = \\int_0^{[[a]]} [[K]]x^2\\,dx = [[K]]\\frac{x^3}{3}\\Big|_0^{[[a]]}$, ответ: [[ans]]. Ловушка: $2x$ — производная, а не первообразная.",
                  "kk": "$S = \\int_0^{[[a]]} [[K]]x^2\\,dx = [[K]]\\frac{x^3}{3}\\Big|_0^{[[a]]}$, жауабы: [[ans]]. Абай болыңыз: $2x$ — туынды, алғашқы функция емес."},
    ),
    # ---------- Физика ----------
    Template(
        id="phys.hard.inelastic", **H("physics", "conservation-laws"),
        params={"m1": [1, 2, 3, 4, 5], "m2": [1, 2, 3, 4, 6], "v1": [2, 3, 4, 5, 6, 10]},
        answer=lambda p: p.m1 * p.v1 / (p.m1 + p.m2),
        distractors=[lambda p: p.v1 / 2, lambda p: p.m1 * p.v1 / p.m2, lambda p: p.m2 * p.v1 / (p.m1 + p.m2)],
        decimals=2, unit="м/с",
        text={"ru": "Тележка массой $[[m1]]$ кг, движущаяся со скоростью $[[v1]]$ м/с, сцепляется с неподвижной тележкой массой $[[m2]]$ кг. Найдите скорость тележек после сцепки.",
              "kk": "$[[v1]]$ м/с жылдамдықпен қозғалған массасы $[[m1]]$ кг арба массасы $[[m2]]$ кг тыныш тұрған арбамен тіркеседі. Тіркескеннен кейінгі арбалардың жылдамдығын табыңыз."},
        solution={"ru": "Импульс сохраняется: $m_1v_1 = (m_1 + m_2)v$, $v = \\frac{[[m1]] \\cdot [[v1]]}{[[m1]] + [[m2]]} = [[ans]]$ м/с.",
                  "kk": "Импульс сақталады: $m_1v_1 = (m_1 + m_2)v$, $v = \\frac{[[m1]] \\cdot [[v1]]}{[[m1]] + [[m2]]} = [[ans]]$ м/с."},
    ),
    Template(
        id="phys.hard.gas-law", **H("physics", "gas-laws"),
        params={"p1": [100, 150, 200, 300], "V1": [2, 4, 6, 10], "T1": [300, 400], "V2": [1, 2, 3, 5], "T2": [300, 450, 600]},
        where=lambda p: p.V2 != p.V1,
        answer=lambda p: p.p1 * p.V1 * p.T2 / (p.T1 * p.V2),
        distractors=[lambda p: p.p1 * p.V1 / p.V2, lambda p: p.p1 * p.V2 * p.T2 / (p.T1 * p.V1), lambda p: p.p1 * p.T2 / p.T1],
        decimals=2, unit="кПа",
        text={"ru": "Газ занимал объём $[[V1]]$ л при давлении $[[p1]]$ кПа и температуре $[[T1]]$ К. Каким станет давление при объёме $[[V2]]$ л и температуре $[[T2]]$ К? Масса газа не меняется.",
              "kk": "Газ $[[p1]]$ кПа қысымда және $[[T1]]$ К температурада $[[V1]]$ л көлем алып тұрды. $[[V2]]$ л көлем мен $[[T2]]$ К температурада қысым қандай болады? Газдың массасы өзгермейді."},
        solution={"ru": "Объединённый газовый закон: $\\frac{p_1V_1}{T_1} = \\frac{p_2V_2}{T_2}$, $p_2 = \\frac{[[p1]] \\cdot [[V1]] \\cdot [[T2]]}{[[T1]] \\cdot [[V2]]} = [[ans]]$ кПа.",
                  "kk": "Біріккен газ заңы: $\\frac{p_1V_1}{T_1} = \\frac{p_2V_2}{T_2}$, $p_2 = \\frac{[[p1]] \\cdot [[V1]] \\cdot [[T2]]}{[[T1]] \\cdot [[V2]]} = [[ans]]$ кПа."},
    ),
    Template(
        id="phys.hard.photoeffect-ev", **H("physics", "atomic-and-quantum-physics"),
        params={"E": [3, 3.5, 4, 4.5, 5, 6], "A": [1.8, 2, 2.2, 2.5, 3, 4.5]},
        where=lambda p: p.E > p.A,
        answer=lambda p: round(p.E - p.A, 2),
        distractors=[lambda p: p.E + p.A, lambda p: p.E, lambda p: round(p.A - p.E + 2 * p.A, 2) if round(p.A - p.E + 2 * p.A, 2) > 0 else p.A],
        decimals=2, unit="эВ",
        text={"ru": "Фотоны с энергией $[[E]]$ эВ падают на металл с работой выхода $[[A]]$ эВ. Найдите максимальную кинетическую энергию фотоэлектронов.",
              "kk": "Энергиясы $[[E]]$ эВ фотондар шығу жұмысы $[[A]]$ эВ металға түседі. Фотоэлектрондардың ең үлкен кинетикалық энергиясын табыңыз."},
        solution={"ru": "Уравнение Эйнштейна: $h\\nu = A + E_k$, $E_k = [[E]] - [[A]] = [[ans]]$ эВ.",
                  "kk": "Эйнштейн теңдеуі: $h\\nu = A + E_k$, $E_k = [[E]] - [[A]] = [[ans]]$ эВ."},
    ),
    Template(
        id="phys.hard.float-fraction", **H("physics", "fluid-gas-mechanics"),
        params={"rho": [400, 500, 600, 700, 800, 900], "V": [0.2, 0.5, 1, 2, 4]},
        answer=lambda p: p.rho * p.V / 1000,
        distractors=[lambda p: p.V - p.rho * p.V / 1000, lambda p: p.V, lambda p: 1000 * p.V / p.rho],
        decimals=3, unit="м³",
        text={"ru": "Деревянный брус объёмом $[[V]]$ м³ и плотностью $[[rho]]$ кг/м³ плавает в воде. Найдите объём погружённой части. Плотность воды $1000$ кг/м³.",
              "kk": "Көлемі $[[V]]$ м³, тығыздығы $[[rho]]$ кг/м³ ағаш білеу суда жүзеді. Батқан бөлігінің көлемін табыңыз. Судың тығыздығы $1000$ кг/м³."},
        solution={"ru": "Плавание: $F_A = mg$, $\\rho_{\\text{в}} g V_{\\text{погр}} = \\rho V g$, $V_{\\text{погр}} = \\frac{[[rho]]}{1000} \\cdot [[V]] = [[ans]]$ м³.",
                  "kk": "Жүзу: $F_A = mg$, $\\rho_{\\text{су}} g V_{\\text{бат}} = \\rho V g$, $V_{\\text{бат}} = \\frac{[[rho]]}{1000} \\cdot [[V]] = [[ans]]$ м³."},
    ),
    Template(
        id="phys.hard.ice-to-water", **H("physics", "thermodynamics"),
        params={"m": [0.2, 0.5, 1, 2], "t": [10, 20, 30, 40, 50]},
        answer=lambda p: (330000 * p.m + 4200 * p.m * p.t) / 1000,
        distractors=[lambda p: 330000 * p.m / 1000, lambda p: 4200 * p.m * p.t / 1000, lambda p: (330000 * p.m + 2100 * p.m * p.t) / 1000],
        decimals=1, unit="кДж",
        text={"ru": "Сколько теплоты нужно, чтобы $[[m]]$ кг льда при $0$ °C превратить в воду при $[[t]]$ °C? $\\lambda = 330$ кДж/кг, $c_{\\text{в}} = 4200$ Дж/(кг·°C).",
              "kk": "$0$ °C температурадағы $[[m]]$ кг мұзды $[[t]]$ °C суға айналдыру үшін қанша жылу керек? $\\lambda = 330$ кДж/кг, $c_{\\text{су}} = 4200$ Дж/(кг·°C)."},
        solution={"ru": "Два этапа: плавление $Q_1 = \\lambda m$ и нагрев воды $Q_2 = cm\\Delta t$. $Q = 330 \\cdot [[m]] + 4{,}2 \\cdot [[m]] \\cdot [[t]] = [[ans]]$ кДж.",
                  "kk": "Екі кезең: балқу $Q_1 = \\lambda m$ және суды қыздыру $Q_2 = cm\\Delta t$. $Q = 330 \\cdot [[m]] + 4{,}2 \\cdot [[m]] \\cdot [[t]] = [[ans]]$ кДж."},
    ),
]
