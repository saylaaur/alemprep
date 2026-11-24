"""Генератор задач ЕНТ из шаблонов.

Шаблон — это одна «задача-образец»: условие с переменными, ответ, который считает код,
и неверные варианты из типичных ошибок. Генератор подставляет разные числа и оставляет
только хорошие варианты: ответ «красивый», пять вариантов разные, условие не повторяется.

Плейсхолдеры в тексте: [[имя]] — значение переменной, [[ans]] — верный ответ (без единиц).
Двойные квадратные скобки выбраны, чтобы не мешать фигурным скобкам LaTeX.

Запуск: python3 content-studio/problems/build.py
"""
from __future__ import annotations

import itertools
import random
import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Callable

Num = int | float | Fraction
Value = Num | str  # вариант ответа: число или готовая строка («(2; +∞)», «Мнимое»)
Params = dict[str, Num]

LEVELS = ("easy", "medium", "hard")


class P(dict):
    """Параметры с доступом через точку: p.v0 вместо p['v0']."""

    __getattr__ = dict.__getitem__


@dataclass
class Template:
    """Вопрос с одним верным ответом (kind="single") или с несколькими (kind="multi").

    single: answer → один верный, distractors → неверные; итого 5 вариантов.
    multi:  answers → 2–3 верных (например, одно и то же множество, записанное по-разному),
            distractors → неверные; итого 5 вариантов. Верные задаются битовой маской.
    Вопрос без чисел (факт): params={} и answer=lambda p: "строка" — получится одна задача.
    """

    id: str  # уникальный, например "phys.kin.accel-from-speeds"
    subject: str  # math | physics | informatics
    topic: str  # slug официальной темы из scripts/data/official-topics.json
    level: str  # easy | medium | hard
    params: dict[str, list[Num] | range]
    distractors: list[Callable[[P], Value]]  # каждая — типичная ошибка ученика
    answer: Callable[[P], Value] | None = None
    answers: list[Callable[[P], Value]] | None = None  # для kind="multi"
    kind: str = "single"
    options: int = 5
    text: dict[str, str] = field(default_factory=dict)  # {"ru": "...", "kk": "..."} — kk можно не давать
    solution: dict[str, str] = field(default_factory=dict)
    unit: str = ""  # «м/с²» — добавляется к каждому варианту
    unit_kk: str | None = None
    where: Callable[[P], bool] = lambda p: True  # отсеять неудобные наборы чисел
    # Вычисляемые переменные для текста (N = aˣ⁺ᵐ − aˣ и т. п.): считаются до where, доступны как [[имя]].
    derived: Callable[[P], dict] | None = None
    decimals: int = 2  # сколько знаков после запятой допустимо в ответе
    variants: int = 50
    extra: dict = field(default_factory=dict)
    # Качество вариантов. Неверный вариант, который больше/меньше ответа в spread раз и более,
    # ученик отбросит не думая («27000 кДж» рядом с «27 кДж») — такой вариант не берём. None — не проверять.
    spread: float | None = 12.0
    # Физически/логически возможный ли вариант (влажность ≤ 100 %, вероятность ≤ 1). None — любой.
    valid: Callable[[P, Num], bool] | None = None


# ---------- числа ----------

def nice(x: Value, decimals: int) -> bool:
    """Ответ без «хвоста»: не больше decimals знаков после запятой и конечный. Строка — всегда годится."""
    if isinstance(x, str):
        return bool(x.strip())
    if isinstance(x, Fraction):
        x = float(x)
    if x != x or x in (float("inf"), float("-inf")):
        return False
    return abs(round(x, decimals) - x) < 1e-9


def fmt(x: Value, decimals: int = 2) -> str:
    """Число по-русски: запятая, без лишних нулей, минус — настоящий минус. Строку не трогаем."""
    if isinstance(x, str):
        return x
    if isinstance(x, Fraction):
        x = float(x)
    x = round(float(x), decimals)
    if abs(x - round(x)) < 1e-9:
        s = str(int(round(x)))
    else:
        s = f"{x:.{decimals}f}".rstrip("0").rstrip(".").replace(".", ",")
    return s.replace("-", "−")


def fmt_tex(x: Value, decimals: int = 2) -> str:
    """То же для LaTeX: десятичная запятая как {,}."""
    if isinstance(x, str):
        return x
    return fmt(x, decimals).replace(",", "{,}").replace("−", "-")


