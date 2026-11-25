"""Собирает конспекты из content-studio/books/*_books.py в scripts/data/books/<slug>.json
и проверяет: slug есть в каталоге, страницы ru и kk совпадают по числу, лимиты схемы соблюдены."""
import importlib.util
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "scripts/data/books"
sys.path.insert(0, str(HERE))

catalog = json.loads((ROOT / "scripts/data/books-catalog.json").read_text())
SLUGS = {b["slug"] for subj in catalog["subjects"].values() for books in subj.values() for b in books}
CYR = re.compile(r"[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]")


def check_text(s: str, where: str, limit: int = 600) -> list[str]:
    errs = []
    if not s.strip() or len(s) > limit:
        errs.append(f"{where}: длина {len(s)}")
    if s.count("$") % 2:
        errs.append(f"{where}: непарный $")
    for m in re.findall(r"\$([^$]*)\$", s):
        if CYR.search(re.sub(r"\\text\{[^}]*\}", "", m)):
            errs.append(f"{where}: кириллица в формуле: {m}")
    return errs


def check_pages(pages: list[dict], where: str) -> list[str]:
    errs = []
    if not 1 <= len(pages) <= 16:
        errs.append(f"{where}: страниц {len(pages)}")
    for i, p in enumerate(pages, 1):
        w = f"{where} стр.{i}"
        if len(p["title"]) > 80 or len(p.get("kicker", "")) > 60:
            errs.append(f"{w}: длинный заголовок")
        if not 1 <= len(p["blocks"]) <= 10:
            errs.append(f"{w}: блоков {len(p['blocks'])}")
        for b in p["blocks"]:
            t = b["type"]
            if t in ("text", "note"):
                errs += check_text(b["text"], w)
            elif t == "formula":
                if len(b["tex"]) > 300 or CYR.search(re.sub(r"\\text\{[^}]*\}", "", b["tex"])):
                    errs.append(f"{w}: формула {b['tex']}")
            else:
                items = b["items"]
                if not 1 <= len(items) <= (8 if t == "trap" else 12):
                    errs.append(f"{w}: пунктов {len(items)}")
                for it in items:
                    errs += check_text(it, w)
    return errs


def main() -> None:
    books, errs = [], []
    for f in sorted(HERE.glob("*_books.py")):
        spec = importlib.util.spec_from_file_location(f.stem, f)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        books += mod.BOOKS
    for b in books:
        s = b["slug"]
        if s not in SLUGS:
            errs.append(f"{s}: нет в каталоге")
        if len(b["ru"]) != len(b["kk"]):
            errs.append(f"{s}: ru {len(b['ru'])} стр., kk {len(b['kk'])} стр.")
        errs += check_pages(b["ru"], f"{s}/ru") + check_pages(b["kk"], f"{s}/kk")
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    for b in books:
        data = {"ru": {"pages": b["ru"]}, "kk": {"pages": b["kk"]}}
        (OUT / f"{b['slug']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    write_registry()
    write_migration(books)
    print(f"Собрано книг: {len(books)}: {', '.join(b['slug'] for b in books)}")


def camel(slug: str) -> str:
    head, *rest = slug.split("-")
    return head + "".join(w.capitalize() for w in rest)


def write_registry() -> None:
    """lib/local/book-content.ts — все готовые конспекты из scripts/data/books (для режима без базы)."""
    slugs = sorted(f.stem for f in OUT.glob("*.json"))
    imports = "\n".join(f"import {camel(s)} from '../../scripts/data/books/{s}.json';" for s in slugs)
    rows = "\n".join(f"  '{s}': {camel(s)}," for s in slugs)
    (ROOT / "lib/local/book-content.ts").write_text(f"""{imports}

/**
 * Написанные конспекты для локального режима (в базе они лежат в books.content_ru/kk).
 * Файл генерирует content-studio/books/build.py — не править руками.
 */
export type RawBookContent = {{ ru?: unknown; kk?: unknown }};

const REGISTRY: Record<string, RawBookContent> = {{
{rows}
}};

export function bookContentOf(slug: string): RawBookContent | undefined {{
  return Object.prototype.hasOwnProperty.call(REGISTRY, slug) ? REGISTRY[slug] : undefined;
}}
""")


MIGRATION = "0045_first_term_books.sql"


def write_migration(books: list[dict]) -> None:
    """Миграция заполняет конспекты в базе. Только пустые книги: правки, сделанные в базе, не затираются."""
    lit = lambda v: "'" + json.dumps(v, ensure_ascii=False, separators=(",", ":")).replace("'", "''") + "'::jsonb"
    parts = [
        "-- Конспекты первых трёх месяцев (математика, физика, информатика).",
        "-- Сгенерировано content-studio/books/build.py из content-studio/books/*_books.py.",
        "-- Заполняет только книги без конспекта, чтобы не затереть правки в базе.",
        "-- Казахский текст — черновик для вычитки носителем языка.",
    ]
    for b in sorted(books, key=lambda b: b["slug"]):
        parts.append(
            f"\nUPDATE public.books\nSET content_ru = {lit({'pages': b['ru']})},\n"
            f"    content_kk = {lit({'pages': b['kk']})}\n"
            f"WHERE slug = '{b['slug']}' AND content_ru IS NULL;"
        )
    (ROOT / "supabase/migrations" / MIGRATION).write_text("\n".join(parts) + "\n")


if __name__ == "__main__":
    main()
