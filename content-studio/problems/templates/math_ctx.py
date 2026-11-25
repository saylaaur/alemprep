"""Математика · контекстные блоки (ЕНТ 26–30) и задачи с рисунками.
Казахский текст — черновик, нужна вычитка носителем языка."""
from fractions import Fraction

from ctx import Q
from engine import Context, Template, frac, pi_ans
from figures import cone, right_triangle

_BASE = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29)]
# Пифагоровы тройки и их кратные, обе ориентации катетов
TRIPLES = sorted({(a * k, b * k, c * k) for a, b, c in _BASE for k in (1, 2, 3, 4) if c * k <= 60}
                 | {(b * k, a * k, c * k) for a, b, c in _BASE for k in (1, 2, 3, 4) if c * k <= 60})


def T(topic: str, level: str = "medium") -> dict:
    return dict(subject="math", topic=topic, level=level)


def _tri(p):
    return dict(zip("abc", p.tr))


CONTEXTS = [
    Context(
        id="math.ctx.shop-discount", **T("calculus-and-modeling"),
        params={"price": [8000, 12000, 15000, 20000, 24000, 30000], "d": [10, 20, 25, 30, 40], "up": [10, 20, 25, 50]},
        derived=lambda p: {"after": p.price * (100 - p.d) // 100, "final": p.price * (100 - p.d) * (100 + p.up) // 10000},
        where=lambda p: p.price * (100 - p.d) * (100 + p.up) % 10000 == 0 and p.d != p.up,
        context={
            "ru": "В магазине «Алем» куртка стоила $[[price]]$ тенге. В ноябре на неё сделали скидку $[[d]]\\%$, а в декабре новую цену повысили на $[[up]]\\%$.",
            "kk": "«Алем» дүкенінде күртеше $[[price]]$ теңге тұрды. Қарашада оған $[[d]]\\%$ жеңілдік жасалды, ал желтоқсанда жаңа баға $[[up]]\\%$-ға көтерілді.",
        },
        questions=[
            Q("Сколько стоила куртка в ноябре?", "Қарашада күртеше қанша тұрды?",
              lambda p: p.after, [lambda p: p.price * p.d // 100, lambda p: p.price - p.price * p.d // 1000, lambda p: p.price * (100 + p.d) // 100],
              "$[[price]] \\cdot (1 - [[d]]/100) = [[ans]]$ тенге.", "$[[price]] \\cdot (1 - [[d]]/100) = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("Сколько тенге сэкономил покупатель в ноябре?", "Қарашада сатып алушы қанша теңге үнемдеді?",
              lambda p: p.price * p.d // 100, [lambda p: p.after, lambda p: p.d * 100, lambda p: p.price * p.d // 1000],
              "$[[price]] \\cdot [[d]]/100 = [[ans]]$ тенге.", "$[[price]] \\cdot [[d]]/100 = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("Сколько стоила куртка в декабре?", "Желтоқсанда күртеше қанша тұрды?",
              lambda p: p.final, [lambda p: p.price * (100 - p.d + p.up) // 100, lambda p: p.after + p.up * 100, lambda p: p.price * (100 + p.up) // 100],
              "Повышение считается от ноябрьской цены: $[[after]] \\cdot (1 + [[up]]/100) = [[ans]]$ тенге.",
              "Көтеру қарашадағы бағадан есептеледі: $[[after]] \\cdot (1 + [[up]]/100) = [[ans]]$ теңге.", decimals=0, unit="тенге", unit_kk="теңге"),
            Q("На сколько процентов декабрьская цена отличается от первоначальной (по модулю)?", "Желтоқсандағы баға бастапқыдан неше пайызға өзгеше (модулі бойынша)?",
              lambda p: abs(p.final - p.price) * 100 / p.price, [lambda p: abs(p.up - p.d), lambda p: p.d + p.up, lambda p: abs(p.final - p.price) * 100 / p.after],
              "$\\frac{|[[final]] - [[price]]|}{[[price]]} \\cdot 100\\% = [[ans]]\\%$. Проценты нельзя просто вычитать: они берутся от разных чисел.",
              "$\\frac{|[[final]] - [[price]]|}{[[price]]} \\cdot 100\\% = [[ans]]\\%$. Пайыздарды жай азайтуға болмайды: олар әртүрлі сандардан алынады.", decimals=2, unit="%"),
            Q("Какую часть первоначальной цены составляет декабрьская? Ответ дайте десятичной дробью.", "Желтоқсандағы баға бастапқы бағаның қандай бөлігін құрайды? Жауабын ондық бөлшекпен беріңіз.",
              lambda p: p.final / p.price, [lambda p: (100 - p.d + p.up) / 100, lambda p: p.price / p.final, lambda p: (100 - p.d) / 100],
              "$\\frac{[[final]]}{[[price]]} = (1 - [[d]]/100)(1 + [[up]]/100) = [[ans]]$.", "$\\frac{[[final]]}{[[price]]} = (1 - [[d]]/100)(1 + [[up]]/100) = [[ans]]$.", decimals=4),
        ],
        variants=10,
    ),
    Context(
        id="math.ctx.right-triangle", **T("metric-relations-plane"),
        params={"tr": TRIPLES},
        derived=_tri,
        figure=lambda p: right_triangle(f"a = {p.tr[0]}", f"b = {p.tr[1]}", "c", "α", p.tr[0] / p.tr[1]),
        context={
            "ru": "В прямоугольном треугольнике катеты $a = [[a]]$ и $b = [[b]]$ (см. рисунок). Угол $\\alpha$ лежит против катета $a$.",
            "kk": "Тікбұрышты үшбұрыштың катеттері $a = [[a]]$ және $b = [[b]]$ (суретті қараңыз). $\\alpha$ бұрышы $a$ катетіне қарсы жатыр.",
        },
        questions=[
            Q("Найдите гипотенузу $c$.", "$c$ гипотенузасын табыңыз.",
              lambda p: p.c, [lambda p: p.a + p.b, lambda p: p.c * p.c, lambda p: p.b - p.a + p.c],
              "$c = \\sqrt{[[a]]^2 + [[b]]^2} = [[ans]]$.", "$c = \\sqrt{[[a]]^2 + [[b]]^2} = [[ans]]$.", decimals=0),
            Q("Найдите площадь треугольника.", "Үшбұрыштың ауданын табыңыз.",
              lambda p: p.a * p.b / 2, [lambda p: p.a * p.b, lambda p: p.a * p.c / 2, lambda p: (p.a + p.b + p.c) / 2],
              "$S = \\frac{ab}{2} = \\frac{[[a]] \\cdot [[b]]}{2} = [[ans]]$.", "$S = \\frac{ab}{2} = \\frac{[[a]] \\cdot [[b]]}{2} = [[ans]]$.", decimals=1),
            Q("Найдите $\\sin\\alpha$.", "$\\sin\\alpha$ табыңыз.",
              lambda p: p.a / p.c, [lambda p: p.b / p.c, lambda p: p.a / p.b, lambda p: p.c / p.a],
              "Синус — противолежащий катет к гипотенузе: $\\sin\\alpha = \\frac{[[a]]}{[[c]]} = [[ans]]$.",
              "Синус — қарсы катеттің гипотенузаға қатынасы: $\\sin\\alpha = \\frac{[[a]]}{[[c]]} = [[ans]]$.", decimals=4),
            Q("Найдите радиус окружности, описанной около треугольника.", "Үшбұрышқа сырттай сызылған шеңбердің радиусын табыңыз.",
              lambda p: p.c / 2, [lambda p: p.c, lambda p: (p.a + p.b - p.c) / 2, lambda p: p.a * p.b / p.c],
              "Центр описанной окружности — середина гипотенузы: $R = \\frac{c}{2} = [[ans]]$.", "Сырттай сызылған шеңбердің центрі — гипотенузаның ортасы: $R = \\frac{c}{2} = [[ans]]$.", decimals=1),
            Q("Найдите радиус вписанной окружности.", "Іштей сызылған шеңбердің радиусын табыңыз.",
              lambda p: (p.a + p.b - p.c) / 2, [lambda p: p.c / 2, lambda p: (p.a + p.b + p.c) / 2, lambda p: p.a * p.b / (p.a + p.b + p.c)],
              "Для прямоугольного треугольника $r = \\frac{a + b - c}{2} = \\frac{[[a]] + [[b]] - [[c]]}{2} = [[ans]]$.",
              "Тікбұрышты үшбұрыш үшін $r = \\frac{a + b - c}{2} = \\frac{[[a]] + [[b]] - [[c]]}{2} = [[ans]]$.", decimals=1),
        ],
        variants=9,
    ),
    Context(
        id="math.ctx.cone", **T("metric-relations-space"),
        params={"tr": TRIPLES},
        derived=lambda p: {"r": p.tr[0], "h": p.tr[1], "l": p.tr[2]},
        figure=lambda p: cone(f"r = {p.tr[0]}", f"h = {p.tr[1]}", "l"),
        context={
            "ru": "Радиус основания конуса $r = [[r]]$, высота $h = [[h]]$ (см. рисунок).",
            "kk": "Конус табанының радиусы $r = [[r]]$, биіктігі $h = [[h]]$ (суретті қараңыз).",
        },
        questions=[
            Q("Найдите образующую конуса $l$.", "Конустың $l$ жасаушысын табыңыз.",
              lambda p: p.l, [lambda p: p.r + p.h, lambda p: abs(p.h - p.r) or p.l + 1, lambda p: p.l * 2],
              "Образующая, высота и радиус образуют прямоугольный треугольник: $l = \\sqrt{[[r]]^2 + [[h]]^2} = [[ans]]$.",
              "Жасаушы, биіктік және радиус тікбұрышты үшбұрыш құрайды: $l = \\sqrt{[[r]]^2 + [[h]]^2} = [[ans]]$.", decimals=0),
            Q("Найдите объём конуса.", "Конустың көлемін табыңыз.",
              lambda p: pi_ans(Fraction(p.r**2 * p.h, 3)), [lambda p: pi_ans(p.r**2 * p.h), lambda p: pi_ans(Fraction(p.r * p.h, 3)), lambda p: pi_ans(Fraction(p.r**2 * p.l, 3))],
              "$V = \\frac{1}{3}\\pi r^2 h = \\frac{1}{3}\\pi \\cdot [[r]]^2 \\cdot [[h]]$, ответ: [[ans]].", "$V = \\frac{1}{3}\\pi r^2 h = \\frac{1}{3}\\pi \\cdot [[r]]^2 \\cdot [[h]]$, жауабы: [[ans]]."),
            Q("Найдите площадь боковой поверхности конуса.", "Конустың бүйір бетінің ауданын табыңыз.",
              lambda p: pi_ans(p.r * p.l), [lambda p: pi_ans(p.r * p.h), lambda p: pi_ans(2 * p.r * p.l), lambda p: pi_ans(p.r**2)],
              "$S_{\\text{бок}} = \\pi r l = \\pi \\cdot [[r]] \\cdot [[l]]$, ответ: [[ans]].", "$S_{\\text{бүйір}} = \\pi r l = \\pi \\cdot [[r]] \\cdot [[l]]$, жауабы: [[ans]]."),
            Q("Найдите площадь полной поверхности конуса.", "Конустың толық бетінің ауданын табыңыз.",
              lambda p: pi_ans(p.r * p.l + p.r**2), [lambda p: pi_ans(p.r * p.l), lambda p: pi_ans(p.r * p.l + 2 * p.r**2), lambda p: pi_ans(p.r * p.h + p.r**2)],
              "$S = \\pi r l + \\pi r^2 = \\pi r(l + r)$, ответ: [[ans]].", "$S = \\pi r l + \\pi r^2 = \\pi r(l + r)$, жауабы: [[ans]]."),
            Q("Чему равен тангенс угла между образующей и плоскостью основания?", "Жасаушы мен табан жазықтығы арасындағы бұрыштың тангенсі неге тең?",
              lambda p: frac(Fraction(p.h, p.r)), [lambda p: frac(Fraction(p.r, p.h)), lambda p: frac(Fraction(p.h, p.l)), lambda p: frac(Fraction(p.r, p.l))],
              "Угол при основании: противолежащий катет — высота, прилежащий — радиус: $\\operatorname{tg}\\varphi = \\frac{h}{r}$.",
              "Табандағы бұрыш: қарсы катет — биіктік, іргелес — радиус: $\\operatorname{tg}\\varphi = \\frac{h}{r}$."),
        ],
        variants=9,
    ),
    Context(
        id="math.ctx.parabola", **T("calculus-and-modeling"),
        params={"x1": range(-5, 6), "x2": range(-5, 8)},
        derived=lambda p: {"s": p.x1 + p.x2, "q": p.x1 * p.x2, "S": ("- " + str(p.x1 + p.x2)) if p.x1 + p.x2 >= 0 else ("+ " + str(-(p.x1 + p.x2))),
                           "Qs": ("+ " + str(p.x1 * p.x2)) if p.x1 * p.x2 >= 0 else ("- " + str(-(p.x1 * p.x2)))},
        where=lambda p: p.x1 < p.x2 and (p.x1 + p.x2) % 2 == 0 and p.x1 * p.x2 != 0 and p.x1 + p.x2 != 0,
        context={
            "ru": "Дана функция $f(x) = x^2 [[S]]x [[Qs]]$.",
            "kk": "$f(x) = x^2 [[S]]x [[Qs]]$ функциясы берілген.",
        },
        questions=[
            Q("Найдите абсциссу вершины параболы.", "Парабола төбесінің абсциссасын табыңыз.",
              lambda p: p.s // 2, [lambda p: -p.s // 2, lambda p: p.s, lambda p: p.q],
              "$x_0 = -\\frac{b}{2a} = \\frac{[[s]]}{2} = [[ans]]$.", "$x_0 = -\\frac{b}{2a} = \\frac{[[s]]}{2} = [[ans]]$.", decimals=0),
            Q("Найдите наименьшее значение функции.", "Функцияның ең кіші мәнін табыңыз.",
              lambda p: p.q - (p.s // 2) ** 2, [lambda p: p.q, lambda p: (p.s // 2) ** 2, lambda p: p.q + (p.s // 2) ** 2],
              "Наименьшее значение — в вершине: $f([[s]]/2) = [[ans]]$ (ветви вверх).", "Ең кіші мән — төбеде: $f([[s]]/2) = [[ans]]$ (тармақтары жоғары).", decimals=0),
            Q("Найдите больший нуль функции.", "Функцияның үлкен нөлін табыңыз.",
              lambda p: p.x2, [lambda p: p.x1, lambda p: -p.x2, lambda p: p.s],
              "По теореме Виета корни $[[x1]]$ и $[[x2]]$; больший — $[[ans]]$.", "Виет теоремасы бойынша түбірлері $[[x1]]$ және $[[x2]]$; үлкені — $[[ans]]$.", decimals=0),
            Q("Найдите $f(0)$.", "$f(0)$ табыңыз.",
              lambda p: p.q, [lambda p: -p.q, lambda p: p.s, lambda p: 0],
              "$f(0)$ — свободный член: $[[ans]]$. Это точка пересечения графика с осью $Oy$.", "$f(0)$ — бос мүше: $[[ans]]$. Бұл графиктің $Oy$ осімен қиылысу нүктесі.", decimals=0),
            Q("Сколько целых решений имеет неравенство $f(x) < 0$?", "$f(x) < 0$ теңсіздігінің неше бүтін шешімі бар?",
              lambda p: p.x2 - p.x1 - 1, [lambda p: p.x2 - p.x1 + 1, lambda p: p.x2 - p.x1, lambda p: 2],
              "$f(x) < 0$ между корнями: $([[x1]]; [[x2]])$. Целых чисел строго между ними $[[x2]] - ([[x1]]) - 1 = [[ans]]$.",
              "$f(x) < 0$ түбірлер арасында: $([[x1]]; [[x2]])$. Олардың арасында қатаң $[[x2]] - ([[x1]]) - 1 = [[ans]]$ бүтін сан бар.", decimals=0),
        ],
        variants=10,
    ),
]


TEMPLATES = [
    Template(
        id="math.fig.triangle-cos", **T("metric-relations-plane", "easy"),
        params={"tr": TRIPLES}, derived=_tri,
        figure=lambda p: right_triangle(f"{p.tr[0]}", f"{p.tr[1]}", f"{p.tr[2]}", "α", p.tr[0] / p.tr[1]),
        answer=lambda p: frac(Fraction(p.tr[1], p.tr[2])),
        distractors=[lambda p: frac(Fraction(p.tr[0], p.tr[2])), lambda p: frac(Fraction(p.tr[0], p.tr[1])), lambda p: frac(Fraction(p.tr[1], p.tr[0]))],
        text={"ru": "По рисунку найдите $\\cos\\alpha$.", "kk": "Сурет бойынша $\\cos\\alpha$ табыңыз."},
        solution={"ru": "Косинус — прилежащий катет к гипотенузе: $\\cos\\alpha = \\frac{[[b]]}{[[c]]}$, ответ [[ans]].",
                  "kk": "Косинус — іргелес катеттің гипотенузаға қатынасы: $\\cos\\alpha = \\frac{[[b]]}{[[c]]}$, жауабы [[ans]]."},
    ),
    Template(
        id="math.fig.triangle-tan", **T("trigonometry", "easy"),
        params={"tr": TRIPLES}, derived=_tri,
        figure=lambda p: right_triangle(f"{p.tr[0]}", f"{p.tr[1]}", f"{p.tr[2]}", "α", p.tr[0] / p.tr[1]),
        answer=lambda p: frac(Fraction(p.tr[0], p.tr[1])),
        distractors=[lambda p: frac(Fraction(p.tr[1], p.tr[0])), lambda p: frac(Fraction(p.tr[0], p.tr[2])), lambda p: frac(Fraction(p.tr[1], p.tr[2]))],
        text={"ru": "По рисунку найдите $\\operatorname{tg}\\alpha$.", "kk": "Сурет бойынша $\\operatorname{tg}\\alpha$ табыңыз."},
        solution={"ru": "Тангенс — противолежащий катет к прилежащему: $\\operatorname{tg}\\alpha = \\frac{[[a]]}{[[b]]}$, ответ [[ans]].",
                  "kk": "Тангенс — қарсы катеттің іргелес катетке қатынасы: $\\operatorname{tg}\\alpha = \\frac{[[a]]}{[[b]]}$, жауабы [[ans]]."},
    ),
]
