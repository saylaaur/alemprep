"""Информатика · новые типы задач (ночь 3): SQL-запросы, ключи и связи таблиц, логика, веб (HTML/CSS/URL),
программное обеспечение и устройства, IT-тренды и 3D-печать, Python, сети и безопасность; контекстные блоки.
Ответы к SQL и коду получаются вычислением по сгенерированной таблице / запуском кода.
Казахский текст — черновик для вычитки."""
import contextlib
import io
import itertools
import random

from ctx import Q
from engine import Context, Template, fmt_tex


def T(topic: str, level: str = "medium") -> dict:
    return dict(subject="informatics", topic=topic, level=level)


def run(code: str) -> str:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(code, {})  # код собран в этом файле из чисел-параметров
    return buf.getvalue().strip().replace("\n", " ")


def table(head: list, rows: list) -> str:
    w = [max(len(str(x)) for x in col) for col in zip(head, *rows)]
    fmt_row = lambda r: " | ".join(str(x).ljust(n) for x, n in zip(r, w))
    return "\n".join([fmt_row(head), "-+-".join("-" * n for n in w), *map(fmt_row, rows)])


Q_RUN = {"ru": "Что выведет программа?\n\n```python\n[[code]]\n```", "kk": "Бағдарлама не шығарады?\n\n```python\n[[code]]\n```"}
Q_SQL = {"ru": "Дана таблица `students`:\n\n```\n[[tbl]]\n```\n\nЧто вернёт запрос?\n\n```sql\n[[sql]]\n```",
         "kk": "`students` кестесі берілген:\n\n```\n[[tbl]]\n```\n\nСұрау не қайтарады?\n\n```sql\n[[sql]]\n```"}

NAMES = ["Asel", "Bauyrzhan", "Dana", "Erlan", "Aruzhan", "Nurlan", "Madina", "Timur", "Alikhan", "Zhanna", "Aigerim", "Daniyar"]
CLS = ["10A", "10B", "11A"]


def students(seed: int, n: int = 7) -> list:
    r = random.Random(seed * 7919)
    names = r.sample(NAMES, n)
    return [[i + 1, names[i], r.choice(CLS), r.randrange(50, 101, 5)] for i in range(n)]


def stbl(rows):
    return table(["id", "name", "class", "score"], rows)


def code_tpl(id_, topic, level, params, make, wrong_makers, sol_ru, sol_kk, where=lambda p: True, variants=40):
    return Template(
        id=f"inf.n.{id_}", **T(topic, level), params=params, where=where,
        derived=lambda p: {"code": make(p)},
        answer=lambda p: run(make(p)),
        distractors=[(lambda p, w=w: run(w(p))) for w in wrong_makers],
        text=Q_RUN, solution={"ru": sol_ru + " Программа выведет: `[[ans]]`.", "kk": sol_kk + " Бағдарлама шығарады: `[[ans]]`."}, variants=variants,
    )


def sql_tpl(id_, level, params, sql, ans, wrongs, sol_ru, sol_kk, where=None, n=7, decimals=0):
    def d(p):
        rows = students(p.seed, n)
        return {"rows": rows, "tbl": stbl(rows), "sql": sql(p)}
    return Template(
        id=f"inf.n.sql.{id_}", **T("database-design-sql", level), params=params, derived=d,
        where=where or (lambda p: True), answer=ans, distractors=wrongs, decimals=decimals, spread=None,
        text=Q_SQL, solution={"ru": sol_ru, "kk": sol_kk},
    )


# логические формулы: (формула, равносильная, [неравносильные])
NEG, AND, OR, IMP = "\\neg ", " \\land ", " \\lor ", " \\to "
EQUIV = [
    ("\\neg(A \\land B)", "\\neg A \\lor \\neg B", ["\\neg A \\land \\neg B", "A \\lor B", "\\neg A \\land B"]),
    ("\\neg(A \\lor B)", "\\neg A \\land \\neg B", ["\\neg A \\lor \\neg B", "A \\land B", "\\neg A \\lor B"]),
    ("A \\to B", "\\neg A \\lor B", ["A \\lor \\neg B", "\\neg A \\land B", "B \\to A"]),
    ("\\neg(A \\to B)", "A \\land \\neg B", ["\\neg A \\land B", "\\neg A \\lor B", "\\neg A \\to \\neg B"]),
    ("A \\lor (A \\land B)", "A", ["B", "A \\land B", "A \\lor B"]),
    ("A \\land (A \\lor B)", "A", ["B", "A \\lor B", "A \\land B"]),
    ("A \\to B", "\\neg B \\to \\neg A", ["B \\to A", "\\neg A \\to \\neg B", "A \\land B"]),
    ("(A \\lor B) \\land \\neg A", "\\neg A \\land B", ["A \\land \\neg B", "B", "A \\lor B"]),
    ("\\neg(\\neg A \\lor B)", "A \\land \\neg B", ["\\neg A \\land B", "A \\lor \\neg B", "\\neg A \\lor B"]),
]

HTML_TAGS = [("<a>", "гиперссылка", "гиперсілтеме"), ("<img>", "изображение", "сурет"), ("<table>", "таблица", "кесте"),
             ("<p>", "абзац", "абзац"), ("<ul>", "маркированный список", "маркерленген тізім"), ("<ol>", "нумерованный список", "нөмірленген тізім"),
             ("<h1>", "заголовок первого уровня", "бірінші деңгейлі тақырып"), ("<br>", "перенос строки", "жаңа жолға көшу"),
             ("<tr>", "строка таблицы", "кесте жолы"), ("<b>", "полужирный текст", "жартылай қалың мәтін")]
HTML_KK = {ru: kk for _, ru, kk in HTML_TAGS}

CSS = [("цвет текста", "мәтін түсі", "color"), ("цвет фона", "фон түсі", "background-color"), ("размер шрифта", "қаріп өлшемі", "font-size"),
       ("гарнитуру (семейство) шрифта", "қаріп гарнитурасы (тобы)", "font-family"), ("выравнивание текста", "мәтінді туралау", "text-align"),
       ("внешние отступы элемента", "элементтің сыртқы шегіністері", "margin"), ("внутренние отступы элемента", "элементтің ішкі шегіністері", "padding"),
       ("толщину и вид рамки", "жиектеменің қалыңдығы мен түрі", "border"), ("ширину элемента", "элементтің ені", "width")]

SOFT = [("Windows", 0), ("Linux", 0), ("Android", 0), ("драйвер принтера", 0), 
        ("Microsoft Word", 1), ("Excel", 1), ("браузер Chrome", 1), ("Photoshop", 1), ("компилятор C++", 2), ("среда PyCharm", 2), ("отладчик", 2)]
SOFT_KK = {"драйвер принтера": "принтер драйвері", "антивирус": "антивирус", "архиватор WinRAR": "WinRAR мұрағаттауышы", "браузер Chrome": "Chrome браузері",
           "компилятор C++": "C++ компиляторы", "среда PyCharm": "PyCharm ортасы", "отладчик": "жөндеуші бағдарлама (debugger)"}
SOFT_CAT = ["системное ПО", "прикладное ПО", "инструментальное ПО (системы программирования)", "аппаратное обеспечение"]
SOFT_CAT_KK = ["жүйелік БҚ", "қолданбалы БҚ", "аспаптық БҚ (бағдарламалау жүйелері)", "аппараттық қамтамасыз ету"]

DEV_IN = [("клавиатура", "пернетақта"), ("мышь", "тінтуір"), ("сканер", "сканер"), ("микрофон", "микрофон"), ("веб-камера", "веб-камера")]
DEV_OUT = [("монитор", "монитор"), ("принтер", "принтер"), ("колонки", "дыбыс колонкалары"), ("проектор", "проектор")]
DEV_KK = dict(DEV_IN + DEV_OUT)
DEV_ALL = [(ru, 0) for ru, _ in DEV_IN] + [(ru, 1) for ru, _ in DEV_OUT] + [("жёсткий диск", 2), ("флешка", 2), ("SSD-накопитель", 2), ("процессор", 3)]
DEV_KK.update({"жёсткий диск": "қатты диск", "флешка": "флеш-жинақтағыш", "SSD-накопитель": "SSD жинақтағышы", "процессор": "процессор"})
DEV_TYPE = ["устройство ввода", "устройство вывода", "устройство хранения", "устройство обработки"]
DEV_TYPE_KK = ["енгізу құрылғысы", "шығару құрылғысы", "сақтау құрылғысы", "өңдеу құрылғысы"]

