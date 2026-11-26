"""Информатика · новые типы задач (ночь 2): код Python, графы, исполнители, логика, системы счисления,
устройства компьютера, веб, 3D-печать, базы данных, электронные таблицы, сети.
Ответы для кода и алгоритмов получаются вычислением (запуском кода / перебором), не «в уме».
Казахский текст — черновик, нужна вычитка носителем языка."""
import contextlib
import io
import itertools
import math
import random

from ctx import Q
from engine import Context, Template


def run(code: str) -> str:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(code, {})  # код собран в этом файле из чисел-параметров
    return buf.getvalue().strip().replace("\n", " ")


def T(topic: str, level: str = "medium") -> dict:
    return dict(subject="informatics", topic=topic, level=level)


Q_RUN = {"ru": "Что выведет программа?\n\n```python\n[[code]]\n```", "kk": "Бағдарлама не шығарады?\n\n```python\n[[code]]\n```"}


def code_tpl(id_, topic, level, params, make, wrong_makers, sol_ru, sol_kk, where=lambda p: True, variants=40):
    return Template(
        id=f"inf.m.{id_}", **T(topic, level), params=params, where=where,
        derived=lambda p: {"code": make(p)},
        answer=lambda p: run(make(p)),
        distractors=[(lambda p, w=w: run(w(p))) for w in wrong_makers],
        text=Q_RUN, solution={"ru": sol_ru, "kk": sol_kk}, variants=variants,
    )


# ---------- помощники ----------

SUB = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


def base(n: int, b: int) -> str:
    digits = "0123456789ABCDEF"
    if n == 0:
        return "0"
    s = ""
    while n:
        s = digits[n % b] + s
        n //= b
    return s


def tagged(n: int, b: int) -> str:
    return base(n, b) + str(b).translate(SUB)


def graph(seed: int):
    """Схема дорог без циклов: A → … → F. Возвращает рёбра и число путей из A в F."""
    r = random.Random(seed)
    nodes = "ABCDEF"
    edges = set()
    for i in range(5):
        edges.add((nodes[i], nodes[i + 1]))  # цепочка гарантирует путь
    for i in range(6):
        for j in range(i + 2, 6):
            if r.random() < 0.4:
                edges.add((nodes[i], nodes[j]))
    edges = sorted(edges)
    ways = {"A": 1}
    for v in nodes[1:]:
        ways[v] = sum(ways[a] for a, b in edges if b == v)
    return edges, ways


def roads(edges) -> str:
    return ", ".join(f"{a}→{b}" for a, b in edges)


