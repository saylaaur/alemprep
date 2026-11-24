from manim import *
import numpy as np

GREEN_A = "#2BC98F"; YEL = "#FFD45A"; BLU = "#5CC8FF"
config.background_color = "#0C0E0D"
tpl = TexTemplate(); tpl.add_to_preamble(r"\usepackage[T2A]{fontenc}\usepackage[utf8]{inputenc}")
config.tex_template = tpl

class TangentDemo(Scene):
    def construct(self):
        title = Text("Тангенс — это крутизна", font="Inter Display", weight=BOLD, font_size=44)
        self.play(Write(title), run_time=1.2); self.wait(.4)
        self.play(title.animate.scale(.6).to_edge(UP), run_time=.8)

        ang = ValueTracker(30)
        O = np.array([-4.2, -2.4, 0]); run = 3.0
        def tri():
            a = np.deg2rad(ang.get_value()); rise = run * np.tan(a)
            A, B, C = O, O + RIGHT * run, O + RIGHT * run + UP * rise
            g = VGroup(
                Line(A, B, color=BLU, stroke_width=8),
                Line(B, C, color=YEL, stroke_width=8),
                Line(A, C, color=WHITE, stroke_width=4),
                Arc(radius=.8, start_angle=0, angle=a, arc_center=A, color=GREEN_A, stroke_width=5),
            )
            return g
        triangle = always_redraw(tri)
        lab_run = Text("вперёд", font="Inter Display", font_size=28, color=BLU).next_to(O + RIGHT * 1.5, DOWN)
        lab_rise = always_redraw(lambda: Text("вверх", font="Inter Display", font_size=28, color=YEL)
                                 .next_to(O + RIGHT * run + UP * run * np.tan(np.deg2rad(ang.get_value())) / 2, RIGHT))
        deg = always_redraw(lambda: MathTex(rf"{ang.get_value():.0f}^\circ", color=GREEN_A, font_size=40)
                            .move_to(O + np.array([1.3, .35, 0])))
        self.play(Create(triangle), FadeIn(lab_run), FadeIn(lab_rise), FadeIn(deg), run_time=1.5)

        formula = MathTex(r"\tan\alpha", "=", r"{\text{вверх}", r"\over", r"\text{вперёд}}", font_size=56).shift(RIGHT * 2.6 + UP * 1.2)
        formula[2].set_color(YEL); formula[4].set_color(BLU)
        self.play(Write(formula), run_time=1.5)
        val = always_redraw(lambda: MathTex(rf"\tan {ang.get_value():.0f}^\circ \approx {np.tan(np.deg2rad(ang.get_value())):.2f}",
                                            font_size=48, color=GREEN_A).next_to(formula, DOWN, buff=.6))
        self.play(FadeIn(val)); self.wait(.6)
        for target in (45, 60, 75):
            self.play(ang.animate.set_value(target), run_time=1.6, rate_func=smooth); self.wait(.5)
        note = Text("круче горка → больше тангенс", font="Inter Display", font_size=32, color=GREEN_A).to_edge(DOWN)
        self.play(FadeIn(note, shift=UP * .3)); self.wait(1.2)
