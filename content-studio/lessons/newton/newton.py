from manim import *
import numpy as np

# ---------- style ----------
BG = "#0C0E0D"; G = "#2BC98F"; Y = "#FFD45A"; B = "#5CC8FF"; R = "#FF5C6C"; W = "#F2F4F3"; MUTED = "#8A938F"
config.background_color = BG
tpl = TexTemplate(); tpl.add_to_preamble(r"\usepackage[T2A]{fontenc}\usepackage[utf8]{inputenc}")
config.tex_template = tpl
FONT = "Inter Display"

def T(s, size=34, color=W, weight=NORMAL):
    return Text(s, font=FONT, font_size=size, color=color, weight=weight)

def M(s, size=48, color=W):
    return MathTex(s, font_size=size, color=color)

def arrow(start, end, color, w=8):
    return Arrow(start, end, buff=0, color=color, stroke_width=w, max_tip_length_to_length_ratio=0.25, max_stroke_width_to_length_ratio=12)

class Lesson(Scene):
    # ---- caption helper: one line of narration at the bottom ----
    cap = None
    def say(self, text, wait=2.6, color=W):
        import textwrap
        lines = []
        for part in text.split("\n"):
            lines += textwrap.wrap(part, 62) or [""]
        new = VGroup(*[T(l, 30, color) for l in lines]).arrange(DOWN, buff=0.12)
        if new.width > 12.6: new.scale_to_fit_width(12.6)
        bg = RoundedRectangle(corner_radius=0.18, width=new.width + 0.7, height=new.height + 0.4,
                              fill_color="#000000", fill_opacity=0.55, stroke_width=0)
        grp = VGroup(bg, new).to_edge(DOWN, buff=0.35)
        if self.cap is not None:
            self.play(FadeOut(self.cap), run_time=0.2)
        self.play(FadeIn(grp, shift=UP * 0.12), run_time=0.3)
        self.cap = grp
        self.wait(max(wait, 1.0 + len(text) / 14.0))

    def clear_cap(self):
        if self.cap is not None:
            self.play(FadeOut(self.cap), run_time=0.3); self.cap = None

    def wipe(self, *keep):
        objs = [m for m in self.mobjects if m not in keep and m is not self.cap]
        if objs: self.play(*[FadeOut(m) for m in objs], run_time=0.6)

    def header(self, s, color=G):
        h = T(s, 30, color, BOLD).to_corner(UL, buff=0.45)
        self.play(FadeIn(h, shift=RIGHT * 0.2), run_time=0.5)
        return h

    # ================================================================
    def construct(self):
        self.title(); self.hook(); self.dynamics(); self.law1(); self.law2(); self.law3()
        self.problems(); self.conspect(); self.outro()

    # ---------------- 0. title ----------------
    def title(self):
        tag = T("ДИНАМИКА · ФИЗИКА ЕНТ", 24, G, BOLD)
        t = T("Законы Ньютона", 72, W, BOLD)
        sub = T("три закона, которые объясняют любое движение", 30, MUTED)
        g = VGroup(tag, t, sub).arrange(DOWN, buff=0.35)
        self.play(FadeIn(tag, shift=UP * .2), Write(t), run_time=1.6)
        self.play(FadeIn(sub, shift=UP * .2)); self.wait(2.2)
        self.play(FadeOut(g, shift=UP * .3), run_time=.7)
        plan = VGroup(T("В этом уроке:", 40, G, BOLD),
                      T("1. Почему в автобусе бросает вперёд", 32), T("2. Три закона Ньютона — на примерах", 32),
                      T("3. Семь задач в формате ЕНТ + ловушки", 32), T("4. Конспект для тетради", 32)).arrange(DOWN, buff=.3, aligned_edge=LEFT)
        for p in plan: self.play(FadeIn(p, shift=RIGHT * .2), run_time=.45); self.wait(.5)
        self.wait(2.0); self.play(FadeOut(plan), run_time=.6)

    # ---------------- 1. hook: bus ----------------
    def bus(self):
        body = RoundedRectangle(corner_radius=.25, width=6.2, height=2.3, fill_color="#2E6F9E", fill_opacity=1, stroke_width=0)
        wins = VGroup(*[RoundedRectangle(corner_radius=.08, width=.95, height=.75, fill_color="#BFE3FF", fill_opacity=.9, stroke_width=0)
                        .move_to(body.get_top() + DOWN * .65 + RIGHT * (-2.35 + i * 1.18)) for i in range(5)])
        wheels = VGroup(*[Circle(.38, fill_color="#16181A", fill_opacity=1, stroke_color="#55595C", stroke_width=6)
                          .move_to(body.get_bottom() + RIGHT * x) for x in (-1.9, 1.9)])
        return VGroup(body, wins, wheels)

    def person(self, color=Y):
        head = Circle(.17, fill_color=color, fill_opacity=1, stroke_width=0)
        torso = Line(ORIGIN, DOWN * .55, color=color, stroke_width=8)
        legs = VGroup(Line(DOWN * .55, DOWN * 1.0 + LEFT * .12, color=color, stroke_width=8),
                      Line(DOWN * .55, DOWN * 1.0 + RIGHT * .12, color=color, stroke_width=8))
        head.next_to(torso, UP, buff=.02)
        return VGroup(head, torso, legs)

    def hook(self):
        road = Line(LEFT * 8, RIGHT * 8, color=MUTED, stroke_width=3).shift(DOWN * 1.9)
        bus = self.bus().shift(LEFT * 7 + DOWN * .3)
        man = self.person().scale(1.05).move_to(bus[0].get_center() + DOWN * .25 + RIGHT * .2)
        self.play(Create(road), run_time=.6)
        self.add(bus, man)
        self.say("Автобус едет. Ты стоишь внутри.", 0.2)
        self.play(VGroup(bus, man).animate.shift(RIGHT * 6.5), run_time=2.6, rate_func=linear)
        self.say("Водитель резко тормозит —", 0.1)
        self.play(VGroup(bus, man).animate.shift(RIGHT * .9), run_time=.9, rate_func=rate_functions.ease_out_cubic)
        pivot = man.get_bottom()
        self.play(Rotate(man, angle=-0.55, about_point=pivot), run_time=.45, rate_func=rate_functions.ease_out_back)
        self.wait(.6)
        q = T("Почему тебя бросает ВПЕРЁД?", 46, Y, BOLD).to_edge(UP, buff=.8)
        self.play(Write(q), run_time=1.2)
        self.say("Тебя никто не толкал. Разгадка — в первом законе Ньютона.", 3.2)
        self.play(Rotate(man, angle=0.55, about_point=pivot), run_time=.4)
        self.wipe()

    # ---------------- 2. what is dynamics / force ----------------
    def dynamics(self):
        h = self.header("Что изучает динамика")
        k = T("Кинематика:", 38, MUTED, BOLD); k2 = T("КАК движется тело", 38, W)
        d = T("Динамика:", 38, G, BOLD); d2 = T("ПОЧЕМУ оно так движется", 38, W)
        rows = VGroup(VGroup(k, k2).arrange(RIGHT, buff=.3), VGroup(d, d2).arrange(RIGHT, buff=.3)).arrange(DOWN, buff=.6, aligned_edge=LEFT).shift(UP * 1)
        self.play(FadeIn(rows[0], shift=RIGHT * .2)); self.wait(.6)
        self.play(FadeIn(rows[1], shift=RIGHT * .2))
        self.say("Причина любого изменения движения — СИЛА.", 2.4)
        box = Square(1.1, fill_color=B, fill_opacity=.85, stroke_width=0).shift(DOWN * 1.6 + LEFT * 2)
        f = arrow(box.get_right(), box.get_right() + RIGHT * 2.2, R)
        fl = M(r"\vec F", 52, R).next_to(f, UP, buff=.1)
        self.play(FadeIn(box), GrowArrow(f), FadeIn(fl))
        info = VGroup(T("сила — это вектор:", 30, W), T("есть величина и направление", 30, MUTED),
                      M(r"[F] = 1\ \text{Н (ньютон)}", 40, Y)).arrange(DOWN, buff=.2, aligned_edge=LEFT).next_to(f, RIGHT, buff=.6)
        self.play(FadeIn(info, shift=LEFT * .2))
        self.say("Сила показывает, кто и как сильно действует на тело.", 3.0)
        self.wipe(h)
        # mass = measure of inertia
        sm = Square(.8, fill_color=B, fill_opacity=.9, stroke_width=0).shift(LEFT * 3 + UP * .6)
        bg_ = Square(1.6, fill_color="#2F7D63", fill_opacity=.95, stroke_width=0).shift(RIGHT * 2.5 + UP * .6)
        ls = M("1\\ \\text{кг}", 40).move_to(sm); lb = M("50\\ \\text{кг}", 44).move_to(bg_)
        self.play(FadeIn(sm), FadeIn(bg_), FadeIn(ls), FadeIn(lb))
        self.say("Что легче сдвинуть с места: мешок в 1 кг или в 50 кг?", 2.6)
        mt = T("Масса — мера инертности тела", 40, Y, BOLD).shift(DOWN * 1.4)
        self.play(Write(mt))
        self.say("Чем больше масса, тем труднее изменить скорость тела. Масса измеряется в кг.", 3.0)
        self.wipe(h)
        # kinds of forces
        kinds = VGroup(
            VGroup(M("m\\vec g", 46, R), T("сила тяжести — Земля тянет вниз", 30)).arrange(RIGHT, buff=.4),
            VGroup(M("\\vec N", 46, G), T("сила реакции опоры — опора давит вверх", 30)).arrange(RIGHT, buff=.4),
            VGroup(M("\\vec F_{\\text{тр}}", 46, Y), T("сила трения — мешает скольжению", 30)).arrange(RIGHT, buff=.4),
            VGroup(M("\\vec T", 46, B), T("сила натяжения — нить или трос тянет", 30)).arrange(RIGHT, buff=.4),
        ).arrange(DOWN, buff=.45, aligned_edge=LEFT).shift(UP * .3)
        for k in kinds: self.play(FadeIn(k, shift=RIGHT * .2), run_time=.6); self.wait(.8)
        self.say("Эти четыре силы встречаются почти в каждой задаче ЕНТ по динамике.", 3.0)
        self.wipe()

    # ---------------- 3. first law ----------------
    def law1(self):
        h = self.header("1-й закон Ньютона · закон инерции")
        # two lanes: carpet vs ice
        lane1 = VGroup(Rectangle(width=11, height=.5, fill_color="#7A4B3A", fill_opacity=.8, stroke_width=0), T("ковёр", 24, MUTED)).shift(UP * 1.2)
        lane1[1].next_to(lane1[0], LEFT, buff=.2)
        lane2 = VGroup(Rectangle(width=11, height=.5, fill_color="#BFE3FF", fill_opacity=.45, stroke_width=0), T("лёд", 24, MUTED)).shift(DOWN * .6)
        lane2[1].next_to(lane2[0], LEFT, buff=.2)
        p1 = Circle(.22, fill_color=Y, fill_opacity=1, stroke_width=0).move_to(lane1[0].get_left() + RIGHT * .5 + UP * .45)
        p2 = Circle(.22, fill_color=Y, fill_opacity=1, stroke_width=0).move_to(lane2[0].get_left() + RIGHT * .5 + UP * .45)
        self.play(FadeIn(lane1), FadeIn(lane2), FadeIn(p1), FadeIn(p2))
        self.say("Толкнём шайбу одинаково по ковру и по льду.", 1.0)
        self.play(p1.animate.shift(RIGHT * 2.2), p2.animate.shift(RIGHT * 6.5), run_time=2.4, rate_func=rate_functions.ease_out_quad)
        self.say("На ковре её быстро тормозит трение. На льду трения почти нет.", 2.8)
        self.say("А если бы трения не было совсем?", 0.3)
        p2b = p2.copy().set_color(G)
        self.play(FadeOut(p2), FadeIn(p2b))
        self.play(p2b.animate.shift(RIGHT * 4.5), run_time=1.8, rate_func=linear)
        self.say("Шайба ехала бы вечно — с той же скоростью и по прямой.", 2.8)
        self.wipe(h)
        law = VGroup(
            T("Если на тело не действуют силы", 40, W, BOLD),
            T("(или они уравновешены),", 34, MUTED),
            T("тело покоится или движется", 40, W, BOLD),
            T("равномерно и прямолинейно.", 40, G, BOLD)).arrange(DOWN, buff=.18).shift(UP * .6)
        frame = SurroundingRectangle(law, color=G, buff=.35, corner_radius=.2, stroke_width=3)
        self.play(FadeIn(law, shift=UP * .2), Create(frame), run_time=1.4)
        self.say("Это свойство тела «сохранять движение» называется ИНЕРЦИЯ.", 3.4, Y)
        self.wipe(h)
        # balanced forces: book on table
        table = Rectangle(width=5, height=.25, fill_color="#8C6B4F", fill_opacity=1, stroke_width=0).shift(DOWN * .8)
        legs = VGroup(*[Rectangle(width=.2, height=1.6, fill_color="#6E533D", fill_opacity=1, stroke_width=0).next_to(table, DOWN, buff=0).shift(RIGHT * x) for x in (-2.1, 2.1)])
        book = Rectangle(width=1.6, height=.45, fill_color=B, fill_opacity=1, stroke_width=0).next_to(table, UP, buff=0)
        self.play(FadeIn(table), FadeIn(legs), FadeIn(book))
        mg = arrow(book.get_center(), book.get_center() + DOWN * 1.8, R); mgl = M(r"m\vec g", 42, R).next_to(mg, LEFT, buff=.15)
        N = arrow(book.get_center(), book.get_center() + UP * 1.8, G); Nl = M(r"\vec N", 42, G).next_to(N, LEFT, buff=.15)
        self.play(GrowArrow(mg), FadeIn(mgl)); self.play(GrowArrow(N), FadeIn(Nl))
        eq = M(r"\vec N + m\vec g = 0", 46, Y).move_to(RIGHT * 4.3 + UP * .8)
        self.play(Write(eq))
        self.say("Силы есть, но они уравновешены — книга лежит. Это тоже 1-й закон.", 3.4)
        self.wipe(h)
        # back to the bus
        bus = self.bus().scale(.8).shift(DOWN * .2)
        man = self.person().scale(.9).move_to(bus[0].get_center() + DOWN * .2)
        self.play(FadeIn(bus), FadeIn(man))
        v = arrow(man.get_top() + UP * .2, man.get_top() + UP * .2 + RIGHT * 1.6, Y, 6)
        vl = T("ты продолжаешь двигаться", 26, Y).next_to(v, UP, buff=.1)
        self.play(GrowArrow(v), FadeIn(vl))
        self.say("Автобус затормозил, а твоё тело по инерции движется дальше.", 3.0)
        self.say("Вот почему бросает вперёд. Загадка решена.", 2.4, G)
        self.wipe(h)
        isr = VGroup(T("Важно для ЕНТ:", 34, R, BOLD),
                     T("законы Ньютона выполняются в ИНЕРЦИАЛЬНЫХ системах отсчёта —", 32),
                     T("тех, что покоятся или движутся равномерно и прямолинейно.", 32),
                     T("Землю обычно считают инерциальной системой.", 32, MUTED)).arrange(DOWN, buff=.25, aligned_edge=LEFT)
        isr.scale_to_fit_width(min(isr.width, 12.0)).move_to(UP * .5)
        self.play(FadeIn(isr, shift=UP * .2), run_time=1.0)
        self.say("Тормозящий автобус — НЕинерциальная система: в ней тело «само» летит вперёд без силы.", 3.6)
        self.wipe()

    # ---------------- 4. second law ----------------
    def cart(self, color=B, w=1.6):
        body = RoundedRectangle(corner_radius=.1, width=w, height=.8, fill_color=color, fill_opacity=1, stroke_width=0)
        wh = VGroup(*[Circle(.16, fill_color="#16181A", fill_opacity=1, stroke_width=0).move_to(body.get_bottom() + RIGHT * x) for x in (-w / 3, w / 3)])
        return VGroup(body, wh)

    def law2(self):
        h = self.header("2-й закон Ньютона")
        track = Line(LEFT * 6.5, RIGHT * 6.5, color=MUTED, stroke_width=3)
        t1 = track.copy().shift(UP * 1.0); t2 = track.copy().shift(DOWN * 1.6)
        c1 = self.cart().next_to(t1, UP, buff=0).align_to(t1, LEFT).shift(RIGHT * .4)
        c2 = self.cart().next_to(t2, UP, buff=0).align_to(t2, LEFT).shift(RIGHT * .4)
        self.play(Create(t1), Create(t2), FadeIn(c1), FadeIn(c2))
        f1 = always_redraw(lambda: arrow(c1.get_left() + LEFT * 1.0, c1.get_left(), R))
        f2 = always_redraw(lambda: arrow(c2.get_left() + LEFT * 2.0, c2.get_left(), R))
        l1 = always_redraw(lambda: M(r"F", 40, R).next_to(f1, UP, buff=.05))
        l2 = always_redraw(lambda: M(r"2F", 40, R).next_to(f2, UP, buff=.05))
        self.add(f1, f2, l1, l2)
        self.say("Толкнём одинаковые тележки: одну силой F, другую — 2F.", 0.6)
        self.play(c1.animate.shift(RIGHT * 4), c2.animate.shift(RIGHT * 8), run_time=3, rate_func=rate_functions.ease_in_quad)
        self.say("Сила вдвое больше → ускорение вдвое больше.", 2.6, Y)
        self.remove(f1, f2, l1, l2); self.play(FadeOut(c1), FadeOut(c2), run_time=.4)
        # mass
        c3 = self.cart().next_to(t1, UP, buff=0).align_to(t1, LEFT).shift(RIGHT * .4)
        c4 = self.cart(color="#2F7D63", w=2.4).next_to(t2, UP, buff=0).align_to(t2, LEFT).shift(RIGHT * .4)
        load = VGroup(*[Square(.45, fill_color=Y, fill_opacity=.9, stroke_color=BG, stroke_width=3) for _ in range(4)]).arrange(RIGHT, buff=0).next_to(c4[0], UP, buff=0)
        c4.add(load)
        m3 = always_redraw(lambda: M("m", 36, W).move_to(c3[0])); m4 = always_redraw(lambda: M("2m", 36, W).move_to(c4[0]))
        f3 = always_redraw(lambda: arrow(c3.get_left() + LEFT * 1.0, c3.get_left(), R))
        f4 = always_redraw(lambda: arrow(c4.get_left() + LEFT * 1.0, c4.get_left(), R))
        self.play(FadeIn(c3), FadeIn(c4)); self.add(m3, m4, f3, f4)
        self.say("Теперь сила одна и та же, но вторая тележка вдвое тяжелее.", 0.6)
        self.play(c3.animate.shift(RIGHT * 8), c4.animate.shift(RIGHT * 4), run_time=3, rate_func=rate_functions.ease_in_quad)
        self.say("Масса вдвое больше → ускорение вдвое меньше.", 2.6, Y)
        self.remove(m3, m4, f3, f4); self.wipe(h)
        # formula
        f = M(r"\vec a = \frac{\vec F}{m}", 96, W)
        self.play(Write(f), run_time=1.6)
        self.say("Ускорение прямо пропорционально силе и обратно пропорционально массе.", 3.2)
        f2 = M(r"\vec F = m\vec a", 96, G).move_to(f)
        self.play(TransformMatchingTex(f, f2), run_time=1.2)
        unit = M(r"1\ \text{Н} = 1\ \text{кг}\cdot 1\ \tfrac{\text{м}}{\text{с}^2}", 52, Y).next_to(f2, DOWN, buff=.8)
        self.play(FadeIn(unit, shift=UP * .2))
        self.say("Так и определяют ньютон: сила, которая разгоняет 1 кг на 1 м/с².", 3.4)
        self.wipe(h)
        # resultant force
        box = Square(1.2, fill_color=B, fill_opacity=.9, stroke_width=0).shift(UP * .6)
        r_ = arrow(box.get_right(), box.get_right() + RIGHT * 3.0, R); rl = M(r"10\ \text{Н}", 40, R).next_to(r_, UP, buff=.1)
        l_ = arrow(box.get_left(), box.get_left() + LEFT * 1.2, B); ll = M(r"4\ \text{Н}", 40, B).next_to(l_, UP, buff=.1)
        self.play(FadeIn(box), GrowArrow(r_), FadeIn(rl), GrowArrow(l_), FadeIn(ll))
        self.say("Если сил несколько, в формулу ставят РАВНОДЕЙСТВУЮЩУЮ — их векторную сумму.", 3.0)
        res = arrow(box.get_center() + DOWN * 1.5, box.get_center() + DOWN * 1.5 + RIGHT * 1.8, G, 10)
        resl = M(r"F_{\text{рез}} = 10 - 4 = 6\ \text{Н}", 46, G).next_to(res, DOWN, buff=.3)
        self.play(GrowArrow(res), Write(resl))
        self.say("Противоположные силы вычитаются. В формулу идут 6 Н, а не 10.", 3.2, Y)
        self.wipe()

    # ---------------- 5. third law ----------------
    def law3(self):
        h = self.header("3-й закон Ньютона")
        wall = Rectangle(width=.5, height=4, fill_color="#5B6470", fill_opacity=1, stroke_width=0).shift(RIGHT * 1.5)
        man = self.person(B).scale(1.6).next_to(wall, LEFT, buff=1.1).shift(DOWN * .3)
        hand = Line(man[1].get_center() + UP * .2, wall.get_left() + DOWN * .1, color=B, stroke_width=10)
        self.play(FadeIn(wall), FadeIn(man), Create(hand))
        fa = arrow(wall.get_left() + UP * .6, wall.get_left() + UP * .6 + RIGHT * 1.6, R); fal = M(r"\vec F_{12}", 40, R).next_to(fa, UP, buff=.1)
        fb = arrow(wall.get_left() + DOWN * .8, wall.get_left() + DOWN * .8 + LEFT * 1.6, Y); fbl = M(r"\vec F_{21}", 40, Y).next_to(fb, DOWN, buff=.1)
        self.say("Ты давишь на стену — и стена давит на тебя.", 0.4)
        self.play(GrowArrow(fa), FadeIn(fal)); self.play(GrowArrow(fb), FadeIn(fbl))
        self.say("Эти силы равны по величине и противоположны по направлению.", 2.6)
        law = M(r"\vec F_{12} = -\vec F_{21}", 72, G).to_edge(RIGHT, buff=.7).shift(UP * 1.6)
        self.play(Write(law))
        self.say("Тела действуют друг на друга с равными силами — всегда парами.", 3.0)
        self.wipe(h)
        props = VGroup(T("Силы по 3-му закону:", 36, G, BOLD),
                       T("1) равны по модулю", 32), T("2) направлены противоположно", 32),
                       T("3) одной природы (обе — упругости, обе — тяготения…)", 32),
                       T("4) приложены к РАЗНЫМ телам", 32, Y, BOLD)).arrange(DOWN, buff=.28, aligned_edge=LEFT).shift(UP * .4)
        for p in props: self.play(FadeIn(p, shift=RIGHT * .2), run_time=.5); self.wait(.9)
        self.say("Запомни эти 4 свойства — их часто спрашивают в теории.", 2.6)
        self.wipe(h)
        # rocket
        rocket = VGroup(Polygon([-.35, -1, 0], [.35, -1, 0], [.35, .8, 0], [0, 1.4, 0], [-.35, .8, 0], fill_color=W, fill_opacity=1, stroke_width=0))
        flame = Polygon([-.25, -1, 0], [.25, -1, 0], [0, -1.8, 0], fill_color=Y, fill_opacity=1, stroke_width=0)
        rk = VGroup(rocket, flame).shift(LEFT * 2.5 + UP * .6)
        gas = arrow(flame.get_bottom(), flame.get_bottom() + DOWN * 1.2, Y); up = arrow(rocket.get_top(), rocket.get_top() + UP * 1.2, G)
        self.play(FadeIn(rk)); self.play(GrowArrow(gas), GrowArrow(up))
        txt = VGroup(T("ракета толкает газ вниз —", 32, Y), T("газ толкает ракету вверх", 32, G)).arrange(DOWN, buff=.2, aligned_edge=LEFT).shift(RIGHT * 2)
        self.play(FadeIn(txt, shift=LEFT * .2))
        self.say("Так летают ракеты: опереться в космосе не на что, они отталкивают газ.", 3.2)
        self.wipe(h)
        self.clear_cap()
        # trap
        trap = T("ЛОВУШКА ЕНТ", 34, R, BOLD).shift(UP * 2.2)
        q = T("Если силы равны и противоположны — почему они не уничтожают друг друга?", 32, W)
        q.scale_to_fit_width(min(q.width, 12.4)).next_to(trap, DOWN, buff=.4)
        self.play(FadeIn(trap), FadeIn(q))
        self.wait(1.5)
        a1 = T("Потому что они приложены к РАЗНЫМ телам.", 40, G, BOLD).shift(DOWN * .2)
        a2 = T("Одна действует на стену, другая — на тебя. Складывать их нельзя.", 30, MUTED).next_to(a1, DOWN, buff=.35)
        self.play(Write(a1), run_time=1.2); self.play(FadeIn(a2))
        self.say("Складывать можно только силы, приложенные к ОДНОМУ телу.", 3.2, Y)
        self.wipe()

    # ---------------- 6. worked problems ----------------
    def problem(self, n, cond_lines, steps, ans, extra_wait=0.0, note=None, note_color=None):
        hdr = T(f"Задача {n}", 30, G, BOLD).to_corner(UL, buff=.45)
        cond = VGroup(*[T(l, 32, W) for l in cond_lines]).arrange(DOWN, buff=.15, aligned_edge=LEFT).next_to(hdr, DOWN, buff=.35, aligned_edge=LEFT)
        self.play(FadeIn(hdr), FadeIn(cond, shift=UP * .2))
        self.say("Поставь на паузу и попробуй решить сам.", 4.0, MUTED)
        self.clear_cap()
        prev = cond
        objs = [hdr, cond]
        for s in steps:
            m = M(s, 50, W).next_to(prev, DOWN, buff=.45, aligned_edge=LEFT)
            if prev is cond: m.shift(RIGHT * .2)
            self.play(Write(m), run_time=1.2); self.wait(2.0)
            prev = m; objs.append(m)
        box = SurroundingRectangle(prev, color=G, buff=.18, corner_radius=.12)
        a = T(ans, 32, G, BOLD).next_to(box, RIGHT, buff=.4)
        self.play(Create(box), FadeIn(a)); self.wait(3.0 + extra_wait)
        if note:
            self.say(note, 3.4, note_color or Y)
            self.clear_cap()
        self.play(*[FadeOut(o) for o in objs + [box, a]], run_time=.6)

    def problems(self):
        title = T("Решаем задачи как на ЕНТ", 52, W, BOLD)
        self.play(FadeIn(title, shift=UP * .2)); self.wait(1.2); self.play(FadeOut(title))
        self.problem(1, ["На тело массой 3 кг действует сила 12 Н.", "Найдите ускорение тела."],
                     [r"a = \frac{F}{m}", r"a = \frac{12\ \text{Н}}{3\ \text{кг}} = 4\ \tfrac{\text{м}}{\text{с}^2}"], "Ответ: 4 м/с²")
        self.problem(2, ["На брусок массой 2 кг действуют две силы:", "10 Н вправо и 4 Н влево. Найдите ускорение."],
                     [r"F_{\text{рез}} = 10 - 4 = 6\ \text{Н}", r"a = \frac{6\ \text{Н}}{2\ \text{кг}} = 3\ \tfrac{\text{м}}{\text{с}^2}"], "Ответ: 3 м/с²", note="Частая ошибка: подставить 10 Н вместо равнодействующей. Получится 5 — неверно.", note_color=R)
        self.problem(3, ["Автомобиль массой 1200 кг разгоняется с места", "до 20 м/с за 10 с. Найдите силу тяги", "(трение не учитывать)."],
                     [r"a = \frac{v - v_0}{t} = \frac{20 - 0}{10} = 2\ \tfrac{\text{м}}{\text{с}^2}", r"F = ma = 1200 \cdot 2 = 2400\ \text{Н}"], "Ответ: 2,4 кН")
        self.problem(4, ["Земля притягивает яблоко с силой 1 Н.", "С какой силой яблоко притягивает Землю?"],
                     [r"\vec F_{12} = -\vec F_{21}", r"F = 1\ \text{Н}"], "Ответ: тоже 1 Н!", note="Земля не «сильнее» яблока. Силы равны — просто у Земли огромная масса и крошечное ускорение.", note_color=Y)
        self.problem(5, ["Под действием силы 20 Н тело движется", "с ускорением 4 м/с². Найдите массу тела."],
                     [r"m = \frac{F}{a}", r"m = \frac{20\ \text{Н}}{4\ \tfrac{\text{м}}{\text{с}^2}} = 5\ \text{кг}"], "Ответ: 5 кг")
        self.problem(6, ["Силу, действующую на тело, увеличили в 3 раза,", "а массу тела — в 2 раза.", "Как изменилось ускорение?"],
                     [r"a_2 = \frac{3F}{2m} = \frac{3}{2}\cdot\frac{F}{m}", r"a_2 = 1{,}5\, a_1"], "Ответ: выросло в 1,5 раза", note="Такие задачи «во сколько раз» решаются без чисел — просто подставь множители в формулу.", note_color=Y)
        self.problem(7, ["Тело массой 4 кг движется прямолинейно", "с постоянной скоростью 3 м/с.", "Чему равна равнодействующая всех сил?"],
                     [r"v = \text{const} \Rightarrow a = 0", r"F_{\text{рез}} = m a = 4 \cdot 0 = 0"], "Ответ: 0 Н", note="Ловушка: ответ «12 Н» (4·3) — неверно. Скорость не ускорение! При v = const силы уравновешены.", note_color=R)

    # ---------------- 7. conspect ----------------
    def conspect(self):
        t = T("Запиши в тетрадь", 40, Y, BOLD).to_edge(UP, buff=.45)
        self.play(FadeIn(t))
        rows = VGroup(
            VGroup(T("1-й закон (инерция):", 30, G, BOLD), T("нет сил или они уравновешены → покой или v = const", 28, W)).arrange(RIGHT, buff=.25),
            VGroup(T("2-й закон:", 30, G, BOLD), M(r"\vec F_{\text{рез}} = m\vec a,\quad a = \frac{F}{m}", 40)).arrange(RIGHT, buff=.25),
            VGroup(T("3-й закон:", 30, G, BOLD), M(r"\vec F_{12} = -\vec F_{21}", 40), T("(к разным телам!)", 26, MUTED)).arrange(RIGHT, buff=.25),
            VGroup(T("Единица силы:", 30, G, BOLD), M(r"1\ \text{Н} = 1\ \text{кг}\cdot\text{м}/\text{с}^2", 38)).arrange(RIGHT, buff=.25),
            VGroup(T("Ловушки:", 30, R, BOLD), T("в 2-й закон — только равнодействующая; силы 3-го закона не складывают", 26, W)).arrange(RIGHT, buff=.25),
        ).arrange(DOWN, buff=.42, aligned_edge=LEFT).next_to(t, DOWN, buff=.55)
        if rows.width > 13: rows.scale_to_fit_width(13)
        for r in rows:
            self.play(FadeIn(r, shift=RIGHT * .2), run_time=.7); self.wait(3.0)
        frame = SurroundingRectangle(rows, color=Y, buff=.35, corner_radius=.2, stroke_width=2)
        self.play(Create(frame))
        self.say("Поставь на паузу и перепиши. Это весь урок на одной странице.", 6.0, Y)
        self.clear_cap(); self.wipe()

    # ---------------- 8. outro ----------------
    def outro(self):
        logo = RoundedRectangle(corner_radius=.3, width=1.3, height=1.3, fill_color=G, fill_opacity=1, stroke_width=0)
        name = T("AlemPrep", 56, W, BOLD).next_to(logo, RIGHT, buff=.35)
        top = VGroup(logo, name).shift(UP * 1.4)
        l1 = T("Дальше: 12 задач под видео", 34, W)
        l2 = T("Повторение: через 1 · 3 · 7 · 10 · 14 дней", 34, G)
        g = VGroup(l1, l2).arrange(DOWN, buff=.35).next_to(top, DOWN, buff=.9)
        self.play(FadeIn(top, shift=UP * .2)); self.play(FadeIn(g, shift=UP * .2)); self.wait(3.5)
        self.play(FadeOut(VGroup(top, g)), run_time=.8)