_PH = re.compile(r"\[\[(\w+)\]\]")


def fill(s: str, p: P, ans: Value, decimals: int, tex: bool) -> str:
    def rep(m: re.Match[str]) -> str:
        k = m.group(1)
        v = ans if k == "ans" else p[k]
        return fmt_tex(v, decimals) if tex else fmt(v, decimals)

    return _PH.sub(rep, s)


def fill_mixed(s: str, p: P, ans: Value, decimals: int) -> str:
    """Внутри $…$ — числа в LaTeX-виде, снаружи — обычные."""
    parts = re.split(r"(\$[^$]*\$)", s)
    return "".join(fill(x, p, ans, decimals, tex=x.startswith("$")) for x in parts)


# ---------- генерация ----------

class TemplateError(ValueError):
    pass


def check_template(t: Template) -> None:
    if t.level not in LEVELS:
        raise TemplateError(f"{t.id}: level {t.level!r}")
    if t.kind == "single":
        if t.answer is None or t.answers:
            raise TemplateError(f"{t.id}: для single нужен answer (и не нужен answers)")
        need = t.options - 1
    elif t.kind == "multi":
        if not t.answers or not 2 <= len(t.answers) <= 3 or t.answer is not None:
            raise TemplateError(f"{t.id}: для multi нужно 2–3 answers")
        need = t.options - len(t.answers)
    else:
        raise TemplateError(f"{t.id}: kind {t.kind!r}")
    if len(t.distractors) < need:
        raise TemplateError(f"{t.id}: нужно минимум {need} неверных вариантов, есть {len(t.distractors)}")
    if "ru" not in t.text or "ru" not in t.solution:
        raise TemplateError(f"{t.id}: нет русского текста или разбора")
    for lang, s in [*t.text.items(), *t.solution.items()]:
        for name in _PH.findall(s):
            if name != "ans" and name not in t.params and t.derived is None:
                raise TemplateError(f"{t.id} ({lang}): неизвестная переменная [[{name}]]")
        for formula in re.findall(r"\$([^$]*)\$", s):
            if re.search(r"[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]", re.sub(r"\\text\{[^}]*\}", "", formula)):
                raise TemplateError(f"{t.id} ({lang}): кириллица внутри $…$ без \\text{{}}")


def _variant(t: Template, p: P) -> tuple[list[str], int, Value] | None:
    """Варианты ответа (верные первыми), маска верных и «главный» ответ для [[ans]]. None — набор не годится."""
    try:
        if t.derived is not None:
            p.update(t.derived(p))
        if not t.where(p):
            return None
        right = [t.answer(p)] if t.kind == "single" else [a(p) for a in t.answers]  # type: ignore[union-attr]
        wrong = [d(p) for d in t.distractors]
    except (ZeroDivisionError, ValueError, OverflowError, KeyError):
        return None
    if not all(nice(x, t.decimals) for x in right):
        return None
    opts = [fmt(x, t.decimals) for x in right]
    if len(set(opts)) != len(opts):
        return None
    for w in [*wrong, *_fillers(right[0])]:
        if not nice(w, t.decimals) or not _plausible(t, p, right[0], w):
            continue
        ws = fmt(w, t.decimals)
        if ws not in opts:
            opts.append(ws)
        if len(opts) == t.options:
            break
    if len(opts) < t.options:
        return None  # ловушки совпали с ответом или друг с другом — такой набор не годится
    return opts, (1 << len(right)) - 1, right[0]


def _num(x: Value) -> float | None:
    if isinstance(x, (int, float, Fraction)) and not isinstance(x, bool):
        return float(x)
    return None


def _plausible(t: Template, p: P, right: Value, w: Value) -> bool:
    """Неверный вариант должен выглядеть правдоподобно: не абсурдный и не в разы дальше остальных."""
    a, b = _num(right), _num(w)
    if b is None:
        return True
    if t.valid is not None and not t.valid(p, b):
        return False
    if a is None or t.spread is None or a == 0 or b == 0 or (a > 0) != (b > 0):
        return True
    r = abs(b / a)
    return 1 / t.spread < r < t.spread