TRENDS = [("интернет вещей (IoT)", "заттар интернеті (IoT)", "бытовые приборы и датчики обмениваются данными через сеть без участия человека", "тұрмыстық құралдар мен сенсорлар адамның қатысуынсыз желі арқылы деректер алмасады"),
          ("облачные вычисления", "бұлттық есептеулер", "программы и данные хранятся и обрабатываются на удалённых серверах, доступ — через интернет", "бағдарламалар мен деректер қашықтағы серверлерде сақталып, өңделеді, қол жеткізу — интернет арқылы"),
          ("блокчейн", "блокчейн", "записи хранятся цепочкой блоков, каждый блок содержит хеш предыдущего, подделать историю очень трудно", "жазбалар блоктар тізбегі түрінде сақталады, әр блокта алдыңғы блоктың хеші бар, тарихты бұрмалау өте қиын"),
          ("дополненная реальность (AR)", "толықтырылған шындық (AR)", "на изображение реального мира в камере накладываются виртуальные объекты", "камера түсірген нақты әлем бейнесіне виртуалды нысандар қабаттастырылады"),
          ("виртуальная реальность (VR)", "виртуалды шындық (VR)", "пользователь в шлеме полностью погружается в искусственно созданный мир", "арнайы дулыға киген пайдаланушы жасанды түрде құрылған әлемге толықтай енеді"),
          ("машинное обучение", "машиналық оқыту", "программа сама находит закономерности по большому числу примеров, а не по заранее написанным правилам", "бағдарлама алдын ала жазылған ережелер бойынша емес, көптеген мысалдар негізінде заңдылықтарды өзі табады"),
          ("большие данные (Big Data)", "үлкен деректер (Big Data)", "обработка огромных и быстро растущих массивов разнородных данных", "көлемі өте үлкен әрі жылдам өсетін әртүрлі деректер жиымдарын өңдеу"),
          ("3D-печать", "3D-басып шығару", "объект создаётся послойным нанесением материала по цифровой модели", "нысан сандық модель бойынша материалды қабаттап жағу арқылы жасалады")]
TRENDS_KK = {t[0]: t[1] for t in TRENDS}

DOMAINS = ["school.kz", "edu.gov.kz", "bilim.org", "math-club.kz", "library.edu.kz"]
FOLDERS = ["docs", "lessons", "files/2026", "ent/physics", "news"]
FILES = ["plan.html", "test.pdf", "index.php", "photo.jpg", "list.txt"]


def ip_variants(seed):
    r = random.Random(seed * 131)
    good = [".".join(str(r.randrange(0, 256)) for _ in range(4)) for _ in range(3)]
    bad_makers = [
        lambda: ".".join(str(x) for x in [r.randrange(1, 256), r.randrange(256, 300), r.randrange(0, 256), r.randrange(0, 256)]),
        lambda: ".".join(str(r.randrange(0, 256)) for _ in range(3)),
        lambda: ".".join(str(r.randrange(0, 256)) for _ in range(5)),
        lambda: ".".join(str(x) for x in [r.randrange(1, 256), r.randrange(0, 256), r.randrange(0, 256), -r.randrange(1, 9)]),
        lambda: ".".join(str(x) for x in [r.randrange(1, 256), r.randrange(0, 256), r.randrange(0, 256), r.randrange(300, 999)]),
    ]
    bad = [m() for m in r.sample(bad_makers, 3)]
    return good, bad


def prefix_mask(n: int) -> str:
    bits = "1" * n + "0" * (32 - n)
    return ".".join(str(int(bits[i:i + 8], 2)) for i in range(0, 32, 8))


def _pk(p):
    r = random.Random(p.seed * 31)
    surn = [r.choice(["Ахметов", "Ким", "Омаров", "Сейітов"]) for _ in range(5)]
    cls = [r.choice(["10A", "10B", "11A"]) for _ in range(5)]
    uniq = r.sample(range(1000, 9999), 5)
    rep = [r.choice([1205, 1310, 1402]) for _ in range(5)]
    tick, code = (uniq, [x % 1000 for x in rep]) if p.u == 0 else ([x for x in rep], [x % 1000 for x in uniq])
    cols = [surn, cls, tick, code]
    rows = [[surn[i], cls[i], tick[i], code[i]] for i in range(5)]
    return {"cols": cols, "tru": table(["Фамилия", "Класс", "Билет", "Код"], rows), "tkk": table(["Тегі", "Сынып", "Билет", "Код"], rows)}


def _join(p):
    r = random.Random(p.seed * 53)
    st = [[i + 1, n, r.randrange(1, 4)] for i, n in enumerate(r.sample(NAMES, 5))]
    cl = [[i + 1, t] for i, t in enumerate(r.sample(["Seitkali", "Ivanova", "Kim", "Omarova", "Bekov"], 3))]
    who = st[r.randrange(len(st))]
    return {"st": st, "cl": cl, "who": who, "wname": who[1], "t1": table(["id", "name", "class_id"], st), "t2": table(["class_id", "teacher"], cl)}


