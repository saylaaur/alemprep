"""Физика · новые типы задач (ночь 3): космология, относительность, квантовая и ядерная физика,
геометрическая оптика, волны, ток в средах, ЭМ-волны, МКТ, магнитное поле, индукция,
жидкости и твёрдые тела, динамика; контекстные блоки. g = 10 м/с², c = 3·10⁸ м/с, hc = 1240 эВ·нм.
Казахский текст — черновик для вычитки."""
import math
from fractions import Fraction as F

from ctx import Q
from engine import Context, P, Template, fmt_tex, pi_ans


def T(topic: str, level: str = "medium") -> dict:
    return dict(subject="physics", topic=topic, level=level)


def sci(x: float, unit: str = "") -> str:
    if x == 0:
        return "$0$" + (f" {unit}" if unit else "")
    e = math.floor(math.log10(abs(x)) + 1e-12)
    m = round(x / 10 ** e, 2)
    if abs(m) >= 10:
        m, e = round(m / 10, 2), e + 1
    body = fmt_tex(m) if e == 0 else (f"10^{{{e}}}" if m == 1 else f"{fmt_tex(m)} \\cdot 10^{{{e}}}")
    return f"${body}$" + (f" {unit}" if unit else "")


# нуклиды: (символ, A, Z, ru, kk)
NUCL = [("U", 238, 92, "урана", "уран"), ("Th", 232, 90, "тория", "торий"), ("Ra", 226, 88, "радия", "радий"), ("Po", 210, 84, "полония", "полоний"),
        ("Rn", 222, 86, "радона", "радон"), ("Pb", 214, 82, "свинца", "қорғасын"), ("U", 235, 92, "урана", "уран"), ("Bi", 212, 83, "висмута", "висмут")]
STABLE = [("C", 12, 6), ("N", 14, 7), ("O", 16, 8), ("Na", 23, 11), ("Al", 27, 13), ("Fe", 56, 26), ("Cu", 63, 29), ("Ag", 108, 47), ("Au", 197, 79), ("U", 238, 92), ("Ca", 40, 20), ("K", 39, 19)]
LAM = [(248, 5.0), (310, 4.0), (400, 3.1), (413, 3.0), (496, 2.5), (620, 2.0), (310, 4.0), (177, 7.0), (207, 6.0)]
METALS = [("цезий", "цезий", 1.9), ("калий", "калий", 2.2), ("натрий", "натрий", 2.3), ("литий", "литий", 2.4), ("цинк", "мырыш", 4.2), ("вольфрам", "вольфрам", 4.5)]
LENS_CASES = [  # d относительно F → (истинные, ложные свойства)
    ("d > 2F", ["действительное", "перевёрнутое", "уменьшенное"], ["мнимое", "прямое", "увеличенное"]),
    ("F < d < 2F", ["действительное", "перевёрнутое", "увеличенное"], ["мнимое", "прямое", "уменьшенное"]),
    ("d < F", ["мнимое", "прямое", "увеличенное"], ["действительное", "перевёрнутое", "уменьшенное"]),
]


def _chain(old, add):
    def d(p):
        q = old(p) if old else {}
        return {**q, **add(P({**p, **q}))}
    return d


