"""Математика · Действия со степенями. Казахский текст — черновик, нужна вычитка."""
from engine import Template

TEMPLATES = [
    Template(
        id="math.pow.same-base",
        subject="math",
        topic="powers",
        level="easy",
        params={"b": [2, 3, 5], "m": range(2, 9), "n": range(2, 9), "k": range(2, 12)},
        where=lambda p: 0 <= p.m + p.n - p.k <= {2: 10, 3: 6, 5: 4}[p.b] and p.k != p.m and p.k != p.n,
        answer=lambda p: p.b ** (p.m + p.n - p.k),
        distractors=[
            lambda p: p.b ** (p.m * p.n - p.k) if p.m * p.n - p.k <= 12 else float("nan"),  # перемножил показатели
            lambda p: p.b ** (p.m + p.n + p.k) if p.m + p.n + p.k <= 14 else float("nan"),  # прибавил при делении
            lambda p: p.b ** (p.m + p.n - p.k + 1),  # ошибка на единицу
            lambda p: p.b ** (p.m + p.n - p.k - 1) if p.m + p.n - p.k >= 1 else float("nan"),
            lambda p: p.b * (p.m + p.n - p.k),  # умножил основание на показатель
        ],
        text={
            "ru": "Вычислите: $[[b]]^{[[m]]} \\cdot [[b]]^{[[n]]} : [[b]]^{[[k]]}$.",
            "kk": "Есептеңіз: $[[b]]^{[[m]]} \\cdot [[b]]^{[[n]]} : [[b]]^{[[k]]}$.",
        },
        solution={
            "ru": "При умножении степеней с одинаковым основанием показатели складывают, при делении — вычитают: $[[b]]^{[[m]] + [[n]] - [[k]]} = [[ans]]$.",
            "kk": "Негіздері бірдей дәрежелерді көбейткенде көрсеткіштер қосылады, бөлгенде азайтылады: $[[b]]^{[[m]] + [[n]] - [[k]]} = [[ans]]$.",
        },
    ),
]