TEMPLATES = [
    # ---------- SQL ----------
    sql_tpl("count-and", "medium", {"seed": range(1, 120), "a": [60, 70, 75, 80, 85], "c": [0, 1, 2]},
            lambda p: f"SELECT COUNT(*) FROM students\nWHERE score > {p.a} AND class = '{CLS[p.c]}';",
            lambda p: sum(1 for r in p.rows if r[3] > p.a and r[2] == CLS[p.c]),
            [lambda p: sum(1 for r in p.rows if r[3] > p.a or r[2] == CLS[p.c]), lambda p: sum(1 for r in p.rows if r[3] > p.a),
             lambda p: sum(1 for r in p.rows if r[2] == CLS[p.c]), lambda p: sum(1 for r in p.rows if r[3] >= p.a and r[2] == CLS[p.c]) + 1],
            "`AND` — оба условия одновременно: отбираем строки нужного класса, где `score` строго больше порога. Получаем $[[ans]]$.",
            "`AND` — екі шарт та бір мезгілде орындалуы керек. Қажетті сыныптағы, `score` мәні шекті мәннен қатаң үлкен жолдарды санаймыз: $[[ans]]$.",
            where=lambda p: 1 <= sum(1 for r in students(p.seed) if r[3] > p.a and r[2] == CLS[p.c])),
    sql_tpl("count-or", "medium", {"seed": range(1, 120), "a": [85, 90, 95], "c": [0, 1, 2]},
            lambda p: f"SELECT COUNT(*) FROM students\nWHERE score >= {p.a} OR class = '{CLS[p.c]}';",
            lambda p: sum(1 for r in p.rows if r[3] >= p.a or r[2] == CLS[p.c]),
            [lambda p: sum(1 for r in p.rows if r[3] >= p.a and r[2] == CLS[p.c]), lambda p: sum(1 for r in p.rows if r[3] >= p.a) + sum(1 for r in p.rows if r[2] == CLS[p.c]),
             lambda p: sum(1 for r in p.rows if r[2] == CLS[p.c]), lambda p: sum(1 for r in p.rows if r[3] > p.a or r[2] == CLS[p.c])],
            "`OR` — достаточно одного условия; строку, где выполнены оба, считаем один раз. Ответ: $[[ans]]$.",
            "`OR` — бір шарттың орындалуы жеткілікті; екеуі де орындалған жол бір рет қана саналады. Жауабы: $[[ans]]$."),
    sql_tpl("sum-class", "medium", {"seed": range(1, 150), "c": [0, 1, 2]},
            lambda p: f"SELECT SUM(score) FROM students\nWHERE class = '{CLS[p.c]}';",
            lambda p: sum(r[3] for r in p.rows if r[2] == CLS[p.c]),
            [lambda p: sum(r[3] for r in p.rows), lambda p: sum(1 for r in p.rows if r[2] == CLS[p.c]), lambda p: max(r[3] for r in p.rows if r[2] == CLS[p.c]), lambda p: sum(r[3] for r in p.rows if r[2] != CLS[p.c])],
            "Складываем `score` только в строках, где `class` равен заданному: $[[ans]]$.",
            "`class` берілген мәнге тең жолдардағы `score` мәндерін ғана қосамыз: $[[ans]]$.",
            where=lambda p: sum(1 for r in students(p.seed) if r[2] == CLS[p.c]) >= 2),
    sql_tpl("avg", "hard", {"seed": range(1, 300), "c": [0, 1, 2]},
            lambda p: f"SELECT AVG(score) FROM students\nWHERE class = '{CLS[p.c]}';",
            lambda p: round(sum(r[3] for r in p.rows if r[2] == CLS[p.c]) / sum(1 for r in p.rows if r[2] == CLS[p.c]), 2),
            [lambda p: round(sum(r[3] for r in p.rows) / len(p.rows), 2), lambda p: sum(r[3] for r in p.rows if r[2] == CLS[p.c]),
             lambda p: round(sum(r[3] for r in p.rows if r[2] == CLS[p.c]) / len(p.rows), 2), lambda p: max(r[3] for r in p.rows if r[2] == CLS[p.c])],
            "`AVG` — сумма значений в отобранных строках, делённая на их количество: $[[ans]]$.",
            "`AVG` — таңдалған жолдардағы мәндер қосындысының олардың санына қатынасы: $[[ans]]$.",
            where=lambda p: sum(1 for r in students(p.seed) if r[2] == CLS[p.c]) >= 2 and (lambda s, k: s * 100 % k == 0)(sum(r[3] for r in students(p.seed) if r[2] == CLS[p.c]), sum(1 for r in students(p.seed) if r[2] == CLS[p.c])), decimals=2),
    sql_tpl("order-limit", "medium", {"seed": range(1, 200), "d": [0, 1]},
            lambda p: f"SELECT name FROM students\nORDER BY score {'DESC' if p.d else 'ASC'}\nLIMIT 1;",
            lambda p: sorted(p.rows, key=lambda r: r[3], reverse=bool(p.d))[0][1],
            [lambda p: sorted(p.rows, key=lambda r: r[3], reverse=not p.d)[0][1], lambda p: sorted(p.rows, key=lambda r: r[3], reverse=bool(p.d))[1][1],
             lambda p: p.rows[0][1], lambda p: sorted(p.rows, key=lambda r: r[1])[0][1]],
            "Сортируем по `score` (`DESC` — по убыванию, `ASC` — по возрастанию), `LIMIT 1` оставляет первую строку: [[ans]].",
            "`score` бойынша сұрыптаймыз (`DESC` — кему, `ASC` — өсу ретімен), `LIMIT 1` бірінші жолды ғана қалдырады: [[ans]].",
            where=lambda p: len({r[3] for r in students(p.seed)}) == 7 and len({sorted(students(p.seed), key=lambda r: r[3])[0][1], sorted(students(p.seed), key=lambda r: r[3])[-1][1], sorted(students(p.seed), key=lambda r: r[3], reverse=bool(p.d))[1][1], students(p.seed)[0][1], sorted(students(p.seed), key=lambda r: r[1])[0][1]}) == 5),
    sql_tpl("between", "medium", {"seed": range(1, 150), "a": [60, 65, 70, 75], "b": [80, 85, 90, 95]},
            lambda p: f"SELECT COUNT(*) FROM students\nWHERE score BETWEEN {p.a} AND {p.b};",
            lambda p: sum(1 for r in p.rows if p.a <= r[3] <= p.b),
            [lambda p: sum(1 for r in p.rows if p.a < r[3] < p.b), lambda p: sum(1 for r in p.rows if not p.a <= r[3] <= p.b), lambda p: sum(1 for r in p.rows if p.a <= r[3] <= p.b) + 1, lambda p: sum(1 for r in p.rows if r[3] >= p.a)],
            "`BETWEEN a AND b` включает обе границы: $a \\le score \\le b$. Таких строк $[[ans]]$.",
            "`BETWEEN a AND b` екі шекті мәнді де қамтиды: $a \\le score \\le b$. Мұндай жолдар саны — $[[ans]]$.",
            where=lambda p: sum(1 for r in students(p.seed) if r[3] in (p.a, p.b)) >= 1),
    sql_tpl("like", "easy", {"seed": range(1, 150), "ch": ["A", "D", "N", "M", "T", "Z"]},
            lambda p: f"SELECT COUNT(*) FROM students\nWHERE name LIKE '{p.ch}%';",
            lambda p: sum(1 for r in p.rows if r[1].startswith(p.ch)),
            [lambda p: sum(1 for r in p.rows if p.ch.lower() in r[1].lower()), lambda p: sum(1 for r in p.rows if r[1].endswith(p.ch.lower())) + 7, lambda p: sum(1 for r in p.rows if not r[1].startswith(p.ch))],
            "В шаблоне `LIKE` знак `%` означает любую последовательность символов, значит отбираются имена, **начинающиеся** с заданной буквы: $[[ans]]$.",
            "`LIKE` үлгісінде `%` белгісі кез келген таңбалар тізбегін білдіреді, демек берілген әріптен **басталатын** есімдер таңдалады: $[[ans]]$.",
            where=lambda p: sum(1 for r in students(p.seed) if r[1].startswith(p.ch)) >= 1),
    sql_tpl("distinct", "easy", {"seed": range(1, 200)},
            lambda p: "SELECT COUNT(DISTINCT class) FROM students;",
            lambda p: len({r[2] for r in p.rows}),
            [lambda p: len(p.rows), lambda p: len({r[3] for r in p.rows}), lambda p: len({r[2] for r in p.rows}) + 1],
            "`DISTINCT` убирает повторы: считаем разные значения поля `class` — $[[ans]]$.",
            "`DISTINCT` қайталанатын мәндерді алып тастайды: `class` өрісінің әртүрлі мәндерін санаймыз — $[[ans]]$.",
            where=lambda p: len({r[2] for r in students(p.seed)}) < 3 or p.seed % 3 == 0),
    sql_tpl("group-max", "hard", {"seed": range(1, 200), "c": [0, 1, 2]},
            lambda p: f"SELECT MAX(score) FROM students\nWHERE class = '{CLS[p.c]}';",
            lambda p: max(r[3] for r in p.rows if r[2] == CLS[p.c]),
            [lambda p: max(r[3] for r in p.rows), lambda p: min(r[3] for r in p.rows if r[2] == CLS[p.c]), lambda p: sum(r[3] for r in p.rows if r[2] == CLS[p.c]), lambda p: sum(1 for r in p.rows if r[2] == CLS[p.c])],
            "`WHERE` оставляет строки нужного класса, `MAX(score)` берёт среди них наибольший балл: $[[ans]]$.",
            "`WHERE` қажетті сыныптың жолдарын қалдырады, `MAX(score)` солардың ішінен ең үлкен балды алады: $[[ans]]$.",
            where=lambda p: sum(1 for r in students(p.seed) if r[2] == CLS[p.c]) >= 2 and max(r[3] for r in students(p.seed) if r[2] == CLS[p.c]) != max(r[3] for r in students(p.seed))),
    Template(
        id="inf.n.sql.commands", kind="multi", **T("database-design-sql", "easy"),
        params={"k": [0, 1, 2, 3]},
        answers=[lambda p: "`INSERT`", lambda p: "`UPDATE`", lambda p: "`DELETE`"],
        distractors=[lambda p: "`SELECT`", lambda p: ["`ORDER BY`", "`WHERE`", "`GROUP BY`", "`COUNT`"][p.k], lambda p: ["`FROM`", "`LIMIT`", "`DISTINCT`", "`AS`"][p.k]],
        variants=4,
        text={"ru": "Какие команды SQL **изменяют** данные в таблице (добавляют, меняют или удаляют записи)? Выберите все верные ответы.",
              "kk": "SQL тілінің қай командалары кестедегі деректерді **өзгертеді** (жазбаларды қосады, өзгертеді немесе жояды)? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "`INSERT` добавляет записи, `UPDATE` изменяет, `DELETE` удаляет. `SELECT` и его части (`WHERE`, `ORDER BY`, `LIMIT`…) только читают данные.",
                  "kk": "`INSERT` жазба қосады, `UPDATE` өзгертеді, `DELETE` жояды. `SELECT` және оның бөліктері (`WHERE`, `ORDER BY`, `LIMIT`…) деректерді тек оқиды."},
    ),
    Template(
        id="inf.n.sql.update", **T("database-design-sql", "hard"),
        params={"seed": range(1, 200), "a": [70, 75, 80], "k": [5, 10]},
        derived=lambda p: (lambda rows: {"rows": rows, "tbl": stbl(rows), "sql": f"UPDATE students SET score = score + {p.k}\nWHERE score < {p.a};\nSELECT SUM(score) FROM students;"})(students(p.seed)),
        answer=lambda p: sum(r[3] + (p.k if r[3] < p.a else 0) for r in p.rows),
        distractors=[lambda p: sum(r[3] for r in p.rows), lambda p: sum(r[3] + p.k for r in p.rows), lambda p: sum(r[3] + (p.k if r[3] <= p.a else 0) for r in p.rows) + (0 if any(r[3] == p.a for r in p.rows) else p.k),
                     lambda p: sum(r[3] + (p.k if r[3] > p.a else 0) for r in p.rows)],
        where=lambda p: 2 <= sum(1 for r in students(p.seed) if r[3] < p.a) <= 5,
        decimals=0, spread=None,
        text={"ru": "Дана таблица `students`:\n\n```\n[[tbl]]\n```\n\nВыполнили команды:\n\n```sql\n[[sql]]\n```\n\nКакое число вернёт последний запрос?",
              "kk": "`students` кестесі берілген:\n\n```\n[[tbl]]\n```\n\nМына командалар орындалды:\n\n```sql\n[[sql]]\n```\n\nСоңғы сұрау қандай сан қайтарады?"},
        solution={"ru": "`UPDATE` увеличивает `score` только у строк, где он меньше порога; затем складываем все баллы уже **после** изменения: $[[ans]]$.",
                  "kk": "`UPDATE` `score` мәні шекті мәннен кіші жолдарда ғана оны арттырады; содан кейін барлық балдарды өзгерістен **кейін** қосамыз: $[[ans]]$."},
    ),

    # ---------- реляционные базы: ключи и связи ----------
    Template(
        id="inf.n.rdb.primary-key", **T("relational-databases", "medium"),
        params={"seed": range(1, 200), "u": [0, 1]},
        derived=_pk,
        where=lambda p: len(set(p.cols[0])) < 5 and len(set(p.cols[1])) < 5 and len(set(p.cols[3 - p.u])) < 5 and len(set(p.cols[2 + p.u])) == 5,
        answer=lambda p: ["Билет", "Код"][p.u],
        distractors=[lambda p: ["Код", "Билет"][p.u], lambda p: "Фамилия", lambda p: "Класс"],
        options_kk={"Фамилия": "Тегі", "Класс": "Сынып", "Билет": "Билет", "Код": "Код"},
        variants=40,
        text={"ru": "Дан фрагмент таблицы:\n\n```\n[[tru]]\n```\n\nКакое поле по этим данным может быть первичным ключом?",
              "kk": "Кестенің үзіндісі берілген:\n\n```\n[[tkk]]\n```\n\nОсы деректер бойынша қай өріс бастапқы кілт бола алады?"},
        solution={"ru": "Первичный ключ однозначно определяет запись, поэтому его значения не повторяются. Без повторов только поле «[[ans]]».",
                  "kk": "Бастапқы кілт жазбаны бірмәнді анықтайды, сондықтан оның мәндері қайталанбайды. Мәндері қайталанбайтын жалғыз өріс — «[[ans]]»."},
    ),
    Template(
        id="inf.n.rdb.join", **T("relational-databases", "hard"),
        params={"seed": range(1, 300)},
        derived=_join,
        where=lambda p: len({s[2] for s in p.st}) == 3,
        answer=lambda p: p.cl[p.who[2] - 1][1],
        distractors=[lambda p: p.cl[p.who[2] % 3][1], lambda p: p.cl[(p.who[2] + 1) % 3][1], lambda p: p.cl[p.who[0] % 3 - 1][1] if p.cl[p.who[0] % 3 - 1][1] != p.cl[p.who[2] - 1][1] else "Bekov" if "Bekov" not in [c[1] for c in p.cl] else "Ivanova"],
        variants=50,
        text={"ru": "Даны две таблицы, связанные по полю `class_id`.\n\n`students`:\n```\n[[t1]]\n```\n\n`classes`:\n```\n[[t2]]\n```\n\nКто классный руководитель ученика [[wname]]?",
              "kk": "`class_id` өрісі арқылы байланысқан екі кесте берілген.\n\n`students`:\n```\n[[t1]]\n```\n\n`classes`:\n```\n[[t2]]\n```\n\n[[wname]] оқушысының сынып жетекшісі кім?"},
        solution={"ru": "В `students` находим `class_id` ученика, затем в `classes` — строку с таким же `class_id`. Это внешний ключ: руководитель — [[ans]].",
                  "kk": "`students` кестесінен оқушының `class_id` мәнін, содан кейін `classes` кестесінен `class_id` мәні дәл сондай жолды табамыз. Мұндағы `class_id` — сыртқы кілт. Сынып жетекшісі — [[ans]]."},
    ),

    # ---------- логика ----------
    Template(
        id="inf.n.logic.equivalent", **T("logic-foundations", "medium"),
        params={"i": range(len(EQUIV))},
        derived=lambda p: {"f": EQUIV[p.i][0]},
        answer=lambda p: f"${EQUIV[p.i][1]}$",
        distractors=[(lambda p, j=j: f"${EQUIV[p.i][2][j]}$") for j in range(3)],
        variants=9,
        text={"ru": "Какое выражение равносильно выражению $[[f]]$?", "kk": "Қай өрнек $[[f]]$ өрнегімен мәндес?"},
        solution={"ru": "Используем законы де Моргана, $A \\to B = \\neg A \\lor B$ и законы поглощения. Проверка по таблице истинности даёт [[ans]].",
                  "kk": "Де Морган заңдарын, $A \\to B = \\neg A \\lor B$ теңдігін және жұтылу заңдарын қолданамыз. Ақиқаттық кестесі бойынша тексерсек, [[ans]] шығады."},
    ),
    Template(
        id="inf.n.logic.implication-count", **T("logic-foundations", "hard"),
        params={"a": [2, 3, 4, 5, 6], "b": [2, 3, 4, 6, 9, 10, 12], "N": [20, 30, 40, 50]},
        where=lambda p: p.a != p.b and p.a % p.b != 0,
        answer=lambda p: sum(1 for x in range(1, p.N + 1) if not (x % p.a == 0) or x % p.b == 0),
        distractors=[lambda p: sum(1 for x in range(1, p.N + 1) if x % p.a == 0 and x % p.b == 0), lambda p: sum(1 for x in range(1, p.N + 1) if x % p.a == 0 or x % p.b == 0),
                     lambda p: sum(1 for x in range(1, p.N + 1) if not (x % p.b == 0) or x % p.a == 0), lambda p: p.N - sum(1 for x in range(1, p.N + 1) if not (x % p.a == 0) or x % p.b == 0)],
        decimals=0, spread=None,
        text={"ru": "Сколько натуральных чисел $x$ от $1$ до $[[N]]$ делают истинным высказывание: **(x делится на [[a]]) → (x делится на [[b]])**?",
              "kk": "$1$ мен $[[N]]$ аралығындағы неше натурал $x$ саны **(x саны [[a]] санына бөлінеді) → (x саны [[b]] санына бөлінеді)** тұжырымын ақиқат етеді?"},
        solution={"ru": "Импликация ложна только при истинной посылке и ложном следствии: $x$ делится на $[[a]]$, но не на $[[b]]$. Вычитаем такие $x$ из $[[N]]$: остаётся $[[ans]]$.",
                  "kk": "Импликация алғышарты ақиқат, ал салдары жалған болғанда ғана жалған болады: $x$ саны $[[a]]$ санына бөлінеді, бірақ $[[b]]$ санына бөлінбейді. Мұндай $x$ сандарының санын $[[N]]$ санынан шегереміз: $[[ans]]$ қалады."},
    ),
    Template(
        id="inf.n.logic.min-x", **T("logic-foundations", "medium"),
        params={"a": [5, 8, 10, 12, 15, 20, 25], "b": [3, 4, 6, 7, 9], "w": [0]},
        derived=lambda p: {"op": "\\lor" if p.w else "\\land", "op_ru": "ИЛИ" if p.w else "И", "op_kk": "НЕМЕСЕ" if p.w else "ЖӘНЕ"},
        answer=lambda p: next(x for x in range(1, 500) if (x > p.a or x % p.b == 0) if p.w) if p.w else next(x for x in range(1, 500) if x > p.a and x % p.b == 0),
        distractors=[lambda p: p.a + 1 if p.w == 0 else p.a, lambda p: p.b * 2 if p.b * 2 != (next(x for x in range(1, 500) if x > p.a or x % p.b == 0) if p.w else next(x for x in range(1, 500) if x > p.a and x % p.b == 0)) else p.b * 3,
                     lambda p: (next(x for x in range(1, 500) if x > p.a and x % p.b == 0) + p.b) if p.w == 0 else p.a + 1, lambda p: 1 if p.w == 0 else p.a + p.b],
        decimals=0, spread=None, variants=40,
        text={"ru": "Найдите наименьшее натуральное $x$, для которого истинно высказывание: **(x > [[a]]) [[op_ru]] (x делится на [[b]])**.",
              "kk": "**(x > [[a]]) [[op_kk]] (x саны [[b]] санына бөлінеді)** тұжырымы ақиқат болатын ең кіші натурал $x$ санын табыңыз."},
        solution={"ru": "Перебираем $x = 1, 2, 3, \\dots$ и проверяем оба условия с учётом связки «[[op_ru]]». Первое подходящее число — $[[ans]]$.",
                  "kk": "$x = 1, 2, 3, \\dots$ мәндерін кезекпен алып, «[[op_kk]]» амалын ескере отырып екі шартты тексереміз. Шартты қанағаттандыратын алғашқы сан — $[[ans]]$."},
    ),

    # ---------- веб ----------
    Template(
        id="inf.n.web.tag-match", kind="match", **T("web-design", "easy"),
        params={"i": range(len(HTML_TAGS)), "j": range(len(HTML_TAGS))},
        where=lambda p: p.i != p.j,
        derived=lambda p: {"t1": HTML_TAGS[p.i][0], "t2": HTML_TAGS[p.j][0]},
        rows={"ru": ["`[[t1]]`", "`[[t2]]`"], "kk": ["`[[t1]]`", "`[[t2]]`"]},
        answers=[lambda p: HTML_TAGS[p.i][1], lambda p: HTML_TAGS[p.j][1]],
        distractors=[(lambda p, k=k: [t for n, t in enumerate(HTML_TAGS) if n not in (p.i, p.j)][(p.i * 3 + p.j + k * 4) % (len(HTML_TAGS) - 2)][1]) for k in range(2)],
        options_kk=HTML_KK, variants=40,
        text={"ru": "Установите соответствие между тегом HTML и его назначением.", "kk": "HTML тегі мен оның қызметі арасындағы сәйкестікті анықтаңыз."},
        solution={"ru": "`[[t1]]` — [[ans1]]; `[[t2]]` — [[ans2]].", "kk": "`[[t1]]` — [[ans1]]; `[[t2]]` — [[ans2]]."},
    ),
    Template(
        id="inf.n.web.css-prop", **T("web-design", "easy"),
        params={"i": range(len(CSS))},
        derived=lambda p: {"what": CSS[p.i][0], "what_kk": CSS[p.i][1], "what_cap": CSS[p.i][1][0].upper() + CSS[p.i][1][1:]},
        answer=lambda p: f"`{CSS[p.i][2]}`",
        distractors=[(lambda p, k=k: f"`{CSS[(p.i + k) % len(CSS)][2]}`") for k in (1, 3, 5)],
        variants=9,
        text={"ru": "Какое свойство CSS задаёт [[what]]?", "kk": "CSS-тің қай қасиеті арқылы [[what_kk]] беріледі?"},
        solution={"ru": "За [[what]] отвечает свойство [[ans]].", "kk": "[[what_cap]] [[ans]] қасиеті арқылы беріледі."},
    ),
    Template(
        id="inf.n.web.rgb-hex", **T("web-design", "medium"),
        params={"r": [0, 17, 51, 102, 128, 160, 204, 255], "g": [0, 34, 68, 136, 170, 221, 255], "b": [0, 51, 85, 119, 187, 240, 255]},
        where=lambda p: len({p.r, p.g, p.b}) == 3,
        answer=lambda p: f"`#{p.r:02X}{p.g:02X}{p.b:02X}`",
        distractors=[lambda p: f"`#{p.b:02X}{p.g:02X}{p.r:02X}`", lambda p: f"`#{p.r % 100:02d}{p.g % 100:02d}{p.b % 100:02d}`", lambda p: f"`#{p.g:02X}{p.r:02X}{p.b:02X}`"],
        variants=40,
        text={"ru": "Цвет задан в CSS как `rgb([[r]], [[g]], [[b]])`. Как записать этот цвет в шестнадцатеричном виде?",
              "kk": "Түс CSS-те `rgb([[r]], [[g]], [[b]])` түрінде берілген. Бұл түс он алтылық түрде қалай жазылады?"},
        solution={"ru": "Каждый канал (красный, зелёный, синий) переводим в две шестнадцатеричные цифры и записываем по порядку: [[ans]].",
                  "kk": "Әр арнаны (қызыл, жасыл, көк) екі таңбалы он алтылық санға айналдырып, ретімен жазамыз: [[ans]]."},
    ),
    Template(
        id="inf.n.web.url", kind="match", **T("web-design", "medium"),
        params={"d": range(len(DOMAINS)), "f": range(len(FOLDERS)), "n": range(len(FILES)), "s": ["https", "http", "ftp"]},
        derived=lambda p: {"url": f"{p.s}://{DOMAINS[p.d]}/{FOLDERS[p.f]}/{FILES[p.n]}"},
        rows={"ru": ["доменное имя сервера", "имя файла"], "kk": ["сервердің домендік аты", "файл аты"]},
        answers=[lambda p: f"`{DOMAINS[p.d]}`", lambda p: f"`{FILES[p.n]}`"],
        distractors=[lambda p: f"`{FOLDERS[p.f]}`", lambda p: f"`{p.s}`", lambda p: f"`{FOLDERS[p.f]}/{FILES[p.n]}`"],
        variants=40,
        text={"ru": "Дан адрес ресурса в интернете: `[[url]]`. Установите соответствие.", "kk": "Интернеттегі ресурстың мекенжайы берілген: `[[url]]`. Сәйкестікті анықтаңыз."},
        solution={"ru": "URL = протокол `://` сервер `/` путь к папке `/` файл. Сервер — [[ans1]], файл — [[ans2]].",
                  "kk": "URL = хаттама `://` сервер `/` бумаға дейінгі жол `/` файл. Сервер — [[ans1]], файл — [[ans2]]."},
    ),

    # ---------- ПО и устройства ----------
    Template(
        id="inf.n.hw.software-kind", **T("hardware-and-software", "easy"),
        params={"i": range(len(SOFT))},
        derived=lambda p: {"name": SOFT[p.i][0], "name_kk": SOFT_KK.get(SOFT[p.i][0], SOFT[p.i][0]), "name_cap": (lambda k: k[0].upper() + k[1:])(SOFT_KK.get(SOFT[p.i][0], SOFT[p.i][0]))},
        answer=lambda p: SOFT_CAT[SOFT[p.i][1]],
        distractors=[(lambda p, k=k: SOFT_CAT[(SOFT[p.i][1] + k) % 4]) for k in (1, 2, 3)],
        options_kk=dict(zip(SOFT_CAT, SOFT_CAT_KK)), variants=13,
        text={"ru": "К какому виду программного обеспечения относится «[[name]]»?", "kk": "«[[name_cap]]» бағдарламалық қамтамасыз етудің қай түріне жатады?"},
        solution={"ru": "ПО делят на системное (ОС, драйверы, служебные программы), прикладное (для задач пользователя) и инструментальное (системы программирования). Аппаратное обеспечение — это устройства, а не программы. Ответ: [[ans]].",
                  "kk": "БҚ жүйелік (ОЖ, драйверлер, қызметтік бағдарламалар), қолданбалы (пайдаланушы есептеріне арналған) және аспаптық (бағдарламалау жүйелері) болып бөлінеді. Аппараттық қамтамасыз ету — бағдарламалар емес, құрылғылар. Жауабы: [[ans]]."},
    ),
    Template(
        id="inf.n.hw.cpu-time", **T("hardware-and-software", "medium"),
        params={"f": [1, 2, 2.5, 3, 4], "k": [1, 2, 4], "N": [6, 12, 24, 60, 120]},
        where=lambda p: (p.N * 1e9 / (p.f * 1e9 * p.k)) * 100 % 1 == 0,
        answer=lambda p: round(p.N / (p.f * p.k), 2),
        distractors=[lambda p: round(p.N / p.f, 2), lambda p: round(p.N * p.f / p.k, 2), lambda p: round(p.N / (p.f * p.k) * 1000, 2), lambda p: round(p.N * p.k / p.f, 2)],
        unit="с", decimals=2,
        text={"ru": "Процессор с тактовой частотой $[[f]]$ ГГц за один такт выполняет столько операций: $[[k]]$. За сколько секунд он выполнит $[[N]]$ млрд операций?",
              "kk": "Такт жиілігі $[[f]]$ ГГц процессор бір тактіде $[[k]]$ амал орындайды. Ол $[[N]]$ млрд амалды неше секундта орындайды?"},
        solution={"ru": "За секунду: $[[f]] \\cdot 10^9 \\cdot [[k]]$ операций. $t = \\frac{[[N]] \\cdot 10^9}{[[f]] \\cdot 10^9 \\cdot [[k]]} = [[ans]]$ с.",
                  "kk": "Бір секундта: $[[f]] \\cdot 10^9 \\cdot [[k]]$ амал. $t = \\frac{[[N]] \\cdot 10^9}{[[f]] \\cdot 10^9 \\cdot [[k]]} = [[ans]]$ с."},
    ),
    Template(
        id="inf.n.dev.input", kind="multi", **T("computer-devices", "easy"),
        params={"a": list(itertools.combinations(range(5), 3)), "b": list(itertools.combinations(range(4), 3))},
        answers=[(lambda p, j=j: DEV_IN[p.a[j]][0]) for j in range(3)],
        distractors=[(lambda p, j=j: DEV_OUT[p.b[j]][0]) for j in range(3)],
        options_kk={ru: kk for ru, kk in DEV_IN + DEV_OUT}, variants=40,
        text={"ru": "Какие из перечисленных устройств являются устройствами **ввода** информации? Выберите все верные ответы.",
              "kk": "Аталған құрылғылардың қайсылары ақпаратты **енгізу** құрылғыларына жатады? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "Устройства ввода передают данные в компьютер (клавиатура, мышь, сканер, микрофон, камера). Монитор, принтер, колонки, проектор — устройства вывода.",
                  "kk": "Енгізу құрылғылары деректерді компьютерге береді (пернетақта, тінтуір, сканер, микрофон, камера). Монитор, принтер, колонкалар, проектор — шығару құрылғылары."},
    ),
    Template(
        id="inf.n.dev.type-match", kind="match", **T("computer-devices", "medium"),
        params={"i": range(len(DEV_ALL)), "j": range(len(DEV_ALL))},
        where=lambda p: DEV_ALL[p.i][1] != DEV_ALL[p.j][1],
        derived=lambda p: {"d1": DEV_ALL[p.i][0], "d2": DEV_ALL[p.j][0], "k1": DEV_KK[DEV_ALL[p.i][0]], "k2": DEV_KK[DEV_ALL[p.j][0]]},
        rows={"ru": ["[[d1]]", "[[d2]]"], "kk": ["[[k1]]", "[[k2]]"]},
        answers=[lambda p: DEV_TYPE[DEV_ALL[p.i][1]], lambda p: DEV_TYPE[DEV_ALL[p.j][1]]],
        distractors=[(lambda p, k=k: [t for n, t in enumerate(DEV_TYPE) if n not in (DEV_ALL[p.i][1], DEV_ALL[p.j][1])][k]) for k in range(2)],
        options_kk=dict(zip(DEV_TYPE, DEV_TYPE_KK)), variants=40,
        text={"ru": "Установите соответствие между устройством и его назначением.", "kk": "Құрылғы мен оның қызметі арасындағы сәйкестікті анықтаңыз."},
        solution={"ru": "[[d1]] — [[ans1]]; [[d2]] — [[ans2]].", "kk": "[[k1]] — [[ans1]]; [[k2]] — [[ans2]]."},
    ),

    # ---------- IT-тренды и 3D ----------
    Template(
        id="inf.n.it.trend", **T("it-trends-and-3d", "easy"),
        params={"i": range(len(TRENDS))},
        derived=lambda p: {"desc": TRENDS[p.i][2], "desc_kk": TRENDS[p.i][3]},
        answer=lambda p: TRENDS[p.i][0],
        distractors=[(lambda p, k=k: TRENDS[(p.i + k) % len(TRENDS)][0]) for k in (1, 3, 5)],
        options_kk=TRENDS_KK, variants=8,
        text={"ru": "Как называется технология: «[[desc]]»?", "kk": "Технология қалай аталады: «[[desc_kk]]»?"},
        solution={"ru": "Это описание технологии «[[ans]]».", "kk": "Бұл — «[[ans]]» технологиясының сипаттамасы."},
    ),
    Template(
        id="inf.n.it.print-time", **T("it-trends-and-3d", "medium"),
        params={"H": [2, 3, 4, 5, 6, 8], "h": [0.1, 0.2, 0.25], "t": [15, 20, 30, 45, 60]},
        where=lambda p: (p.H * 10 / p.h * p.t / 60) % 1 == 0,
        answer=lambda p: round(p.H * 10 / p.h * p.t / 60),
        distractors=[lambda p: round(p.H / p.h * p.t / 60), lambda p: round(p.H * 10 / p.h * p.t), lambda p: round(p.H * 10 * p.h * p.t / 60, 2), lambda p: round(p.H * 10 / p.h * p.t / 3600, 2)],
        unit="мин", decimals=2,
        text={"ru": "3D-принтер печатает один слой толщиной $[[h]]$ мм за $[[t]]$ с. Сколько минут займёт печать детали высотой $[[H]]$ см?",
              "kk": "3D-принтер қалыңдығы $[[h]]$ мм бір қабатты $[[t]]$ с ішінде басып шығарады. Биіктігі $[[H]]$ см бөлшекті басып шығару неше минутқа созылады?"},
        solution={"ru": "Слоёв: $\\frac{[[H]] \\cdot 10}{[[h]]}$ (сантиметры переводим в миллиметры). Время: слои $\\cdot [[t]]$ с, делим на $60$: $[[ans]]$ мин.",
                  "kk": "Қабаттар саны: $\\frac{[[H]] \\cdot 10}{[[h]]}$ (сантиметрді миллиметрге айналдырамыз). Уақыт: қабаттар саны $\\cdot [[t]]$ с, оны $60$-қа бөлеміз: $[[ans]]$ мин."},
    ),
    Template(
        id="inf.n.it.filament", **T("it-trends-and-3d", "hard"),
        params={"V": [40, 60, 80, 100, 120, 200], "q": [20, 25, 40, 50, 100], "pr": [8, 10, 12]},
        answer=lambda p: round(p.V * p.q / 100 * 1.25 * p.pr, 2),
        distractors=[lambda p: round(p.V * 1.25 * p.pr, 2), lambda p: round(p.V * p.q / 100 * p.pr, 2), lambda p: round(p.V * p.q / 100 * 1.25, 2), lambda p: round(p.V * p.q * 1.25 * p.pr, 2)],
        unit="тг", decimals=2,
        text={"ru": "Модель объёмом $[[V]]$ см³ печатают пластиком PLA (плотность $1{,}25$ г/см³) с заполнением $[[q]]\\%$. Грамм пластика стоит $[[pr]]$ тг. Сколько стоит пластик на эту модель?",
              "kk": "Көлемі $[[V]]$ см³ модельді PLA пластигімен (тығыздығы $1{,}25$ г/см³) $[[q]]\\%$ толтыру арқылы басып шығарады. Пластиктің бір граммы $[[pr]]$ тг тұрады. Осы модельге кететін пластик қанша тұрады?"},
        solution={"ru": "Объём пластика: $[[V]] \\cdot [[q]]\\%$; масса — объём $\\cdot 1{,}25$; стоимость — масса $\\cdot [[pr]]$: $[[ans]]$ тг.",
                  "kk": "Пластик көлемі: $[[V]] \\cdot [[q]]\\%$; массасы — көлем $\\cdot 1{,}25$; құны — масса $\\cdot [[pr]]$: $[[ans]]$ тг."},
    ),

    # ---------- Python ----------
    code_tpl("py.list-filter", "python-programming", "medium",
             {"seed": range(1, 80), "k": [2, 3, 5]},
             lambda p: f"a = {random.Random(p.seed).sample(range(1, 40), 7)}\nprint(sum(x for x in a if x % {p.k} == 0))",
             [lambda p: f"a = {random.Random(p.seed).sample(range(1, 40), 7)}\nprint(sum(x for x in a if x % {p.k} != 0))",
              lambda p: f"a = {random.Random(p.seed).sample(range(1, 40), 7)}\nprint(len([x for x in a if x % {p.k} == 0]))",
              lambda p: f"a = {random.Random(p.seed).sample(range(1, 40), 7)}\nprint(sum(a))"],
             "Генератор отбирает элементы, делящиеся на заданное число без остатка, `sum` их складывает.",
             "Генератор өрнегі берілген санға қалдықсыз бөлінетін элементтерді таңдайды, `sum` оларды қосады.",
             where=lambda p: 2 <= sum(1 for x in random.Random(p.seed).sample(range(1, 40), 7) if x % p.k == 0) <= 5),
    code_tpl("py.slice", "python-programming", "medium",
             {"n": [8, 10, 12], "i": [1, 2, 3], "j": [6, 7, 8, -1, -2], "s": [1, 2, 3]},
             lambda p: f"a = list(range({p.n}))\nprint(a[{p.i}:{p.j}:{p.s}])",
             [lambda p: f"a = list(range({p.n}))\nprint(a[{p.i}:{p.j} + 1:{p.s}])" if p.j != -1 else f"a = list(range({p.n}))\nprint(a[{p.i}::{p.s}])",
              lambda p: f"a = list(range({p.n}))\nprint(a[{p.i} - 1:{p.j}:{p.s}])",
              lambda p: f"a = list(range({p.n}))\nprint(a[{p.i}:{p.j}])" if p.s != 1 else f"a = list(range({p.n}))\nprint(a[{p.i}:{p.j}:2])"],
             "Срез `a[start:stop:step]` берёт элементы с индекса start до stop (не включая stop) с шагом step; отрицательный индекс считается с конца.",
             "`a[start:stop:step]` қимасы start индексінен stop индексіне дейінгі (stop кірмейді) элементтерді step қадамымен алады; теріс индекс соңынан саналады.",
             where=lambda p: len(list(range(p.n))[p.i:p.j:p.s]) >= 2),
    code_tpl("py.digit-sum", "python-programming", "medium",
             {"n": [1234, 2025, 4096, 9081, 7777, 31415, 50607, 123456, 98765], "w": [0, 1, 2]},
             lambda p: f"n = {p.n}\ns = 0\nwhile n > 0:\n    {['s += n % 10', 's = s * 10 + n % 10', 's += 1'][p.w]}\n    n //= 10\nprint(s)",
             [lambda p: f"n = {p.n}\ns = 0\nwhile n > 0:\n    {['s += n // 10 % 10', 's = s + n % 10', 's += n % 10'][p.w]}\n    n //= 10\nprint(s)",
              lambda p: f"n = {p.n}\ns = 0\nwhile n > 10:\n    {['s += n % 10', 's = s * 10 + n % 10', 's += 1'][p.w]}\n    n //= 10\nprint(s)",
              lambda p: f"n = {p.n}\ns = 1\nwhile n > 0:\n    {['s += n % 10', 's = s * 10 + n % 10', 's += 1'][p.w]}\n    n //= 10\nprint(s)"],
             "`n % 10` — последняя цифра, `n //= 10` отбрасывает её. Цикл проходит по всем цифрам числа справа налево.",
             "`n % 10` — соңғы цифр, `n //= 10` оны алып тастайды. Цикл санның барлық цифрларын оңнан солға қарай кезекпен қарап шығады.",
             variants=27),
    code_tpl("py.nested", "python-programming", "hard",
             {"n": [3, 4, 5, 6], "m": [4, 5, 6, 7], "w": [0, 1, 2]},
             lambda p: f"c = 0\nfor i in range({p.n}):\n    for j in range({['i', 'i + 1', '0'][p.w]}, {p.m}):\n        c += 1\nprint(c)",
             [lambda p: f"c = 0\nfor i in range({p.n}):\n    for j in range({p.m}):\n        c += 1\nprint(c)",
              lambda p: f"c = 0\nfor i in range({p.n} + 1):\n    for j in range({['i', 'i + 1', '0'][p.w]}, {p.m}):\n        c += 1\nprint(c)",
              lambda p: f"c = 0\nfor i in range({p.n}):\n    for j in range({['i', 'i + 1', '0'][p.w]}, {p.m} + 1):\n        c += 1\nprint(c)"],
             "Считаем, сколько раз выполнится внутренний цикл при каждом $i$, и складываем.",
             "Әр $i$ үшін ішкі цикл неше рет орындалатынын санап, нәтижелерді қосамыз.",
             where=lambda p: p.m >= p.n),
    code_tpl("py.string", "python-programming", "easy",
             {"s": ["informatics", "programming", "algorithm", "database", "kazakhstan", "network"], "w": [0, 1, 2, 3]},
             lambda p: f"s = '{p.s}'\nprint({['s.count(\"a\")', 's[::-1][:3]', 'len(s) // 2', 's.upper()[1:4]'][p.w]})",
             [lambda p: f"s = '{p.s}'\nprint({['s.count(\"a\") + 1', 's[:3]', 'len(s) / 2', 's.upper()[0:3]'][p.w]})",
              lambda p: f"s = '{p.s}'\nprint({['len(s)', 's[-3:]', 'len(s) // 2 + 1', 's.upper()[1:5]'][p.w]})",
              lambda p: f"s = '{p.s}'\nprint({['s.count(\"i\")', 's[::-1][:4]', 'len(s) % 2 + 4', 's[1:4]'][p.w]})"],
             "Разбираем вызов по шагам: `count` — число вхождений, `[::-1]` — строка задом наперёд, `//` — целочисленное деление, `upper()` — заглавные буквы.",
             "Әрекеттерді қадам-қадаммен талдаймыз: `count` — кездесу саны, `[::-1]` — жолды кері ретпен жазу, `//` — бүтін бөлу, `upper()` — бас әріптер.",
             variants=24),

    # ---------- сети и безопасность ----------
    Template(
        id="inf.n.net.ip-valid", kind="multi", **T("networks-and-security", "medium"),
        params={"seed": range(1, 120)},
        derived=lambda p: dict(zip(("good", "bad"), ip_variants(p.seed))),
        answers=[(lambda p, j=j: f"`{p.good[j]}`") for j in range(3)],
        distractors=[(lambda p, j=j: f"`{p.bad[j]}`") for j in range(3)],
        variants=40,
        text={"ru": "Какие из строк являются правильными IPv4-адресами? Выберите все верные ответы.", "kk": "Қай жолдар дұрыс жазылған IPv4-мекенжайы болып табылады? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "IPv4-адрес — ровно четыре числа от $0$ до $255$, разделённые точками. Остальные строки нарушают одно из правил.",
                  "kk": "IPv4-мекенжайы — нүктелермен бөлінген $0$-ден $255$-ке дейінгі дәл төрт сан. Қалған жолдар осы ережелердің бірін бұзады."},
    ),
    Template(
        id="inf.n.net.mask-prefix", **T("networks-and-security", "medium"),
        params={"n": list(range(16, 31))},
        derived=lambda p: {"mask": prefix_mask(p.n)},
        answer=lambda p: f"/{p.n}",
        distractors=[lambda p: f"/{p.n - 1}", lambda p: f"/{p.n + 1}", lambda p: f"/{32 - p.n}"],
        variants=15,
        text={"ru": "Маска подсети `[[mask]]`. Какая длина префикса ей соответствует (запись вида /N)?", "kk": "Ішкі желі маскасы `[[mask]]`. Оған сәйкес префикс ұзындығы қандай (/N түріндегі жазба)?"},
        solution={"ru": "Длина префикса — число единиц в двоичной записи маски: $[[n]]$, то есть [[ans]].", "kk": "Префикс ұзындығы — масканың екілік жазбасындағы бірліктер саны: $[[n]]$, яғни [[ans]]."},
    ),
    Template(
        id="inf.n.sec.bruteforce", **T("networks-and-security", "hard"),
        params={"N": [2, 8, 10, 16, 26, 32], "L": [4, 5, 6, 7, 8], "v": [100, 1000, 1024, 4096, 10000, 100000]},
        where=lambda p: 1 <= p.N ** p.L / p.v <= 100000 and (p.N ** p.L / p.v) * 100 % 1 == 0,
        answer=lambda p: p.N ** p.L / p.v,
        distractors=[lambda p: p.L ** p.N / p.v if p.L ** p.N / p.v < 1e7 else p.N * p.L / p.v * 1000, lambda p: p.N * p.L / p.v * 1000, lambda p: p.N ** p.L / p.v / 2, lambda p: p.N ** (p.L - 1) / p.v],
        unit="с", decimals=2,
        text={"ru": "Длина пароля — $[[L]]$, мощность алфавита — $[[N]]$. Программа перебирает $[[v]]$ паролей в секунду. За сколько секунд она гарантированно подберёт пароль?",
              "kk": "Құпиясөз ұзындығы — $[[L]]$, әліпби қуаты — $[[N]]$. Бағдарлама секундына $[[v]]$ құпиясөзді іріктейді. Ол құпиясөзді кепілді түрде неше секундта табады?"},
        solution={"ru": "Всего паролей $[[N]]^{[[L]]}$; в худшем случае перебираются все: $t = \\frac{[[N]]^{[[L]]}}{[[v]]} = [[ans]]$ с. Поэтому длинный пароль из большого алфавита надёжнее.",
                  "kk": "Барлық құпиясөздер саны $[[N]]^{[[L]]}$; ең нашар жағдайда бәрі іріктеледі: $t = \\frac{[[N]]^{[[L]]}}{[[v]]} = [[ans]]$ с. Сондықтан қуаты үлкен әліпбиден құралған ұзын құпиясөз сенімдірек."},
    ),
    Template(
        id="inf.n.ns.zeros", **T("number-systems", "medium"),
        params={"n": list(range(33, 260, 3))},
        answer=lambda p: bin(p.n)[2:].count("0"),
        distractors=[lambda p: bin(p.n)[2:].count("1"), lambda p: len(bin(p.n)) - 2, lambda p: bin(p.n)[2:].count("0") + 1],
        decimals=0, spread=None, variants=40,
        text={"ru": "Сколько нулей в двоичной записи числа $[[n]]$?", "kk": "$[[n]]$ санының екілік жазбасында неше нөл бар?"},
        solution={"ru": "Переводим: $[[n]]_{10}$ → делим на 2 и собираем остатки. В полученной записи нулей $[[ans]]$.", "kk": "Екілік жүйеге аударамыз: $[[n]]_{10}$ санын 2-ге бөліп, қалдықтарды жинаймыз. Шыққан жазбадағы нөлдер саны — $[[ans]]$."},
    ),
]