def _fillers(right: Value) -> list[Value]:
    """Запасные правдоподобные ловушки рядом с ответом — если типичных ошибок не хватило."""
    a = _num(right)
    if a is None or a == 0:
        return []
    out: list[Value] = [a * 2, a / 2, a * 3 / 2, a * 2 / 3, a * 4 / 3, a * 3 / 4, a * 3, a / 3]
    return [int(x) if isinstance(right, int) and float(x).is_integer() else x for x in out]


def _check_names(t: Template, p: P) -> None:
    for lang, s in [*t.text.items(), *t.solution.items()]:
        for name in _PH.findall(s):
            if name != "ans" and name not in p:
                raise TemplateError(f"{t.id} ({lang}): неизвестная переменная [[{name}]]")


def _side(t: Template, lang: str, p: P, ans: Value, opts: list[str], mask: int) -> dict:
    unit = t.unit_kk if (lang == "kk" and t.unit_kk) else t.unit
    out = {
        "question": fill_mixed(t.text[lang], p, ans, t.decimals),
        "options": [o + (f" {unit}" if unit else "") for o in opts],
        "correct": 0 if t.kind == "single" else mask,  # перемешивает сайт
        "solution": fill_mixed(t.solution[lang], p, ans, t.decimals),
    }
    return out


def generate(t: Template, seed: int = 0) -> list[dict]:
    """До t.variants задач по шаблону. Порядок воспроизводимый (seed + id шаблона)."""
    check_template(t)
    names = list(t.params)
    combos = list(itertools.product(*(list(t.params[n]) for n in names)))
    random.Random(f"{seed}:{t.id}").shuffle(combos)
    out: list[dict] = []
    seen: set[str] = set()
    for combo in combos:
        if len(out) >= t.variants:
            break
        p = P(zip(names, combo))
        v = _variant(t, p)
        if v is None:
            continue
        opts, mask, ans = v
        _check_names(t, p)
        q_ru = fill_mixed(t.text["ru"], p, ans, t.decimals)
        if q_ru in seen:
            continue
        seen.add(q_ru)
        item: dict = {
            "id": f"{t.id}#{len(out) + 1:03d}",
            "template": t.id,
            "subject": t.subject,
            "topic": t.topic,
            "level": t.level,
            "kind": t.kind,
            "ru": _side(t, "ru", p, ans, opts, mask),
        }
        if "kk" in t.text and "kk" in t.solution:
            item["kk"] = _side(t, "kk", p, ans, opts, mask)
        out.append(item)
    return out


# ---------- контекстный блок ----------

@dataclass
class Context:
    """Одно общее условие и 3–5 вопросов по нему на одних и тех же числах (формат ЕНТ «контекст»).

    questions — обычные Template без params/where: числа берутся из params контекста.
    Каждая задача блока хранит текст контекста в поле context; group связывает их вместе.
    """

    id: str
    subject: str
    topic: str
    level: str
    params: dict[str, list[Num] | range]
    context: dict[str, str]
    questions: list[Template]
    where: Callable[[P], bool] = lambda p: True
    derived: Callable[[P], dict] | None = None
    variants: int = 10  # сколько разных блоков


def generate_context(c: Context, seed: int = 0) -> list[dict]:
    for q in c.questions:
        q.subject, q.topic, q.level, q.params = c.subject, c.topic, c.level, c.params
        if c.derived is not None and q.derived is None:
            q.derived = lambda p: {}  # переменные контекста уже посчитаны
        check_template(q)
    names = list(c.params)
    combos = list(itertools.product(*(list(c.params[n]) for n in names)))
    random.Random(f"{seed}:{c.id}").shuffle(combos)
    out: list[dict] = []
    groups = 0
    seen: set[str] = set()
    for combo in combos:
        if groups >= c.variants:
            break
        p = P(zip(names, combo))
        try:
            if c.derived is not None:
                p.update(c.derived(p))
            if not c.where(p):
                continue
        except (ZeroDivisionError, ValueError, OverflowError):
            continue
        parts = [_variant(q, p) for q in c.questions]
        if any(v is None for v in parts):
            continue  # блок берём только целиком
        ctx_ru = fill_mixed(c.context["ru"], p, 0, 2)
        if ctx_ru in seen:
            continue
        seen.add(ctx_ru)
        groups += 1
        gid = f"{c.id}#{groups:03d}"
        for k, (q, v) in enumerate(zip(c.questions, parts), start=1):
            opts, mask, ans = v  # type: ignore[misc]
            _check_names(q, p)
            item: dict = {
                "id": f"{gid}.{k}",
                "template": c.id,
                "group": gid,
                "subject": c.subject,
                "topic": c.topic,
                "level": c.level,
                "kind": q.kind,
                "ru": {"context": ctx_ru, **_side(q, "ru", p, ans, opts, mask)},
            }
            if "kk" in c.context and "kk" in q.text and "kk" in q.solution:
                item["kk"] = {"context": fill_mixed(c.context["kk"], p, 0, 2), **_side(q, "kk", p, ans, opts, mask)}
            out.append(item)
    return out


