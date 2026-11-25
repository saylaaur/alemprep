"""Помощник для вопросов контекстного блока: числа берутся из params блока (Context)."""
from engine import Template


def Q(ru, kk, answer, wrong, sol_ru, sol_kk, decimals=2, unit=None, unit_kk=None):
    return Template(
        id="", subject="", topic="", level="", params={},
        text={"ru": ru, "kk": kk}, solution={"ru": sol_ru, "kk": sol_kk},
        answer=answer, distractors=wrong, decimals=decimals, unit=unit, unit_kk=unit_kk,
    )