TEMPLATES = [
    # ---------- космология ----------
    Template(
        id="phys.n.cosmo.parallax", **T("cosmology", "medium"),
        params={"p_": [0.1, 0.2, 0.25, 0.5, 0.05, 0.02, 0.4, 0.125]},
        answer=lambda p: round(1 / p.p_ * 3.26, 1),
        distractors=[lambda p: round(1 / p.p_, 1), lambda p: round(p.p_ * 3.26, 3), lambda p: round(3.26 / p.p_ / 2, 1), lambda p: round(1 / p.p_ * 3.26 * 2, 1)],
        unit="св. лет", decimals=3, spread=None, variants=8, unit_kk="жарық жылы",
        text={"ru": "Годичный параллакс звезды $[[p_]]''$. На каком расстоянии (в световых годах) находится звезда? $1$ пк $\\approx 3{,}26$ св. года.",
              "kk": "Жұлдыздың жылдық параллаксы $[[p_]]''$. Жұлдыз қандай қашықтықта (жарық жылымен) орналасқан? $1$ пк $\\approx 3{,}26$ жарық жылы."},
        solution={"ru": "$d = \\frac{1}{p}$ пк $= \\frac{1}{[[p_]]}$ пк; переводим: $d \\approx [[ans]]$ св. лет. Чем меньше параллакс, тем дальше звезда.",
                  "kk": "$d = \\frac{1}{p}$ пк $= \\frac{1}{[[p_]]}$ пк; аударамыз: $d \\approx [[ans]]$ жарық жылы. Параллакс неғұрлым кіші болса, жұлдыз соғұрлым алыс."},
    ),
    Template(
        id="phys.n.cosmo.first-cosmic", **T("cosmology", "hard"),
        params={"k": [1, 2, 4, 8, 9, 16, 18], "m": [1, 2, 4]},
        where=lambda p: math.isqrt(p.k * p.m) ** 2 == p.k * p.m and p.k != p.m,
        answer=lambda p: round(7.9 * math.sqrt(p.k / p.m), 2),
        distractors=[lambda p: round(7.9 * p.k / p.m, 2), lambda p: round(7.9 * math.sqrt(p.m / p.k), 2), lambda p: round(11.2 * math.sqrt(p.k / p.m), 2), lambda p: round(7.9 * p.k / p.m ** 2, 2)],
        unit="км/с", decimals=2,
        text={"ru": "Масса планеты в $[[k]]$ раз больше массы Земли, а радиус — в $[[m]]$ раз больше земного. Найдите первую космическую скорость для этой планеты (для Земли $7{,}9$ км/с).",
              "kk": "Планетаның массасы Жер массасынан $[[k]]$ есе, ал радиусы Жер радиусынан $[[m]]$ есе үлкен. Осы планета үшін бірінші ғарыштық жылдамдықты табыңыз (Жер үшін $7{,}9$ км/с)."},
        solution={"ru": "$v_1 = \\sqrt{\\frac{GM}{R}}$, поэтому $v_1 = 7{,}9 \\cdot \\sqrt{\\frac{[[k]]}{[[m]]}} = [[ans]]$ км/с.", "kk": "$v_1 = \\sqrt{\\frac{GM}{R}}$, сондықтан $v_1 = 7{,}9 \\cdot \\sqrt{\\frac{[[k]]}{[[m]]}} = [[ans]]$ км/с."},
    ),
    Template(
        id="phys.n.cosmo.surface-g", **T("cosmology", "medium"),
        params={"k": [1, 2, 4, 8, 9, 16, 27, 64], "m": [1, 2, 3, 4]},
        where=lambda p: p.k != p.m * p.m and (10 * p.k / p.m ** 2) * 100 % 1 == 0,
        answer=lambda p: 10 * p.k / p.m ** 2,
        distractors=[lambda p: 10 * p.k / p.m, lambda p: 10 * p.k * p.m ** 2, lambda p: 10 * p.m ** 2 / p.k, lambda p: 10 * math.sqrt(p.k) / p.m],
        unit="м/с²", decimals=2,
        text={"ru": "Масса планеты в $[[k]]$ раз больше массы Земли, радиус — в $[[m]]$ раз больше. Найдите ускорение свободного падения на её поверхности ($g_0 = 10$ м/с² — на Земле).",
              "kk": "Планетаның массасы Жер массасынан $[[k]]$ есе, радиусы $[[m]]$ есе үлкен. Оның бетіндегі еркін түсу үдеуін табыңыз ($g_0 = 10$ м/с² — Жерде)."},
        solution={"ru": "$g = \\frac{GM}{R^2}$: $g = 10 \\cdot \\frac{[[k]]}{[[m]]^2} = [[ans]]$ м/с². Радиус входит в квадрате.", "kk": "$g = \\frac{GM}{R^2}$: $g = 10 \\cdot \\frac{[[k]]}{[[m]]^2} = [[ans]]$ м/с². Радиус квадратпен кіреді."},
    ),

    # ---------- относительность ----------
    Template(
        id="phys.n.rel.time-dilation", **T("relativity", "medium"),
        params={"v": [0.6, 0.8], "t0": [3, 6, 8, 12, 15, 24, 30, 48]},
        derived=lambda p: {"g": 0.8 if p.v == 0.6 else 0.6},
        answer=lambda p: p.t0 / p.g,
        distractors=[lambda p: p.t0 * p.g, lambda p: p.t0, lambda p: p.t0 / (1 - p.v), lambda p: p.t0 * (1 + p.v)],
        unit="мкс", decimals=2,
        text={"ru": "Собственное время жизни частицы $[[t0]]$ мкс. Сколько она проживёт по часам неподвижного наблюдателя, если летит со скоростью $[[v]]c$?",
              "kk": "Бөлшектің меншікті өмір сүру уақыты $[[t0]]$ мкс. Ол $[[v]]c$ жылдамдықпен ұшса, қозғалмайтын бақылаушының сағаты бойынша қанша уақыт өмір сүреді?"},
        solution={"ru": "$\\tau = \\frac{\\tau_0}{\\sqrt{1 - v^2/c^2}} = \\frac{[[t0]]}{\\sqrt{1 - [[v]]^2}} = \\frac{[[t0]]}{[[g]]} = [[ans]]$ мкс. Движущиеся часы идут медленнее.",
                  "kk": "$\\tau = \\frac{\\tau_0}{\\sqrt{1 - v^2/c^2}} = \\frac{[[t0]]}{\\sqrt{1 - [[v]]^2}} = \\frac{[[t0]]}{[[g]]} = [[ans]]$ мкс. Қозғалыстағы сағат баяу жүреді."},
    ),
    Template(
        id="phys.n.rel.mass-loss-power", **T("relativity", "hard"),
        params={"dm": [1, 2, 4, 5, 10]},
        answer=lambda p: sci(p.dm * 1e-3 * 9e16, "Вт"),
        distractors=[lambda p: sci(p.dm * 9e16, "Вт"), lambda p: sci(p.dm * 1e-3 * 3e8, "Вт"), lambda p: sci(p.dm * 1e-3 * 9e16 / 2, "Вт")],
        variants=5,
        text={"ru": "Реактор каждую секунду превращает в энергию $[[dm]]$ г массы. Какова его мощность?", "kk": "Реактор әр секунд сайын $[[dm]]$ г массаны энергияға айналдырады. Оның қуаты қандай?"},
        solution={"ru": "$P = \\frac{\\Delta m c^2}{t} = [[dm]] \\cdot 10^{-3} \\cdot (3 \\cdot 10^8)^2$ Вт $=$ [[ans]].", "kk": "$P = \\frac{\\Delta m c^2}{t} = [[dm]] \\cdot 10^{-3} \\cdot (3 \\cdot 10^8)^2$ Вт $=$ [[ans]]."},
    ),

    # ---------- квантовая физика ----------
    Template(
        id="phys.n.q.photon-energy-ev", **T("atomic-and-quantum-physics", "easy"),
        params={"i": range(len(LAM))},
        derived=lambda p: {"lam": LAM[p.i][0]},
        answer=lambda p: LAM[p.i][1],
        distractors=[lambda p: round(LAM[p.i][0] / 1240, 2), lambda p: round(1240 / LAM[p.i][0] * 2, 2), lambda p: round(LAM[p.i][1] / 2, 2), lambda p: round(1240 / LAM[p.i][0] + 1, 2)],
        unit="эВ", decimals=2, spread=None, variants=8,
        text={"ru": "Найдите энергию фотона с длиной волны $[[lam]]$ нм ($hc \\approx 1240$ эВ·нм).", "kk": "Толқын ұзындығы $[[lam]]$ нм фотонның энергиясын табыңыз ($hc \\approx 1240$ эВ·нм)."},
        solution={"ru": "$E = \\frac{hc}{\\lambda} = \\frac{1240}{[[lam]]} \\approx [[ans]]$ эВ. Чем короче волна, тем больше энергия фотона.", "kk": "$E = \\frac{hc}{\\lambda} = \\frac{1240}{[[lam]]} \\approx [[ans]]$ эВ. Толқын неғұрлым қысқа болса, фотон энергиясы соғұрлым үлкен."},
    ),
    Template(
        id="phys.n.q.red-boundary", **T("atomic-and-quantum-physics", "medium"),
        params={"i": range(len(METALS))},
        derived=lambda p: {"m_ru": METALS[p.i][0], "m_kk": METALS[p.i][1], "A": METALS[p.i][2], "At": fmt_tex(METALS[p.i][2])},
        answer=lambda p: round(1240 / p.A),
        distractors=[lambda p: round(p.A * 1240 / 1000), lambda p: round(1240 / p.A / 2), lambda p: round(1240 * p.A / 10), lambda p: round(1240 / p.A) + 100],
        unit="нм", decimals=0, spread=None, variants=6,
        text={"ru": "Работа выхода электрона из металла ([[m_ru]]) $[[At]]$ эВ. Найдите красную границу фотоэффекта ($hc \\approx 1240$ эВ·нм).",
              "kk": "Металдан ([[m_kk]]) электронның шығу жұмысы $[[At]]$ эВ. Фотоэффектің қызыл шекарасын табыңыз ($hc \\approx 1240$ эВ·нм)."},
        solution={"ru": "На красной границе энергия фотона равна работе выхода: $\\lambda_{\\max} = \\frac{hc}{A} = \\frac{1240}{[[At]]} \\approx [[ans]]$ нм. Свет с большей длиной волны фотоэффекта не вызывает.",
                  "kk": "Қызыл шекарада фотон энергиясы шығу жұмысына тең: $\\lambda_{\\max} = \\frac{hc}{A} = \\frac{1240}{[[At]]} \\approx [[ans]]$ нм. Толқын ұзындығы бұдан үлкен жарық фотоэффект тудырмайды."},
    ),
    Template(
        id="phys.n.q.photon-count", **T("atomic-and-quantum-physics", "hard"),
        params={"P_": [1, 2, 5, 10], "i": [3, 4, 5]},
        derived=lambda p: {"lam": LAM[p.i][0], "E": LAM[p.i][1]},
        answer=lambda p: sci(p.P_ / (p.E * 1.6e-19), "1/с"),
        distractors=[lambda p: sci(p.P_ * p.E * 1.6e-19, "1/с"), lambda p: sci(p.P_ / p.E, "1/с"), lambda p: sci(p.P_ / (p.E * 1.6e-19) / 1000, "1/с")],
        variants=12,
        text={"ru": "Лазер мощностью $[[P_]]$ мВт излучает свет с длиной волны $[[lam]]$ нм (энергия фотона $[[E]]$ эВ). Сколько фотонов он испускает за $1$ с? ($1$ эВ $= 1{,}6 \\cdot 10^{-19}$ Дж)",
              "kk": "Қуаты $[[P_]]$ мВт лазер толқын ұзындығы $[[lam]]$ нм жарық шығарады (фотон энергиясы $[[E]]$ эВ). Ол $1$ с ішінде неше фотон шығарады? ($1$ эВ $= 1{,}6 \\cdot 10^{-19}$ Дж)"},
        solution={"ru": "$N = \\frac{Pt}{E_\\phi} = \\frac{[[P_]] \\cdot 10^{-3}}{[[E]] \\cdot 1{,}6 \\cdot 10^{-19}} \\approx$ [[ans]]. Мощность переводим в ватты, энергию — в джоули.",
                  "kk": "$N = \\frac{Pt}{E_\\phi} = \\frac{[[P_]] \\cdot 10^{-3}}{[[E]] \\cdot 1{,}6 \\cdot 10^{-19}} \\approx$ [[ans]]. Қуатты ваттқа, энергияны джоульге айналдырамыз."},
    ),

    # ---------- ядерная физика ----------
    Template(
        id="phys.n.nuc.decay-chain", **T("nuclear-physics", "hard"),
        params={"i": range(len(NUCL)), "a": [1, 2, 3, 4], "b": [0, 1, 2]},
        derived=lambda p: (lambda s, A, Z, ru, kk: {"s": s, "A": A, "Z": Z, "n_ru": ru, "n_kk": kk, "A2": A - 4 * p.a, "Z2": Z - 2 * p.a + p.b})(*NUCL[p.i]),
        answer=lambda p: f"$A = {p.A2}$, $Z = {p.Z2}$",
        distractors=[lambda p: f"$A = {p.A2}$, $Z = {p.Z - 2 * p.a - p.b}$" if p.b else f"$A = {p.A - 2 * p.a}$, $Z = {p.Z - p.a}$",
                     lambda p: f"$A = {p.A - 2 * p.a}$, $Z = {p.Z2}$", lambda p: f"$A = {p.A2 - p.b}$, $Z = {p.Z - 4 * p.a + p.b}$"],
        text={"ru": "Ядро $^{[[A]]}_{[[Z]]}\\text{[[s]]}$ испытало $[[a]]$ α-распада и $[[b]]$ β⁻-распада. Найдите массовое число $A$ и зарядовое число $Z$ получившегося ядра.",
              "kk": "$^{[[A]]}_{[[Z]]}\\text{[[s]]}$ ядросы $[[a]]$ α-ыдырау және $[[b]]$ β⁻-ыдырау жасады. Пайда болған ядроның массалық саны $A$ мен зарядтық саны $Z$-ті табыңыз."},
        solution={"ru": "α-распад: $A$ уменьшается на 4, $Z$ — на 2. β⁻-распад: $A$ не меняется, $Z$ растёт на 1. $A = [[A]] - 4 \\cdot [[a]] = [[A2]]$, $Z = [[Z]] - 2 \\cdot [[a]] + [[b]] = [[Z2]]$.",
                  "kk": "α-ыдырау: $A$ 4-ке, $Z$ 2-ге кемиді. β⁻-ыдырау: $A$ өзгермейді, $Z$ 1-ге артады. $A = [[A]] - 4 \\cdot [[a]] = [[A2]]$, $Z = [[Z]] - 2 \\cdot [[a]] + [[b]] = [[Z2]]$."},
    ),
    Template(
        id="phys.n.nuc.half-life-time", **T("nuclear-physics", "medium"),
        params={"T": [2, 5, 8, 10, 12, 20, 30, 1600], "k": [2, 3, 4, 5]},
        derived=lambda p: {"frac_t": f"\\frac{{1}}{{{2 ** p.k}}}", "unit_ru": "лет" if p.T == 1600 else "суток", "unit_kk": "жыл" if p.T == 1600 else "тәулік"},
        answer=lambda p: p.k * p.T,
        distractors=[lambda p: 2 ** p.k * p.T, lambda p: (p.k - 1) * p.T, lambda p: p.T * 2 ** p.k // 2, lambda p: (p.k + 1) * p.T],
        decimals=0, spread=None,
        text={"ru": "Период полураспада изотопа $[[T]]$ [[unit_ru]]. Через сколько [[unit_ru]] нераспавшейся останется $[[frac_t]]$ начального числа ядер?",
              "kk": "Изотоптың жартылай ыдырау периоды $[[T]]$ [[unit_kk]]. Қанша [[unit_kk]] өткенде ядролардың бастапқы санының $[[frac_t]]$ бөлігі ыдырамай қалады?"},
        solution={"ru": "$\\frac{N}{N_0} = \\left(\\frac{1}{2}\\right)^{t/T} = [[frac_t]]$, значит $t/T = [[k]]$, $t = [[k]] \\cdot [[T]] = [[ans]]$ [[unit_ru]].",
                  "kk": "$\\frac{N}{N_0} = \\left(\\frac{1}{2}\\right)^{t/T} = [[frac_t]]$, демек $t/T = [[k]]$, $t = [[k]] \\cdot [[T]] = [[ans]]$ [[unit_kk]]."},
    ),
    Template(
        id="phys.n.nuc.neutrons", **T("nuclear-physics", "easy"),
        params={"i": range(len(STABLE))},
        derived=lambda p: (lambda s, A, Z: {"s": s, "A": A, "Z": Z})(*STABLE[p.i]),
        answer=lambda p: p.A - p.Z,
        distractors=[lambda p: p.A, lambda p: p.Z, lambda p: p.A + p.Z, lambda p: p.A - p.Z + 1],
        decimals=0, spread=None, variants=12,
        text={"ru": "Сколько нейтронов в ядре $^{[[A]]}_{[[Z]]}\\text{[[s]]}$?", "kk": "$^{[[A]]}_{[[Z]]}\\text{[[s]]}$ ядросында неше нейтрон бар?"},
        solution={"ru": "$N = A - Z = [[A]] - [[Z]] = [[ans]]$. Верхнее число — нуклоны, нижнее — протоны.", "kk": "$N = A - Z = [[A]] - [[Z]] = [[ans]]$. Жоғарғы сан — нуклондар, төменгі сан — протондар."},
    ),

    # ---------- геометрическая оптика ----------
    Template(
        id="phys.n.gopt.lens-power", **T("geometric-optics", "easy"),
        params={"F1": [10, 20, 25, 40, 50, 100], "F2": [10, 20, 25, 50, -50, -25, -100]},
        derived=lambda p: {"D1": 100 / p.F1, "D2": 100 / p.F2},
        where=lambda p: p.F1 != abs(p.F2),
        answer=lambda p: round(100 / p.F1 + 100 / p.F2, 2),
        distractors=[lambda p: round(100 / (p.F1 + p.F2), 2) if p.F1 + p.F2 else 1, lambda p: round(1 / p.F1 + 1 / p.F2, 3), lambda p: round(100 / p.F1 - 100 / p.F2, 2), lambda p: round(p.F1 + p.F2, 2)],
        unit="дптр", decimals=2, spread=None,
        text={"ru": "Две тонкие линзы с фокусными расстояниями $[[F1]]$ см и $[[F2]]$ см сложили вплотную. Найдите оптическую силу системы.",
              "kk": "Фокус аралықтары $[[F1]]$ см және $[[F2]]$ см екі жұқа линзаны бір-біріне тығыз қойды. Жүйенің оптикалық күшін табыңыз."},
        solution={"ru": "Оптические силы складываются: $D = \\frac{1}{F_1} + \\frac{1}{F_2}$ (фокусы в метрах): $[[D1]] + ([[D2]]) = [[ans]]$ дптр. Рассеивающая линза имеет отрицательный фокус.",
                  "kk": "Оптикалық күштер қосылады: $D = \\frac{1}{F_1} + \\frac{1}{F_2}$ (фокустар метрмен): $[[D1]] + ([[D2]]) = [[ans]]$ дптр. Шашыратқыш линзаның фокусы теріс."},
    ),
    Template(
        id="phys.n.gopt.image-height", **T("geometric-optics", "medium"),
        params={"d": [15, 20, 30, 40, 60], "f": [30, 60, 20, 12, 15, 120], "h": [2, 3, 4, 5]},
        where=lambda p: p.d != p.f and (p.h * p.f / p.d) * 10 % 1 == 0,
        answer=lambda p: p.h * p.f / p.d,
        distractors=[lambda p: p.h * p.d / p.f, lambda p: p.h * (p.f + p.d) / p.d, lambda p: p.h * p.f / p.d * 2, lambda p: p.h],
        unit="см", decimals=1,
        text={"ru": "Предмет высотой $[[h]]$ см находится на расстоянии $[[d]]$ см от собирающей линзы, его изображение — на расстоянии $[[f]]$ см за линзой. Найдите высоту изображения.",
              "kk": "Биіктігі $[[h]]$ см зат жинағыш линзадан $[[d]]$ см қашықтықта тұр, оның кескіні линзаның арғы жағында $[[f]]$ см қашықтықта. Кескіннің биіктігін табыңыз."},
        solution={"ru": "Увеличение $\\Gamma = \\frac{f}{d} = \\frac{[[f]]}{[[d]]}$, высота изображения $H = \\Gamma h = [[ans]]$ см.", "kk": "Үлкейту $\\Gamma = \\frac{f}{d} = \\frac{[[f]]}{[[d]]}$, кескіннің биіктігі $H = \\Gamma h = [[ans]]$ см."},
    ),
    Template(
        id="phys.n.gopt.speed-in-medium", **T("geometric-optics", "easy"),
        params={"n": [1.25, 1.33, 1.5, 1.6, 2, 2.4, 1.2]},
        derived=lambda p: {"nt": fmt_tex(p.n), "med_ru": {1.33: "воде", 1.5: "стекле", 2.4: "алмазе"}.get(p.n, "среде"), "med_kk": {1.33: "суда", 1.5: "шыныда", 2.4: "алмазда"}.get(p.n, "ортада")},
        answer=lambda p: round(300000 / p.n),
        distractors=[lambda p: round(300000 * p.n), lambda p: 300000, lambda p: round(300000 / p.n / 2), lambda p: round(300000 - 100000 * p.n)],
        unit="км/с", decimals=0, spread=None, variants=7, valid=lambda p, x: x > 0,
        text={"ru": "Показатель преломления $n = [[nt]]$. С какой скоростью свет распространяется в этой [[med_ru]]?", "kk": "Сыну көрсеткіші $n = [[nt]]$. Жарық осы [[med_kk]] қандай жылдамдықпен таралады?"},
        solution={"ru": "$v = \\frac{c}{n} = \\frac{300\\,000}{[[nt]]} \\approx [[ans]]$ км/с. В среде свет медленнее, чем в вакууме.", "kk": "$v = \\frac{c}{n} = \\frac{300\\,000}{[[nt]]} \\approx [[ans]]$ км/с. Ортада жарық вакуумдағыдан баяу таралады."},
    ),
    Template(
        id="phys.n.gopt.critical-angle", **T("geometric-optics", "medium"),
        params={"i": [0, 1, 2]},
        derived=lambda p: {"nt": ["2", "\\sqrt{2}", "\\frac{2}{\\sqrt{3}}"][p.i]},
        answer=lambda p: ["30°", "45°", "60°"][p.i],
        distractors=[lambda p: ["60°", "60°", "30°"][p.i], lambda p: "90°", lambda p: ["45°", "30°", "45°"][p.i]],
        variants=3,
        text={"ru": "Показатель преломления стекла $n = [[nt]]$. Найдите предельный угол полного внутреннего отражения на границе стекло — воздух.",
              "kk": "Шынының сыну көрсеткіші $n = [[nt]]$. Шыны — ауа шекарасындағы толық ішкі шағылудың шекті бұрышын табыңыз."},
        solution={"ru": "$\\sin\\alpha_0 = \\frac{1}{n} = \\frac{1}{[[nt]]}$, откуда $\\alpha_0 =$ [[ans]].", "kk": "$\\sin\\alpha_0 = \\frac{1}{n} = \\frac{1}{[[nt]]}$, осыдан $\\alpha_0 =$ [[ans]]."},
    ),

    # ---------- волны ----------
    Template(
        id="phys.n.wave.boat", **T("wave-motion", "medium"),
        params={"lam": [1, 2, 3, 4, 5, 6], "N": [10, 15, 20, 30], "t": [10, 20, 30, 60]},
        where=lambda p: (p.lam * p.N / p.t) * 100 % 1 == 0,
        answer=lambda p: p.lam * p.N / p.t,
        distractors=[lambda p: p.lam * p.t / p.N, lambda p: p.N / p.t, lambda p: p.lam / p.N * p.t / 10, lambda p: 2 * p.lam * p.N / p.t],
        unit="м/с", decimals=2,
        text={"ru": "Лодка качается на волнах и за $[[t]]$ с совершает $[[N]]$ колебаний. Расстояние между соседними гребнями волн $[[lam]]$ м. Найдите скорость волн.",
              "kk": "Қайық толқындарда тербеліп, $[[t]]$ с ішінде $[[N]]$ тербеліс жасайды. Көрші толқын жоталарының арақашықтығы $[[lam]]$ м. Толқындардың жылдамдығын табыңыз."},
        solution={"ru": "Частота $\\nu = \\frac{N}{t}$, расстояние между гребнями — длина волны. $v = \\lambda\\nu = [[lam]] \\cdot \\frac{[[N]]}{[[t]]} = [[ans]]$ м/с.",
                  "kk": "Жиілік $\\nu = \\frac{N}{t}$, жоталар арасындағы қашықтық — толқын ұзындығы. $v = \\lambda\\nu = [[lam]] \\cdot \\frac{[[N]]}{[[t]]} = [[ans]]$ м/с."},
    ),
    Template(
        id="phys.n.wave.string-harmonic", **T("wave-motion", "hard"),
        params={"L": [0.5, 0.6, 0.8, 1, 1.2], "v": [120, 200, 240, 300, 400], "n": [1, 2, 3]},
        where=lambda p: (p.n * p.v / (2 * p.L)) % 1 == 0,
        answer=lambda p: p.n * p.v / (2 * p.L),
        distractors=[lambda p: p.n * p.v / p.L, lambda p: p.v / (2 * p.L), lambda p: p.n * p.v * 2 * p.L, lambda p: p.n * p.v / (4 * p.L)],
        unit="Гц", decimals=1,
        text={"ru": "Струна длиной $[[L]]$ м закреплена с обоих концов, скорость волны в ней $[[v]]$ м/с. Найдите частоту $[[n]]$-й гармоники (число полуволн на струне — $[[n]]$).",
              "kk": "Ұзындығы $[[L]]$ м шек екі ұшынан бекітілген, ондағы толқын жылдамдығы $[[v]]$ м/с. $[[n]]$-гармониканың жиілігін табыңыз (шектегі жарты толқындар саны — $[[n]]$)."},
        solution={"ru": "$L = n\\frac{\\lambda}{2}$, $\\lambda = \\frac{2L}{n}$, $\\nu = \\frac{v}{\\lambda} = \\frac{[[n]] \\cdot [[v]]}{2 \\cdot [[L]]} = [[ans]]$ Гц.", "kk": "$L = n\\frac{\\lambda}{2}$, $\\lambda = \\frac{2L}{n}$, $\\nu = \\frac{v}{\\lambda} = \\frac{[[n]] \\cdot [[v]]}{2 \\cdot [[L]]} = [[ans]]$ Гц."},
    ),

    # ---------- ток в средах ----------
    Template(
        id="phys.n.media.electron-count", **T("current-in-media", "medium"),
        params={"I": [0.16, 0.32, 0.8, 1.6, 3.2, 4.8], "t": [1, 2, 5, 10, 60]},
        answer=lambda p: sci(p.I * p.t / 1.6e-19),
        distractors=[lambda p: sci(p.I * p.t * 1.6e-19), lambda p: sci(p.I / p.t / 1.6e-19), lambda p: sci(p.I * p.t / 1.6e-19 / 10)],
        text={"ru": "Сила тока в проводнике $[[I]]$ А. Сколько электронов проходит через поперечное сечение за $[[t]]$ с? ($e = 1{,}6 \\cdot 10^{-19}$ Кл)",
              "kk": "Өткізгіштегі ток күші $[[I]]$ А. $[[t]]$ с ішінде көлденең қима арқылы неше электрон өтеді? ($e = 1{,}6 \\cdot 10^{-19}$ Кл)"},
        solution={"ru": "$q = It = [[I]] \\cdot [[t]]$ Кл, $N = \\frac{q}{e} =$ [[ans]].", "kk": "$q = It = [[I]] \\cdot [[t]]$ Кл, $N = \\frac{q}{e} =$ [[ans]]."},
    ),
    Template(
        id="phys.n.media.resistance-temp", **T("current-in-media", "medium"),
        params={"R0": [10, 20, 25, 50, 100], "t": [50, 100, 150, 200, 250]},
        answer=lambda p: p.R0 * (1 + 0.004 * p.t),
        distractors=[lambda p: p.R0 * (1 - 0.004 * p.t), lambda p: p.R0 * 0.004 * p.t, lambda p: p.R0 + 0.004 * p.t, lambda p: p.R0 * (1 + 0.04 * p.t)],
        unit="Ом", decimals=2, valid=lambda p, x: x > 0,
        text={"ru": "Сопротивление медного провода при $0$ °C равно $[[R0]]$ Ом. Найдите его сопротивление при $[[t]]$ °C. Температурный коэффициент меди $\\alpha = 0{,}004$ К⁻¹.",
              "kk": "Мыс сымның $0$ °C кезіндегі кедергісі $[[R0]]$ Ом. Оның $[[t]]$ °C кезіндегі кедергісін табыңыз. Мыстың температуралық коэффициенті $\\alpha = 0{,}004$ К⁻¹."},
        solution={"ru": "$R = R_0(1 + \\alpha t) = [[R0]] \\cdot (1 + 0{,}004 \\cdot [[t]]) = [[ans]]$ Ом. У металлов сопротивление с нагревом растёт.",
                  "kk": "$R = R_0(1 + \\alpha t) = [[R0]] \\cdot (1 + 0{,}004 \\cdot [[t]]) = [[ans]]$ Ом. Металдардың кедергісі қызғанда артады."},
    ),

    # ---------- ЭМ-волны ----------
    Template(
        id="phys.n.emw.visible-frequency", **T("electromagnetic-waves", "medium"),
        params={"lam": [400, 450, 500, 600, 750]},
        answer=lambda p: sci(3e8 / (p.lam * 1e-9), "Гц"),
        distractors=[lambda p: sci(3e8 * p.lam * 1e-9, "Гц"), lambda p: sci(3e8 / p.lam, "Гц"), lambda p: sci(3e8 / (p.lam * 1e-6), "Гц")],
        variants=5,
        text={"ru": "Найдите частоту света с длиной волны $[[lam]]$ нм.", "kk": "Толқын ұзындығы $[[lam]]$ нм жарықтың жиілігін табыңыз."},
        solution={"ru": "$\\nu = \\frac{c}{\\lambda} = \\frac{3 \\cdot 10^8}{[[lam]] \\cdot 10^{-9}} =$ [[ans]].", "kk": "$\\nu = \\frac{c}{\\lambda} = \\frac{3 \\cdot 10^8}{[[lam]] \\cdot 10^{-9}} =$ [[ans]]."},
    ),
    Template(
        id="phys.n.emw.lc-frequency-change", **T("electromagnetic-waves", "medium"),
        params={"k": [4, 9, 16, 25], "w": ["C", "L"]},
        derived=lambda p: {"r": math.isqrt(p.k), "w_ru": "ёмкость конденсатора" if p.w == "C" else "индуктивность катушки", "w_kk": "конденсатордың сыйымдылығын" if p.w == "C" else "катушканың индуктивтілігін"},
        answer=lambda p: f"уменьшится в ${math.isqrt(p.k)}$ раза",
        distractors=[lambda p: f"уменьшится в ${p.k}$ раза", lambda p: f"увеличится в ${math.isqrt(p.k)}$ раза", lambda p: f"увеличится в ${p.k}$ раза"],
        options_kk={**{f"уменьшится в ${n}$ раза": f"${n}$ есе кемиді" for n in (2, 3, 4, 5, 9, 16, 25)}, **{f"увеличится в ${n}$ раза": f"${n}$ есе артады" for n in (2, 3, 4, 5, 9, 16, 25)}},
        variants=8,
        text={"ru": "Как изменится частота электромагнитных колебаний в контуре, если [[w_ru]] увеличить в $[[k]]$ раз?", "kk": "Егер [[w_kk]] $[[k]]$ есе арттырса, контурдағы электромагниттік тербелістердің жиілігі қалай өзгереді?"},
        solution={"ru": "$\\nu = \\frac{1}{2\\pi\\sqrt{LC}}$: частота обратно пропорциональна корню из $L$ и $C$. $\\sqrt{[[k]]} = [[r]]$ — частота уменьшится в $[[r]]$ раза.",
                  "kk": "$\\nu = \\frac{1}{2\\pi\\sqrt{LC}}$: жиілік $L$ мен $C$ көбейтіндісінің түбіріне кері пропорционал. $\\sqrt{[[k]]} = [[r]]$ — жиілік $[[r]]$ есе кемиді."},
    ),

    # ---------- МКТ ----------
    Template(
        id="phys.n.mkt.molecule-count", **T("kinetic-theory", "medium"),
        params={"g": [("воды", "судың", 18), ("кислорода", "оттектің", 32), ("гелия", "гелийдің", 4), ("азота", "азоттың", 28), ("углекислого газа", "көмірқышқыл газының", 44)], "k": [0.5, 1, 2, 3, 5]},
        derived=lambda p: {"g_ru": p.g[0], "g_kk": p.g[1], "M": p.g[2], "m": p.k * p.g[2]},
        answer=lambda p: sci(p.k * 6e23),
        distractors=[lambda p: sci(p.m * 6e23), lambda p: sci(6e23 / p.k), lambda p: sci(p.k * 6e23 / 1000)],
        text={"ru": "Сколько молекул содержится в $[[m]]$ г [[g_ru]] ($M = [[M]]$ г/моль, $N_A = 6 \\cdot 10^{23}$ моль⁻¹)?",
              "kk": "$[[m]]$ г [[g_kk]] құрамында неше молекула бар ($M = [[M]]$ г/моль, $N_A = 6 \\cdot 10^{23}$ моль⁻¹)?"},
        solution={"ru": "$\\nu = \\frac{m}{M} = [[k]]$ моль, $N = \\nu N_A =$ [[ans]].", "kk": "$\\nu = \\frac{m}{M} = [[k]]$ моль, $N = \\nu N_A =$ [[ans]]."},
    ),
    Template(
        id="phys.n.mkt.pressure-rho-v", **T("kinetic-theory", "hard"),
        params={"rho": [0.3, 0.6, 0.9, 1.2, 1.5, 3], "v": [300, 400, 500, 600, 1000, 1500]},
        where=lambda p: (p.rho * p.v ** 2 / 3) % 100 == 0,
        answer=lambda p: p.rho * p.v ** 2 / 3 / 1000,
        distractors=[lambda p: p.rho * p.v ** 2 / 1000, lambda p: p.rho * p.v / 3 / 1000, lambda p: p.rho * p.v ** 2 / 2 / 1000, lambda p: p.rho * p.v ** 2 / 3 / 100],
        unit="кПа", decimals=1,
        text={"ru": "Плотность газа $[[rho]]$ кг/м³, среднеквадратичная скорость молекул $[[v]]$ м/с. Найдите давление газа.", "kk": "Газдың тығыздығы $[[rho]]$ кг/м³, молекулалардың орташа квадраттық жылдамдығы $[[v]]$ м/с. Газдың қысымын табыңыз."},
        solution={"ru": "Основное уравнение МКТ: $p = \\frac{1}{3}\\rho \\bar{v^2} = \\frac{[[rho]] \\cdot [[v]]^2}{3}$ Па $= [[ans]]$ кПа.", "kk": "МКТ-ның негізгі теңдеуі: $p = \\frac{1}{3}\\rho \\bar{v^2} = \\frac{[[rho]] \\cdot [[v]]^2}{3}$ Па $= [[ans]]$ кПа."},
    ),

    # ---------- магнитное поле и индукция ----------
    Template(
        id="phys.n.mag.ampere-angle", **T("magnetic-field", "easy"),
        params={"B": [0.1, 0.2, 0.4, 0.5, 1], "I": [2, 4, 5, 10], "L": [0.1, 0.2, 0.5, 1], "a": [30, 90]},
        derived=lambda p: {"sa": "\\frac{1}{2}" if p.a == 30 else "1"},
        answer=lambda p: p.B * p.I * p.L * (0.5 if p.a == 30 else 1),
        distractors=[lambda p: p.B * p.I * p.L * (1 if p.a == 30 else 0.5), lambda p: p.B * p.I / p.L, lambda p: p.I * p.L / p.B, lambda p: 2 * p.B * p.I * p.L],
        unit="Н", decimals=3,
        text={"ru": "Проводник длиной $[[L]]$ м с током $[[I]]$ А находится в магнитном поле с индукцией $[[B]]$ Тл под углом $[[a]]^\\circ$ к линиям индукции. Найдите силу Ампера.",
              "kk": "Ұзындығы $[[L]]$ м, тогы $[[I]]$ А өткізгіш индукциясы $[[B]]$ Тл магнит өрісінде индукция сызықтарына $[[a]]^\\circ$ бұрыш жасап орналасқан. Ампер күшін табыңыз."},
        solution={"ru": "$F_A = BIL\\sin\\alpha = [[B]] \\cdot [[I]] \\cdot [[L]] \\cdot [[sa]] = [[ans]]$ Н.", "kk": "$F_A = BIL\\sin\\alpha = [[B]] \\cdot [[I]] \\cdot [[L]] \\cdot [[sa]] = [[ans]]$ Н."},
    ),
    Template(
        id="phys.n.ind.moving-rod", **T("electromagnetic-induction", "medium"),
        params={"B": [0.1, 0.2, 0.5, 1], "v": [2, 4, 5, 10, 20], "L": [0.2, 0.5, 1, 1.5]},
        answer=lambda p: p.B * p.v * p.L,
        distractors=[lambda p: p.B * p.v / p.L, lambda p: p.B * p.L / p.v, lambda p: p.B * p.v * p.L / 2, lambda p: p.v * p.L],
        unit="В", decimals=3,
        text={"ru": "Проводник длиной $[[L]]$ м движется со скоростью $[[v]]$ м/с перпендикулярно линиям магнитного поля с индукцией $[[B]]$ Тл. Найдите ЭДС индукции на его концах.",
              "kk": "Ұзындығы $[[L]]$ м өткізгіш индукциясы $[[B]]$ Тл магнит өрісі сызықтарына перпендикуляр $[[v]]$ м/с жылдамдықпен қозғалады. Оның ұштарындағы индукция ЭҚК-ін табыңыз."},
        solution={"ru": "$\\mathcal{E} = BvL = [[B]] \\cdot [[v]] \\cdot [[L]] = [[ans]]$ В.", "kk": "$\\mathcal{E} = BvL = [[B]] \\cdot [[v]] \\cdot [[L]] = [[ans]]$ В."},
    ),
    Template(
        id="phys.n.ind.coil-current", **T("electromagnetic-induction", "hard"),
        params={"N": [50, 100, 200, 500], "dF": [2, 4, 5, 10], "dt": [0.01, 0.02, 0.05, 0.1], "R": [5, 10, 20, 50]},
        where=lambda p: 1 <= p.N * p.dF * 1e-3 / p.dt / p.R <= 50,
        answer=lambda p: p.N * p.dF * 1e-3 / p.dt / p.R,
        distractors=[lambda p: p.N * p.dF * 1e-3 / p.dt, lambda p: p.dF * 1e-3 / p.dt / p.R, lambda p: p.N * p.dF * 1e-3 * p.dt / p.R * 1000, lambda p: p.N * p.dF / p.dt / p.R],
        unit="А", decimals=3,
        text={"ru": "Магнитный поток через катушку из $[[N]]$ витков равномерно изменился на $[[dF]]$ мВб за $[[dt]]$ с. Сопротивление катушки $[[R]]$ Ом. Найдите индукционный ток.",
              "kk": "$[[N]]$ орамнан тұратын катушка арқылы өтетін магнит ағыны $[[dt]]$ с ішінде $[[dF]]$ мВб-ге бірқалыпты өзгерді. Катушканың кедергісі $[[R]]$ Ом. Индукциялық токты табыңыз."},
        solution={"ru": "$\\mathcal{E} = N\\frac{\\Delta\\Phi}{\\Delta t} = [[N]] \\cdot \\frac{[[dF]] \\cdot 10^{-3}}{[[dt]]}$ В, $I = \\frac{\\mathcal{E}}{R} = [[ans]]$ А.", "kk": "$\\mathcal{E} = N\\frac{\\Delta\\Phi}{\\Delta t} = [[N]] \\cdot \\frac{[[dF]] \\cdot 10^{-3}}{[[dt]]}$ В, $I = \\frac{\\mathcal{E}}{R} = [[ans]]$ А."},
    ),

    # ---------- жидкости и твёрдые тела ----------
    Template(
        id="phys.n.ls.thermal-expansion", **T("liquids-and-solids", "medium"),
        params={"l": [10, 12.5, 20, 25, 50], "dt": [20, 30, 40, 50, 60]},
        answer=lambda p: p.l * 12e-6 * p.dt * 1000,
        distractors=[lambda p: p.l * 12e-6 * p.dt, lambda p: p.l * 12e-6 * p.dt * 100, lambda p: p.l * 12e-6 * p.dt * 1000 * 2, lambda p: p.l * 1.2e-6 * p.dt * 1000],
        unit="мм", decimals=2,
        text={"ru": "Стальной рельс длиной $[[l]]$ м нагрелся на $[[dt]]$ °C. На сколько миллиметров он удлинился? Коэффициент линейного расширения стали $12 \\cdot 10^{-6}$ К⁻¹.",
              "kk": "Ұзындығы $[[l]]$ м болат рельс $[[dt]]$ °C-қа қызды. Ол неше миллиметрге ұзарды? Болаттың сызықтық ұлғаю коэффициенті $12 \\cdot 10^{-6}$ К⁻¹."},
        solution={"ru": "$\\Delta l = \\alpha l_0 \\Delta t = 12 \\cdot 10^{-6} \\cdot [[l]] \\cdot [[dt]]$ м $= [[ans]]$ мм. Поэтому между рельсами оставляют зазоры.",
                  "kk": "$\\Delta l = \\alpha l_0 \\Delta t = 12 \\cdot 10^{-6} \\cdot [[l]] \\cdot [[dt]]$ м $= [[ans]]$ мм. Сондықтан рельстердің арасында саңылау қалдырады."},
    ),

    # ---------- динамика ----------
    Template(
        id="phys.n.dyn.incline", **T("dynamics", "easy"),
        params={"a": [30, 90], "m": [1, 2, 3, 5]},
        derived=lambda p: {"s": "\\frac{1}{2}" if p.a == 30 else "1"},
        answer=lambda p: 5 if p.a == 30 else 10,
        distractors=[lambda p: 10 if p.a == 30 else 5, lambda p: 8.66, lambda p: 5 * p.m if p.m > 1 else 2.5],
        unit="м/с²", decimals=2, spread=None, variants=8,
        text={"ru": "Брусок массой $[[m]]$ кг соскальзывает без трения с наклонной плоскости с углом наклона $[[a]]^\\circ$. Найдите его ускорение ($g = 10$ м/с²).",
              "kk": "Массасы $[[m]]$ кг білеуше көлбеулік бұрышы $[[a]]^\\circ$ көлбеу жазықтықтан үйкеліссіз сырғанайды. Оның үдеуін табыңыз ($g = 10$ м/с²)."},
        solution={"ru": "Вдоль плоскости действует $mg\\sin\\alpha$, поэтому $a = g\\sin\\alpha = 10 \\cdot [[s]] = [[ans]]$ м/с². Масса сокращается.", "kk": "Жазықтық бойымен $mg\\sin\\alpha$ күші әсер етеді, сондықтан $a = g\\sin\\alpha = 10 \\cdot [[s]] = [[ans]]$ м/с². Масса қысқарады."},
    ),
    Template(
        id="phys.n.dyn.atwood", **T("dynamics", "hard"),
        params={"m1": [2, 3, 4, 5, 6, 7, 9], "m2": [1, 2, 3, 4, 5]},
        where=lambda p: p.m1 > p.m2 and (10 * (p.m1 - p.m2) / (p.m1 + p.m2)) * 100 % 1 == 0,
        answer=lambda p: 10 * (p.m1 - p.m2) / (p.m1 + p.m2),
        distractors=[lambda p: 10 * (p.m1 - p.m2) / p.m1, lambda p: 10 * (p.m1 - p.m2), lambda p: 10 * p.m2 / (p.m1 + p.m2), lambda p: 10],
        unit="м/с²", decimals=2,
        text={"ru": "Через неподвижный блок перекинута нить с грузами $[[m1]]$ кг и $[[m2]]$ кг. Найдите ускорение грузов (блок и нить невесомы, трения нет, $g = 10$ м/с²).",
              "kk": "Қозғалмайтын блок арқылы асылған жіптің ұштарында $[[m1]]$ кг және $[[m2]]$ кг жүктер бар. Жүктердің үдеуін табыңыз (блок пен жіп салмақсыз, үйкеліс жоқ, $g = 10$ м/с²)."},
        solution={"ru": "Для системы: $(m_1 + m_2)a = (m_1 - m_2)g$, $a = \\frac{[[m1]] - [[m2]]}{[[m1]] + [[m2]]} \\cdot 10 = [[ans]]$ м/с².", "kk": "Жүйе үшін: $(m_1 + m_2)a = (m_1 - m_2)g$, $a = \\frac{[[m1]] - [[m2]]}{[[m1]] + [[m2]]} \\cdot 10 = [[ans]]$ м/с²."},
    ),

    # ---------- соответствие ----------
    Template(
        id="phys.n.match.nucleus", kind="match", **T("nuclear-physics", "easy"),
        params={"i": range(len(STABLE))},
        derived=lambda p: (lambda s, A, Z: {"s": s, "A": A, "Z": Z})(*STABLE[p.i]),
        where=lambda p: p.A - p.Z != p.Z,
        rows={"ru": ["число протонов", "число нейтронов"], "kk": ["протондар саны", "нейтрондар саны"]},
        answers=[lambda p: p.Z, lambda p: p.A - p.Z],
        distractors=[lambda p: p.A, lambda p: p.A + p.Z, lambda p: p.A - p.Z + 1],
        decimals=0, variants=12,
        text={"ru": "Для ядра $^{[[A]]}_{[[Z]]}\\text{[[s]]}$ установите соответствие.", "kk": "$^{[[A]]}_{[[Z]]}\\text{[[s]]}$ ядросы үшін сәйкестікті анықтаңыз."},
        solution={"ru": "Протонов $Z = [[ans1]]$, нейтронов $A - Z = [[ans2]]$.", "kk": "Протондар $Z = [[ans1]]$, нейтрондар $A - Z = [[ans2]]$."},
    ),
    Template(
        id="phys.n.match.photon", kind="match", **T("atomic-and-quantum-physics", "medium"),
        params={"i": [0, 1, 3, 4, 5]},
        derived=lambda p: {"lam": LAM[p.i][0], "E": LAM[p.i][1]},
        rows={"ru": ["энергия фотона, эВ", "импульс фотона, $\\cdot 10^{-27}$ кг·м/с"], "kk": ["фотон энергиясы, эВ", "фотон импульсі, $\\cdot 10^{-27}$ кг·м/с"]},
        answers=[lambda p: p.E, lambda p: round(6.63e-34 / (p.lam * 1e-9) / 1e-27, 2)],
        distractors=[lambda p: round(p.E * 2, 2), lambda p: round(6.63e-34 / (p.lam * 1e-9) / 1e-27 * 2, 2), lambda p: round(p.lam / 1240, 3)],
        decimals=3, variants=5,
        text={"ru": "Длина волны света $[[lam]]$ нм ($hc \\approx 1240$ эВ·нм, $h = 6{,}63 \\cdot 10^{-34}$ Дж·с). Установите соответствие.", "kk": "Жарықтың толқын ұзындығы $[[lam]]$ нм ($hc \\approx 1240$ эВ·нм, $h = 6{,}63 \\cdot 10^{-34}$ Дж·с). Сәйкестікті анықтаңыз."},
        solution={"ru": "$E = \\frac{hc}{\\lambda} = [[ans1]]$ эВ; $p = \\frac{h}{\\lambda} = [[ans2]] \\cdot 10^{-27}$ кг·м/с.", "kk": "$E = \\frac{hc}{\\lambda} = [[ans1]]$ эВ; $p = \\frac{h}{\\lambda} = [[ans2]] \\cdot 10^{-27}$ кг·м/с."},
    ),

    # ---------- несколько верных ответов ----------
    Template(
        id="phys.n.multi.lens-image", kind="multi", **T("geometric-optics", "medium"),
        params={"c": range(3), "F": [10, 15, 20, 25]},
        derived=lambda p: {"cond": LENS_CASES[p.c][0], "d": {0: 3 * p.F, 1: 3 * p.F // 2, 2: p.F // 2}[p.c]},
        where=lambda p: p.d * 2 % 2 == 0,
        answers=[(lambda p, j=j: LENS_CASES[p.c][1][j]) for j in range(3)],
        distractors=[(lambda p, j=j: LENS_CASES[p.c][2][j]) for j in range(3)],
        variants=12,
        text={"ru": "Предмет находится на расстоянии $[[d]]$ см от собирающей линзы с фокусным расстоянием $[[F]]$ см. Каким будет изображение? Выберите все верные ответы.",
              "kk": "Зат фокус аралығы $[[F]]$ см жинағыш линзадан $[[d]]$ см қашықтықта тұр. Кескін қандай болады? Барлық дұрыс жауапты таңдаңыз."},
        solution={"ru": "Здесь $[[cond]]$. Строим ход лучей (луч через центр и луч, параллельный оси) — получаем изображение с отмеченными свойствами.",
                  "kk": "Мұнда $[[cond]]$. Сәулелердің жолын саламыз (центр арқылы өтетін сәуле және оське параллель сәуле) — белгіленген қасиеттері бар кескін шығады."},
    ),
    Template(
        id="phys.n.multi.isochoric", kind="multi", **T("thermodynamics", "medium"),
        params={"T1": [250, 300, 400], "k": [2, 3]},
        answers=[lambda p: "давление газа увеличилось", lambda p: "газ не совершил работы", lambda p: "внутренняя энергия газа увеличилась"],
        distractors=[lambda p: "объём газа увеличился", lambda p: "газ отдал теплоту", lambda p: "давление газа не изменилось"],
        options_kk={"давление газа увеличилось": "газ қысымы артты", "газ не совершил работы": "газ жұмыс атқарған жоқ", "внутренняя энергия газа увеличилась": "газдың ішкі энергиясы артты",
                    "объём газа увеличился": "газ көлемі артты", "газ отдал теплоту": "газ жылу берді", "давление газа не изменилось": "газ қысымы өзгерген жоқ"},
        variants=6,
        text={"ru": "Газ в закрытом жёстком баллоне нагрели от $[[T1]]$ К до температуры в $[[k]]$ раза выше. Выберите все верные утверждения.",
              "kk": "Жабық қатты баллондағы газды $[[T1]]$ К температурадан $[[k]]$ есе жоғары температураға дейін қыздырды. Барлық дұрыс тұжырымды таңдаңыз."},
        solution={"ru": "Изохора: $V = \\text{const}$, поэтому $A = 0$. $\\frac{p}{T} = \\text{const}$ — давление выросло в $[[k]]$ раза. $Q = \\Delta U > 0$: газ получил теплоту, внутренняя энергия выросла.",
                  "kk": "Изохора: $V = \\text{const}$, сондықтан $A = 0$. $\\frac{p}{T} = \\text{const}$ — қысым $[[k]]$ есе артты. $Q = \\Delta U > 0$: газ жылу алды, ішкі энергия артты."},
    ),

    Template(
        id="phys.n.rel.length", **T("relativity", "medium"),
        params={"v": [0.6, 0.8], "L0": [5, 10, 15, 20, 25, 40, 50, 100]},
        derived=lambda p: {"g": 0.8 if p.v == 0.6 else 0.6},
        answer=lambda p: round(p.L0 * (0.8 if p.v == 0.6 else 0.6), 2),
        distractors=[lambda p: round(p.L0 / (0.8 if p.v == 0.6 else 0.6), 2), lambda p: p.L0, lambda p: round(p.L0 * (1 - p.v), 2), lambda p: round(p.L0 * p.v, 2) if p.v == 0.6 else round(p.L0 * 0.36, 2)],
        unit="м", decimals=2,
        text={"ru": "Собственная длина космического корабля $[[L0]]$ м. Какой будет его длина для неподвижного наблюдателя, если корабль летит со скоростью $[[v]]c$?",
              "kk": "Ғарыш кемесінің меншікті ұзындығы $[[L0]]$ м. Кеме $[[v]]c$ жылдамдықпен ұшса, қозғалмайтын бақылаушы үшін оның ұзындығы қандай болады?"},
        solution={"ru": "$L = L_0\\sqrt{1 - v^2/c^2} = [[L0]] \\cdot [[g]] = [[ans]]$ м. Размер вдоль движения сокращается.", "kk": "$L = L_0\\sqrt{1 - v^2/c^2} = [[L0]] \\cdot [[g]] = [[ans]]$ м. Қозғалыс бағытындағы өлшем қысқарады."},
    ),
    Template(
        id="phys.n.q.bohr", **T("atomic-and-quantum-physics", "hard"),
        params={"n1": [1, 2, 3], "n2": [2, 3, 4, 5, 6]},
        where=lambda p: p.n2 > p.n1,
        answer=lambda p: round(13.6 * (1 / p.n1 ** 2 - 1 / p.n2 ** 2), 2),
        distractors=[lambda p: round(13.6 / p.n2 ** 2, 2), lambda p: round(13.6 * (1 / p.n1 - 1 / p.n2), 2), lambda p: round(13.6 / p.n1 ** 2, 2), lambda p: round(13.6 * (1 / p.n1 ** 2 + 1 / p.n2 ** 2), 2)],
        unit="эВ", decimals=2, spread=None,
        text={"ru": "Электрон в атоме водорода переходит с $[[n2]]$-го энергетического уровня на $[[n1]]$-й. Найдите энергию излучённого фотона ($E_n = -\\frac{13{,}6}{n^2}$ эВ).",
              "kk": "Сутегі атомындағы электрон $[[n2]]$-энергетикалық деңгейден $[[n1]]$-деңгейге өтеді. Шығарылған фотонның энергиясын табыңыз ($E_n = -\\frac{13{,}6}{n^2}$ эВ)."},
        solution={"ru": "$E_\\phi = E_{[[n2]]} - E_{[[n1]]} = 13{,}6\\left(\\frac{1}{[[n1]]^2} - \\frac{1}{[[n2]]^2}\\right) \\approx [[ans]]$ эВ.", "kk": "$E_\\phi = E_{[[n2]]} - E_{[[n1]]} = 13{,}6\\left(\\frac{1}{[[n1]]^2} - \\frac{1}{[[n2]]^2}\\right) \\approx [[ans]]$ эВ."},
    ),
    Template(
        id="phys.n.emw.radar", **T("electromagnetic-waves", "easy"),
        params={"t": [2, 4, 6, 10, 20, 40, 100, 200, 400, 1000]},
        answer=lambda p: 300 * p.t / 2 / 1000,
        distractors=[lambda p: 300 * p.t / 1000, lambda p: 300 * p.t / 4 / 1000, lambda p: 340 * p.t / 2 / 1e6, lambda p: 3 * p.t / 2],
        unit="км", decimals=3, spread=None, variants=10,
        text={"ru": "Сигнал радиолокатора вернулся, отразившись от самолёта, через $[[t]]$ мкс после посылки. На каком расстоянии находится самолёт?",
              "kk": "Радиолокатор сигналы ұшақтан шағылып, жіберілгеннен кейін $[[t]]$ мкс өткенде оралды. Ұшақ қандай қашықтықта тұр?"},
        solution={"ru": "Сигнал прошёл путь туда и обратно: $s = \\frac{ct}{2} = \\frac{3 \\cdot 10^8 \\cdot [[t]] \\cdot 10^{-6}}{2}$ м $= [[ans]]$ км.", "kk": "Сигнал барып-қайтты: $s = \\frac{ct}{2} = \\frac{3 \\cdot 10^8 \\cdot [[t]] \\cdot 10^{-6}}{2}$ м $= [[ans]]$ км."},
    ),
    Template(
        id="phys.n.wave.echo", **T("wave-motion", "easy"),
        params={"t": [0.4, 0.6, 1, 1.5, 2, 3, 4, 5, 6]},
        answer=lambda p: 340 * p.t / 2,
        distractors=[lambda p: 340 * p.t, lambda p: 340 * p.t / 4, lambda p: 340 / p.t, lambda p: 330 * p.t],
        unit="м", decimals=1, spread=None, variants=9,
        text={"ru": "Турист услышал эхо от скалы через $[[t]]$ с после крика. На каком расстоянии от него скала? Скорость звука $340$ м/с.",
              "kk": "Турист айқайлағаннан кейін $[[t]]$ с өткенде жартастан жаңғырық естіді. Жартас одан қандай қашықтықта? Дыбыс жылдамдығы $340$ м/с."},
        solution={"ru": "Звук прошёл до скалы и обратно: $s = \\frac{vt}{2} = \\frac{340 \\cdot [[t]]}{2} = [[ans]]$ м.", "kk": "Дыбыс жартасқа дейін барып, қайтып келді: $s = \\frac{vt}{2} = \\frac{340 \\cdot [[t]]}{2} = [[ans]]$ м."},
    ),
    Template(
        id="phys.n.media.electrolysis", **T("current-in-media", "medium"),
        params={"I": [1, 2, 4, 5, 10], "t": [10, 20, 30, 60]},
        answer=lambda p: round(0.33e-6 * p.I * p.t * 60 * 1000, 3),
        distractors=[lambda p: round(0.33e-6 * p.I * p.t * 1000, 4), lambda p: round(0.33e-6 * p.I * p.t * 60 * 1000 / 2, 3), lambda p: round(0.33e-6 * p.I * p.t * 60 * 1e6, 1), lambda p: round(0.33e-6 * p.t * 60 * 1000 / p.I, 3)],
        unit="г", decimals=3,
        text={"ru": "При электролизе раствора медного купороса через ванну $[[t]]$ мин шёл ток $[[I]]$ А. Сколько граммов меди выделилось на катоде? Электрохимический эквивалент меди $0{,}33 \\cdot 10^{-6}$ кг/Кл.",
              "kk": "Мыс купоросы ерітіндісін электролиздегенде ванна арқылы $[[t]]$ мин бойы $[[I]]$ А ток жүрді. Катодта неше грамм мыс бөлінді? Мыстың электрохимиялық эквиваленті $0{,}33 \\cdot 10^{-6}$ кг/Кл."},
        solution={"ru": "Закон Фарадея: $m = kIt = 0{,}33 \\cdot 10^{-6} \\cdot [[I]] \\cdot [[t]] \\cdot 60$ кг $\\approx [[ans]]$ г. Время переводим в секунды.",
                  "kk": "Фарадей заңы: $m = kIt = 0{,}33 \\cdot 10^{-6} \\cdot [[I]] \\cdot [[t]] \\cdot 60$ кг $\\approx [[ans]]$ г. Уақытты секундқа айналдырамыз."},
    ),
    Template(
        id="phys.n.mkt.clapeyron", **T("kinetic-theory", "medium"),
        params={"n": [1, 2, 3, 5], "T": [250, 300, 400, 500], "V": [10, 20, 25, 50]},
        answer=lambda p: round(p.n * 8.31 * p.T / (p.V * 1e-3) / 1000, 1),
        distractors=[lambda p: round(p.n * 8.31 * p.T / p.V, 1), lambda p: round(p.n * 8.31 * p.T / (p.V * 1e-3) / 1e6, 3), lambda p: round(p.n * 8.31 * p.V / p.T, 1), lambda p: round(p.n * 8.31 * (p.T - 273) / (p.V * 1e-3) / 1000, 1)],
        unit="кПа", decimals=1, valid=lambda p, x: x > 0,
        text={"ru": "В сосуде объёмом $[[V]]$ л находится $[[n]]$ моль идеального газа при температуре $[[T]]$ К. Найдите давление газа ($R = 8{,}31$ Дж/(моль·К)).",
              "kk": "Көлемі $[[V]]$ л ыдыста $[[T]]$ К температурада $[[n]]$ моль идеал газ бар. Газдың қысымын табыңыз ($R = 8{,}31$ Дж/(моль·К))."},
        solution={"ru": "$pV = \\nu RT$, $p = \\frac{[[n]] \\cdot 8{,}31 \\cdot [[T]]}{[[V]] \\cdot 10^{-3}}$ Па $\\approx [[ans]]$ кПа. Литры переводим в м³.",
                  "kk": "$pV = \\nu RT$, $p = \\frac{[[n]] \\cdot 8{,}31 \\cdot [[T]]}{[[V]] \\cdot 10^{-3}}$ Па $\\approx [[ans]]$ кПа. Литрді м³-ге айналдырамыз."},
    ),
    Template(
        id="phys.n.dyn.braking", **T("dynamics", "medium"),
        params={"v": [5, 10, 15, 20, 30], "mu": [0.1, 0.2, 0.25, 0.4, 0.5]},
        answer=lambda p: p.v ** 2 / (2 * p.mu * 10),
        distractors=[lambda p: p.v ** 2 / (p.mu * 10), lambda p: p.v / (2 * p.mu * 10), lambda p: p.v ** 2 * p.mu / 20, lambda p: p.v / (p.mu * 10)],
        unit="м", decimals=2,
        text={"ru": "Автомобиль, двигавшийся со скоростью $[[v]]$ м/с, резко затормозил (колёса заблокированы). Коэффициент трения шин о дорогу $[[mu]]$. Найдите тормозной путь ($g = 10$ м/с²).",
              "kk": "$[[v]]$ м/с жылдамдықпен келе жатқан автомобиль кенет тежелді (дөңгелектер бұғатталған). Дөңгелектің жолмен үйкеліс коэффициенті $[[mu]]$. Тежелу жолын табыңыз ($g = 10$ м/с²)."},
        solution={"ru": "Ускорение торможения $a = \\mu g = [[mu]] \\cdot 10$ м/с², путь $s = \\frac{v^2}{2a} = \\frac{[[v]]^2}{2 \\cdot [[mu]] \\cdot 10} = [[ans]]$ м.",
                  "kk": "Тежелу үдеуі $a = \\mu g = [[mu]] \\cdot 10$ м/с², жол $s = \\frac{v^2}{2a} = \\frac{[[v]]^2}{2 \\cdot [[mu]] \\cdot 10} = [[ans]]$ м."},
    ),
    Template(
        id="phys.n.kin.throw-up", kind="match", **T("kinematics", "easy"),
        params={"v": [10, 15, 20, 25, 30, 40, 50]},
        rows={"ru": ["наибольшая высота, м", "время полёта до падения, с"], "kk": ["ең үлкен биіктік, м", "құлағанға дейінгі ұшу уақыты, с"]},
        answers=[lambda p: p.v ** 2 / 20, lambda p: p.v / 5],
        distractors=[lambda p: p.v ** 2 / 10, lambda p: p.v / 10, lambda p: p.v * 2],
        decimals=2, variants=7,
        text={"ru": "Мяч бросили вертикально вверх со скоростью $[[v]]$ м/с ($g = 10$ м/с², сопротивления воздуха нет). Установите соответствие.",
              "kk": "Допты $[[v]]$ м/с жылдамдықпен тік жоғары лақтырды ($g = 10$ м/с², ауа кедергісі жоқ). Сәйкестікті анықтаңыз."},
        solution={"ru": "$h = \\frac{v^2}{2g} = [[ans1]]$ м; подъём длится $\\frac{v}{g}$, спуск столько же: $t = \\frac{2v}{g} = [[ans2]]$ с.", "kk": "$h = \\frac{v^2}{2g} = [[ans1]]$ м; көтерілу $\\frac{v}{g}$ уақытқа созылады, түсу де сонша: $t = \\frac{2v}{g} = [[ans2]]$ с."},
    ),
    Template(
        id="phys.n.mag.lorentz-period", **T("magnetic-field", "hard"),
        params={"k": [2, 3, 4], "w": ["B", "v"]},
        derived=lambda p: {"w_ru": "индукцию поля" if p.w == "B" else "скорость частицы", "w_kk": "өріс индукциясын" if p.w == "B" else "бөлшектің жылдамдығын"},
        answer=lambda p: f"уменьшится в ${p.k}$ раза" if p.w == "B" else "не изменится",
        distractors=[lambda p: f"увеличится в ${p.k}$ раза", lambda p: "не изменится" if p.w == "B" else f"уменьшится в ${p.k}$ раза", lambda p: f"уменьшится в ${p.k * p.k}$ раза"],
        options_kk={**{f"уменьшится в ${n}$ раза": f"${n}$ есе кемиді" for n in (2, 3, 4, 9, 16)}, **{f"увеличится в ${n}$ раза": f"${n}$ есе артады" for n in (2, 3, 4)}, "не изменится": "өзгермейді"},
        variants=6,
        text={"ru": "Заряженная частица движется по окружности в однородном магнитном поле. Как изменится период её обращения, если [[w_ru]] увеличить в $[[k]]$ раза?",
              "kk": "Зарядталған бөлшек біртекті магнит өрісінде шеңбер бойымен қозғалады. Егер [[w_kk]] $[[k]]$ есе арттырса, оның айналу периоды қалай өзгереді?"},
        solution={"ru": "$T = \\frac{2\\pi m}{qB}$ — период не зависит от скорости и обратно пропорционален $B$.", "kk": "$T = \\frac{2\\pi m}{qB}$ — период жылдамдыққа тәуелді емес және $B$-ға кері пропорционал."},
    ),
    Template(
        id="phys.n.gopt.mirror-approach", **T("geometric-optics", "easy"),
        params={"d": [1, 1.5, 2, 3, 4, 5], "x": [0.5, 1, 1.5]},
        where=lambda p: p.x < p.d,
        answer=lambda p: 2 * (p.d - p.x),
        distractors=[lambda p: p.d - p.x, lambda p: 2 * p.d, lambda p: 2 * p.d - p.x, lambda p: 2 * (p.d + p.x)],
        unit="м", decimals=2, spread=None,
        text={"ru": "Человек стоял на расстоянии $[[d]]$ м от плоского зеркала, затем подошёл к нему на $[[x]]$ м. Каким стало расстояние между человеком и его изображением?",
              "kk": "Адам жазық айнадан $[[d]]$ м қашықтықта тұрды, содан кейін оған $[[x]]$ м жақындады. Адам мен оның кескінінің арақашықтығы қандай болды?"},
        solution={"ru": "До зеркала теперь $[[d]] - [[x]]$ м, изображение — на таком же расстоянии за зеркалом: $2 \\cdot ([[d]] - [[x]]) = [[ans]]$ м.", "kk": "Айнаға дейін енді $[[d]] - [[x]]$ м, кескін айнаның арғы жағында дәл сондай қашықтықта: $2 \\cdot ([[d]] - [[x]]) = [[ans]]$ м."},
    ),
]

_EXTRA = {}
for _t in TEMPLATES:
    if _t.id in _EXTRA:
        _t.derived = _chain(_t.derived, _EXTRA[_t.id])


CONTEXTS = [
    Context(
        id="phys.ctx.elevator", **T("dynamics"),
        params={"m": [40, 50, 60, 70, 80], "a": [1, 2, 3, 4]},
        context={"ru": "Ученик массой $[[m]]$ кг стоит на весах в лифте. Ускорение лифта при разгоне и торможении по модулю равно $[[a]]$ м/с² ($g = 10$ м/с²).",
                 "kk": "Массасы $[[m]]$ кг оқушы лифтідегі таразыда тұр. Лифтінің екпін алу және тежелу кезіндегі үдеуінің модулі $[[a]]$ м/с² ($g = 10$ м/с²)."},
        questions=[
            Q("Каков вес ученика, когда лифт движется равномерно?", "Лифт бірқалыпты қозғалғанда оқушының салмағы қандай?",
              lambda p: 10 * p.m, [lambda p: p.m, lambda p: p.m * (10 + p.a), lambda p: 0],
              "При равномерном движении $a = 0$: $P = mg = [[m]] \\cdot 10 = [[ans]]$ Н.", "Бірқалыпты қозғалыста $a = 0$: $P = mg = [[m]] \\cdot 10 = [[ans]]$ Н.", decimals=0, unit="Н"),
            Q("Каков вес ученика, когда лифт разгоняется вверх?", "Лифт жоғары қарай екпін алғанда оқушының салмағы қандай?",
              lambda p: p.m * (10 + p.a), [lambda p: p.m * (10 - p.a), lambda p: 10 * p.m, lambda p: p.m * p.a],
              "Ускорение направлено вверх: $P = m(g + a) = [[m]] \\cdot (10 + [[a]]) = [[ans]]$ Н.", "Үдеу жоғары бағытталған: $P = m(g + a) = [[m]] \\cdot (10 + [[a]]) = [[ans]]$ Н.", decimals=0, unit="Н"),
            Q("Каков вес ученика, когда лифт, двигаясь вверх, тормозит?", "Лифт жоғары қозғалып бара жатып тежелгенде оқушының салмағы қандай?",
              lambda p: p.m * (10 - p.a), [lambda p: p.m * (10 + p.a), lambda p: 10 * p.m, lambda p: p.m * p.a],
              "При торможении на подъёме ускорение направлено вниз: $P = m(g - a) = [[ans]]$ Н.", "Көтерілу кезінде тежелгенде үдеу төмен бағытталған: $P = m(g - a) = [[ans]]$ Н.", decimals=0, unit="Н"),
            Q("Каким станет вес ученика, если трос оборвётся и лифт будет свободно падать?", "Арқан үзіліп, лифт еркін құласа, оқушының салмағы қандай болады?",
              lambda p: 0, [lambda p: 10 * p.m, lambda p: 20 * p.m, lambda p: p.m],
              "При свободном падении $a = g$: $P = m(g - g) = 0$ — невесомость. Сила тяжести при этом не исчезает.", "Еркін түсуде $a = g$: $P = m(g - g) = 0$ — салмақсыздық. Бұл кезде ауырлық күші жойылмайды.", decimals=0, unit="Н"),
        ],
        variants=12,
    ),
    Context(
        id="phys.ctx.photoeffect", **T("atomic-and-quantum-physics"),
        params={"i": range(len(LAM)), "j": range(len(METALS))},
        derived=lambda p: {"lam": LAM[p.i][0], "E": LAM[p.i][1], "m_ru": METALS[p.j][0], "m_kk": METALS[p.j][1], "A": METALS[p.j][2], "At": fmt_tex(METALS[p.j][2])},
        where=lambda p: LAM[p.i][1] - METALS[p.j][2] >= 0.5 and LAM[p.i][0] != 310 or (p.i == 1 and LAM[p.i][1] - METALS[p.j][2] >= 0.5),
        context={"ru": "Пластинку из металла ([[m_ru]], работа выхода $[[At]]$ эВ) освещают светом с длиной волны $[[lam]]$ нм. $hc \\approx 1240$ эВ·нм.",
                 "kk": "Металдан ([[m_kk]], шығу жұмысы $[[At]]$ эВ) жасалған пластинаны толқын ұзындығы $[[lam]]$ нм жарықпен жарықтандырады. $hc \\approx 1240$ эВ·нм."},
        questions=[
            Q("Найдите энергию одного фотона.", "Бір фотонның энергиясын табыңыз.",
              lambda p: p.E, [lambda p: round(p.E - p.A, 2), lambda p: round(p.lam / 1240, 3), lambda p: p.A],
              "$E = \\frac{1240}{[[lam]]} \\approx [[ans]]$ эВ.", "$E = \\frac{1240}{[[lam]]} \\approx [[ans]]$ эВ.", decimals=2, unit="эВ"),
            Q("Найдите наибольшую кинетическую энергию фотоэлектронов.", "Фотоэлектрондардың ең үлкен кинетикалық энергиясын табыңыз.",
              lambda p: round(p.E - p.A, 2), [lambda p: round(p.E + p.A, 2), lambda p: p.E, lambda p: p.A],
              "Уравнение Эйнштейна: $E_k = h\\nu - A = [[E]] - [[At]] = [[ans]]$ эВ.", "Эйнштейн теңдеуі: $E_k = h\\nu - A = [[E]] - [[At]] = [[ans]]$ эВ.", decimals=2, unit="эВ"),
            Q("Какое задерживающее напряжение нужно, чтобы остановить фотоэлектроны?", "Фотоэлектрондарды тоқтату үшін қандай тежеуші кернеу қажет?",
              lambda p: round(p.E - p.A, 2), [lambda p: p.E, lambda p: round((p.E - p.A) * 2, 2), lambda p: p.A],
              "$eU = E_k$: в электронвольтах численно $U = [[ans]]$ В.", "$eU = E_k$: электронвольтпен сан жағынан $U = [[ans]]$ В.", decimals=2, unit="В"),
            Q("Найдите красную границу фотоэффекта для этого металла.", "Осы металл үшін фотоэффектің қызыл шекарасын табыңыз.",
              lambda p: round(1240 / p.A), [lambda p: p.lam, lambda p: round(1240 / (p.E - p.A)), lambda p: round(1240 / p.A / 2)],
              "$\\lambda_{\\max} = \\frac{1240}{A} = \\frac{1240}{[[At]]} \\approx [[ans]]$ нм.", "$\\lambda_{\\max} = \\frac{1240}{A} = \\frac{1240}{[[At]]} \\approx [[ans]]$ нм.", decimals=0, unit="нм"),
        ],
        variants=12,
    ),
    Context(
        id="phys.ctx.rails", **T("liquids-and-solids"),
        params={"l": [12.5, 25], "t1": [-30, -20, -10], "t2": [30, 40, 50]},
        derived=lambda p: {"dT": p.t2 - p.t1, "dl": round(12e-6 * p.l * (p.t2 - p.t1) * 1000, 2)},
        context={"ru": "Стальные рельсы длиной $[[l]]$ м укладывают при температуре $[[t1]]$ °C. Летом рельсы нагреваются до $[[t2]]$ °C. Коэффициент линейного расширения стали $12 \\cdot 10^{-6}$ К⁻¹, плотность $7800$ кг/м³.",
                 "kk": "Ұзындығы $[[l]]$ м болат рельстерді $[[t1]]$ °C температурада төсейді. Жазда рельстер $[[t2]]$ °C-қа дейін қызады. Болаттың сызықтық ұлғаю коэффициенті $12 \\cdot 10^{-6}$ К⁻¹, тығыздығы $7800$ кг/м³."},
        questions=[
            Q("На сколько градусов изменяется температура рельса?", "Рельстің температурасы неше градусқа өзгереді?",
              lambda p: p.dT, [lambda p: p.t2 + p.t1, lambda p: p.t2, lambda p: p.dT + 273],
              "$\\Delta t = [[t2]] - ([[t1]]) = [[ans]]$ °C (изменение в кельвинах такое же).", "$\\Delta t = [[t2]] - ([[t1]]) = [[ans]]$ °C (кельвинмен өзгерісі де сондай).", decimals=0, unit="°C"),
            Q("На сколько миллиметров удлинится рельс летом?", "Жазда рельс неше миллиметрге ұзарады?",
              lambda p: p.dl, [lambda p: round(p.dl * p.t2 / p.dT, 2), lambda p: round(p.dl / 1000, 4), lambda p: round(p.dl * 2, 2)],
              "$\\Delta l = \\alpha l \\Delta t = 12 \\cdot 10^{-6} \\cdot [[l]] \\cdot [[dT]]$ м $= [[ans]]$ мм.", "$\\Delta l = \\alpha l \\Delta t = 12 \\cdot 10^{-6} \\cdot [[l]] \\cdot [[dT]]$ м $= [[ans]]$ мм.", decimals=2, unit="мм"),
            Q("Каким должен быть наименьший зазор между соседними рельсами при укладке?", "Төсеу кезінде көрші рельстер арасындағы ең кіші саңылау қандай болуы керек?",
              lambda p: p.dl, [lambda p: round(p.dl / 2, 2), lambda p: round(p.dl * 2, 2), lambda p: 0],
              "Каждый рельс удлиняется на $[[dl]]$ мм (по половине с каждого конца в соседние зазоры), значит зазор не меньше $[[ans]]$ мм.", "Әр рельс $[[dl]]$ мм-ге ұзарады (әр ұшынан жартысы көрші саңылауларға), демек саңылау кемінде $[[ans]]$ мм.", decimals=2, unit="мм"),
            Q("Изменится ли масса рельса при нагревании?", "Қыздырғанда рельстің массасы өзгере ме?",
              lambda p: "не изменится", [lambda p: "увеличится", lambda p: "уменьшится", lambda p: "увеличится пропорционально объёму"],
              "Растёт объём, плотность уменьшается, а масса вещества остаётся той же.", "Көлемі артады, тығыздығы кемиді, ал заттың массасы өзгермейді."),
        ],
        variants=12,
    ),
    Context(
        id="phys.ctx.isotope", **T("nuclear-physics"),
        params={"T": [2, 4, 5, 8, 10], "N0": [800, 1600, 3200, 6400], "k": [2, 3]},
        derived=lambda p: {"t": p.k * p.T, "N": p.N0 // 2 ** p.k},
        context={"ru": "В лабораторию привезли образец радиоактивного изотопа, содержащий $[[N0]]$ миллионов ядер. Период полураспада изотопа $[[T]]$ ч.",
                 "kk": "Зертханаға $[[N0]]$ миллион ядросы бар радиоактивті изотоп үлгісін әкелді. Изотоптың жартылай ыдырау периоды $[[T]]$ сағ."},
        questions=[
            Q("Сколько миллионов ядер останется через $[[t]]$ ч?", "$[[t]]$ сағаттан кейін неше миллион ядро қалады?",
              lambda p: p.N, [lambda p: p.N0 // p.k, lambda p: p.N0 - p.N, lambda p: p.N0 // (2 * p.k)],
              "$t = [[k]]T$, $N = \\frac{N_0}{2^{[[k]]}} = [[ans]]$ млн.", "$t = [[k]]T$, $N = \\frac{N_0}{2^{[[k]]}} = [[ans]]$ млн.", decimals=0, unit="млн"),
            Q("Сколько миллионов ядер распадётся за это время?", "Осы уақытта неше миллион ядро ыдырайды?",
              lambda p: p.N0 - p.N, [lambda p: p.N, lambda p: p.N0 // 2, lambda p: p.N0],
              "Распалось $N_0 - N = [[N0]] - [[N]] = [[ans]]$ млн.", "Ыдырағаны $N_0 - N = [[N0]] - [[N]] = [[ans]]$ млн.", decimals=0, unit="млн"),
            Q("Через сколько часов останется $\\frac{1}{16}$ начального числа ядер?", "Қанша сағаттан кейін ядролардың бастапқы санының $\\frac{1}{16}$ бөлігі қалады?",
              lambda p: 4 * p.T, [lambda p: 16 * p.T, lambda p: 8 * p.T, lambda p: 3 * p.T],
              "$\\frac{1}{16} = \\left(\\frac{1}{2}\\right)^4$, значит $t = 4T = [[ans]]$ ч.", "$\\frac{1}{16} = \\left(\\frac{1}{2}\\right)^4$, демек $t = 4T = [[ans]]$ сағ.", decimals=0, unit="ч", unit_kk="сағ"),
            Q("Через сколько часов распадётся $75\\%$ ядер?", "Қанша сағаттан кейін ядролардың $75\\%$-ы ыдырайды?",
              lambda p: 2 * p.T, [lambda p: p.T, lambda p: 3 * p.T, lambda p: p.T * 75 // 50],
              "Останется $25\\% = \\frac{1}{4} = \\left(\\frac{1}{2}\\right)^2$, значит $t = 2T = [[ans]]$ ч.", "$25\\% = \\frac{1}{4} = \\left(\\frac{1}{2}\\right)^2$ бөлігі қалады, демек $t = 2T = [[ans]]$ сағ.", decimals=0, unit="ч", unit_kk="сағ"),
        ],
        variants=12,
    ),
]