def programs(x: int, y: int, a: int, b: int) -> int:
    """Число программ из команд «+a» и «×b», переводящих x в y."""
    ways = {x: 1}
    for v in range(x + 1, y + 1):
        ways[v] = ways.get(v - a, 0) + (ways.get(v // b, 0) if v % b == 0 and v // b >= x and v // b < v else 0)
    return ways.get(y, 0)


def shortest(x: int, y: int, a: int, b: int) -> int:
    from collections import deque
    d = {x: 0}
    q = deque([x])
    while q:
        v = q.popleft()
        for w in (v + a, v * b):
            if w <= y and w not in d:
                d[w] = d[v] + 1
                q.append(w)
    return d.get(y, -1)


def calc(x: int, prog: str, a: int, b: int) -> int:
    for c in prog:
        x = x + a if c == "1" else x * b
    return x


VARS3 = list(itertools.product([0, 1], repeat=3))
LOGIC = [
    ("(x ∨ y) ∧ ¬z", lambda x, y, z: (x or y) and not z),
    ("x ∧ ¬y ∨ z", lambda x, y, z: (x and not y) or z),
    ("¬x ∧ (y ∨ z)", lambda x, y, z: (not x) and (y or z)),
    ("(x → y) ∧ z", lambda x, y, z: ((not x) or y) and z),
    ("x ∨ (y ∧ ¬z)", lambda x, y, z: x or (y and not z)),
    ("¬(x ∧ y) ∧ z", lambda x, y, z: (not (x and y)) and z),
    ("(x ≡ y) ∨ z", lambda x, y, z: (x == y) or z),
    ("(x ∨ ¬y) ∧ (y ∨ z)", lambda x, y, z: (x or not y) and (y or z)),
    ("¬x ∨ y ∧ z", lambda x, y, z: (not x) or (y and z)),
    ("(x → z) ∧ ¬y", lambda x, y, z: ((not x) or z) and not y),
]


def tup(t) -> str:
    return f"({t[0]}, {t[1]}, {t[2]})"


def logic_sets(e):
    f = LOGIC[e][1]
    good = [tup(t) for t in VARS3 if f(*t)]
    bad = [tup(t) for t in VARS3 if not f(*t)]
    return good, bad


def products(seed: int):
    r = random.Random(seed)
    cats = [("Молоко", "Сүт"), ("Хлеб", "Нан"), ("Сок", "Шырын")]
    rows = []
    for i in range(7):
        c = r.randrange(3)
        rows.append((i + 1, c, r.randrange(200, 1001, 50), r.randrange(0, 31, 5)))
    return rows, cats


def prod_table(rows, cats, lang):
    head = ("id", "Категория" if lang == "ru" else "Санат", "Цена" if lang == "ru" else "Бағасы", "Остаток" if lang == "ru" else "Қалдық")
    body = [(str(i), cats[c][0 if lang == "ru" else 1], str(pr), str(q)) for i, c, pr, q in rows]
    w = [max(len(x) for x in col) for col in zip(head, *body)]
    line = lambda r: " | ".join(x.ljust(n) for x, n in zip(r, w))
    return "\n".join([line(head), "-+-".join("-" * n for n in w), *map(line, body)])


def shift_ref(ref: str, dr: int, dc: int) -> str:
    """Сдвиг ссылки вида $A$1 / A$1 / $A1 / A1 при копировании."""
    col_abs = ref.startswith("$")
    rest = ref[1:] if col_abs else ref
    col = rest[0]
    row_abs = rest[1] == "$"
    row = int(rest[2:] if row_abs else rest[1:])
    if not col_abs:
        col = chr(ord(col) + dc)
    if not row_abs:
        row += dr
    return ("$" if col_abs else "") + col + ("$" if row_abs else "") + str(row)


FORMULAS = [
    ("=A$1*$B2", ["A$1", "$B2"], "*"),
    ("=$A1+B$2", ["$A1", "B$2"], "+"),
    ("=A1+$B$1", ["A1", "$B$1"], "+"),
    ("=$A$2*B1", ["$A$2", "B1"], "*"),
    ("=B$1-$A2", ["B$1", "$A2"], "-"),
    ("=$B1*A$3", ["$B1", "A$3"], "*"),
]


def formula(i: int, dr: int, dc: int, mode: str = "ok") -> str:
    _, refs, op = FORMULAS[i]
    if mode == "ok":
        out = [shift_ref(r, dr, dc) for r in refs]
    elif mode == "all":  # сдвинул всё, не глядя на $
        out = [shift_ref(r.replace("$", ""), dr, dc) for r in refs]
    elif mode == "none":  # ничего не сдвинул
        out = refs
    else:  # перепутал строки и столбцы
        out = [shift_ref(r, dc, dr) for r in refs]
    return "`=" + op.join(out) + "`"  # в коде: иначе KaTeX примет $A$ за формулу


def ip_host(ip: list[int], prefix: int) -> int:
    n = (ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3]
    return n & ((1 << (32 - prefix)) - 1)


def mask_str(prefix: int) -> str:
    m = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF
    return ".".join(str((m >> s) & 255) for s in (24, 16, 8, 0))


SIZES = [("Кбайт", 10), ("Мбайт", 20), ("Гбайт", 30)]


def size_name(bits_pow: int) -> str:
    """2^k байт → «64 Кбайт»."""
    for name, p in reversed(SIZES):
        if bits_pow >= p:
            return f"{2 ** (bits_pow - p)} {name}"
    return f"{2 ** bits_pow} байт"


TEMPLATES = [
    # ---------- Python ----------
    code_tpl("py.while-mult", "python-programming", "medium",
             {"a": [1, 2, 3], "k": [2, 3], "n": [50, 100, 200, 500, 1000]},
             lambda p: f"x = {p.a}\nn = 0\nwhile x < {p.n}:\n    x = x * {p.k}\n    n += 1\nprint(n)",
             [lambda p: f"x = {p.a}\nn = 0\nwhile x <= {p.n}:\n    x = x * {p.k}\n    n += 1\nprint(n + 1)",
              lambda p: f"x = {p.a}\nn = 0\nwhile x < {p.n}:\n    x = x * {p.k}\n    n += 1\nprint(x)",
              lambda p: f"x = {p.a}\nn = 0\nwhile x < {p.n}:\n    x = x + {p.k}\n    n += 1\nprint(n // 10)"],
             "Считаем шаги: после каждого умножения проверяем условие `x < [[n]]`. Цикл останавливается, как только `x` достигнет порога.",
             "Қадамдарды санаймыз: әр көбейтуден кейін `x < [[n]]` шартын тексереміз. `x` шекке жеткен бойда цикл тоқтайды."),
    code_tpl("py.while-sum", "python-programming", "medium",
             {"n": [10, 15, 20, 25, 30, 40, 50, 60, 75, 100]},
             lambda p: f"s = 0\ni = 0\nwhile s < {p.n}:\n    i += 1\n    s += i\nprint(i)",
             [lambda p: f"s = 0\ni = 0\nwhile s < {p.n}:\n    i += 1\n    s += i\nprint(s)",
              lambda p: f"s = 0\ni = 0\nwhile s < {p.n}:\n    i += 1\n    s += i\nprint(i - 1)",
              lambda p: f"s = 0\ni = 0\nwhile s < {p.n}:\n    i += 1\n    s += i\nprint(i + 1)"],
             "Складываем $1 + 2 + 3 + \\dots$, пока сумма меньше порога. Выводится `i` — последнее прибавленное число.",
             "$1 + 2 + 3 + \\dots$ сандарын қосынды шектен кіші болғанша қосып отырамыз. Соңғы қосылған сан `i` шығарылады.",
             where=lambda p: run(f"s=0\ni=0\nwhile s<{p.n}:\n    i+=1\n    s+=i\nprint(i)") != run(f"s=0\ni=0\nwhile s<{p.n}:\n    i+=1\n    s+=i\nprint(s)")),
    code_tpl("py.str-find-count", "python-programming", "medium",
             {"s": ["abracadabra", "banana", "mississippi", "programming", "informatics", "parallel", "coconut", "assessment"], "c": ["a", "s", "i", "n", "o", "m", "r", "l", "e", "t"]},
             lambda p: f's = "{p.s}"\nprint(s.find("{p.c}"), s.count("{p.c}"))',
             [lambda p: f's = "{p.s}"\nprint(s.find("{p.c}") + 1, s.count("{p.c}"))',
              lambda p: f's = "{p.s}"\nprint(s.rfind("{p.c}"), s.count("{p.c}"))',
              lambda p: f's = "{p.s}"\nprint(s.find("{p.c}"), s.count("{p.c}") + 1)'],
             "`find` возвращает индекс **первого** вхождения (с нуля), `count` — сколько раз символ встречается.",
             "`find` **бірінші** кездесудің индексін қайтарады (нөлден), `count` — символ неше рет кездесетінін.",
             where=lambda p: p.s.count(p.c) >= 2 and p.s.find(p.c) != p.s.rfind(p.c)),
    code_tpl("py.nested-count", "algorithms-and-programs", "hard",
             {"a": [3, 4, 5, 6], "b": [4, 5, 6, 7, 8]},
             lambda p: f"c = 0\nfor i in range({p.a}):\n    for j in range(i, {p.b}):\n        c += 1\nprint(c)",
             [lambda p: f"print({p.a} * {p.b})",
              lambda p: f"c = 0\nfor i in range({p.a}):\n    for j in range(i + 1, {p.b}):\n        c += 1\nprint(c)",
              lambda p: f"c = 0\nfor i in range({p.a} + 1):\n    for j in range(i, {p.b}):\n        c += 1\nprint(c)"],
             "Внутренний цикл при каждом `i` выполняется $[[b]] - i$ раз, `i` идёт от 0 до $[[a]] - 1$. Складываем эти числа: $[[ans]]$.",
             "Ішкі цикл әр `i` үшін $[[b]] - i$ рет орындалады, `i` 0-ден $[[a]] - 1$ мәніне дейін өзгереді. Осы сандарды қосамыз: $[[ans]]$.",
             where=lambda p: p.a < p.b),
    code_tpl("py.floor-div-neg", "python-programming", "hard",
             {"a": [-7, -9, -11, -13, -15, -17, -10, -14], "b": [2, 3, 4, 5]},
             lambda p: f"print({p.a} // {p.b}, {p.a} % {p.b})",
             [lambda p: f"print({int(p.a / p.b)}, {int(math.fmod(p.a, p.b))})",
              lambda p: f"print({int(p.a / p.b)}, {p.a % p.b})",
              lambda p: f"print({p.a // p.b}, {int(math.fmod(p.a, p.b))})"],
             "В Python `//` округляет **вниз** (к минус бесконечности), а остаток `%` имеет знак делителя: $a = b \\cdot (a // b) + a \\% b$.",
             "Python-да `//` **төмен** (минус шексіздікке) дөңгелектейді, ал `%` қалдығы бөлгіштің таңбасымен бірдей болады: $a = b \\cdot (a // b) + a \\% b$.",
             where=lambda p: p.a % p.b != 0),
    code_tpl("py.range-len", "python-programming", "medium",
             {"a": [1, 2, 3, 5, 10], "b": [20, 25, 30, 41, 50], "c": [2, 3, 4, 5, 7]},
             lambda p: f"a = list(range({p.a}, {p.b}, {p.c}))\nprint(len(a), a[-1])",
             [lambda p: f"a = list(range({p.a}, {p.b} + 1, {p.c}))\nprint(len(a) + 1, a[-1])",
              lambda p: f"a = list(range({p.a}, {p.b}, {p.c}))\nprint(len(a) + 1, a[-1] + {p.c})",
              lambda p: f"a = list(range({p.a}, {p.b}, {p.c}))\nprint(len(a), {p.b})"],
             "`range(a, b, c)`: от `a` с шагом `c`, число `b` не входит. `a[-1]` — последний элемент списка.",
             "`range(a, b, c)`: `a`-дан `c` қадаммен, `b` саны кірмейді. `a[-1]` — тізімнің соңғы элементі.",
             where=lambda p: (p.b - p.a) % p.c != 0 and (p.b - p.a) // p.c >= 3),
    code_tpl("py.divisors", "algorithms-and-programs", "medium",
             {"n": [12, 18, 20, 24, 28, 30, 36, 40, 45, 48, 50, 60, 72, 84, 90, 96, 100]},
             lambda p: f"n = {p.n}\nc = 0\nfor d in range(1, n + 1):\n    if n % d == 0:\n        c += 1\nprint(c)",
             [lambda p: f"n = {p.n}\nc = 0\nfor d in range(1, n):\n    if n % d == 0:\n        c += 1\nprint(c)",
              lambda p: f"n = {p.n}\nc = 0\nfor d in range(2, n):\n    if n % d == 0:\n        c += 1\nprint(c)",
              lambda p: f"n = {p.n}\nc = 0\nfor d in range(1, n + 1):\n    if n % d == 0:\n        c += d\nprint(c)"],
             "Программа перебирает все `d` от 1 до `n` и считает делители — включая 1 и само `n`.",
             "Бағдарлама 1-ден `n`-ге дейінгі барлық `d`-ні тексеріп, бөлгіштерді санайды — 1 мен `n`-нің өзі де кіреді.",
             variants=17),
    code_tpl("py.fibonacci", "algorithms-and-programs", "medium",
             {"n": [5, 6, 7, 8, 9, 10, 11, 12], "a": [0, 1, 2], "b": [1, 2, 3]},
             lambda p: f"a, b = {p.a}, {p.b}\nfor _ in range({p.n}):\n    a, b = b, a + b\nprint(a)",
             [lambda p: f"a, b = {p.a}, {p.b}\nfor _ in range({p.n}):\n    a, b = b, a + b\nprint(b)",
              lambda p: f"a, b = {p.a}, {p.b}\nfor _ in range({p.n} - 1):\n    a, b = b, a + b\nprint(a)",
              lambda p: f"a, b = {p.a}, {p.b}\nfor _ in range({p.n}):\n    a = b\n    b = a + b\nprint(a)"],
             "Одновременное присваивание `a, b = b, a + b`: новое `a` — старое `b`, новое `b` — сумма старых. Выписываем пары по шагам.",
             "`a, b = b, a + b` бір мезгілде меншіктеу: жаңа `a` — ескі `b`, жаңа `b` — ескілердің қосындысы. Жұптарды қадам бойынша жазамыз.",
             where=lambda p: p.a < p.b),
    code_tpl("py.matrix-diag-sum", "python-programming", "medium",
             {"seed": list(range(1, 80))},
             lambda p: (lambda r: f"m = [{[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]}]\ns = 0\nfor i in range(3):\n    s += m[i][i]\nprint(s)")(random.Random(p.seed)),
             [lambda p: (lambda r: f"m = [{[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]}]\ns = 0\nfor i in range(3):\n    s += m[i][2 - i]\nprint(s)")(random.Random(p.seed)),
              lambda p: (lambda r: f"m = [{[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]}]\nprint(sum(m[0]))")(random.Random(p.seed)),
              lambda p: (lambda r: f"m = [{[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]},\n     {[r.randrange(1, 10) for _ in range(3)]}]\nprint(m[0][0] + m[1][0] + m[2][0])")(random.Random(p.seed))],
             "`m[i][i]` — элементы главной диагонали (строка и столбец с одинаковым номером): `m[0][0]`, `m[1][1]`, `m[2][2]`.",
             "`m[i][i]` — бас диагональ элементтері (жол мен баған нөмірі бірдей): `m[0][0]`, `m[1][1]`, `m[2][2]`."),
    code_tpl("py.digits-in-string", "python-programming", "medium",
             {"s": ["a1b2c3", "x9y8z7", "k5m0n4", "q7w3e2r", "p4l5d1", "t2h6u3k1", "s8a1t", "b3o9x"]},
             lambda p: f's = "{p.s}"\nt = 0\nfor ch in s:\n    if ch.isdigit():\n        t += int(ch)\nprint(t)',
             [lambda p: f's = "{p.s}"\nt = 0\nfor ch in s:\n    if ch.isdigit():\n        t += 1\nprint(t)',
              lambda p: f's = "{p.s}"\nprint(len(s))',
              lambda p: f's = "{p.s}"\nt = ""\nfor ch in s:\n    if ch.isdigit():\n        t += ch\nprint(t)'],
             "`isdigit()` истинно для цифр. Программа складывает значения цифр строки, буквы пропускает.",
             "`isdigit()` цифрлар үшін ақиқат. Бағдарлама жолдағы цифрлардың мәндерін қосады, әріптерді өткізеді.",
             variants=8),

    # ---------- алгоритмы: графы и исполнители ----------
    Template(
        id="inf.m.alg.graph-paths", **T("algorithms-and-programs", "hard"),
        params={"seed": list(range(1, 200))},
        derived=lambda p: (lambda e, w: {"r": roads(e), "ways": w, "ne": len(e)})(*graph(p.seed)),
        where=lambda p: 4 <= p.ways["F"] <= 20 and p.ways["E"] != p.ways["F"],
        answer=lambda p: p.ways["F"],
        distractors=[lambda p: p.ways["E"], lambda p: p.ne, lambda p: p.ways["F"] + p.ways["E"], lambda p: p.ways["F"] - 1],
        decimals=0,
        text={"ru": "Между городами A, B, C, D, E, F есть дороги с односторонним движением: [[r]]. Сколько существует различных путей из A в F?",
              "kk": "A, B, C, D, E, F қалаларының арасында бір бағытты жолдар бар: [[r]]. A-дан F-ке дейін неше түрлі маршрут бар?"},
        solution={"ru": "Для каждого города число путей из A равно сумме путей в города, из которых в него ведут дороги. Считаем по порядку A, B, …, F: в F получается $[[ans]]$.",
                  "kk": "Әр қалаға A-дан келетін маршруттар саны — оған жол түсетін қалаларға келетін маршруттар санының қосындысы. A, B, …, F ретімен есептесек, F-ке $[[ans]]$ шығады."},
    ),
    Template(
        id="inf.m.alg.calc-programs", **T("algorithms-and-programs", "hard"),
        params={"x": [1, 2, 3], "y": [10, 12, 14, 15, 16, 18, 20, 21, 24], "a": [1], "b": [2, 3]},
        derived=lambda p: {"n": programs(p.x, p.y, p.a, p.b), "n1": programs(p.x, p.y - 1, p.a, p.b)},
        where=lambda p: 3 <= p.n <= 40,
        answer=lambda p: p.n,
        distractors=[lambda p: p.n1, lambda p: p.n + 1, lambda p: p.y - p.x, lambda p: p.n * 2],
        decimals=0,
        text={"ru": "У исполнителя Калькулятор две команды: **1. прибавь [[a]]**, **2. умножь на [[b]]**. Сколько существует программ, которые число $[[x]]$ преобразуют в число $[[y]]$?",
              "kk": "Калькулятор орындаушысының екі командасы бар: **1. [[a]] қос**, **2. [[b]] санына көбейт**. $[[x]]$ санын $[[y]]$ санына түрлендіретін неше бағдарлама бар?"},
        solution={"ru": "Пусть $K(n)$ — число программ из $[[x]]$ в $n$. Тогда $K(n) = K(n - 1)$, а если $n$ делится на $[[b]]$, ещё $+ K(n / [[b]])$. Считаем по порядку до $[[y]]$: $[[ans]]$.",
                  "kk": "$K(n)$ — $[[x]]$ санынан $n$ санына апаратын бағдарламалар саны. Онда $K(n) = K(n - 1)$, ал $n$ саны $[[b]]$ санына бөлінсе, тағы $+ K(n / [[b]])$. $[[y]]$ санына дейін ретімен есептейміз: $[[ans]]$."},
    ),
    Template(
        id="inf.m.alg.calc-run", **T("algorithms-and-programs", "easy"),
        params={"x": [2, 3, 4, 5], "a": [1, 2, 3], "b": [2, 3], "prog": ["1212", "2121", "1122", "2211", "1221", "2112"]},
        derived=lambda p: {"y": calc(p.x, p.prog, p.a, p.b)},
        answer=lambda p: p.y,
        distractors=[lambda p: calc(p.x, p.prog[::-1], p.a, p.b),
                     lambda p: calc(p.x, p.prog.translate(str.maketrans("12", "21")), p.a, p.b),
                     lambda p: p.x + 2 * p.a + 2 * p.b],
        decimals=0,
        text={"ru": "У исполнителя Калькулятор две команды: **1. прибавь [[a]]**, **2. умножь на [[b]]**. Какое число получится из числа $[[x]]$ после выполнения программы **[[prog]]**?",
              "kk": "Калькулятор орындаушысының екі командасы бар: **1. [[a]] қос**, **2. [[b]] санына көбейт**. $[[x]]$ санына **[[prog]]** бағдарламасын орындағанда қандай сан шығады?"},
        solution={"ru": "Выполняем команды слева направо, каждую — над результатом предыдущей: получаем $[[ans]]$.",
                  "kk": "Командаларды солдан оңға қарай, әрқайсысын алдыңғы нәтижеге орындаймыз: $[[ans]]$ шығады."},
    ),
    Template(
        id="inf.m.alg.binary-search-steps", **T("algorithms-and-programs", "medium"),
        params={"n": [10, 15, 20, 30, 50, 100, 127, 200, 250, 500, 1000, 1023, 2000]},
        answer=lambda p: math.floor(math.log2(p.n)) + 1,
        distractors=[lambda p: p.n // 2, lambda p: math.floor(math.log2(p.n)), lambda p: math.ceil(math.sqrt(p.n)), lambda p: math.floor(math.log2(p.n)) + 2],
        decimals=0, spread=None, variants=16,
        text={"ru": "Число элементов упорядоченного массива — $[[n]]$. Какое наибольшее число шагов может понадобиться двоичному (бинарному) поиску, чтобы найти элемент или убедиться, что его нет? Один шаг — одна проверка среднего элемента.",
              "kk": "Реттелген массивте $[[n]]$ элемент бар. Екілік (бинарлық) іздеу элементті табу немесе оның жоқ екенін анықтау үшін ең көп дегенде неше қадам жасайды? Бір қадам — ортаңғы элементті бір рет тексеру."},
        solution={"ru": "Каждый шаг делит отрезок пополам. Нужно наименьшее $k$, при котором $2^k > n$: $k = \\lfloor \\log_2 [[n]] \\rfloor + 1 = [[ans]]$.",
                  "kk": "Әр қадам кесіндіні екіге бөледі. $2^k > n$ болатын ең кіші $k$ керек: $k = \\lfloor \\log_2 [[n]] \\rfloor + 1 = [[ans]]$."},
    ),

    # ---------- логика ----------
    Template(
        id="inf.m.logic.true-sets", kind="multi", **T("logic-foundations", "hard"),
        params={"e": list(range(len(LOGIC))), "sh": [0, 1, 2, 3]},
        derived=lambda p: (lambda g, b: {"expr": LOGIC[p.e][0], "good": g[p.sh % len(g):] + g[:p.sh % len(g)], "bad": b[p.sh % len(b):] + b[:p.sh % len(b)]})(*logic_sets(p.e)),
        where=lambda p: len(p.good) >= 3 and len(p.bad) >= 3,
        answers=[lambda p: p.good[0], lambda p: p.good[1], lambda p: p.good[2]],
        distractors=[lambda p: p.bad[0], lambda p: p.bad[1], lambda p: p.bad[2]],
        text={"ru": "Дано логическое выражение $F = [[expr]]$. При каких наборах значений $(x, y, z)$ оно **истинно**? Выберите все верные ответы.",
              "kk": "$F = [[expr]]$ логикалық өрнегі берілген. $(x, y, z)$ мәндерінің қандай жиындарында ол **ақиқат**? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "Подставляем каждый набор. Порядок действий: ¬, затем ∧, затем ∨, затем → и ≡. $F = 1$ при наборах [[ans]] и других отмеченных.",
                  "kk": "Әр жиынды қоямыз. Амалдар реті: ¬, сосын ∧, сосын ∨, сосын → және ≡. $F = 1$: [[ans]] және басқа белгіленген жиындарда."},
    ),
    Template(
        id="inf.m.logic.count-true", **T("logic-foundations", "medium"),
        params={"e": list(range(len(LOGIC)))},
        derived=lambda p: {"expr": LOGIC[p.e][0], "k": len(logic_sets(p.e)[0])},
        answer=lambda p: p.k,
        distractors=[lambda p: 8 - p.k, lambda p: p.k + 1, lambda p: p.k - 1, lambda p: 4],
        decimals=0, spread=None, variants=10,
        text={"ru": "Сколько строк таблицы истинности выражения $F = [[expr]]$ содержат $F = 1$?",
              "kk": "$F = [[expr]]$ өрнегінің ақиқаттық кестесінің неше жолында $F = 1$?"},
        solution={"ru": "У трёх переменных $2^3 = 8$ наборов. Перебираем все и считаем, где $F = 1$: $[[ans]]$.",
                  "kk": "Үш айнымалының $2^3 = 8$ жиыны бар. Барлығын тексеріп, $F = 1$ болатындарын санаймыз: $[[ans]]$."},
    ),

    # ---------- системы счисления ----------
    Template(
        id="inf.m.ns.binary-add", **T("number-systems", "medium"),
        params={"a": list(range(9, 40, 2)), "b": list(range(6, 30, 3))},
        answer=lambda p: base(p.a + p.b, 2),
        distractors=[lambda p: base(p.a ^ p.b, 2), lambda p: base(p.a + p.b + 1, 2), lambda p: base(p.a + p.b - 2, 2), lambda p: base(p.a | p.b, 2)],
        derived=lambda p: {"A": base(p.a, 2), "B": base(p.b, 2), "sum": p.a + p.b},
        where=lambda p: p.a & p.b != 0,
        text={"ru": "Вычислите сумму двоичных чисел $[[A]]_2 + [[B]]_2$. Ответ запишите в двоичной системе.",
              "kk": "$[[A]]_2 + [[B]]_2$ екілік сандарының қосындысын табыңыз. Жауапты екілік жүйеде жазыңыз."},
        solution={"ru": "Складываем столбиком, помня, что $1 + 1 = 10_2$ (пишем 0, переносим 1). Проверка в десятичной: $[[a]] + [[b]] = [[sum]]$ → $[[ans]]_2$.",
                  "kk": "Бағанмен қосамыз: $1 + 1 = 10_2$ (0 жазамыз, 1 ауысады). Ондық жүйеде тексеру: $[[a]] + [[b]] = [[sum]]$ → $[[ans]]_2$."},
    ),
    Template(
        id="inf.m.ns.hex-to-oct", **T("number-systems", "hard"),
        params={"n": list(range(40, 255, 7))},
        derived=lambda p: {"H": base(p.n, 16)},
        where=lambda p: any(c in "ABCDEF" for c in base(p.n, 16)),
        answer=lambda p: base(p.n, 8),
        distractors=[lambda p: str(p.n), lambda p: base(p.n + 8, 8), lambda p: base(p.n, 16).replace("A", "10").replace("B", "11").replace("C", "12").replace("D", "13").replace("E", "14").replace("F", "15"), lambda p: base(p.n - 8, 8)],
        text={"ru": "Переведите число $[[H]]_{16}$ в восьмеричную систему счисления.",
              "kk": "$[[H]]_{16}$ санын сегіздік санау жүйесіне аударыңыз."},
        solution={"ru": "Каждую шестнадцатеричную цифру заменяем четырьмя битами, затем делим двоичную запись справа на тройки и каждую тройку заменяем восьмеричной цифрой: $[[ans]]_8$. Проверка: $[[H]]_{16} = [[n]]_{10}$.",
                  "kk": "Әр он алтылық цифрды төрт битпен ауыстырамыз, сосын екілік жазуды оңнан үштіктерге бөліп, әр үштікті сегіздік цифрмен ауыстырамыз: $[[ans]]_8$. Тексеру: $[[H]]_{16} = [[n]]_{10}$."},
    ),
    Template(
        id="inf.m.ns.find-base", **T("number-systems", "medium"),
        params={"d1": [1, 2, 3, 4], "d0": [0, 1, 2, 3, 4, 5], "x": [5, 6, 7, 8, 9]},
        derived=lambda p: {"v": p.d1 * p.x + p.d0},
        where=lambda p: p.d0 < p.x and p.d1 < p.x and p.v != 10 * p.d1 + p.d0,
        answer=lambda p: p.x,
        distractors=[lambda p: p.x + 1, lambda p: p.x - 1, lambda p: p.x + 2, lambda p: p.d1 + p.d0 + 1],
        decimals=0, spread=None,
        text={"ru": "В какой системе счисления верно равенство $[[d1]][[d0]]_x = [[v]]_{10}$?",
              "kk": "Қай санау жүйесінде $[[d1]][[d0]]_x = [[v]]_{10}$ теңдігі дұрыс?"},
        solution={"ru": "$[[d1]][[d0]]_x = [[d1]] \\cdot x + [[d0]] = [[v]]$, откуда $x = [[ans]]$. Цифры числа меньше основания — подходит.",
                  "kk": "$[[d1]][[d0]]_x = [[d1]] \\cdot x + [[d0]] = [[v]]$, осыдан $x = [[ans]]$. Цифрлар негізден кіші — жарайды."},
    ),
    Template(
        id="inf.m.ns.compare-max", **T("number-systems", "medium"),
        params={"seed": list(range(1, 120))},
        derived=lambda p: (lambda r: (lambda vals: {"v": vals, "t": [tagged(v, b) for v, b in zip(vals, r.sample([2, 8, 10, 16], 4))]})(r.sample(range(40, 120), 4)))(random.Random(p.seed)),
        where=lambda p: max(p.v) - sorted(p.v)[-2] <= 12,
        answer=lambda p: p.t[p.v.index(max(p.v))],
        distractors=[lambda p: [t for v, t in sorted(zip(p.v, p.t))][2], lambda p: [t for v, t in sorted(zip(p.v, p.t))][1], lambda p: [t for v, t in sorted(zip(p.v, p.t))][0]],
        text={"ru": "Какое из чисел наибольшее?", "kk": "Қай сан ең үлкен?"},
        solution={"ru": "Переводим все числа в десятичную систему и сравниваем. Наибольшее — [[ans]].",
                  "kk": "Барлық сандарды ондық жүйеге аударып, салыстырамыз. Ең үлкені — [[ans]]."},
    ),

    # ---------- представление информации ----------
    Template(
        id="inf.m.rep.password", **T("information-representation", "hard"),
        params={"L": [7, 8, 9, 10, 11, 12, 15], "K": [10, 12, 26, 30, 33, 52, 62], "N": [20, 30, 40, 50, 100]},
        derived=lambda p: {"bits": math.ceil(math.log2(p.K)), "per": math.ceil(p.L * math.ceil(math.log2(p.K)) / 8)},
        answer=lambda p: p.N * p.per,
        distractors=[lambda p: p.N * p.L, lambda p: math.ceil(p.N * p.L * p.bits / 8), lambda p: p.N * p.L * p.bits, lambda p: p.N * math.ceil(p.L * math.log2(p.K) / 8)],
        where=lambda p: p.L * p.bits % 8 != 0 and p.K != 2 ** p.bits,
        decimals=0, unit="байт",
        text={"ru": "Пароль состоит из $[[L]]$ символов, каждый выбирается из алфавита в $[[K]]$ символов. Каждый символ кодируется одинаковым минимально возможным числом бит, а весь пароль — минимально возможным **целым** числом байт. Сколько байт займут пароли $[[N]]$ пользователей?",
              "kk": "Құпиясөз $[[L]]$ символдан тұрады, әрқайсысы $[[K]]$ символдық әліпбиден таңдалады. Әр символ бірдей ең аз бит санымен, ал бүкіл құпиясөз ең аз **бүтін** байт санымен кодталады. $[[N]]$ пайдаланушының құпиясөздері неше байт алады?"},
        solution={"ru": "На символ: $2^{[[bits]]} \\ge [[K]]$, значит $[[bits]]$ бит. Пароль: $[[L]] \\cdot [[bits]]$ бит → округляем вверх до $[[per]]$ байт. Всего: $[[N]] \\cdot [[per]] = [[ans]]$ байт.",
                  "kk": "Бір символға: $2^{[[bits]]} \\ge [[K]]$, демек $[[bits]]$ бит. Құпиясөз: $[[L]] \\cdot [[bits]]$ бит → жоғары қарай $[[per]]$ байтқа дейін дөңгелектейміз. Барлығы: $[[N]] \\cdot [[per]] = [[ans]]$ байт."},
    ),
    Template(
        id="inf.m.rep.code-length", **T("information-representation", "easy"),
        params={"n": [5, 7, 10, 12, 20, 25, 30, 33, 40, 50, 60, 70, 100, 120, 200, 300, 500, 1000]},
        answer=lambda p: math.ceil(math.log2(p.n)),
        distractors=[lambda p: math.ceil(math.log2(p.n)) - 1, lambda p: math.ceil(math.log2(p.n)) + 1, lambda p: len(str(p.n)), lambda p: 8],
        where=lambda p: 2 ** math.ceil(math.log2(p.n)) != p.n,
        decimals=0, spread=None, unit="бит", variants=18,
        text={"ru": "Число участников соревнования — $[[n]]$. Каждому присваивают номер, записанный минимально возможным одинаковым числом бит. Сколько бит нужно для одного номера?",
              "kk": "Жарысқа $[[n]]$ спортшы қатысады. Әрқайсысына ең аз бірдей бит санымен жазылған нөмір беріледі. Бір нөмірге неше бит қажет?"},
        solution={"ru": "Нужно наименьшее $i$, при котором $2^i \\ge [[n]]$: $i = [[ans]]$.",
                  "kk": "$2^i \\ge [[n]]$ болатын ең кіші $i$ керек: $i = [[ans]]$."},
    ),

    # ---------- устройство компьютера ----------
    Template(
        id="inf.m.dev.address-bus", **T("computer-devices", "medium"),
        params={"n": [16, 20, 22, 24, 26, 28, 30, 32]},
        answer=lambda p: size_name(p.n),
        distractors=[lambda p: size_name(p.n - 1), lambda p: size_name(p.n + 1), lambda p: size_name(p.n + 3), lambda p: f"{p.n} Кбайт"],
        variants=8,
        text={"ru": "Разрядность шины адреса процессора — $[[n]]$, каждый адрес указывает на один байт. Какой наибольший объём оперативной памяти может адресовать процессор?",
              "kk": "Процессордың адрестік шинасында $[[n]]$ сызық (разряд) бар, әр адрес бір байтты көрсетеді. Процессор ең көп дегенде қанша жедел жадты адрестей алады?"},
        solution={"ru": "Шина из $[[n]]$ разрядов даёт $2^{[[n]]}$ различных адресов, то есть $2^{[[n]]}$ байт $=$ [[ans]] ($2^{10}$ байт = 1 Кбайт, $2^{20}$ = 1 Мбайт, $2^{30}$ = 1 Гбайт).",
                  "kk": "$[[n]]$ разряд $2^{[[n]]}$ түрлі адрес береді, яғни $2^{[[n]]}$ байт $=$ [[ans]] ($2^{10}$ байт = 1 Кбайт, $2^{20}$ = 1 Мбайт, $2^{30}$ = 1 Гбайт)."},
    ),
    Template(
        id="inf.m.dev.clock-ops", **T("computer-devices", "medium"),
        params={"f": [1, 1.5, 2, 2.4, 3, 3.2, 3.6, 4], "k": [2, 4, 5, 8, 10]},
        answer=lambda p: p.f * 1000 / p.k,
        distractors=[lambda p: p.f * 1000 * p.k, lambda p: p.f * 1000, lambda p: p.f / p.k, lambda p: p.f * 100 / p.k],
        spread=None, unit="млн",
        text={"ru": "Тактовая частота процессора $[[f]]$ ГГц. Одна операция выполняется за $[[k]]$ тактов. Сколько миллионов таких операций процессор выполнит за 1 секунду?",
              "kk": "Процессордың тактілік жиілігі $[[f]]$ ГГц. Бір операция $[[k]]$ тактіде орындалады. Процессор 1 секундта осындай неше миллион операция орындайды?"},
        solution={"ru": "$[[f]]$ ГГц $= [[f]] \\cdot 1000$ млн тактов в секунду. Делим на $[[k]]$: $[[ans]]$ млн операций.",
                  "kk": "$[[f]]$ ГГц $= [[f]] \\cdot 1000$ млн такт/с. Оны $[[k]]$ санына бөлеміз: $[[ans]]$ млн операция."},
    ),
    Template(
        id="inf.m.dev.disk-files", **T("hardware-and-software", "easy"),
        params={"g": [1, 2, 4, 8, 16], "m": [3, 5, 6, 7, 12, 20, 24, 50, 100]},
        answer=lambda p: p.g * 1024 // p.m,
        distractors=[lambda p: p.g * 1000 // p.m, lambda p: p.g * 1024 // p.m + 1, lambda p: p.g * 1024 * 8 // p.m, lambda p: p.g * 1024 / p.m],
        where=lambda p: p.g * 1024 % p.m != 0 and p.g * 1024 // p.m != p.g * 1000 // p.m,
        decimals=0,
        text={"ru": "На пустую флешку объёмом $[[g]]$ Гбайт записывают файлы по $[[m]]$ Мбайт. Сколько **целых** файлов поместится? (1 Гбайт = 1024 Мбайт)",
              "kk": "Көлемі $[[g]]$ Гбайт бос флеш-жинақтағышқа әрқайсысы $[[m]]$ Мбайт файлдар жазылады. Неше **бүтін** файл сыяды? (1 Гбайт = 1024 Мбайт)"},
        solution={"ru": "$[[g]] \\cdot 1024$ Мбайт делим на $[[m]]$ и отбрасываем дробную часть. Ответ: $[[ans]]$.",
                  "kk": "$[[g]] \\cdot 1024$ Мбайтты $[[m]]$ санына бөліп, бөлшек бөлігін алып тастаймыз: $[[ans]]$ файл."},
    ),
    Template(
        id="inf.m.hw.units", **T("hardware-and-software", "easy"),
        params={"x": [2, 4, 8, 16, 32, 64, 128], "u": [0, 1, 2]},
        derived=lambda p: {"from": ["Кбайт", "Мбайт", "Гбайт"][p.u], "to": ["бит", "Кбайт", "Мбайт"][p.u]},
        answer=lambda p: p.x * (8192 if p.u == 0 else 1024),
        distractors=[lambda p: p.x * (8000 if p.u == 0 else 1000), lambda p: p.x * (1024 if p.u == 0 else 8192), lambda p: p.x * (8192 if p.u == 0 else 1024) // 2],
        decimals=0, spread=None, variants=21,
        text={"ru": "Сколько [[to]] в $[[x]]$ [[from]]?", "kk": "$[[x]]$ [[from]] неше [[to]]?"},
        solution={"ru": "1 байт = 8 бит, 1 Кбайт = 1024 байт, 1 Мбайт = 1024 Кбайт, 1 Гбайт = 1024 Мбайт. Ответ: $[[ans]]$ [[to]].",
                  "kk": "1 байт = 8 бит, 1 Кбайт = 1024 байт, 1 Мбайт = 1024 Кбайт, 1 Гбайт = 1024 Мбайт. Жауабы: $[[ans]]$ [[to]]."},
    ),

    # ---------- веб ----------
    Template(
        id="inf.m.web.hex-color", **T("web-design", "medium"),
        params={"r": [0x1A, 0x2F, 0x3C, 0x4B, 0x5E, 0x7D, 0x8A, 0x9F, 0xA4, 0xC8, 0xE6, 0xFF], "g": [0x10, 0x80, 0xC0], "b": [0x33, 0x99]},
        derived=lambda p: {"hex": f"#{p.r:02X}{p.g:02X}{p.b:02X}", "R": f"{p.r:02X}"},
        answer=lambda p: p.r,
        distractors=[lambda p: p.g, lambda p: (p.r % 16) * 16 + p.r // 16, lambda p: int(f"{p.r:02X}".replace("A", "10").replace("B", "11").replace("C", "12").replace("D", "13").replace("E", "14").replace("F", "15")) if f"{p.r:02X}".isalnum() else p.r + 16, lambda p: p.b],
        where=lambda p: p.r // 16 != p.r % 16,
        decimals=0, spread=None,
        text={"ru": "В CSS цвет задан кодом `[[hex]]` (формат #RRGGBB). Чему равна интенсивность **красной** составляющей в десятичной системе (от 0 до 255)?",
              "kk": "CSS-те түс `[[hex]]` кодымен берілген (#RRGGBB пішімі). **Қызыл** құраушының қарқындылығы ондық жүйеде неге тең (0-ден 255-ке дейін)?"},
        solution={"ru": "Красная составляющая — первые две цифры: $[[R]]_{16} = [[ans]]_{10}$.",
                  "kk": "Қызыл құраушы — алғашқы екі цифр: $[[R]]_{16} = [[ans]]_{10}$."},
    ),
    Template(
        id="inf.m.web.table-cells", **T("web-design", "easy"),
        params={"r": [2, 3, 4, 5], "c": [2, 3, 4, 5]},
        derived=lambda p: {"html": "<table>\n" + "".join("  <tr>" + "<td>…</td>" * p.c + "</tr>\n" for _ in range(p.r)) + "</table>"},
        answer=lambda p: f"{p.r} × {p.c}",
        distractors=[lambda p: f"{p.c} × {p.r}", lambda p: f"{p.r} × {p.r * p.c}", lambda p: f"{p.r + 1} × {p.c}", lambda p: f"1 × {p.r * p.c}"],
        where=lambda p: p.r != p.c,
        text={"ru": "Сколько строк и столбцов будет у таблицы (строки × столбцы)?\n\n```html\n[[html]]\n```",
              "kk": "Кестеде неше жол және неше баған болады (жолдар × бағандар)?\n\n```html\n[[html]]\n```"},
        solution={"ru": "Тег `<tr>` задаёт строку, `<td>` — ячейку в строке. Число строк — $[[r]]$, ячеек в каждой строке — $[[c]]$: [[ans]].",
                  "kk": "`<tr>` тегі жолды, `<td>` — жолдағы ұяшықты білдіреді. Жол саны $[[r]]$, әрқайсысында $[[c]]$ ұяшық: [[ans]]."},
    ),

    # ---------- 3D и тренды ----------
    Template(
        id="inf.m.it.3d-layers", **T("it-trends-and-3d", "medium"),
        params={"H": [30, 45, 60, 72, 90, 120], "h": [0.1, 0.15, 0.2, 0.3], "t": [6, 8, 10, 12, 15]},
        derived=lambda p: {"N": round(p.H / p.h)},
        where=lambda p: abs(p.H / p.h - round(p.H / p.h)) < 1e-9 and (round(p.H / p.h) * p.t) % 60 == 0,
        answer=lambda p: p.N * p.t // 60,
        distractors=[lambda p: p.N, lambda p: p.N * p.t // 3600 or p.N * p.t // 60 // 2, lambda p: round(p.H * p.t / 60), lambda p: p.N * p.t // 60 + p.t],
        decimals=2, unit="мин",
        text={"ru": "3D-принтер печатает фигурку высотой $[[H]]$ мм слоями толщиной $[[h]]$ мм. Печать одного слоя занимает $[[t]]$ с. Сколько минут займёт печать?",
              "kk": "3D-принтер биіктігі $[[H]]$ мм мүсінді қалыңдығы $[[h]]$ мм қабаттармен басады. Бір қабатты басу $[[t]]$ с алады. Басып шығару неше минутқа созылады?"},
        solution={"ru": "Слоёв: $\\frac{[[H]]}{[[h]]} = [[N]]$. Время: $[[N]] \\cdot [[t]]$ с $= [[ans]]$ мин.",
                  "kk": "Қабаттар саны: $\\frac{[[H]]}{[[h]]} = [[N]]$. Уақыт: $[[N]] \\cdot [[t]]$ с $= [[ans]]$ мин."},
    ),

    # ---------- базы данных ----------
    Template(
        id="inf.m.rdb.filter", **T("relational-databases", "medium"),
        params={"seed": list(range(1, 60)), "a": [400, 500, 600, 700], "c": [0, 1, 2]},
        derived=lambda p: (lambda rows, cats: {"rows": rows, "tru": prod_table(rows, cats, "ru"), "tkk": prod_table(rows, cats, "kk"), "cru": cats[p.c][0], "ckk": cats[p.c][1]})(*products(p.seed)),
        answer=lambda p: sum(1 for _, c, pr, _q in p.rows if pr > p.a and c == p.c),
        distractors=[lambda p: sum(1 for _, c, pr, _q in p.rows if pr > p.a or c == p.c),
                     lambda p: sum(1 for _, c, pr, _q in p.rows if pr > p.a),
                     lambda p: sum(1 for _, c, pr, _q in p.rows if c == p.c),
                     lambda p: sum(1 for _, c, pr, _q in p.rows if pr >= p.a and c == p.c) + 1],
        where=lambda p: sum(1 for _, c, pr, _q in p.rows if pr > p.a and c == p.c) >= 1,
        decimals=0, spread=None,
        text={"ru": "Дан фрагмент таблицы базы данных магазина:\n\n```\n[[tru]]\n```\n\nСколько записей удовлетворяют условию **(Цена > [[a]]) И (Категория = «[[cru]]»)**?",
              "kk": "Дүкеннің деректер қоры кестесінің үзіндісі берілген:\n\n```\n[[tkk]]\n```\n\n**(Бағасы > [[a]]) ЖӘНЕ (Санат = «[[ckk]]»)** шартын неше жазба қанағаттандырады?"},
        solution={"ru": "«И» требует выполнения обоих условий сразу. Отбираем строки категории «[[cru]]» с ценой строго больше $[[a]]$: $[[ans]]$.",
                  "kk": "«ЖӘНЕ» екі шарттың да бір мезгілде орындалуын талап етеді. «[[ckk]]» санатындағы бағасы $[[a]]$ санынан қатаң үлкен жолдарды аламыз: $[[ans]]$."},
    ),
    Template(
        id="inf.m.rdb.sort-first", **T("relational-databases", "medium"),
        params={"seed": list(range(1, 80)), "d": [0, 1]},
        derived=lambda p: (lambda rows, cats: {"rows": rows, "tru": prod_table(rows, cats, "ru"), "tkk": prod_table(rows, cats, "kk"),
                                               "ord": sorted(rows, key=lambda r: (r[2], r[0]), reverse=bool(p.d)),
                                               "dir_ru": "по убыванию" if p.d else "по возрастанию", "low": "высокой" if p.d else "низкой", "dir_kk": "кему ретімен" if p.d else "өсу ретімен"})(*products(p.seed)),
        where=lambda p: len({r[2] for r in p.rows}) == 7,
        answer=lambda p: p.ord[0][0],
        distractors=[lambda p: p.ord[-1][0], lambda p: p.ord[1][0], lambda p: sorted(p.rows, key=lambda r: (r[3], r[0]), reverse=bool(p.d))[0][0], lambda p: p.ord[2][0]],
        decimals=0, spread=None,
        text={"ru": "Дан фрагмент таблицы базы данных магазина:\n\n```\n[[tru]]\n```\n\nЗаписи отсортировали по полю «Цена» [[dir_ru]]. Какой `id` у **первой** записи?",
              "kk": "Дүкеннің деректер қоры кестесінің үзіндісі берілген:\n\n```\n[[tkk]]\n```\n\nЖазбалар «Бағасы» өрісі бойынша [[dir_kk]] сұрыпталды. **Бірінші** жазбаның `id`-і қандай?"},
        solution={"ru": "Сортировка [[dir_ru]] по полю «Цена» ставит первой запись с самой [[low]] ценой — это запись с `id` = $[[ans]]$.",
                  "kk": "«Бағасы» өрісі бойынша [[dir_kk]] сұрыптағанда бірінші орынға `id` = $[[ans]]$ жазбасы шығады."},
    ),

    # ---------- электронные таблицы ----------
    Template(
        id="inf.m.obj.copy-formula", **T("information-objects", "hard"),
        params={"f": list(range(len(FORMULAS))), "dr": [1, 2, 3], "dc": [1, 2]},
        derived=lambda p: {"src": FORMULAS[p.f][0], "to": chr(ord("C") + p.dc) + str(3 + p.dr)},
        answer=lambda p: formula(p.f, p.dr, p.dc),
        distractors=[lambda p: formula(p.f, p.dr, p.dc, "all"), lambda p: formula(p.f, p.dr, p.dc, "none"), lambda p: formula(p.f, p.dr, p.dc, "swap")],
        where=lambda p: p.dr != p.dc,
        text={"ru": "В ячейке C3 электронной таблицы записана формула `[[src]]`. Её скопировали в ячейку [[to]]. Какая формула получится в ячейке [[to]]?",
              "kk": "Электрондық кестенің C3 ұяшығында `[[src]]` формуласы жазылған. Оны [[to]] ұяшығына көшірді. [[to]] ұяшығында қандай формула шығады?"},
        solution={"ru": "При копировании относительные части ссылок сдвигаются на столько же строк и столбцов, на сколько сдвинулась ячейка, а части со знаком `$` не меняются. Получаем [[ans]].",
                  "kk": "Көшіргенде сілтемелердің салыстырмалы бөліктері ұяшық қанша жолға және бағанға жылжыса, сонша жылжиды, ал `$` белгісі бар бөліктері өзгермейді. [[ans]] шығады."},
    ),
    Template(
        id="inf.m.obj.countif", **T("information-objects", "medium"),
        params={"seed": list(range(1, 100)), "k": [4, 5, 6, 7]},
        derived=lambda p: (lambda r: (lambda v: {"v": v, "cells": ", ".join(f"A{i + 1} = {x}" for i, x in enumerate(v))})([r.randrange(1, 11) for _ in range(6)]))(random.Random(p.seed)),
        where=lambda p: p.k in p.v and sum(1 for x in p.v if x > p.k) >= 1,
        answer=lambda p: sum(1 for x in p.v if x > p.k),
        distractors=[lambda p: sum(1 for x in p.v if x >= p.k), lambda p: sum(1 for x in p.v if x < p.k), lambda p: sum(x for x in p.v if x > p.k), lambda p: 6 - sum(1 for x in p.v if x > p.k) + 1],
        decimals=0, spread=None,
        text={"ru": "В ячейках электронной таблицы: [[cells]]. Какое значение вернёт формула `=COUNTIF(A1:A6;\">[[k]]\")` (в русской версии `=СЧЁТЕСЛИ`)?",
              "kk": "Электрондық кесте ұяшықтарында: [[cells]]. `=COUNTIF(A1:A6;\">[[k]]\")` формуласы (орыс нұсқасында `=СЧЁТЕСЛИ`) қандай мән қайтарады?"},
        solution={"ru": "`COUNTIF` считает ячейки, удовлетворяющие условию. Условие «больше [[k]]» — строгое, само $[[k]]$ не считается: $[[ans]]$.",
                  "kk": "`COUNTIF` шартты қанағаттандыратын ұяшықтарды санайды. «[[k]] санынан үлкен» шарты қатаң, $[[k]]$ санының өзі саналмайды: $[[ans]]$."},
    ),

    # ---------- сети ----------
    Template(
        id="inf.m.net.host-number", **T("networks-and-security", "hard"),
        params={"a": [10, 172, 192], "c": [5, 17, 34, 78, 130, 200], "d": [9, 37, 70, 115, 158, 201, 240], "pre": [24, 25, 26, 27, 28]},
        derived=lambda p: {"ip": f"{p.a}.16.{p.c}.{p.d}", "mask": mask_str(p.pre), "host": ip_host([p.a, 16, p.c, p.d], p.pre)},
        where=lambda p: p.host not in (0, p.d),
        answer=lambda p: p.host,
        distractors=[lambda p: p.d, lambda p: p.d - p.host, lambda p: p.host + 1, lambda p: 255 - int(p.mask.split(".")[3])],
        decimals=0, spread=None,
        text={"ru": "IP-адрес компьютера $[[ip]]$, маска сети $[[mask]]$. Каков номер компьютера в сети?",
              "kk": "Компьютердің IP-адресі $[[ip]]$, желі маскасы $[[mask]]$. Компьютердің желідегі нөмірі қандай?"},
        solution={"ru": "Номер узла — часть адреса, где в маске нули. Последний байт маски даёт $2^{32 - [[pre]]}$ адресов в сети, номер узла — остаток от деления $[[d]]$ на это число: $[[ans]]$.",
                  "kk": "Түйін нөмірі — адрестің маскадағы нөлдерге сәйкес бөлігі. Желіде $2^{32 - [[pre]]}$ адрес бар, түйін нөмірі — $[[d]]$ санын осы санға бөлгендегі қалдық: $[[ans]]$."},
    ),
    Template(
        id="inf.m.net.transfer-compare", **T("networks-and-security", "medium"),
        params={"s": [4, 8, 16, 32], "v": [128, 256, 512, 1024], "k": [2, 4]},
        derived=lambda p: {"t": p.s * 1024 * 8 / p.v},
        where=lambda p: (p.s * 8192) % p.v == 0,
        answer=lambda p: p.s * 1024 * 8 // p.v,
        distractors=[lambda p: p.s * 1024 // p.v, lambda p: p.s * 1000 * 8 // p.v, lambda p: p.s * 1024 * 8 // p.v // p.k, lambda p: p.s * 1024 * 8 // p.v * 2],
        decimals=0, unit="с",
        text={"ru": "Файл размером $[[s]]$ Мбайт передаётся по каналу со скоростью $[[v]]$ Кбит/с. Сколько секунд займёт передача?",
              "kk": "Көлемі $[[s]]$ Мбайт файл жылдамдығы $[[v]]$ Кбит/с арна арқылы беріледі. Беру неше секундқа созылады?"},
        solution={"ru": "$[[s]]$ Мбайт $= [[s]] \\cdot 1024 \\cdot 8$ Кбит. $t = \\frac{[[s]] \\cdot 8192}{[[v]]} = [[ans]]$ с.",
                  "kk": "$[[s]]$ Мбайт $= [[s]] \\cdot 1024 \\cdot 8$ Кбит. $t = \\frac{[[s]] \\cdot 8192}{[[v]]} = [[ans]]$ с."},
    ),

    # ---------- соответствие ----------
    Template(
        id="inf.m.match.code-output", kind="match", **T("python-programming", "medium"),
        params={"a": [7, 9, 11, 13, 17, 19, 23], "b": [2, 3, 4, 5]},
        rows={"ru": ["`print([[a]] // [[b]])`", "`print([[a]] % [[b]])`"], "kk": ["`print([[a]] // [[b]])`", "`print([[a]] % [[b]])`"]},
        answers=[lambda p: p.a // p.b, lambda p: p.a % p.b],
        distractors=[lambda p: round(p.a / p.b, 2), lambda p: p.a // p.b + 1, lambda p: p.b - p.a % p.b],
        where=lambda p: p.a % p.b != 0 and p.a // p.b != p.a % p.b,
        text={"ru": "Установите соответствие между командой и тем, что она выведет.", "kk": "Команда мен оның шығаратын нәтижесінің сәйкестігін анықтаңыз."},
        solution={"ru": "`//` — целая часть от деления ($[[ans1]]$), `%` — остаток ($[[ans2]]$).",
                  "kk": "`//` — бөліндінің бүтін бөлігі ($[[ans1]]$), `%` — қалдық ($[[ans2]]$)."},
    ),
    Template(
        id="inf.m.match.bases", kind="match", **T("number-systems", "medium"),
        params={"n": list(range(20, 100, 3))},
        rows={"ru": ["$[[n]]_{10}$ в двоичной системе", "$[[n]]_{10}$ в восьмеричной системе"], "kk": ["$[[n]]_{10}$ екілік жүйеде", "$[[n]]_{10}$ сегіздік жүйеде"]},
        answers=[lambda p: base(p.n, 2), lambda p: base(p.n, 8)],
        distractors=[lambda p: base(p.n, 16), lambda p: base(p.n + 1, 2), lambda p: base(p.n - 1, 8)],
        where=lambda p: any(c in "ABCDEF" for c in base(p.n, 16)) or base(p.n, 16) != base(p.n, 8),
        text={"ru": "Установите соответствие между числом и его записью.", "kk": "Сан мен оның жазылуының сәйкестігін анықтаңыз."},
        solution={"ru": "Делим $[[n]]$ на 2 и на 8 с остатком: $[[ans1]]_2$ и $[[ans2]]_8$.",
                  "kk": "$[[n]]$ санын 2-ге және 8-ге қалдықпен бөлеміз: $[[ans1]]_2$ және $[[ans2]]_8$."},
    ),
]


CONTEXTS = [
    Context(
        id="inf.ctx.calculator", **T("algorithms-and-programs", "medium"),
        params={"x": [1, 2, 3], "a": [1, 2], "b": [2, 3], "y": [12, 14, 16, 18, 20, 24]},
        derived=lambda p: {"n": programs(p.x, p.y, p.a, p.b), "sh": shortest(p.x, p.y, p.a, p.b),
                           "r1": calc(p.x, "1212", p.a, p.b), "r2": calc(p.x, "2211", p.a, p.b)},
        where=lambda p: 2 <= p.n <= 30 and p.sh > 1 and p.r1 != p.r2,
        context={"ru": "У исполнителя Калькулятор две команды:\n\n**1. прибавь [[a]]**\n**2. умножь на [[b]]**\n\nПрограмма — последовательность номеров команд. Начальное число $[[x]]$.",
                 "kk": "Калькулятор орындаушысының екі командасы бар:\n\n**1. [[a]] қос**\n**2. [[b]] санына көбейт**\n\nБағдарлама — командалар нөмірлерінің тізбегі. Бастапқы сан $[[x]]$."},
        questions=[
            Q("Какое число получится после программы **1212**?", "**1212** бағдарламасынан кейін қандай сан шығады?",
              lambda p: p.r1, [lambda p: calc(p.x, "2121", p.a, p.b), lambda p: p.r2, lambda p: p.x + 2 * p.a + 2 * p.b],
              "По шагам: прибавляем, умножаем, прибавляем, умножаем — $[[ans]]$.", "Қадам бойынша: қосамыз, көбейтеміз, қосамыз, көбейтеміз — $[[ans]]$.", decimals=0),
            Q("Какое число получится после программы **2211**?", "**2211** бағдарламасынан кейін қандай сан шығады?",
              lambda p: p.r2, [lambda p: p.r1, lambda p: calc(p.x, "1122", p.a, p.b), lambda p: p.r2 + p.a],
              "Сначала два умножения, потом два прибавления: $[[ans]]$.", "Алдымен екі көбейту, сосын екі қосу: $[[ans]]$.", decimals=0),
            Q("Какое наименьшее число команд нужно, чтобы получить $[[y]]$?", "$[[y]]$ санын алу үшін ең аз дегенде неше команда керек?",
              lambda p: p.sh, [lambda p: p.sh + 1, lambda p: p.sh - 1, lambda p: (p.y - p.x) // p.a],
              "Идём от $[[y]]$ назад: если число делится на $[[b]]$ и это выгодно — делим, иначе вычитаем $[[a]]$. Наименьшее число команд: $[[ans]]$.",
              "$[[y]]$ санынан кері жүреміз: сан $[[b]]$ санына бөлінсе және тиімді болса — бөлеміз, әйтпесе $[[a]]$ азайтамыз. Ең азы — $[[ans]]$ команда.", decimals=0),
            Q("Сколько существует программ, которые из $[[x]]$ получают $[[y]]$?", "$[[x]]$ санынан $[[y]]$ санын алатын неше бағдарлама бар?",
              lambda p: p.n, [lambda p: p.n + 1, lambda p: p.sh, lambda p: p.n * 2],
              "$K(n) = K(n - [[a]]) + K(n / [[b]])$ (второе слагаемое — если делится). Считаем от $[[x]]$ до $[[y]]$: $[[ans]]$.",
              "$K(n) = K(n - [[a]]) + K(n / [[b]])$ (екінші қосылғыш — бөлінсе). $[[x]]$ санынан $[[y]]$ санына дейін есептейміз: $[[ans]]$.", decimals=0),
        ],
        variants=10,
    ),
    Context(
        id="inf.ctx.grades-sheet", **T("information-objects", "medium"),
        params={"seed": list(range(1, 60))},
        derived=lambda p: (lambda r: (lambda v: {"v": v, "tot": sum(v), "cells": "\n".join(f"| A{i + 1} | {n} | B{i + 1} | {x} |" for i, (n, x) in enumerate(zip(["Алия", "Данияр", "Ерлан", "Жанна", "Мадина"], v)))})([r.randrange(50, 101, 5) for _ in range(5)]))(random.Random(p.seed)),
        where=lambda p: len(set(p.v)) == 5 and sum(p.v) % 5 == 0,
        context={"ru": "В электронной таблице записаны баллы учеников за пробный тест:\n\n| Ячейка | Имя | Ячейка | Балл |\n|---|---|---|---|\n[[cells]]",
                 "kk": "Электрондық кестеде оқушылардың сынақ тестінің ұпайлары жазылған:\n\n| Ұяшық | Аты | Ұяшық | Ұпай |\n|---|---|---|---|\n[[cells]]"},
        questions=[
            Q("Какое значение вернёт формула `=SUM(B1:B5)` (`=СУММ`)?", "`=SUM(B1:B5)` (`=СУММ`) формуласы қандай мән қайтарады?",
              lambda p: sum(p.v), [lambda p: sum(p.v[:4]), lambda p: sum(p.v[1:]), lambda p: sum(p.v) // 5],
              "Складываем все пять баллов: $[[ans]]$.", "Бес ұпайдың бәрін қосамыз: $[[ans]]$.", decimals=0),
            Q("Какое значение вернёт формула `=AVERAGE(B1:B5)` (`=СРЗНАЧ`)?", "`=AVERAGE(B1:B5)` (`=СРЗНАЧ`) формуласы қандай мән қайтарады?",
              lambda p: sum(p.v) / 5, [lambda p: (max(p.v) + min(p.v)) / 2, lambda p: sorted(p.v)[2], lambda p: sum(p.v) / 4],
              "Среднее — сумма, делённая на количество: $\\frac{[[tot]]}{5} = [[ans]]$.", "Орташа мән — қосындыны ұпайлар санына бөлу: $\\frac{[[tot]]}{5} = [[ans]]$.", decimals=1),
            Q("Какое значение вернёт формула `=MAX(B1:B5)-MIN(B1:B5)`?", "`=MAX(B1:B5)-MIN(B1:B5)` формуласы қандай мән қайтарады?",
              lambda p: max(p.v) - min(p.v), [lambda p: max(p.v), lambda p: max(p.v) + min(p.v), lambda p: max(p.v) - sorted(p.v)[1]],
              "Наибольший балл минус наименьший: $[[ans]]$.", "Ең үлкен ұпайдан ең кішісін аламыз: $[[ans]]$.", decimals=0),
            Q("Какое значение вернёт формула `=COUNTIF(B1:B5;\">=80\")` (`=СЧЁТЕСЛИ`)?", "`=COUNTIF(B1:B5;\">=80\")` (`=СЧЁТЕСЛИ`) формуласы қандай мән қайтарады?",
              lambda p: sum(1 for x in p.v if x >= 80), [lambda p: sum(1 for x in p.v if x > 80), lambda p: sum(1 for x in p.v if x < 80), lambda p: sum(x for x in p.v if x >= 80)],
              "Считаем баллы не меньше 80 (80 тоже считается): $[[ans]]$.", "80-нен кем емес ұпайларды санаймыз (80 де саналады): $[[ans]]$.", decimals=0),
        ],
        variants=10,
    ),
    Context(
        id="inf.ctx.video-call", **T("networks-and-security", "medium"),
        params={"v": [256, 512, 1024, 2048], "s": [5, 10, 20, 40], "k": [2, 4, 5]},
        derived=lambda p: {"t": p.s * 8192 // p.v, "tz": p.s * 8192 // p.v // p.k},
        where=lambda p: (p.s * 8192) % (p.v * p.k) == 0 and 10 <= p.s * 8192 // p.v <= 1000,
        context={"ru": "Ученик отправляет учителю видеозапись ответа объёмом $[[s]]$ Мбайт. Скорость интернет-канала $[[v]]$ Кбит/с. Архиватор сжимает такое видео в $[[k]]$ раза. (1 Мбайт = 1024 Кбайт, 1 байт = 8 бит.)",
                 "kk": "Оқушы мұғалімге көлемі $[[s]]$ Мбайт бейне жауабын жібереді. Интернет арнасының жылдамдығы $[[v]]$ Кбит/с. Архиватор мұндай бейнені $[[k]]$ есе сығады. (1 Мбайт = 1024 Кбайт, 1 байт = 8 бит.)"},
        questions=[
            Q("Сколько килобит в файле без сжатия?", "Сығылмаған файлда неше килобит бар?",
              lambda p: p.s * 8192, [lambda p: p.s * 1024, lambda p: p.s * 8000, lambda p: p.s * 8],
              "$[[s]] \\cdot 1024 \\cdot 8 = [[ans]]$ Кбит.", "$[[s]] \\cdot 1024 \\cdot 8 = [[ans]]$ Кбит.", decimals=0, unit="Кбит"),
            Q("Сколько секунд займёт передача без сжатия?", "Сығусыз беру неше секундқа созылады?",
              lambda p: p.t, [lambda p: p.s * 1024 // p.v or 1, lambda p: p.tz, lambda p: p.t * 2],
              "$t = \\frac{[[s]] \\cdot 8192}{[[v]]} = [[ans]]$ с.", "$t = \\frac{[[s]] \\cdot 8192}{[[v]]} = [[ans]]$ с.", decimals=0, unit="с"),
            Q("Сколько секунд займёт передача сжатого файла (без учёта времени на сжатие)?", "Сығылған файлды беру неше секунд алады (сығу уақытын есептемегенде)?",
              lambda p: p.tz, [lambda p: p.t, lambda p: p.t * p.k, lambda p: p.t - p.k],
              "Объём уменьшился в $[[k]]$ раза — во столько же раз меньше и время: $\\frac{[[t]]}{[[k]]} = [[ans]]$ с.",
              "Көлем $[[k]]$ есе азайды — уақыт та сонша есе азаяды: $\\frac{[[t]]}{[[k]]} = [[ans]]$ с.", decimals=0, unit="с"),
            Q("Сжатие и распаковка вместе занимают 10 с. Сколько секунд экономит сжатие?", "Сығу мен ашу бірге 10 с алады. Сығу неше секунд үнемдейді?",
              lambda p: p.t - p.tz - 10, [lambda p: p.t - p.tz, lambda p: p.t - p.tz + 10, lambda p: p.tz - 10 if p.tz > 10 else p.tz + 5],
              "Без сжатия $[[t]]$ с, со сжатием $[[tz]] + 10$ с. Экономия: $[[ans]]$ с.", "Сығусыз $[[t]]$ с, сығумен $[[tz]] + 10$ с. Үнем: $[[ans]]$ с.", decimals=0, unit="с"),
        ],
        variants=10,
    ),
    Context(
        id="inf.ctx.city-roads", **T("algorithms-and-programs", "hard"),
        params={"seed": list(range(1, 300))},
        derived=lambda p: (lambda e, w: {"e": e, "r": roads(e), "w": w, "outA": sum(1 for a, _ in e if a == "A"), "inF": sum(1 for _, b in e if b == "F")})(*graph(p.seed)),
        where=lambda p: 4 <= p.w["F"] <= 15 and len({p.w["D"], p.w["E"], p.w["F"], len(p.e)}) == 4 and p.outA >= 2 and p.inF >= 2 and p.w["D"] >= 2,
        context={"ru": "Между городами A, B, C, D, E, F проложены дороги с односторонним движением: [[r]].",
                 "kk": "A, B, C, D, E, F қалаларының арасында бір бағытты жолдар салынған: [[r]]."},
        questions=[
            Q("Сколько всего дорог на схеме?", "Сызбада барлығы неше жол (тікелей жол кесіндісі) бар?",
              lambda p: len(p.e), [lambda p: len(p.e) + 1, lambda p: len(p.e) - 1, lambda p: 6],
              "Считаем пары в списке: $[[ans]]$.", "Тізімдегі жұптарды санаймыз: $[[ans]]$.", decimals=0),
            Q("Сколько различных путей ведёт из A в D?", "A-дан D-ге неше түрлі маршрут бар?",
              lambda p: p.w["D"], [lambda p: p.w["D"] + 1, lambda p: p.w["C"] if p.w["C"] != p.w["D"] else p.w["D"] + 2, lambda p: p.w["E"]],
              "Число путей в город — сумма путей в города, из которых в него ведут дороги: $[[ans]]$.",
              "Қалаға келетін маршруттар саны — оған жол түсетін қалаларға келетін маршруттардың қосындысы: $[[ans]]$.", decimals=0),
            Q("Сколько различных путей ведёт из A в F?", "A-дан F-ке неше түрлі маршрут бар?",
              lambda p: p.w["F"], [lambda p: p.w["E"], lambda p: len(p.e), lambda p: p.w["F"] + p.w["D"]],
              "Считаем по порядку A, B, C, D, E, F: в F получается $[[ans]]$.", "A, B, C, D, E, F ретімен есептесек, F-ке $[[ans]]$ шығады.", decimals=0),
            Q("Сколько дорог выходит из города A?", "A қаласынан неше тікелей жол шығады?",
              lambda p: p.outA, [lambda p: p.outA + 1, lambda p: p.inF if p.inF != p.outA else p.outA + 2, lambda p: 1 if p.outA != 1 else 3],
              "Считаем пары, которые начинаются с A: $[[ans]]$.", "A-дан басталатын жұптарды санаймыз: $[[ans]]$.", decimals=0),
        ],
        variants=10,
    ),
]


# ---------- несколько верных ответов (ЕНТ 36–40) ----------
TEMPLATES += [
    Template(
        id="inf.m.multi.greater-than", kind="multi", **T("number-systems", "medium"),
        params={"seed": list(range(1, 150)), "X": [40, 50, 60, 70]},
        derived=lambda p: (lambda r: (lambda big, small: {"big": [tagged(v, b) for v, b in zip(big, r.sample([2, 8, 16], 3))], "small": [tagged(v, b) for v, b in zip(small, r.sample([2, 8, 16], 3))]})(r.sample(range(p.X + 1, p.X + 40), 3), r.sample(range(p.X - 30, p.X + 1), 3)))(random.Random(p.seed)),
        answers=[lambda p: p.big[0], lambda p: p.big[1], lambda p: p.big[2]],
        distractors=[lambda p: p.small[0], lambda p: p.small[1], lambda p: p.small[2]],
        text={"ru": "Какие из чисел больше $[[X]]_{10}$? Выберите все верные ответы.", "kk": "Қай сандар $[[X]]_{10}$ санынан үлкен? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "Переводим каждое число в десятичную систему и сравниваем с $[[X]]$.", "kk": "Әр санды ондық жүйеге аударып, $[[X]]$ санымен салыстырамыз."},
    ),
    Template(
        id="inf.m.multi.condition-yes", kind="multi", **T("python-programming", "medium"),
        params={"a": [2, 3, 4, 5, 6, 8, 10, 12], "b": [18, 20, 21, 24, 25, 27, 30, 36], "k": [2, 3, 4, 5, 6]},
        derived=lambda p: (lambda good, bad: {"good": good, "bad": bad, "code": f"x = int(input())\nif x > {p.a} and x < {p.b} and x % {p.k} == 0:\n    print('YES')\nelse:\n    print('NO')"})(
            [x for x in range(p.a + 1, p.b) if x % p.k == 0], [p.a, p.b, *[x for x in range(p.a + 1, p.b) if x % p.k != 0]]),
        where=lambda p: len(p.good) >= 3 and p.a % p.k == 0 and p.b % p.k == 0,
        answers=[lambda p: str(p.good[0]), lambda p: str(p.good[len(p.good) // 2]), lambda p: str(p.good[-1])],
        distractors=[lambda p: str(p.a), lambda p: str(p.b), lambda p: str(p.bad[2])],
        text={"ru": "При каких введённых значениях `x` программа выведет `YES`? Выберите все верные ответы.\n\n```python\n[[code]]\n```",
              "kk": "`x`-тің қандай енгізілген мәндерінде бағдарлама `YES` шығарады? Барлық дұрыс жауапты таңдаңыз.\n\n```python\n[[code]]\n```"},
        solution={"ru": "Нужно одновременно: `x` строго между [[a]] и [[b]] (границы не входят) и `x` делится на [[k]].",
                  "kk": "Бір мезгілде орындалуы керек: `x > [[a]]` және `x < [[b]]` (шекаралар кірмейді), сондай-ақ `x` [[k]] санына бөлінеді."},
    ),
]
