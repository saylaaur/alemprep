/** Все подписи страницы урока одним объектом: сервер собирает их из messages, демо — из JSON. */
export type LessonLabels = {
  video: {
    play: string;
    pause: string;
    mute: string;
    unmute: string;
    speed: string;
    fullscreen: string;
    seek: string;
    watched: string;
  };
  practice: {
    title: string;
    /** «Решено {done} из {total}» */
    progress: string;
    /** «верно: {n}» */
    correct: string;
    /** «Задача {n}» */
    question: string;
    levels: { easy: string; medium: string; hard: string };
    solution: string;
    right: string;
    wrong: string;
    next: string;
    closedTitle: string;
    /** «Верно {correct} из {total}. Пробник по теме открыт.» */
    closedText: string;
    hint: string;
    /** Кнопка для вопроса с несколькими ответами */
    check: string;
    /** «Выберите все верные ответы» */
    multiHint: string;
    matchHint: string;
  };
  mock: {
    title: string;
    lockedTitle: string;
    /** «Осталось решить: {left}» */
    lockedHint: string;
    /** «{n} вопросов строго по этой теме. Ответы и разбор — в конце.» */
    intro: string;
    start: string;
    /** «Вопрос {n} из {total}» */
    question: string;
    prev: string;
    next: string;
    finish: string;
    /** «{score} из {total}» */
    result: string;
    /** «Лучший результат: {score} из {total}» */
    best: string;
    retry: string;
    review: string;
    yourAnswer: string;
    rightAnswer: string;
    unlockDemo: string;
  };
  notes: {
    title: string;
    subtitle: string;
    /** «Страница {n}» */
    page: string;
    expand: string;
    collapse: string;
    notReady: string;
  };
  sound: { on: string; off: string };
  /** «Серия: {n}» — оранжевая плашка после первой задачи дня. Необязательна (демо без неё). */
  streakChip?: string;
  /** Книга-подарок после урока. {date} — дата первого повторения. Необязательна. */
  gift?: { title: string; text: string };
  textFallback: string;
  demoBadge: string;
};