# ---------- помощники для текстов ответов ----------

INF = float("inf")


def iv(a: Num, b: Num, left: str = "(", right: str = ")") -> str:
    """Промежуток в записи ЕНТ: iv(2, INF) → «(2; +∞)», iv(-INF, 3, right="]") → «(−∞; 3]»."""
    lo = "−∞" if a == -INF else fmt(a)
    hi = "+∞" if b == INF else fmt(b)
    if a == -INF:
        left = "("
    if b == INF:
        right = ")"
    return f"{left}{lo}; {hi}{right}"


def term(v: Num, var: str = "") -> str:
    """Слагаемое для формулы со знаком: term(-5, "x") → «- 5x», term(1, "x") → «+ x», term(0) → «»."""
    if v == 0:
        return ""
    body = var if (var and abs(v) == 1) else f"{fmt_tex(abs(v))}{var}"
    return f"{'+' if v > 0 else '-'} {body}"


def lead(v: Num, var: str) -> str:
    """Первое слагаемое: lead(1, "x") → «x», lead(-1, "x") → «-x», lead(3, "x") → «3x»."""
    if v == 1:
        return var
    if v == -1:
        return f"-{var}"
    return f"{fmt_tex(v)}{var}"


def union(*parts: str) -> str:
    return " ∪ ".join(parts)


def pt(x: Num, y: Num) -> str:
    """Точка: «(2; −38)»."""
    return f"({fmt(x)}; {fmt(y)})"


def lin(k: Num, m: Num, var: str = "x") -> str:
    """Прямая y = kx + m в обычной записи: «y = 3x − 2», «y = −x + 4», «y = 5»."""
    if k == 0:
        return f"y = {fmt(m)}"
    ks = "" if k == 1 else "−" if k == -1 else fmt(k)
    s = f"y = {ks}{var}"
    if m:
        s += f" {'+' if m > 0 else '−'} {fmt(abs(m))}"
    return s


def frac(x: Num) -> str:
    """Дробь как вариант ответа в LaTeX: Fraction(-4, 5) → «$-\\frac{4}{5}$», Fraction(3) → «3»."""
    f = Fraction(x).limit_denominator(1000)
    if f.denominator == 1:
        return fmt(f.numerator)
    sign = "-" if f < 0 else ""
    return f"${sign}\\frac{{{abs(f.numerator)}}}{{{f.denominator}}}$"


def pi_ans(k: Num) -> str:
    """Ответ с π: pi_ans(36) → «$36\\pi$», pi_ans(1) → «$\\pi$», pi_ans(Fraction(1, 2)) → «$\\frac{1}{2}\\pi$»."""
    f = Fraction(k).limit_denominator(1000)
    if f == 1:
        return "$\\pi$"
    if f.denominator == 1:
        return f"${fmt_tex(f.numerator)}\\pi$"
    return frac(f)[:-1] + "\\pi$"


def fact(id, topic, level, q_ru, q_kk, right, wrong, sol_ru, sol_kk, kind="single"):
    """Вопрос без чисел: right — верный ответ (или список верных для multi), wrong — правдоподобные ошибки.
    topic — словарь dict(subject=..., topic=...)."""
    rights = right if isinstance(right, list) else [right]
    return Template(
        id=id, level=level, kind=kind, params={}, **topic,
        text={"ru": q_ru, "kk": q_kk}, solution={"ru": sol_ru, "kk": sol_kk},
        answer=(lambda p, r=rights[0]: r) if kind == "single" else None,
        answers=[(lambda p, r=r: r) for r in rights] if kind == "multi" else None,
        distractors=[(lambda p, w=w: w) for w in wrong],
    )
