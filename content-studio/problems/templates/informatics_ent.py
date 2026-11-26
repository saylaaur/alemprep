"""Информатика · задачи в формате ЕНТ с параметрами: трассировка кода Python, SQL по таблице, Excel,
объём изображений/звука, передача данных, IP-адреса, системы счисления.
Правильные ответы для кода получаются запуском кода; неверные — запуском того же кода с типичной ошибкой.
Казахский текст — черновик, нужна вычитка носителем языка."""
import contextlib
import io

from engine import Template


def run(code: str) -> str:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(code, {})  # код собран в этом файле из чисел-параметров
    return buf.getvalue().strip().replace("\n", " ")


def T(topic: str, level: str = "medium") -> dict:
    return dict(subject="informatics", topic=topic, level=level)


Q_RUN = {"ru": "Что выведет программа?\n\n```python\n[[code]]\n```", "kk": "Бағдарлама не шығарады?\n\n```python\n[[code]]\n```"}


def code_tpl(id_, topic, level, params, make, wrong_makers, sol_ru, sol_kk, where=lambda p: True, variants=40):
    """make(p) → код; wrong_makers — функции p → код с типичной ошибкой (его вывод — неверный вариант)."""
    return Template(
        id=f"inf.e.{id_}", **T(topic, level), params=params, where=where,
        derived=lambda p: {"code": make(p)},
        answer=lambda p: run(make(p)),
        distractors=[(lambda p, w=w: run(w(p))) for w in wrong_makers],
        text=Q_RUN, solution={"ru": sol_ru, "kk": sol_kk}, variants=variants,
    )


def table(head: list[str], rows: list[list]) -> str:
    w = [max(len(str(x)) for x in col) for col in zip(head, *rows)]
    fmt_row = lambda r: " | ".join(str(x).ljust(n) for x, n in zip(r, w))
    return "\n".join([fmt_row(head), "-+-".join("-" * n for n in w), *map(fmt_row, rows)])


NAMES = ["Алия", "Данияр", "Ерлан", "Жанна", "Мадина", "Нурлан", "Айгерим", "Тимур"]
CLASSES = ["10А", "10Б", "11А"]


def pupils(seed: int) -> list[list]:
    import random
    r = random.Random(seed)
    return [[i + 1, NAMES[i], r.choice(CLASSES), r.randrange(60, 141, 5)] for i in range(6)]


