"""Короткая запись конспектов. Каждая книга — dict(slug=..., ru=[страницы], kk=[страницы]).
Страница: P(kicker, title, *блоки). Блоки: T(текст), F(tex), L(*пункты), O(*пункты по порядку), N(плашка), X(*ловушки).
Формулы внутри текста — в $...$. Сборка: python3 content-studio/books/build.py
Казахский текст — черновик, нужна вычитка носителем языка."""


def P(kicker: str, title: str, *blocks: dict) -> dict:
    return {"kicker": kicker, "title": title, "blocks": list(blocks)}


def T(text: str) -> dict:
    return {"type": "text", "text": text}


def F(tex: str) -> dict:
    return {"type": "formula", "tex": tex}


def L(*items: str) -> dict:
    return {"type": "list", "items": list(items)}


def O(*items: str) -> dict:
    return {"type": "list", "items": list(items), "ordered": True}


def N(text: str) -> dict:
    return {"type": "note", "text": text}


def X(*items: str) -> dict:
    return {"type": "trap", "items": list(items)}
