# content-studio — мастерская видеоуроков

Здесь живёт всё, из чего делаются уроки (видео в стиле 3Blue1Brown, задачи, карточки). В сайт этот код не попадает.

## Что внутри
- `lessons/newton/newton.py` — сцена Manim «Законы Ньютона» (класс `Lesson`). Фирменные цвета и функции `T()` (текст), `M()` (формула), `arrow()`; субтитры — функция `say()`.
- `lessons/tan_demo.py` — маленький пример сцены.
- `make_pack.py` — собирает пакет урока: 12 задач (`problems.json`), 15 карточек (`cards.json`), `lesson.json`. Сам проверяет числа ответов.
- `packs/newton-laws/` — готовый пакет первого урока (`conspect.md` — текст книги).
- `design-drafts/` — два HTML-черновика стилей, из которых выбран нынешний дизайн.

## Как собрать видео
Нужны: Python 3, `manim` (Community, проверено на 0.22.1), LaTeX с кириллицей (T2A, пакет texlive-lang-cyrillic), шрифт Inter Display, `ffmpeg`.
```
manim -qm lessons/newton/newton.py Lesson     # 720p
```
Готовый mp4 и постер кладём в `public/lessons/<id>.mp4` и `<id>.jpg`. Большие рендеры в git не коммитим, кроме итогового сжатого файла (сейчас ~3,6 МБ).

## Как сделать новый урок
1. Скопируй `lessons/newton/` в `lessons/<тема>/`, замени сценарий. Голоса пока нет — только субтитры (`say`).
2. Задачи и пробник: `lib/lessons/data/<id>.json` (формат — `lib/lessons/schema.ts`, правила — `docs/video-lessons.md`).
3. Книга-конспект: `scripts/data/books/<slug>.json` и миграция (`docs/books-plan.md`).
4. Цитаты, если нужны в видео, — только казахских писателей.
