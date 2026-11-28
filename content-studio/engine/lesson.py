"""Движок видеоуроков AlemPrep: урок собирается из файла-сценария (JSON), а не пишется кодом.

    LESSON=content-studio/engine/lessons/<id>.json LANG=ru manim -qm content-studio/engine/lesson.py Lesson

Сценарий: {"id", "subject", "tag", "title", "subtitle", "scenes": [...]}.
Сцена: {"type": ..., поля типа, "beats": [{"say": {"ru","kk"}, ...поля шага}]}.
Каждый шаг (beat) — одна фраза диктора + одно действие на экране; шаг длится столько, сколько звучит фраза.
Тексты: строка (одна на оба языка) или {"ru": ..., "kk": ...}. Формулы внутри текста — в $...$.
Типы сцен и их поля — в SCENES ниже и в content-studio/engine/README.md."""
import json
import os
import sys
import textwrap
from pathlib import Path

import numpy as np
from manim import *

sys.path.insert(0, str(Path(__file__).parent))
import tts  # noqa: E402

# ---------- фирменный стиль ----------
BG = "#0C0E0D"; G = "#2BC98F"; Y = "#FFD45A"; B = "#5CC8FF"; R = "#FF5C6C"; O = "#FF9F43"; W = "#F2F4F3"; MUTED = "#8A938F"; CARD = "#161A18"
PALETTE = {"green": G, "yellow": Y, "blue": B, "red": R, "orange": O, "white": W, "muted": MUTED}
config.background_color = BG
_tpl = TexTemplate(); _tpl.add_to_preamble(r"\usepackage[T2A]{fontenc}\usepackage[utf8]{inputenc}\usepackage{amssymb}")
config.tex_template = _tpl
FONT = "Inter Display"
LANG = os.environ.get("LANG_LESSON") or os.environ.get("LESSON_LANG") or os.environ.get("LANG", "ru")
LANG = LANG if LANG in ("ru", "kk") else "ru"
UI = {"ru": {"notebook": "ЗАПИШИ В ТЕТРАДЬ", "think": "Подумай и выбери ответ", "answer": "Ответ", "example": "Пример", "next": "Дальше — задачи под видео"},
      "kk": {"notebook": "ДӘПТЕРГЕ ЖАЗ", "think": "Ойланып, жауапты таңда", "answer": "Жауабы", "example": "Мысал", "next": "Енді — видео астындағы есептер"}}


def L(v):
    if isinstance(v, dict):
        return v.get(LANG) or v.get("ru", "")
    return v if v is not None else ""


def col(c, default=W):
    return PALETTE.get(c, c) if c else default


def T(s, size=34, color=W, weight=NORMAL):
    return Text(s, font=FONT, font_size=size, color=color, weight=weight)


def M(s, size=48, color=W, isolate=None):
    return MathTex(s, font_size=size, color=color, substrings_to_isolate=isolate or None)


def rich(s, size=34, color=W, width=12.0, weight=NORMAL):
    """Текст с формулами в $...$, перенос по реальной ширине. Возвращает VGroup строк."""
    s = L(s)
    parts = s.split("$")
    toks = []  # ("t", слово) | ("m", MathTex)
    for i, p in enumerate(parts):
        if i % 2:
            if p.strip():
                toks.append(("m", M(p, size * 1.5, color)))
        else:
            for w in p.split(" "):
                if w:
                    toks.append(("t", w))
    sp = T("a a", size).width - 2 * T("a", size).width  # ширина пробела
    widths = [T(v, size, weight=weight).width if k == "t" else v.width for k, v in toks]
    lines, cur, cur_w = [], [], 0.0
    for tok, w in zip(toks, widths):
        add = w + (sp if cur else 0)
        if cur and cur_w + add > width:
            lines.append(cur); cur, cur_w, add = [], 0.0, w
        cur.append(tok); cur_w += add
    if cur:
        lines.append(cur)
    rows = []
    for ln in lines:
        mobs, buf = [], []
        for k, v in ln:
            if k == "t":
                buf.append(v)
            else:
                if buf:
                    mobs.append(T(" ".join(buf), size, color, weight)); buf = []
                mobs.append(v)
        if buf:
            mobs.append(T(" ".join(buf), size, color, weight))
        row = VGroup(*mobs).arrange(RIGHT, buff=sp * 0.9)
        rows.append(row)
    g = VGroup(*rows).arrange(DOWN, buff=size * 0.008, aligned_edge=LEFT)
    if g.width > width:
        g.scale_to_fit_width(width)
    return g


