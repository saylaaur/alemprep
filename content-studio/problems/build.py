"""Собирает банк задач из всех шаблонов в content-studio/problems/templates/.

Запуск из корня репозитория:
    python3 content-studio/problems/build.py           # собрать банк
    python3 content-studio/problems/build.py --sample  # показать по 2 задачи с каждого шаблона

Пишет lib/problems/bank/{math,physics,informatics}.json и печатает сводку:
сколько задач дал каждый шаблон. Шаблон, который дал меньше 20 задач, — повод
расширить диапазоны чисел или ослабить условие where.
В файле шаблонов: TEMPLATES = [...] (обычные и «несколько ответов»), CONTEXTS = [...] (контекстные блоки).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from engine import Context, Template, generate, generate_context  # noqa: E402

SUBJECTS = ("math", "physics", "informatics")
OUT = ROOT / "lib" / "problems" / "bank"
MIN_VARIANTS = 20


def load_templates() -> list[Template | Context]:
    out: list[Template | Context] = []
    for f in sorted((HERE / "templates").glob("*.py")):
        spec = importlib.util.spec_from_file_location(f"tpl_{f.stem}", f)
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        out.extend(getattr(mod, "TEMPLATES", []))
        out.extend(getattr(mod, "CONTEXTS", []))
    ids = [t.id for t in out]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise SystemExit(f"Повторяются id шаблонов: {sorted(dup)}")
    return out


def official_topics() -> dict[str, set[str]]:
    d = json.loads((ROOT / "scripts" / "data" / "official-topics.json").read_text())
    return {s: {t["slug"] for sec in d[s]["sections"] for t in sec["topics"]} for s in SUBJECTS}


# Не больше стольких вариантов одного шаблона: лёгкие — одна формула, их много не нужно.
CAP = {"easy": 25, "medium": 40, "hard": 50}


def main() -> None:
    sample = "--sample" in sys.argv
    topics = official_topics()
    bank: dict[str, list[dict]] = {s: [] for s in SUBJECTS}
    weak: list[str] = []
    for t in load_templates():
        if t.subject not in bank:
            raise SystemExit(f"{t.id}: неизвестный предмет {t.subject}")
        if t.topic not in topics[t.subject]:
            raise SystemExit(f"{t.id}: темы {t.topic!r} нет в официальной спецификации {t.subject}")
        if not isinstance(t, Context):
            # Чистка: однотипных лёгких задач меньше, чтобы набор из 15 не состоял из одной и той же формулы.
            t.variants = min(t.variants, CAP[t.level])
        items = generate_context(t) if isinstance(t, Context) else generate(t)
        if len(items) < MIN_VARIANTS and t.params:
            weak.append(f"{t.id}: {len(items)}")
        bank[t.subject].extend(items)
        print(f"{t.id:40s} {len(items):4d}")
        if sample:
            for it in items[: (5 if isinstance(t, Context) else 2)]:
                ctx = f"[{it['ru']['context'][:60]}…] " if "context" in it["ru"] else ""
                mark = f" (маска {it['ru']['correct']})" if it["kind"] == "multi" else ""
                print("   ", ctx + it["ru"]["question"], "|", " / ".join(it["ru"]["options"]) + mark)
    OUT.mkdir(parents=True, exist_ok=True)
    for s, items in bank.items():
        (OUT / f"{s}.json").write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n")
    total = sum(len(v) for v in bank.values())
    print(f"\nВсего: {total} задач · " + ", ".join(f"{s} {len(v)}" for s, v in bank.items()))
    if weak:
        print("Мало вариантов (меньше 20):", "; ".join(weak))


if __name__ == "__main__":
    main()