TEMPLATES = [
    # ---------- Python: циклы и условия ----------
    code_tpl("py.sum-mod", "python-programming", "medium",
             {"a": [1, 2, 3, 5], "b": [10, 12, 15, 20], "k": [2, 3, 4, 5], "r": [0, 1]},
             lambda p: f"s = 0\nfor i in range({p.a}, {p.b}):\n    if i % {p.k} == {p.r}:\n        s += i\nprint(s)",
             [lambda p: f"s = 0\nfor i in range({p.a}, {p.b} + 1):\n    if i % {p.k} == {p.r}:\n        s += i\nprint(s)",
              lambda p: f"s = 0\nfor i in range({p.a}, {p.b}):\n    if i % {p.k} != {p.r}:\n        s += i\nprint(s)",
              lambda p: f"s = 0\nfor i in range({p.a}, {p.b}):\n    if i % {p.k} == {p.r}:\n        s += 1\nprint(s)"],
             "`range` не включает правую границу. Складываем только числа с нужным остатком от деления.",
             "`range` оң шекараны қамтымайды. Тек бөлгендегі қалдығы керекті сандарды қосамыз.",
             where=lambda p: p.r < p.k),
    code_tpl("py.digit-sum", "python-programming", "medium",
             {"n": [1234, 2025, 3071, 4589, 5603, 7777, 8102, 9348, 1590, 2718, 3141, 6084]},
             lambda p: f"n = {p.n}\ns = 0\nwhile n > 0:\n    s += n % 10\n    n //= 10\nprint(s)",
             [lambda p: f"n = {p.n}\ns = 0\nwhile n > 0:\n    s += 1\n    n //= 10\nprint(s)",
              lambda p: f"n = {p.n}\ns = 0\nwhile n > 10:\n    s += n % 10\n    n //= 10\nprint(s)",
              lambda p: f"print({p.n} % 10 + {p.n} // 1000)"],
             "`n % 10` — последняя цифра, `n //= 10` — отбрасываем её. Цикл складывает все цифры числа.",
             "`n % 10` — соңғы цифр, `n //= 10` — оны алып тастаймыз. Цикл санның барлық цифрларын қосады.",
             variants=12),
    code_tpl("py.reverse-number", "python-programming", "hard",
             {"n": [1234, 2025, 3071, 4589, 5603, 8102, 9348, 1590, 2718, 3141, 6084, 1203]},
             lambda p: f"n = {p.n}\nr = 0\nwhile n > 0:\n    r = r * 10 + n % 10\n    n //= 10\nprint(r)",
             [lambda p: f"print({p.n})",
              lambda p: f"n = {p.n}\nr = 0\nwhile n > 0:\n    r = r + n % 10\n    n //= 10\nprint(r)",
              lambda p: f"print(int(str({p.n})[::-1]) * 10)"],
             "Цикл переписывает цифры в обратном порядке; ведущий ноль у числа пропадает (например, 3071 → 1703).",
             "Цикл цифрларды кері ретпен жазады; санның алдыңғы нөлі жоғалады (мысалы, 3071 → 1703).",
             variants=12),
    code_tpl("py.list-ops", "python-programming", "medium",
             {"a": [3, 5, 7], "b": [2, 4, 8], "c": [1, 6, 9], "x": [10, 12, 15], "i": [0, 1, 2]},
             lambda p: f"a = [{p.a}, {p.b}, {p.c}]\na.append({p.x})\na.pop({p.i})\nprint(sum(a))",
             [lambda p: f"print({p.a} + {p.b} + {p.c} + {p.x})",
              lambda p: f"a = [{p.a}, {p.b}, {p.c}, {p.x}]\na.pop({p.i} + 1)\nprint(sum(a))",
              lambda p: f"a = [{p.a}, {p.b}, {p.c}]\na.pop({p.i})\nprint(sum(a))"],
             "`append` добавляет элемент в конец, `pop(i)` удаляет элемент с индексом `i` (индексы с нуля).",
             "`append` элементті соңына қосады, `pop(i)` `i` индексті элементті жояды (индекстер нөлден).",
             where=lambda p: len({p.a, p.b, p.c}) == 3),
    code_tpl("py.slice-step", "python-programming", "medium",
             {"w": ["informatics", "programming", "algorithm", "computer", "variable"], "i": [1, 2], "j": [6, 7, 8], "s": [1, 2]},
             lambda p: f's = "{p.w}"\nprint(s[{p.i}:{p.j}:{p.s}])',
             [lambda p: f's = "{p.w}"\nprint(s[{p.i}:{p.j} + 1:{p.s}])',
              lambda p: f's = "{p.w}"\nprint(s[{p.i} - 1:{p.j}:{p.s}])',
              lambda p: f's = "{p.w}"\nprint(s[{p.i}:{p.j}])' if p.s == 2 else f's = "{p.w}"\nprint(s[{p.i}:{p.j}:2])'],
             "Срез `[начало:конец:шаг]`: индексы с нуля, конец не входит.",
             "`[басы:соңы:қадам]` қимасы: индекстер нөлден, соңы кірмейді."),
    code_tpl("py.function", "algorithms-and-programs", "medium",
             {"k": [2, 3], "b": [-1, 1, 2, 4], "n": [1, 2, 3, 5]},
             lambda p: f"def f(x):\n    return {p.k} * x {'+' if p.b > 0 else '-'} {abs(p.b)}\n\nprint(f(f({p.n})))",
             [lambda p: f"def f(x):\n    return {p.k} * x {'+' if p.b > 0 else '-'} {abs(p.b)}\n\nprint(f({p.n}))",
              lambda p: f"def f(x):\n    return {p.k} * x {'+' if p.b > 0 else '-'} {abs(p.b)}\n\nprint(f({p.n}) * 2)",
              lambda p: f"def f(x):\n    return {p.k} * x {'+' if p.b > 0 else '-'} {abs(p.b)}\n\nprint(f({p.n}) + {p.n})"],
             "Сначала вычисляется внутренний вызов `f(n)`, его результат подставляется во внешний.",
             "Алдымен ішкі `f(n)` шақыруы есептеледі, нәтижесі сыртқы шақыруға қойылады."),
    code_tpl("py.recursion", "algorithms-and-programs", "hard",
             {"n": [3, 4, 5, 6], "k": [1, 2, 3]},
             lambda p: f"def f(n):\n    if n <= 1:\n        return {p.k}\n    return f(n - 1) + n\n\nprint(f({p.n}))",
             [lambda p: f"def f(n):\n    if n <= 1:\n        return {p.k}\n    return f(n - 1) * n\n\nprint(f({p.n}))",
              lambda p: f"def f(n):\n    if n <= 0:\n        return {p.k}\n    return f(n - 1) + n\n\nprint(f({p.n}))",
              lambda p: f"print({p.n} + {p.k})"],
             "Разворачиваем вызовы: $f(n) = f(n - 1) + n$ до $f(1) = [[k]]$, затем складываем на обратном ходе: $f([[n]]) = [[k]] + 2 + \\dots + [[n]] = [[ans]]$.",
             "Шақыруларды ашамыз: $f(n) = f(n - 1) + n$, $f(1) = [[k]]$ болғанша, сосын кері жолда қосамыз: $f([[n]]) = [[k]] + 2 + \\dots + [[n]] = [[ans]]$."),
    code_tpl("py.max-index", "algorithms-and-programs", "medium",
             {"a": [3, 8, 1], "b": [9, 4, 6], "c": [2, 7, 5], "d": [10, 0, 11]},
             lambda p: f"a = [{p.a}, {p.b}, {p.c}, {p.d}]\nm = 0\nfor i in range(1, len(a)):\n    if a[i] > a[m]:\n        m = i\nprint(m)",
             [lambda p: f"a = [{p.a}, {p.b}, {p.c}, {p.d}]\nprint(max(a))",
              lambda p: f"a = [{p.a}, {p.b}, {p.c}, {p.d}]\nprint(a.index(max(a)) + 1)",
              lambda p: f"a = [{p.a}, {p.b}, {p.c}, {p.d}]\nprint(a.index(min(a)))"],
             "Программа ищет **индекс** наибольшего элемента (с нуля), а не само значение.",
             "Бағдарлама ең үлкен элементтің мәнін емес, **индексін** (нөлден) іздейді.",
             where=lambda p: len({p.a, p.b, p.c, p.d}) == 4),
    code_tpl("py.count-chars", "algorithms-and-programs", "easy",
             {"w": ["абракадабра", "информатика", "математика", "колокол", "барабан", "молоко"], "c": ["а", "о", "к", "м"]},
             lambda p: f's = "{p.w}"\nk = 0\nfor ch in s:\n    if ch == "{p.c}":\n        k += 1\nprint(k)',
             [lambda p: f'print(len("{p.w}"))', lambda p: f'print("{p.w}".count("{p.c}") + 1)', lambda p: f'print(len("{p.w}") - "{p.w}".count("{p.c}"))'],
             "Цикл проходит по символам строки и считает совпадения с заданной буквой.",
             "Цикл жолдың символдарын аралап, берілген әріппен сәйкестерін санайды.",
             where=lambda p: p.c in p.w),
    # ---------- Информация: изображения, звук, передача ----------
    Template(
        id="inf.e.image-colors", **T("information-representation", "medium"),
        params={"w": [128, 256, 512, 1024], "h": [128, 256, 512], "N": [4, 16, 256, 65536]},
        derived=lambda p: {"i": (p.N - 1).bit_length()},
        where=lambda p: p.w * p.h * (p.N - 1).bit_length() % 8192 == 0,
        answer=lambda p: p.w * p.h * (p.N - 1).bit_length() // 8192,
        distractors=[lambda p: p.w * p.h * p.N // 8192, lambda p: p.w * p.h * (p.N - 1).bit_length() // 1024,
                     lambda p: p.w * p.h // 8192 or 1, lambda p: p.w * p.h * (p.N - 1).bit_length() // 4096],
        decimals=0, unit="Кбайт",
        text={"ru": "Растровое изображение $[[w]] \\times [[h]]$ пикселей использует палитру из $[[N]]$ цветов. Сколько килобайт занимает изображение без сжатия?",
              "kk": "$[[w]] \\times [[h]]$ пиксельді растрлық кескін $[[N]]$ түсті палитраны пайдаланады. Сығусыз кескін неше килобайт алады?"},
        solution={"ru": "$N = 2^i$: $[[N]]$ цветов → $i = [[i]]$ бит. $I = [[w]] \\cdot [[h]] \\cdot [[i]]$ бит $= [[ans]]$ Кбайт (делим на $8 \\cdot 1024$).",
                  "kk": "$N = 2^i$: $[[N]]$ түс → $i = [[i]]$ бит. $I = [[w]] \\cdot [[h]] \\cdot [[i]]$ бит $= [[ans]]$ Кбайт ($8 \\cdot 1024$-ке бөлеміз)."},
    ),
    Template(
        id="inf.e.sound", **T("information-representation", "hard"),
        params={"f": [8, 16, 32, 64], "b": [8, 16, 24], "t": [16, 32, 60, 64, 128], "c": [1, 2]},
        where=lambda p: p.f * 1000 * p.b * p.t * p.c % (8 * 1024) == 0,
        answer=lambda p: p.f * 1000 * p.b * p.t * p.c // (8 * 1024),
        distractors=[lambda p: p.f * 1000 * p.b * p.t * p.c // 8000, lambda p: p.f * 1000 * p.b * p.t // (8 * 1024),
                     lambda p: p.f * p.b * p.t * p.c // 8, lambda p: p.f * 1000 * p.b * p.t * p.c * 2 // (8 * 1024)],
        decimals=0, unit="Кбайт", variants=30,
        text={"ru": "Звук записан с частотой дискретизации $[[f]]$ кГц и глубиной кодирования $[[b]]$ бит, каналов: $[[c]]$. Длительность $[[t]]$ с. Найдите объём файла без сжатия.",
              "kk": "Дыбыс $[[f]]$ кГц дискреттеу жиілігімен және $[[b]]$ бит кодтау тереңдігімен жазылған, арналар саны: $[[c]]$. Ұзақтығы $[[t]]$ с. Сығусыз файл көлемін табыңыз."},
        solution={"ru": "$I = \\nu \\cdot i \\cdot t \\cdot k = [[f]] \\cdot 1000 \\cdot [[b]] \\cdot [[t]] \\cdot [[c]]$ бит. Делим на $8 \\cdot 1024$: $[[ans]]$ Кбайт.",
                  "kk": "$I = \\nu \\cdot i \\cdot t \\cdot k = [[f]] \\cdot 1000 \\cdot [[b]] \\cdot [[t]] \\cdot [[c]]$ бит. $8 \\cdot 1024$-ке бөлеміз: $[[ans]]$ Кбайт."},
    ),
    Template(
        id="inf.e.transfer-time", **T("networks-and-security", "medium"),
        params={"mb": [1, 2, 4, 5, 8, 10, 16], "v": [256, 512, 1024, 2048]},
        where=lambda p: p.mb * 1024 * 1024 * 8 % (p.v * 1024) == 0,
        answer=lambda p: p.mb * 1024 * 1024 * 8 // (p.v * 1024),
        distractors=[lambda p: p.mb * 1024 * 1024 // (p.v * 1024), lambda p: p.mb * 1024 * 8 // p.v,
                     lambda p: p.mb * 1024 * 1024 * 8 // (p.v * 1024) * 2, lambda p: p.mb * 1000 * 8 // p.v],
        decimals=0, unit="с",
        text={"ru": "Файл размером $[[mb]]$ Мбайт передаётся по каналу со скоростью $[[v]]$ Кбит/с. Сколько секунд займёт передача?",
              "kk": "Көлемі $[[mb]]$ Мбайт файл жылдамдығы $[[v]]$ Кбит/с арна арқылы беріледі. Беру неше секундқа созылады?"},
        solution={"ru": "$[[mb]]$ Мбайт $= [[mb]] \\cdot 1024 \\cdot 8$ Кбит. $t = \\frac{I}{v} = [[ans]]$ с. Не забудьте: в байте 8 бит.",
                  "kk": "$[[mb]]$ Мбайт $= [[mb]] \\cdot 1024 \\cdot 8$ Кбит. $t = \\frac{I}{v} = [[ans]]$ с. Ұмытпаңыз: байтта 8 бит."},
    ),
    Template(
        id="inf.e.network-address", **T("networks-and-security", "hard"),
        params={"x": [37, 75, 113, 150, 200, 219, 245], "m": [128, 192, 224, 240, 248]},
        derived=lambda p: {"net": p.x & p.m, "bc": (p.x & p.m) | (255 - p.m)},
        answer=lambda p: f"192.168.5.{p.x & p.m}",
        distractors=[lambda p: f"192.168.5.{(p.x & p.m) | (255 - p.m)}", lambda p: f"192.168.5.{p.x}",
                     lambda p: f"192.168.5.{p.m}", lambda p: f"192.168.5.{p.x | p.m}"],
        text={"ru": "IP-адрес компьютера 192.168.5.[[x]], маска сети 255.255.255.[[m]]. Найдите адрес сети.",
              "kk": "Компьютердің IP-адресі 192.168.5.[[x]], желі маскасы 255.255.255.[[m]]. Желі адресін табыңыз."},
        solution={"ru": "Адрес сети — поразрядная конъюнкция IP и маски. Последний байт: $[[x]] \\land [[m]] = [[net]]$ (в двоичной записи оставляем биты, где у маски единицы).",
                  "kk": "Желі адресі — IP мен масканың разрядтық конъюнкциясы. Соңғы байт: $[[x]] \\land [[m]] = [[net]]$ (екілік жазуда маскада бірлік тұрған биттерді қалдырамыз)."},
    ),
    # ---------- Системы счисления ----------
    Template(
        id="inf.e.mixed-bases", **T("number-systems", "medium"),
        params={"a": [0o17, 0o25, 0o34, 0o47, 0o63, 0o71], "b": [0x1A, 0x2F, 0x3C, 0x4B, 0x5E]},
        derived=lambda p: {"ao": oct(p.a)[2:], "bh": hex(p.b)[2:].upper()},
        answer=lambda p: p.a + p.b,
        distractors=[lambda p: int(oct(p.a)[2:]) + int(hex(p.b)[2:], 10) if hex(p.b)[2:].isdigit() else int(oct(p.a)[2:]) + p.b,
                     lambda p: p.a + int(hex(p.b)[2:].upper().replace("A", "10")[:2], 10) if False else p.a + p.b - 6,
                     lambda p: int(oct(p.a)[2:], 16) + p.b, lambda p: p.a + p.b + 8],
        decimals=0,
        text={"ru": "Вычислите $[[ao]]_8 + [[bh]]_{16}$. Ответ запишите в десятичной системе.",
              "kk": "$[[ao]]_8 + [[bh]]_{16}$ өрнегін есептеңіз. Жауабын ондық жүйеде жазыңыз."},
        solution={"ru": "Переводим каждое число в десятичную: $[[ao]]_8 = [[a]]$, $[[bh]]_{16} = [[b]]$. Сумма: $[[ans]]$.",
                  "kk": "Әр санды ондыққа аударамыз: $[[ao]]_8 = [[a]]$, $[[bh]]_{16} = [[b]]$. Қосындысы: $[[ans]]$."},
    ),
    Template(
        id="inf.e.min-base", **T("number-systems", "easy"), variants=12,
        params={"d1": [1, 2, 3], "d2": [4, 5, 6, 7], "d3": [0, 1, 2, 3]},
        derived=lambda p: {"num": f"{p.d1}{p.d2}{p.d3}"},
        answer=lambda p: max(p.d1, p.d2, p.d3) + 1,
        distractors=[lambda p: max(p.d1, p.d2, p.d3), lambda p: max(p.d1, p.d2, p.d3) + 2, lambda p: 10 if max(p.d1, p.d2, p.d3) + 1 != 10 else 2],
        decimals=0,
        text={"ru": "Какое наименьшее основание может иметь система счисления, в которой записано число $[[num]]$?",
              "kk": "$[[num]]$ саны жазылған санау жүйесінің ең кіші негізі қандай болуы мүмкін?"},
        solution={"ru": "Все цифры меньше основания. Наибольшая цифра записи $[[ans]] - 1$, значит основание не меньше $[[ans]]$.",
                  "kk": "Барлық цифр негізден кіші. Жазудағы ең үлкен цифр $[[ans]] - 1$, демек негіз кемінде $[[ans]]$."},
    ),
    # ---------- Логика ----------
    Template(
        id="inf.e.logic-integers", **T("logic-foundations", "hard"),
        params={"a": [3, 5, 8, 10], "b": [12, 15, 20, 25], "c": [6, 7, 9, 14]},
        where=lambda p: p.a < p.c < p.b,
        answer=lambda p: sum(1 for x in range(1, 31) if (x > p.a and x < p.b) and not (x == p.c)),
        distractors=[lambda p: p.b - p.a - 1, lambda p: p.b - p.a, lambda p: p.b - p.a - 3],
        decimals=0,
        text={"ru": "Сколько целых $x$ от 1 до 30 удовлетворяют условию $(x > [[a]]) \\land (x < [[b]]) \\land \\lnot(x = [[c]])$?",
              "kk": "1-ден 30-ға дейінгі неше бүтін $x$ $(x > [[a]]) \\land (x < [[b]]) \\land \\lnot(x = [[c]])$ шартын қанағаттандырады?"},
        solution={"ru": "Строго между $[[a]]$ и $[[b]]$ лежат $[[b]] - [[a]] - 1$ чисел; исключаем $x = [[c]]$: остаётся $[[ans]]$.",
                  "kk": "$[[a]]$ және $[[b]]$ сандарының арасында (шеттерін қоспағанда) $[[b]] - [[a]] - 1$ сан бар; $x = [[c]]$ мәнін алып тастаймыз: $[[ans]]$ қалады."},
    ),
]


# ---------- SQL и Excel по таблице: правильный ответ считается по самим данным ----------

def _sql(seed: int, kind: int, thr: int, cls: str) -> tuple[str, str, int, list[int]]:
    rows = pupils(seed)
    t = table(["id", "name", "class", "score"], rows)
    if kind == 0:
        q = f"SELECT COUNT(*) FROM pupils WHERE score > {thr};"
        ans = sum(1 for r in rows if r[3] > thr)
        wrong = [sum(1 for r in rows if r[3] >= thr), len(rows) - ans, ans + 1]
    elif kind == 1:
        q = f"SELECT SUM(score) FROM pupils WHERE class = '{cls}';"
        ans = sum(r[3] for r in rows if r[2] == cls)
        wrong = [sum(r[3] for r in rows), sum(1 for r in rows if r[2] == cls), max(r[3] for r in rows if r[2] == cls) if any(r[2] == cls for r in rows) else 0]
    else:
        q = f"SELECT MAX(score) FROM pupils WHERE score < {thr};"
        vals = [r[3] for r in rows if r[3] < thr]
        ans = max(vals) if vals else 0
        wrong = [max(r[3] for r in rows), min(vals) if vals else 1, thr]
    return t, q, ans, wrong


TEMPLATES += [
    Template(
        id="inf.e.sql-table", **T("database-design-sql", "medium"),
        params={"seed": list(range(1, 13)), "kind": [0, 1, 2], "thr": [90, 100, 110], "cls": CLASSES},
        derived=lambda p: dict(zip(["tbl", "q", "res"], _sql(p.seed, p.kind, p.thr, p.cls)[:3])),
        where=lambda p: _sql(p.seed, p.kind, p.thr, p.cls)[2] > 0,
        answer=lambda p: _sql(p.seed, p.kind, p.thr, p.cls)[2],
        distractors=[(lambda p, k=k: _sql(p.seed, p.kind, p.thr, p.cls)[3][k]) for k in range(3)],
        decimals=0, variants=50, spread=None,
        text={"ru": "Таблица `pupils`:\n\n```\n[[tbl]]\n```\n\nЧто вернёт запрос `[[q]]`?",
              "kk": "`pupils` кестесі:\n\n```\n[[tbl]]\n```\n\n`[[q]]` сұранысы не қайтарады?"},
        solution={"ru": "Сначала `WHERE` отбирает подходящие строки, затем функция (`COUNT`, `SUM` или `MAX`) считается только по ним. Ответ: $[[ans]]$.",
                  "kk": "Алдымен `WHERE` сәйкес жолдарды іріктейді, сосын функция (`COUNT`, `SUM` не `MAX`) тек солар бойынша есептеледі. Жауабы: $[[ans]]$."},
    ),
]


def _excel(a: int, b: int, c: int, d: int, kind: int) -> tuple[str, float, list[float]]:
    if kind == 0:
        return "=СУММ(A1:A3)/A4", (a + b + c) / d, [(a + b + c + d) / d, a + b + c / d, (a + c) / d]
    if kind == 1:
        return "=СРЗНАЧ(A1:A4)", (a + b + c + d) / 4, [(a + d) / 2, (a + b + c) / 3, a + b + c + d]
    if kind == 2:
        return "=ЕСЛИ(A1>A2;A3*2;A4-A1)", (c * 2 if a > b else d - a), [(d - a if a > b else c * 2), c, d - b]
    return "=МАКС(A1:A4)-МИН(A1:A4)", max(a, b, c, d) - min(a, b, c, d), [max(a, b, c, d), max(a, b, c, d) + min(a, b, c, d), a - d]


TEMPLATES += [
    Template(
        id="inf.e.excel-formula", **T("information-objects", "medium"),
        params={"a": [2, 4, 6, 9], "b": [3, 5, 8], "c": [4, 7, 10], "d": [2, 4, 5], "kind": [0, 1, 2, 3]},
        derived=lambda p: {"f": _excel(p.a, p.b, p.c, p.d, p.kind)[0]},
        answer=lambda p: _excel(p.a, p.b, p.c, p.d, p.kind)[1],
        distractors=[(lambda p, k=k: _excel(p.a, p.b, p.c, p.d, p.kind)[2][k]) for k in range(3)],
        decimals=2, variants=50, spread=None,
        text={"ru": "В ячейках записаны числа: A1 = [[a]], A2 = [[b]], A3 = [[c]], A4 = [[d]]. Какое значение будет в ячейке с формулой `[[f]]`?",
              "kk": "Ұяшықтарда сандар жазылған: A1 = [[a]], A2 = [[b]], A3 = [[c]], A4 = [[d]]. `[[f]]` формуласы бар ұяшықта қандай мән болады?"},
        solution={"ru": "Подставляем значения ячеек в формулу. Диапазон `A1:A3` — ячейки с A1 по A3 включительно; в `ЕСЛИ` сначала проверяется условие. Ответ: $[[ans]]$.",
                  "kk": "Формулаға ұяшық мәндерін қоямыз. `A1:A3` ауқымы — A1-ден A3-ке дейінгі ұяшықтар (қоса); `ЕСЛИ`-де алдымен шарт тексеріледі. Жауабы: $[[ans]]$."},
    ),
]


# ---------- Контекстные блоки (ЕНТ 26–30) ----------
from ctx import Q  # noqa: E402
from engine import Context  # noqa: E402

CONTEXTS = [
    Context(
        id="inf.ctx.school-photo", **T("information-representation", "medium"),
        params={"w": [640, 800, 1024, 1280], "h": [480, 512, 768, 1024], "i": [8, 16, 24], "v": [512, 1024, 2048]},
        derived=lambda p: {"N": 2**p.i, "kb": p.w * p.h * p.i // 8192},
        where=lambda p: p.w * p.h * p.i % 8192 == 0 and (p.w * p.h * p.i // 8192) * 8 % p.v == 0,
        context={
            "ru": "Для школьного сайта сделали фотографию $[[w]] \\times [[h]]$ пикселей. Цвет каждого пикселя кодируется $[[i]]$ битами, сжатие не используется. Фото загружают по каналу со скоростью $[[v]]$ Кбит/с.",
            "kk": "Мектеп сайты үшін $[[w]] \\times [[h]]$ пиксельді фотосурет түсірілді. Әр пиксельдің түсі $[[i]]$ битпен кодталады, сығу қолданылмайды. Фото жылдамдығы $[[v]]$ Кбит/с арна арқылы жүктеледі.",
        },
        questions=[
            Q("Сколько цветов может быть в палитре изображения?", "Кескін палитрасында неше түс болуы мүмкін?",
              lambda p: p.N, [lambda p: p.i * 2, lambda p: 2 ** (p.i - 1), lambda p: p.i * 8], 
              "$N = 2^i = 2^{[[i]]} = [[ans]]$.", "$N = 2^i = 2^{[[i]]} = [[ans]]$.", decimals=0),
            Q("Каков объём фотографии в килобайтах?", "Фотосуреттің көлемі неше килобайт?",
              lambda p: p.kb, [lambda p: p.kb * 8, lambda p: p.w * p.h * p.i // 8000, lambda p: p.kb // 8 or 1],
              "$I = [[w]] \\cdot [[h]] \\cdot [[i]]$ бит. Делим на $8 \\cdot 1024$: $[[ans]]$ Кбайт.",
              "$I = [[w]] \\cdot [[h]] \\cdot [[i]]$ бит. $8 \\cdot 1024$-ке бөлеміз: $[[ans]]$ Кбайт.", decimals=0, unit="Кбайт"),
            Q("Сколько секунд займёт загрузка фотографии?", "Фотосуретті жүктеу неше секундқа созылады?",
              lambda p: p.kb * 8 // p.v, [lambda p: p.kb // p.v if p.kb // p.v else 1, lambda p: p.kb * 8 // p.v * 2, lambda p: p.kb * 8 // p.v + 8],
              "$[[kb]]$ Кбайт $= [[kb]] \\cdot 8$ Кбит. $t = \\frac{[[kb]] \\cdot 8}{[[v]]} = [[ans]]$ с.",
              "$[[kb]]$ Кбайт $= [[kb]] \\cdot 8$ Кбит. $t = \\frac{[[kb]] \\cdot 8}{[[v]]} = [[ans]]$ с.", decimals=0, unit="с"),
            Q("Сколько таких фотографий поместится на карту памяти 64 Мбайт?", "64 Мбайт жад картасына осындай неше фотосурет сыяды?",
              lambda p: 64 * 1024 // p.kb, [lambda p: 64 * 1000 // p.kb, lambda p: 64 * 1024 // p.kb + 1, lambda p: 64 * 1024 * 8 // p.kb],
              "$64 \\cdot 1024 = 65536$ Кбайт. Делим на объём одного фото и берём целую часть: $[[ans]]$.",
              "$64 \\cdot 1024 = 65536$ Кбайт. Бір фото көлеміне бөліп, бүтін бөлігін аламыз: $[[ans]]$.", decimals=0),
            Q("Палитру уменьшили до 16 цветов. Во сколько раз уменьшится объём файла?", "Палитраны 16 түске дейін азайтты. Файл көлемі неше есе кемиді?",
              lambda p: p.i / 4, [lambda p: p.N / 16, lambda p: p.i / 2, lambda p: p.i - 4],
              "16 цветов — это 4 бита на пиксель. Объём пропорционален числу бит: $\\frac{[[i]]}{4} = [[ans]]$.",
              "16 түс — пиксельге 4 бит. Көлем бит санына пропорционал: $\\frac{[[i]]}{4} = [[ans]]$.", decimals=2),
        ],
        variants=8,
    ),
    Context(
        id="inf.ctx.school-db", **T("database-design-sql", "medium"),
        params={"seed": list(range(20, 40))},
        derived=lambda p: {"tbl": table(["id", "name", "class", "score"], pupils(p.seed)), "rows": pupils(p.seed)},
        where=lambda p: len({r[3] for r in pupils(p.seed)}) >= 4 and sum(1 for r in pupils(p.seed) if r[2] == "10А") >= 1,
        context={
            "ru": "В базе данных школы есть таблица `pupils` с результатами пробного ЕНТ:\n\n```\n[[tbl]]\n```",
            "kk": "Мектептің деректер қорында сынақ ҰБТ нәтижелері бар `pupils` кестесі бар:\n\n```\n[[tbl]]\n```",
        },
        questions=[
            Q("Что вернёт запрос `SELECT COUNT(*) FROM pupils WHERE class = '10А';`?", "`SELECT COUNT(*) FROM pupils WHERE class = '10А';` сұранысы не қайтарады?",
              lambda p: sum(1 for r in p.rows if r[2] == "10А"), [lambda p: len(p.rows), lambda p: sum(1 for r in p.rows if r[2] != "10А"), lambda p: sum(1 for r in p.rows if r[2] == "10А") + 1],
              "`COUNT(*)` считает строки, прошедшие условие `WHERE`.", "`COUNT(*)` `WHERE` шартынан өткен жолдарды санайды.", decimals=0),
            Q("Что вернёт запрос `SELECT MAX(score) FROM pupils;`?", "`SELECT MAX(score) FROM pupils;` сұранысы не қайтарады?",
              lambda p: max(r[3] for r in p.rows), [lambda p: min(r[3] for r in p.rows), lambda p: p.rows[-1][3] if p.rows[-1][3] != max(r[3] for r in p.rows) else p.rows[0][3] - 5, lambda p: max(r[3] for r in p.rows) + 5],
              "`MAX` возвращает наибольшее значение столбца.", "`MAX` бағандағы ең үлкен мәнді қайтарады.", decimals=0),
            Q("Что вернёт запрос `SELECT SUM(score) FROM pupils WHERE score >= 100;`?", "`SELECT SUM(score) FROM pupils WHERE score >= 100;` сұранысы не қайтарады?",
              lambda p: sum(r[3] for r in p.rows if r[3] >= 100), [lambda p: sum(r[3] for r in p.rows), lambda p: sum(r[3] for r in p.rows if r[3] > 100), lambda p: sum(1 for r in p.rows if r[3] >= 100)],
              "Складываем `score` только тех строк, где `score >= 100` (сто входит).", "Тек `score >= 100` болатын жолдардың `score` мәндерін қосамыз (жүз кіреді).", decimals=0),
            Q("Сколько строк вернёт запрос `SELECT name FROM pupils WHERE score < 100 OR class = '11А';`?", "`SELECT name FROM pupils WHERE score < 100 OR class = '11А';` сұранысы неше жол қайтарады?",
              lambda p: sum(1 for r in p.rows if r[3] < 100 or r[2] == "11А"), [lambda p: sum(1 for r in p.rows if r[3] < 100 and r[2] == "11А"), lambda p: sum(1 for r in p.rows if r[3] < 100), lambda p: len(p.rows)],
              "`OR` — достаточно выполнения одного из условий.", "`OR` — шарттардың біреуінің орындалуы жеткілікті.", decimals=0),
            Q("Какое поле лучше всего подходит для первичного ключа?", "Алғашқы кілт үшін қай өріс ең қолайлы?",
              lambda p: "id", [lambda p: "name", lambda p: "class", lambda p: "score"],
              "Первичный ключ должен быть уникальным для каждой строки. Имена, классы и баллы могут повторяться.",
              "Алғашқы кілт әр жол үшін бірегей болуы керек. Аттар, сыныптар және ұпайлар қайталануы мүмкін."),
        ],
        variants=10,
    ),
    Context(
        id="inf.ctx.loop-program", **T("python-programming", "hard"),
        params={"n": [10, 12, 15, 18, 20, 24], "k": [2, 3, 4, 5]},
        where=lambda p: p.n % p.k == 0,
        derived=lambda p: {"code": f"s = 0\nc = 0\nfor i in range(1, {p.n} + 1):\n    if i % {p.k} == 0:\n        s += i\n        c += 1\nprint(s, c)"},
        context={
            "ru": "Дана программа на Python:\n\n```python\n[[code]]\n```",
            "kk": "Python тіліндегі бағдарлама берілген:\n\n```python\n[[code]]\n```",
        },
        questions=[
            Q("Какое число выведется первым (значение `s`)?", "Бірінші болып қандай сан шығады (`s` мәні)?",
              lambda p: sum(i for i in range(1, p.n + 1) if i % p.k == 0), [lambda p: sum(i for i in range(1, p.n) if i % p.k == 0), lambda p: sum(range(1, p.n + 1)), lambda p: p.n // p.k],
              "`s` — сумма чисел от 1 до $[[n]]$, кратных $[[k]]$; $[[n]]$ входит, потому что `range(1, n + 1)`.",
              "`s` — 1-ден бастап $[[n]]$ санына дейінгі, $[[k]]$ санына еселі сандардың қосындысы; `range(1, n + 1)` болғандықтан $[[n]]$ кіреді.", decimals=0),
            Q("Какое число выведется вторым (значение `c`)?", "Екінші болып қандай сан шығады (`c` мәні)?",
              lambda p: p.n // p.k, [lambda p: p.n, lambda p: p.n // p.k + 1, lambda p: p.n - p.n // p.k],
              "`c` считает, сколько чисел от 1 до $[[n]]$ делятся на $[[k]]$: $\\lfloor [[n]] / [[k]] \\rfloor = [[ans]]$.",
              "`c` 1-ден бастап $[[n]]$ санына дейінгі, $[[k]]$ санына бөлінетін сандарды санайды: $\\lfloor [[n]] / [[k]] \\rfloor = [[ans]]$.", decimals=0),
            Q("Сколько раз выполнится проверка `i % k == 0`?", "`i % k == 0` тексерісі неше рет орындалады?",
              lambda p: p.n, [lambda p: p.n - 1, lambda p: p.n // p.k, lambda p: p.n + 1],
              "Условие проверяется на каждом шаге цикла, а цикл проходит $[[n]]$ значений `i`.",
              "Шарт циклдің әр қадамында тексеріледі, ал цикл `i`-дің $[[n]]$ мәнінен өтеді.", decimals=0),
            Q("Каким будет значение `i` после завершения цикла?", "Цикл аяқталғаннан кейін `i` мәні қандай болады?",
              lambda p: p.n, [lambda p: p.n + 1, lambda p: p.n - 1, lambda p: p.k],
              "`i` принимает последнее значение диапазона — $[[n]]$; после `for` переменная его сохраняет.",
              "`i` аралықтың соңғы мәнін қабылдайды — $[[n]]$; `for`-дан кейін айнымалы оны сақтайды.", decimals=0),
            Q("Что выведет программа, если заменить `range(1, n + 1)` на `range(1, n)`? Укажите первое число.", "`range(1, n + 1)` орнына `range(1, n)` жазса, бағдарлама не шығарады? Бірінші санды көрсетіңіз.",
              lambda p: sum(i for i in range(1, p.n) if i % p.k == 0), [lambda p: sum(i for i in range(1, p.n + 1) if i % p.k == 0), lambda p: (p.n - 1) // p.k, lambda p: sum(range(1, p.n))],
              "Теперь $[[n]]$ не входит в диапазон; оно кратно $[[k]]$, поэтому сумма уменьшится на $[[n]]$.",
              "Енді $[[n]]$ аралыққа кірмейді; ол $[[k]]$ санына еселі, сондықтан қосынды $[[n]]$ шамасына кемиді.", decimals=0),
        ],
        variants=12,
    ),
]


# ---------- Дополнительно: строки, списки, while, объём текста, двоичная запись ----------
TEMPLATES += [
    code_tpl("py.collatz", "algorithms-and-programs", "hard",
             {"n": [6, 7, 9, 10, 12, 13, 15, 17, 18, 20, 22, 24, 26]},
             lambda p: f"n = {p.n}\nk = 0\nwhile n != 1:\n    if n % 2 == 0:\n        n = n // 2\n    else:\n        n = 3 * n + 1\n    k += 1\nprint(k)",
             [lambda p: f"n = {p.n}\nk = 1\nwhile n != 1:\n    if n % 2 == 0:\n        n = n // 2\n    else:\n        n = 3 * n + 1\n    k += 1\nprint(k)",
              lambda p: f"n = {p.n}\nk = 0\nwhile n != 1:\n    if n % 2 == 0:\n        n = n // 2\n    else:\n        n = 3 * n + 1\n    k += 1\nprint(k - 1)",
              lambda p: f"print({p.n} // 2)"],
             "Выполняем шаги по одному: чётное число делим на 2, нечётное заменяем на $3n + 1$, считаем шаги до 1.",
             "Қадамдарды бір-бірлеп орындаймыз: жұп санды 2-ге бөлеміз, тақ санды $3n + 1$-ге ауыстырамыз, 1-ге дейінгі қадамдарды санаймыз.",
             variants=13),
    code_tpl("py.str-replace", "algorithms-and-programs", "medium",
             {"w": ["banana", "ananas", "kokos", "mama", "pasport", "kolokol"], "a": ["a", "o"], "b": ["i", "u", "e"]},
             lambda p: f's = "{p.w}"\nt = s.replace("{p.a}", "{p.b}")\nprint(t, len(t))',
             [lambda p: f's = "{p.w}"\nprint(s, len(s))',
              lambda p: f's = "{p.w}"\nt = s.replace("{p.a}", "{p.b}", 1)\nprint(t, len(t))',
              lambda p: f's = "{p.w}"\nt = s.replace("{p.a}", "")\nprint(t, len(t))'],
             "`replace` заменяет **все** вхождения и возвращает новую строку; длина не меняется, если заменяем букву на букву.",
             "`replace` **барлық** кездесулерді ауыстырып, жаңа жол қайтарады; әріпті әріпке ауыстырсақ, ұзындығы өзгермейді.",
             where=lambda p: p.a in p.w),
    code_tpl("py.list-comp", "python-programming", "medium",
             {"a": [1, 2, 3], "b": [8, 10, 11, 13], "k": [2, 3], "m": [2, 3]},
             lambda p: f"a = [x * {p.k} for x in range({p.a}, {p.b}) if x % {p.m} == 0]\nprint(len(a), sum(a))",
             [lambda p: f"a = [x * {p.k} for x in range({p.a}, {p.b} + 1) if x % {p.m} == 0]\nprint(len(a), sum(a))",
              lambda p: f"a = [x for x in range({p.a}, {p.b}) if x % {p.m} == 0]\nprint(len(a), sum(a))",
              lambda p: f"a = [x * {p.k} for x in range({p.a}, {p.b})]\nprint(len(a), sum(a))"],
             "Генератор списка берёт $x$ из `range`, оставляет только кратные, и каждое умножает. `len` — количество, `sum` — сумма.",
             "Тізім генераторы `range`-тен $x$ алып, тек еселілерін қалдырады да, әрқайсысын көбейтеді. `len` — саны, `sum` — қосындысы."),
    code_tpl("py.nested-if-range", "python-programming", "easy",
             {"x": [3, 7, 12, 15, 18, 25, 30, 41], "a": [5, 10], "b": [20, 25]},
             lambda p: f'x = {p.x}\nif x < {p.a}:\n    print("low")\nelif x < {p.b}:\n    print("ok")\nelse:\n    print("high")',
             [lambda p: 'print("low")' if p.x >= p.a else 'print("ok")', lambda p: 'print("high")' if p.x < p.b else 'print("ok")',
              lambda p: 'print("low ok")'],
             "Цепочка `if/elif/else` выполняет только первую ветку с истинным условием.",
             "`if/elif/else` тізбегі шарты ақиқат бірінші тармақты ғана орындайды."),
    Template(
        id="inf.e.text-pages", **T("information-representation", "medium"),
        params={"pg": [4, 8, 16, 32], "ln": [32, 40, 64], "ch": [32, 64, 128], "b": [8, 16]},
        where=lambda p: p.pg * p.ln * p.ch * p.b % 8192 == 0,
        answer=lambda p: p.pg * p.ln * p.ch * p.b // 8192,
        distractors=[lambda p: p.pg * p.ln * p.ch * p.b // 1024, lambda p: p.pg * p.ln * p.ch // 1024, lambda p: p.pg * p.ln * p.ch * p.b // 8000],
        decimals=0, unit="Кбайт",
        text={"ru": "Документ содержит $[[pg]]$ страниц, на каждой $[[ln]]$ строк по $[[ch]]$ символов. Каждый символ кодируется $[[b]]$ битами. Найдите информационный объём документа.",
              "kk": "Құжатта $[[pg]]$ бет бар, әр бетте $[[ch]]$ символдан $[[ln]]$ жол. Әр символ $[[b]]$ битпен кодталады. Құжаттың ақпараттық көлемін табыңыз."},
        solution={"ru": "$K = [[pg]] \\cdot [[ln]] \\cdot [[ch]]$ символов, $I = K \\cdot [[b]]$ бит. Делим на $8 \\cdot 1024$: $[[ans]]$ Кбайт.",
                  "kk": "$K = [[pg]] \\cdot [[ln]] \\cdot [[ch]]$ символ, $I = K \\cdot [[b]]$ бит. $8 \\cdot 1024$-ке бөлеміз: $[[ans]]$ Кбайт."},
    ),
    Template(
        id="inf.e.bin-ones", **T("number-systems", "medium"),
        params={"n": list(range(40, 256, 3))},
        derived=lambda p: {"b": bin(p.n)[2:]},
        answer=lambda p: bin(p.n).count("1"),
        distractors=[lambda p: bin(p.n).count("0") - 1, lambda p: len(bin(p.n)) - 2, lambda p: bin(p.n).count("1") + 1],
        decimals=0, variants=30, spread=None,
        text={"ru": "Сколько единиц в двоичной записи десятичного числа $[[n]]$?", "kk": "$[[n]]$ ондық санының екілік жазуында неше бірлік бар?"},
        solution={"ru": "$[[n]] = [[b]]_2$ — считаем единицы: $[[ans]]$. Удобно раскладывать по степеням двойки.",
                  "kk": "$[[n]] = [[b]]_2$ — бірліктерді санаймыз: $[[ans]]$. Екінің дәрежелеріне жіктеген ыңғайлы."},
    ),
    Template(
        id="inf.e.hosts-needed", **T("networks-and-security", "hard"),
        params={"k": [10, 20, 25, 30, 50, 60, 100, 120, 200, 250, 500, 1000]},
        derived=lambda p: {"bits": next(b for b in range(2, 16) if 2**b - 2 >= p.k)},
        answer=lambda p: 32 - next(b for b in range(2, 16) if 2**b - 2 >= p.k),
        distractors=[lambda p: 32 - next(b for b in range(2, 16) if 2**b - 2 >= p.k) + 1, lambda p: 32 - next(b for b in range(2, 16) if 2**b - 2 >= p.k) - 1,
                     lambda p: 32 - next(b for b in range(2, 16) if 2**b >= p.k) if 32 - next(b for b in range(2, 16) if 2**b >= p.k) != 32 - next(b for b in range(2, 16) if 2**b - 2 >= p.k) else 32 - next(b for b in range(2, 16) if 2**b - 2 >= p.k) - 2],
        decimals=0, spread=None, valid=lambda p, x: 16 <= x <= 30,
        text={"ru": "В подсети должно быть $[[k]]$ компьютеров. Какой наибольший префикс маски (число единиц, например /24) можно выбрать?",
              "kk": "Ішкі желіде $[[k]]$ компьютер болуы керек. Масканың ең үлкен префиксі (бірліктер саны, мысалы /24) қандай болуы мүмкін?"},
        solution={"ru": "Нужно $2^n - 2 \\ge [[k]]$ адресов узлов (минус адрес сети и широковещательный): $n = [[bits]]$. Префикс $32 - [[bits]] = [[ans]]$.",
                  "kk": "Түйін адрестерінің саны $2^n - 2 \\ge [[k]]$ болуы керек (желі адресі мен кеңтаратымдық адресті шегереміз): $n = [[bits]]$. Префикс $32 - [[bits]] = [[ans]]$."},
    ),
]