BOTTOM = -2.45  # ниже — субтитры


def fit(mob, top, bottom=BOTTOM, max_w=12.6):
    """Вписать группу между top и bottom (по высоте) и по ширине кадра."""
    h = top - bottom
    if mob.height > h:
        mob.scale(h / mob.height)
    if mob.width > max_w:
        mob.scale(max_w / mob.width)
    mob.align_to(np.array([0, top, 0]), UP)
    return mob


def arrow(start, end, color, w=8):
    return Arrow(start, end, buff=0, color=color, stroke_width=w, max_tip_length_to_length_ratio=0.22, max_stroke_width_to_length_ratio=12)


def card(mob, pad=0.45, color=CARD, stroke=None):
    bg = RoundedRectangle(corner_radius=0.22, width=mob.width + 2 * pad, height=mob.height + 2 * pad, fill_color=color, fill_opacity=1,
                          stroke_width=2 if stroke else 0, stroke_color=stroke or color).move_to(mob)
    return VGroup(bg, mob)


class Lesson(Scene):
    cap = None
    head = None

    # ---------- общие механизмы ----------
    def load(self):
        p = os.environ.get("LESSON")
        if not p:
            raise SystemExit("укажите LESSON=путь/к/сценарию.json")
        return json.load(open(p))

    def subtitle(self, text):
        lines = textwrap.wrap(text, 60) or [""]
        if len(lines) > 2:  # длинную фразу показываем мельче, но целиком
            lines = textwrap.wrap(text, 84)
        g = VGroup(*[T(l, 28 if len(lines) <= 2 else 24, W) for l in lines]).arrange(DOWN, buff=0.1)
        if g.width > 12.8:
            g.scale_to_fit_width(12.8)
        bg = RoundedRectangle(corner_radius=0.16, width=g.width + 0.6, height=g.height + 0.32, fill_color="#000000", fill_opacity=0.6, stroke_width=0)
        return VGroup(bg, g).to_edge(DOWN, buff=0.28)

    def beat(self, say, *anims, run_time=1.0, after=None):
        """Одна фраза + анимации. Ждём, пока фраза не дозвучит."""
        text = L(say) if say else ""
        path, dur = tts.clip(text, LANG) if text else (None, 0.0)
        if path:
            self.add_sound(str(path))
        sub_anims = []
        if text:
            new = self.subtitle(text)
            if self.cap is not None:
                sub_anims.append(FadeOut(self.cap, run_time=0.25))
            sub_anims.append(FadeIn(new, run_time=0.3))
            self.cap = new
        anims = [a for a in anims if a is not None]
        if anims or sub_anims:
            self.play(*sub_anims, *anims, run_time=run_time if anims else 0.35)
            spent = run_time if anims else 0.35
        else:
            spent = 0.0
        if after:
            after()
        rest = dur - spent
        if rest > 0.05:
            self.wait(rest)

    def clear(self, keep_head=False):
        objs = [m for m in self.mobjects if m is not self.cap and not (keep_head and m is self.head)]
        if objs:
            self.play(*[FadeOut(m) for m in objs], run_time=0.5)
        if not keep_head:
            self.head = None

    def header(self, kicker, title=None):
        g = VGroup(T(L(kicker).upper(), 24, G, BOLD))
        if title:
            g.add(T(L(title), 44, W, BOLD))
        g.arrange(DOWN, aligned_edge=LEFT, buff=0.12).to_corner(UL, buff=0.5)
        self.head = g
        return FadeIn(g, shift=RIGHT * 0.2)

    def construct(self):
        self.sb = self.load()
        for sc in self.sb["scenes"]:
            fn = getattr(self, "s_" + sc["type"].replace("-", "_"))
            fn(sc, sc.get("beats", []))
            self.clear()
        if self.cap is not None:
            self.play(FadeOut(self.cap), run_time=0.3)
        self.wait(0.5)

    # ---------- типы сцен ----------
    def s_title(self, sc, beats):
        tag = T(L(self.sb.get("tag", "")).upper(), 24, G, BOLD)
        title = rich(self.sb["title"], 64, W, 11.5, BOLD)
        sub = T(L(self.sb.get("subtitle", "")), 30, MUTED) if self.sb.get("subtitle") else VMobject()
        grp = VGroup(tag, title, sub).arrange(DOWN, buff=0.4)
        line = Line(LEFT * 1.6, RIGHT * 1.6, color=G, stroke_width=6).next_to(title, DOWN, buff=0.25)
        sub.next_to(line, DOWN, buff=0.35)
        first = beats[0].get("say") if beats else None
        self.beat(first, FadeIn(tag, shift=DOWN * 0.2), Write(title), Create(line), FadeIn(sub), run_time=1.6)
        for b in beats[1:]:
            self.beat(b.get("say"))

    def s_text(self, sc, beats):
        """Абзацы появляются по одному. beat: {text}."""
        self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        stack = VGroup()
        for b in beats:
            anim = None
            if b.get("text"):
                para = rich(b["text"], b.get("size", 38), col(b.get("color")), 12.0)
                if len(stack):
                    para.next_to(stack, DOWN, buff=0.5, aligned_edge=LEFT)
                else:
                    para.next_to(self.head, DOWN, buff=0.7, aligned_edge=LEFT)
                stack.add(para)
                anim = FadeIn(para, shift=UP * 0.15)
            self.beat(b.get("say"), anim)

    def s_bullets(self, sc, beats):
        self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        stack = VGroup()
        n = 0
        for b in beats:
            anim = None
            item = b.get("item") or (f"${b['tex']}$" if b.get("tex") else None)
            if item:
                n += 1
                mark = Text(str(n) if sc.get("ordered") else "•", font=FONT, font_size=38, color=G, weight=BOLD)
                body = rich(item, 38, W, 11.4)
                row = VGroup(mark, body).arrange(RIGHT, buff=0.3, aligned_edge=UP)
                if len(stack):
                    row.next_to(stack, DOWN, buff=0.45, aligned_edge=LEFT)
                else:
                    row.next_to(self.head, DOWN, buff=0.6, aligned_edge=LEFT)
                stack.add(row)
                anim = FadeIn(row, shift=RIGHT * 0.2)
            if stack.get_bottom()[1] < BOTTOM:  # не влезает — уменьшаем список целиком
                top = self.head.get_bottom()[1] - 0.45
                target = stack.copy(); fit(target, top); target.align_to(self.head, LEFT)
                old = stack[:-1]
                for k in range(len(old)):
                    old[k].generate_target(); old[k].target.become(target[k])
                stack[-1].become(target[-1])
                self.play(*[MoveToTarget(o) for o in old], run_time=0.4)
            self.beat(b.get("say"), anim)

    def s_formula(self, sc, beats):
        """Формула меняется по шагам. beat: {tex} — новая форма, {box} — обвести часть, {note} — подпись."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        cur, notes, boxes = None, VGroup(), []
        iso = [b["box"] for b in beats if b.get("box")]
        for b in beats:
            anims = []
            if b.get("tex"):
                new = M(b["tex"], b.get("size", 64), col(b.get("color")), [x for x in iso if x in b["tex"]]).move_to(UP * 0.3)
                if new.width > 12:
                    new.scale_to_fit_width(12)
                if cur is None:
                    anims.append(Write(new))
                else:
                    anims += [FadeOut(x) for x in boxes]; boxes = []
                    anims.append(TransformMatchingTex(cur, new) if b.get("match", True) else ReplacementTransform(cur, new))
                cur = new
            if b.get("box") and cur is not None:
                part = cur.get_part_by_tex(b["box"])
                target = part if part is not None else cur
                bx = SurroundingRectangle(target, color=col(b.get("color"), Y), buff=0.12, corner_radius=0.08)
                boxes.append(bx); anims.append(Create(bx))
            if b.get("note"):
                nt = rich(b["note"], 36, col(b.get("note_color"), MUTED), 11)
                nt.next_to(notes if len(notes) else (cur if cur else ORIGIN), DOWN, buff=0.5)
                if not len(notes):
                    nt.set_x(0)
                notes.add(nt); anims.append(FadeIn(nt, shift=UP * 0.15))
            self.beat(b.get("say"), *anims, run_time=1.2 if b.get("tex") else 0.8)

    def s_example(self, sc, beats):
        """Разбор задачи: условие сверху, шаги решения столбиком. beat: {tex} | {text} | {answer: true}."""
        self.beat(None, self.header(UI[LANG]["example"] if not sc.get("kicker") else sc["kicker"]), run_time=0.5)
        prob = card(rich(sc["problem"], 34, W, 11.4), 0.35)
        prob.next_to(self.head, DOWN, buff=0.35).set_x(0)
        steps = VGroup()
        first = True
        for b in beats:
            anims = []
            if first:
                anims.append(FadeIn(prob, shift=UP * 0.2)); first = False
            if b.get("tex") or b.get("text"):
                st = M(b["tex"], 54, col(b.get("color"))) if b.get("tex") else rich(b["text"], 34, col(b.get("color")), 11.4)
                if st.width > 12:
                    st.scale_to_fit_width(12)
                st.next_to(steps if len(steps) else prob, DOWN, buff=0.38)
                st.set_x(0) if b.get("tex") else st.align_to(prob, LEFT)
                steps.add(st); anims.append(Write(st) if b.get("tex") else FadeIn(st))
                if steps.get_bottom()[1] < BOTTOM:
                    whole = VGroup(prob, steps)
                    target = whole.copy(); fit(target, self.head.get_bottom()[1] - 0.3); target.set_x(0)
                    st.become(target[1][-1])
                    for k in range(len(steps) - 1):
                        steps[k].generate_target(); steps[k].target.become(target[1][k]); anims.append(MoveToTarget(steps[k]))
                    prob.generate_target(); prob.target.become(target[0]); anims.append(MoveToTarget(prob))
            if b.get("answer") and len(steps):
                anims.append(Create(SurroundingRectangle(steps[-1], color=G, buff=0.15, corner_radius=0.1)))
            self.beat(b.get("say"), *anims, run_time=1.2)

    def s_graph(self, sc, beats):
        """Оси + графики. beat: {plot: "выражение от x", color, label} | {point:[x,y], label} | {area:[a,b], of: номер графика}
        | {line:[[x1,y1],[x2,y2]], dashed} | {tangent: x, of}."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        xr, yr = sc.get("x", [-5, 5, 1]), sc.get("y", [-3, 5, 1])
        side = any(b.get("text") for b in beats)
        ax = Axes(x_range=xr, y_range=yr, x_length=sc.get("w", 7.6 if side else 9), y_length=sc.get("h", 5.0), tips=True,
                  axis_config={"color": MUTED, "stroke_width": 3, "include_numbers": sc.get("numbers", True), "font_size": 24},
                  ).shift(DOWN * 0.35 + RIGHT * sc.get("shift_x", -2.0 if side else 0))
        labels = ax.get_axis_labels(M(sc.get("xlabel", "x"), 36, MUTED), M(sc.get("ylabel", "y"), 36, MUTED))
        plots = []
        colors = [G, Y, B, O, R]
        first = True
        for b in beats:
            anims = []
            if first:
                anims += [Create(ax), FadeIn(labels)]; first = False
            if b.get("plot"):
                expr = b["plot"]
                f = lambda x, e=expr: eval(e, {"np": np, "x": x, "sin": np.sin, "cos": np.cos, "tan": np.tan, "sqrt": np.sqrt, "log": np.log, "exp": np.exp, "abs": abs, "pi": np.pi})
                rng = b.get("range", [xr[0], xr[1]])
                c = col(b.get("color"), colors[len(plots) % len(colors)])
                g = ax.plot(f, x_range=[rng[0], rng[1], (rng[1] - rng[0]) / 300], color=c, stroke_width=5, use_smoothing=False)
                plots.append(g); anims.append(Create(g))
                if b.get("label"):
                    lx = b.get("label_at", rng[1] - (rng[1] - rng[0]) * 0.12)
                    lab = M(b["label"], 34, c).next_to(ax.c2p(lx, f(lx)), UR, buff=0.12)
                    anims.append(FadeIn(lab))
            if b.get("point"):
                x, y = b["point"]
                d = Dot(ax.c2p(x, y), color=col(b.get("color"), Y), radius=0.09)
                anims.append(FadeIn(d, scale=1.6))
                if b.get("dashed", True):
                    anims.append(Create(ax.get_lines_to_point(ax.c2p(x, y), color=MUTED)))
                if b.get("label"):
                    anims.append(FadeIn(M(b["label"], 32, col(b.get("color"), Y)).next_to(d, globals()[b["dir"]] if b.get("dir") else UR, buff=0.12)))
            if b.get("area") and plots:
                g = plots[b.get("of", len(plots) - 1)]
                ar = ax.get_area(g, x_range=b["area"], color=col(b.get("color"), G), opacity=0.35)
                anims.append(FadeIn(ar))
            if b.get("line"):
                (x1, y1), (x2, y2) = b["line"]
                ln = (DashedLine if b.get("dashed") else Line)(ax.c2p(x1, y1), ax.c2p(x2, y2), color=col(b.get("color"), B), stroke_width=4)
                anims.append(Create(ln))
            if b.get("text"):
                t = card(rich(b["text"], 32, W, 3.8), 0.3)
                t.move_to([4.6, 0.6, 0])
                anims.append(FadeIn(t))
            self.beat(b.get("say"), *anims, run_time=1.4)

    def s_forces(self, sc, beats):
        """Тело и силы. beat: {force: {angle (градусы), len, label, color}} | {text}."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        ground = Line(LEFT * 5, RIGHT * 5, color=MUTED, stroke_width=4).shift(DOWN * 1.6)
        body = Square(1.4, color=W, fill_color="#2A2F2C", fill_opacity=1, stroke_width=3).next_to(ground, UP, buff=0)
        if sc.get("label"):
            body.add(M(sc["label"], 40, W).move_to(body))
        first = True
        for b in beats:
            anims = []
            if first:
                anims += [Create(ground), FadeIn(body)]; first = False
            f = b.get("force")
            if f:
                a = np.deg2rad(f.get("angle", 0))
                d = np.array([np.cos(a), np.sin(a), 0])
                start = body.get_center()
                c = col(f.get("color"), G)
                ar = arrow(start, start + d * f.get("len", 2), c)
                anims.append(GrowArrow(ar))
                if f.get("label"):
                    anims.append(FadeIn(M(f["label"], 40, c).move_to(start + d * (f.get("len", 2) + 0.45))))
            if b.get("text"):
                t = card(rich(b["text"], 28, W, 4.8), 0.25).to_corner(UR, buff=0.5).shift(DOWN * 0.9)
                anims.append(FadeIn(t))
            self.beat(b.get("say"), *anims, run_time=1.0)

    def s_numberline(self, sc, beats):
        """Числовая прямая. beat: {point: x, open, label} | {interval: [a, b], open: [bool, bool]} (±inf допустимы)."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        r = sc.get("range", [-6, 6, 1])
        nl = NumberLine(x_range=r, length=11, color=MUTED, include_numbers=True, font_size=28, include_tip=True).shift(DOWN * 0.2)
        first = True
        for b in beats:
            anims = []
            if first:
                anims.append(Create(nl)); first = False
            if "point" in b:
                p = nl.n2p(b["point"])
                d = Circle(0.13, color=Y, stroke_width=4, fill_color=BG if b.get("open") else Y, fill_opacity=1).move_to(p)
                anims.append(FadeIn(d, scale=1.5))
                if b.get("label"):
                    anims.append(FadeIn(M(b["label"], 34, Y).next_to(d, UP, buff=0.25)))
            if "interval" in b:
                a, c = b["interval"]
                a = r[0] - 0.3 if a in (None, "-inf") else a
                c = r[1] + 0.3 if c in (None, "inf") else c
                band = Line(nl.n2p(max(a, r[0] - 0.3)), nl.n2p(min(c, r[1] + 0.3)), color=col(b.get("color"), G), stroke_width=12, stroke_opacity=0.75).shift(UP * 0.0)
                anims.append(Create(band))
            if b.get("text"):
                anims.append(FadeIn(card(rich(b["text"], 30, W, 10), 0.3).shift(UP * 2.0)))
            self.beat(b.get("say"), *anims, run_time=1.0)

    def s_table(self, sc, beats):
        """Таблица. beat: {row: номер} показывает строку (0 — шапка), без row — только фраза."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        head = [L(h) for h in sc["head"]]
        rows = [[L(c) for c in r] for r in sc["rows"]]
        cells = [[rich(c, 36, G if i == 0 else W, 4.2, BOLD if i == 0 else NORMAL) for c in r] for i, r in enumerate([head] + rows)]
        widths = [max(cells[i][j].width for i in range(len(cells))) + 0.6 for j in range(len(head))]
        h = 0.85
        grid = VGroup()
        for i, r in enumerate(cells):
            x = -sum(widths) / 2
            line = VGroup()
            for j, c in enumerate(r):
                box = Rectangle(width=widths[j], height=h, stroke_color="#2A302D", stroke_width=2, fill_color=CARD if i else "#13201A", fill_opacity=1)
                box.move_to([x + widths[j] / 2, 0, 0]); c.move_to(box)
                line.add(VGroup(box, c)); x += widths[j]
            grid.add(line)
        grid.arrange(DOWN, buff=0).next_to(self.head if self.head else UP * 3, DOWN, buff=0.5).set_x(0)
        if grid.height > 5.2:
            grid.scale_to_fit_height(5.2)
        shown = set()
        for b in beats:
            anims = []
            if "row" in b:
                for k in range(0, b["row"] + 1):
                    if k not in shown:
                        anims.append(FadeIn(grid[k], shift=UP * 0.1)); shown.add(k)
            self.beat(b.get("say"), *anims, run_time=0.8)

    def s_code(self, sc, beats):
        """Код Python. beat: {line: номер} — подсветить строку, {output: "текст"} — вывод программы."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        code = Code(code_string=sc["code"], language=sc.get("language", "python"), formatter_style="monokai", background="window",
                    paragraph_config={"font": "DejaVu Sans Mono", "font_size": 32})
        code.move_to(LEFT * 1.6 + DOWN * 0.2)
        if code.width > 8.5:
            code.scale_to_fit_width(8.5)
        hl = None
        first = True
        for b in beats:
            anims = []
            if first:
                anims.append(FadeIn(code, shift=UP * 0.2)); first = False
            if b.get("line"):
                ln = code.code_lines[b["line"] - 1] if hasattr(code, "code_lines") else code[2][b["line"] - 1]
                new = SurroundingRectangle(ln, color=Y, buff=0.06, stroke_width=3)
                anims.append(ReplacementTransform(hl, new) if hl else Create(new)); hl = new
            if "output" in b:
                out = card(VGroup(T(">>>", 24, MUTED), T(str(b["output"]), 30, G)).arrange(DOWN, aligned_edge=LEFT, buff=0.15), 0.3)
                out.next_to(code, RIGHT, buff=0.5).align_to(code, UP)
                anims.append(FadeIn(out, shift=LEFT * 0.2))
            self.beat(b.get("say"), *anims, run_time=0.9)

    def s_geometry(self, sc, beats):
        """Фигура по точкам. sc.points = {"A": [x, y], ...}. beat: {polygon: ["A","B","C"]} | {segment: ["A","C"], label, color, dashed}
        | {angle: ["B","A","C"], label} | {right: ["B","C","A"]} (прямой угол в C) | {text}."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        pts = {k: np.array([v[0], v[1], 0]) + np.array([sc.get("shift_x", -1.5), sc.get("shift_y", -0.6), 0]) for k, v in sc["points"].items()}
        cen = sum(pts.values()) / len(pts)
        for b in beats:
            anims = []
            if b.get("polygon"):
                poly = Polygon(*[pts[k] for k in b["polygon"]], color=W, stroke_width=4, fill_color=G, fill_opacity=0.08)
                anims.append(Create(poly))
                for k in b["polygon"]:
                    d = pts[k] - cen; d = d / (np.linalg.norm(d) or 1)
                    anims.append(FadeIn(M(k, 36, MUTED).move_to(pts[k] + d * 0.4)))
            if b.get("segment"):
                p, q = (pts[k] for k in b["segment"])
                ln = (DashedLine if b.get("dashed") else Line)(p, q, color=col(b.get("color"), Y), stroke_width=5)
                anims.append(Create(ln))
                if b.get("label"):
                    mid = (p + q) / 2; n = np.array([-(q - p)[1], (q - p)[0], 0]); n = n / (np.linalg.norm(n) or 1)
                    if np.dot(n, mid - cen) < 0:
                        n = -n
                    anims.append(FadeIn(M(b["label"], 34, col(b.get("color"), Y)).move_to(mid + n * 0.4)))
            if b.get("angle"):
                a, v, c = (pts[k] for k in b["angle"])
                ang = Angle(Line(v, a), Line(v, c), radius=0.55, color=col(b.get("color"), B), other_angle=b.get("other", False))
                anims.append(Create(ang))
                if b.get("label"):
                    anims.append(FadeIn(M(b["label"], 30, col(b.get("color"), B)).move_to(Angle(Line(v, a), Line(v, c), radius=0.95, other_angle=b.get("other", False)).point_from_proportion(0.5))))
            if b.get("right"):
                a, v, c = (pts[k] for k in b["right"])
                anims.append(Create(RightAngle(Line(v, a), Line(v, c), length=0.3, color=MUTED)))
            if b.get("text"):
                anims.append(FadeIn(card(rich(b["text"], 28, W, 4.6), 0.25).to_corner(UR, buff=0.5).shift(DOWN * 0.9)))
            self.beat(b.get("say"), *anims, run_time=1.0)

    def s_quiz(self, sc, beats):
        """Вопрос на паузу: варианты, пауза, правильный ответ. beats[0] — вопрос, beats[1] — разбор."""
        self.beat(None, self.header(UI[LANG]["think"]), run_time=0.5)
        q = rich(sc["question"], 40, W, 12).next_to(self.head, DOWN, buff=0.5).set_x(0)
        opts = VGroup()
        for i, o in enumerate(sc["options"]):
            lab = T("ABCD"[i], 36, G, BOLD)
            body = rich(o, 36, W, 4.8)
            opts.add(card(VGroup(lab, body).arrange(RIGHT, buff=0.35), 0.35))
        opts.arrange_in_grid(2, 2, buff=(0.5, 0.4)).next_to(q, DOWN, buff=0.55)
        grp = VGroup(q, opts); fit(grp, self.head.get_bottom()[1] - 0.4); grp.set_x(0)
        self.beat(beats[0].get("say") if beats else None, FadeIn(q), LaggedStart(*[FadeIn(o, shift=UP * 0.15) for o in opts], lag_ratio=0.15), run_time=1.4)
        self.wait(sc.get("pause", 3))
        ok = opts[sc.get("correct", 0)]
        self.beat(beats[1].get("say") if len(beats) > 1 else None, ok[0].animate.set_stroke(G, 4), *[o.animate.set_opacity(0.35) for i, o in enumerate(opts) if i != sc.get("correct", 0)], run_time=0.8)
        for b in beats[2:]:
            self.beat(b.get("say"))

    def s_summary(self, sc, beats):
        """Конспект «запиши в тетрадь»: карточки с главным. beat: {tex} | {item}."""
        self.beat(None, self.header(UI[LANG]["notebook"]), run_time=0.5)
        stack = VGroup()
        for b in beats:
            anim = None
            if b.get("tex") or b.get("item"):
                body = M(b["tex"], 56, W) if b.get("tex") else rich(b["item"], 36, W, 10.8)
                if body.width > 11:
                    body.scale_to_fit_width(11)
                c = card(body, 0.28, stroke="#25302A")
                c.next_to(stack if len(stack) else self.head, DOWN, buff=0.3 if len(stack) else 0.5)
                c.set_x(0)
                stack.add(c); anim = FadeIn(c, shift=UP * 0.15)
                if stack.get_bottom()[1] < BOTTOM:
                    top = self.head.get_bottom()[1] - 0.4
                    target = stack.copy(); fit(target, top); target.set_x(0)
                    old = stack[:-1]
                    for k in range(len(old)):
                        old[k].generate_target(); old[k].target.become(target[k])
                    stack[-1].become(target[-1])
                    self.play(*[MoveToTarget(o) for o in old], run_time=0.4)
            self.beat(b.get("say"), anim)

    def s_motion(self, sc, beats):
        """Тела на оси x. sc.bodies = [{x0, v, color, label}], sc.range = [a, b, шаг].
        beat: {run: T} — время идёт от текущего до T секунд (анимация длится, пока звучит фраза)."""
        if sc.get("kicker") or sc.get("title"):
            self.beat(None, self.header(sc.get("kicker", ""), sc.get("title")), run_time=0.6)
        r = sc.get("range", [0, 120, 20])
        nl = NumberLine(x_range=r, length=11.5, color=MUTED, include_numbers=True, font_size=26, include_tip=True).shift(DOWN * 0.6)
        xl = M(r"x,\ \text{м}", 30, MUTED).next_to(nl, RIGHT, buff=0.2).shift(UP * 0.35)
        t = ValueTracker(0)
        dots = VGroup()
        for i, bd in enumerate(sc["bodies"]):
            c = col(bd.get("color"), [G, Y, B][i % 3])
            d = always_redraw(lambda bd=bd, c=c: Dot(nl.n2p(bd["x0"] + bd["v"] * t.get_value()), radius=0.16, color=c))
            lab = always_redraw(lambda bd=bd, c=c, i=i: M(bd.get("label", str(i + 1)), 30, c).next_to(nl.n2p(bd["x0"] + bd["v"] * t.get_value()), UP * (1 if i % 2 == 0 else -1), buff=0.35))
            dots.add(d, lab)
        clock = always_redraw(lambda: M(f"t = {t.get_value():.0f}" + r"\ \text{с}", 44, W).to_corner(UR, buff=0.6).shift(DOWN * 0.4))
        first = True
        for b in beats:
            anims = []
            if first:
                anims += [Create(nl), FadeIn(xl), FadeIn(dots), FadeIn(clock)]; first = False
            if b.get("text"):
                anims.append(FadeIn(card(rich(b["text"], 32, W, 6), 0.3).to_corner(UL, buff=0.5).shift(DOWN * 1.1)))
            if "run" in b:
                text = L(b.get("say", ""))
                _, dur = tts.clip(text, LANG) if text else (None, 2.0)
                self.beat(b.get("say"), *anims, t.animate.set_value(b["run"]), run_time=max(1.5, dur - 0.2))
            else:
                self.beat(b.get("say"), *anims, run_time=1.0)

    def s_outro(self, sc, beats):
        t = T(UI[LANG]["next"], 44, W, BOLD)
        line = Line(LEFT * 1.4, RIGHT * 1.4, color=G, stroke_width=6).next_to(t, DOWN, buff=0.3)
        brand = T("AlemPrep", 30, G, BOLD).next_to(line, DOWN, buff=0.5)
        self.beat(beats[0].get("say") if beats else None, FadeIn(t, shift=UP * 0.2), Create(line), FadeIn(brand), run_time=1.0)
        for b in beats[1:]:
            self.beat(b.get("say"))