CONTEXTS = [
    Context(
        id="inf.ctx.library-db", **T("database-design-sql"),
        params={"seed": range(1, 200), "y": [2000, 2010, 2015]},
        derived=lambda p: (lambda r: (lambda rows: {"rows": rows, "tbl": table(["id", "title", "author", "year", "pages"], rows)})(
            [[i + 1, t, r.choice(["Abai", "Auezov", "Mustafin", "Zhumabaev"]), r.randrange(1990, 2025), r.randrange(120, 600, 20)] for i, t in enumerate(r.sample(["Kitap", "Zhol", "Dala", "Aspan", "Tau", "Ozen", "Kun", "Ai"], 6))]))(random.Random(p.seed * 97)),
        where=lambda p: 1 <= sum(1 for r in p.rows if r[3] > p.y) <= 5 and len({r[4] for r in p.rows}) == 6 and len({r[2] for r in p.rows}) >= 2,
        context={"ru": "В школьной библиотеке есть таблица `books`:\n\n```\n[[tbl]]\n```", "kk": "Мектеп кітапханасында `books` кестесі бар:\n\n```\n[[tbl]]\n```"},
        questions=[
            Q("Что вернёт запрос `SELECT COUNT(*) FROM books WHERE year > [[y]];`?", "`SELECT COUNT(*) FROM books WHERE year > [[y]];` сұрауы не қайтарады?",
              lambda p: sum(1 for r in p.rows if r[3] > p.y), [lambda p: sum(1 for r in p.rows if r[3] <= p.y), lambda p: len(p.rows), lambda p: sum(1 for r in p.rows if r[3] >= p.y) + 1],
              "Считаем книги, изданные позже $[[y]]$ года: $[[ans]]$.", "$[[y]]$ жылдан кейін шыққан кітаптарды санаймыз: $[[ans]]$.", decimals=0),
            Q("Что вернёт запрос `SELECT title FROM books ORDER BY pages DESC LIMIT 1;`?", "`SELECT title FROM books ORDER BY pages DESC LIMIT 1;` сұрауы не қайтарады?",
              lambda p: max(p.rows, key=lambda r: r[4])[1], [lambda p: min(p.rows, key=lambda r: r[4])[1], lambda p: p.rows[0][1], lambda p: sorted(p.rows, key=lambda r: r[4])[-2][1]],
              "Сортировка по убыванию страниц, первая строка — самая толстая книга: [[ans]].", "Беттер саны бойынша кему ретімен сұрыптаймыз, бірінші жол — ең қалың кітап: [[ans]]."),
            Q("Что вернёт запрос `SELECT COUNT(DISTINCT author) FROM books;`?", "`SELECT COUNT(DISTINCT author) FROM books;` сұрауы не қайтарады?",
              lambda p: len({r[2] for r in p.rows}), [lambda p: len(p.rows), lambda p: len({r[2] for r in p.rows}) + 1, lambda p: len({r[3] for r in p.rows})],
              "Считаем разных авторов без повторов: $[[ans]]$.", "Әртүрлі авторларды қайталамай санаймыз: $[[ans]]$.", decimals=0),
            Q("Что вернёт запрос `SELECT SUM(pages) FROM books WHERE year > [[y]];`?", "`SELECT SUM(pages) FROM books WHERE year > [[y]];` сұрауы не қайтарады?",
              lambda p: sum(r[4] for r in p.rows if r[3] > p.y), [lambda p: sum(r[4] for r in p.rows), lambda p: sum(r[4] for r in p.rows if r[3] <= p.y), lambda p: sum(1 for r in p.rows if r[3] > p.y)],
              "Складываем страницы книг, изданных позже $[[y]]$ года: $[[ans]]$.", "$[[y]]$ жылдан кейін шыққан кітаптардың беттерін қосамыз: $[[ans]]$.", decimals=0),
        ],
        variants=12,
    ),
    Context(
        id="inf.ctx.web-page", **T("web-design"),
        params={"n": [3, 4, 5], "m": [2, 3], "k": [2, 3, 4], "d": range(len(DOMAINS))},
        derived=lambda p: {"html": "<h1>School news</h1>\n<p>Read <b>today</b>:</p>\n<ul>\n" + "".join(f"  <li>Item {i + 1}</li>\n" for i in range(p.n)) + "</ul>\n<table>\n" + "".join("  <tr>" + "<td>x</td>" * p.k + "</tr>\n" for _ in range(p.m)) + f"</table>\n<a href=\"https://{DOMAINS[p.d]}/news\">More</a>"},
        context={"ru": "Дан фрагмент HTML-кода страницы:\n\n```html\n[[html]]\n```", "kk": "Веб-беттің HTML-кодынан үзінді берілген:\n\n```html\n[[html]]\n```"},
        questions=[
            Q("Сколько пунктов будет в маркированном списке?", "Маркерленген тізімде неше тармақ болады?",
              lambda p: p.n, [lambda p: p.n + 1, lambda p: p.m, lambda p: p.k],
              "Каждый пункт задаётся тегом `<li>` внутри `<ul>`: их $[[ans]]$.", "Әр тармақ `<ul>` ішіндегі `<li>` тегімен беріледі, олардың саны — $[[ans]]$.", decimals=0),
            Q("Сколько ячеек в таблице?", "Кестеде неше ұяшық бар?",
              lambda p: p.m * p.k, [lambda p: p.m + p.k, lambda p: p.m, lambda p: p.k],
              "`<tr>` — строка, `<td>` — ячейка: $[[m]] \\cdot [[k]] = [[ans]]$.", "`<tr>` — жол, `<td>` — ұяшық: $[[m]] \\cdot [[k]] = [[ans]]$.", decimals=0),
            Q("Какое слово будет выделено полужирным шрифтом?", "Қай сөз жартылай қалың қаріппен ерекшеленеді?",
              lambda p: "today", [lambda p: "School news", lambda p: "More", lambda p: "Read"],
              "Полужирный текст — внутри тега `<b>`: это слово «today».", "Жартылай қалың мәтін — `<b>` тегінің ішінде: бұл «today» сөзі."),
            Q("На какой сервер ведёт ссылка «More»?", "«More» сілтемесі қай серверге апарады?",
              lambda p: DOMAINS[p.d], [lambda p: "news", lambda p: DOMAINS[(p.d + 1) % len(DOMAINS)], lambda p: "https"],
              "Адрес ссылки — в атрибуте `href`; имя сервера стоит после `https://`: [[ans]].", "Сілтеме мекенжайы `href` атрибутында; сервер аты `https://` бөлігінен кейін тұрады: [[ans]]."),
        ],
        variants=12,
    ),
    Context(
        id="inf.ctx.3d-print", **T("it-trends-and-3d"),
        params={"H": [3, 4, 5, 6], "h": [0.2, 0.25], "t": [20, 30, 45], "m": [30, 40, 50, 60]},
        derived=lambda p: {"L": round(p.H * 10 / p.h), "T": round(p.H * 10 / p.h * p.t / 60), "ht": fmt_tex(p.h)},
        where=lambda p: (p.H * 10 / p.h * p.t / 60) % 1 == 0,
        context={"ru": "Школьный 3D-принтер печатает слоями толщиной $[[ht]]$ мм, на один слой уходит $[[t]]$ с. Ученик печатает брелок высотой $[[H]]$ см и массой $[[m]]$ г. Катушка пластика массой $1$ кг стоит $10\\,000$ тг.",
                 "kk": "Мектептің 3D-принтері қалыңдығы $[[ht]]$ мм қабаттап басып шығарады, бір қабатқа $[[t]]$ с кетеді. Оқушы биіктігі $[[H]]$ см, массасы $[[m]]$ г брелок басып шығарады. Массасы $1$ кг пластик катушкасы $10\\,000$ тг тұрады."},
        questions=[
            Q("Сколько слоёв в брелоке?", "Брелокта неше қабат бар?",
              lambda p: p.L, [lambda p: round(p.H / p.h), lambda p: round(p.H * 10 * p.h), lambda p: p.L * 2],
              "$\\frac{[[H]] \\cdot 10}{[[ht]]} = [[ans]]$ слоёв (см → мм).", "$\\frac{[[H]] \\cdot 10}{[[ht]]} = [[ans]]$ қабат (см → мм).", decimals=0),
            Q("Сколько минут займёт печать?", "Басып шығару неше минутқа созылады?",
              lambda p: p.T, [lambda p: p.L * p.t, lambda p: round(p.T / 60, 2), lambda p: p.T * 2],
              "$[[L]] \\cdot [[t]]$ с, делим на $60$: $[[ans]]$ мин.", "$[[L]] \\cdot [[t]]$ с, $60$-қа бөлеміз: $[[ans]]$ мин.", decimals=2, unit="мин"),
            Q("Сколько тенге стоит пластик на один брелок?", "Бір брелокқа кететін пластик неше теңге тұрады?",
              lambda p: p.m * 10, [lambda p: p.m * 100, lambda p: p.m, lambda p: 10000 // p.m],
              "$1$ г стоит $10\\,000 : 1000 = 10$ тг, значит $[[m]] \\cdot 10 = [[ans]]$ тг.", "$1$ г пластик $10\\,000 : 1000 = 10$ тг тұрады, демек $[[m]] \\cdot 10 = [[ans]]$ тг.", decimals=0, unit="тг"),
            Q("Сколько целых брелоков можно напечатать из одной катушки?", "Бір катушкадан неше бүтін брелок басып шығаруға болады?",
              lambda p: 1000 // p.m, [lambda p: 1000 // p.m + 1, lambda p: 100 // p.m + 1, lambda p: p.m],
              "$1000 : [[m]]$, берём целую часть: $[[ans]]$.", "$1000 : [[m]]$, бүтін бөлігін аламыз: $[[ans]]$.", decimals=0),
        ],
        variants=12,
    ),
    Context(
        id="inf.ctx.password", **T("networks-and-security"),
        params={"i": [1, 2, 3, 4, 5, 6], "L": [6, 8, 10, 12]},
        derived=lambda p: {"N": 2 ** p.i * (2 if p.i < 6 else 1), "b": p.i + (1 if p.i < 6 else 0)},
        where=lambda p: p.b in (5, 6, 7),
        context={"ru": "Сайт школы требует пароль длиной $[[L]]$ символов. Мощность алфавита паролей — $[[N]]$ символов, каждый символ кодируется одинаковым минимально возможным числом бит. Пароли хранятся в базе.",
                 "kk": "Мектеп сайты $[[L]]$ таңбадан тұратын құпиясөз талап етеді. Құпиясөз әліпбиінің қуаты — $[[N]]$ таңба, әр таңба бірдей әрі мүмкін болатын ең аз бит санымен кодталады. Құпиясөздер деректер қорында сақталады."},
        questions=[
            Q("Сколько бит нужно для кодирования одного символа?", "Бір таңбаны кодтауға неше бит қажет?",
              lambda p: p.b, [lambda p: p.b + 1, lambda p: p.N // 8, lambda p: 8],
              "$2^{[[b]]} = [[N]]$, значит $i = [[ans]]$ бит.", "$2^{[[b]]} = [[N]]$, демек $i = [[ans]]$ бит.", decimals=0, unit="бит"),
            Q("Сколько бит занимает один пароль?", "Бір құпиясөз неше бит орын алады?",
              lambda p: p.b * p.L, [lambda p: 8 * p.L, lambda p: p.N * p.L, lambda p: p.b + p.L],
              "$[[L]] \\cdot [[b]] = [[ans]]$ бит.", "$[[L]] \\cdot [[b]] = [[ans]]$ бит.", decimals=0, unit="бит"),
            Q("Сколько байт займут пароли $800$ учеников, если каждый пароль хранится целым числом байт?", "Әр құпиясөз бүтін байт санымен сақталса, $800$ оқушының құпиясөздері неше байт орын алады?",
              lambda p: 800 * -(-p.b * p.L // 8), [lambda p: 800 * p.b * p.L // 8, lambda p: 800 * p.L, lambda p: 800 * p.b * p.L],
              "Один пароль: $\\lceil [[b]] \\cdot [[L]] / 8 \\rceil$ байт; умножаем на $800$: $[[ans]]$ байт.", "Бір құпиясөз: $\\lceil [[b]] \\cdot [[L]] / 8 \\rceil$ байт; $800$-ге көбейтеміз: $[[ans]]$ байт.", decimals=0, unit="байт"),
            Q("Во сколько раз увеличится число возможных паролей, если длину увеличить на $1$ символ?", "Құпиясөз ұзындығын $1$ таңбаға арттырса, мүмкін құпиясөздер саны неше есе артады?",
              lambda p: p.N, [lambda p: 2, lambda p: p.b, lambda p: p.L + 1],
              "Число паролей $[[N]]^L$; при $L + 1$ оно умножается на $[[N]]$.", "Құпиясөздер саны $[[N]]^L$; $L + 1$ болғанда ол $[[N]]$ есе артады.", decimals=0),
        ],
        variants=12,
    ),
]
