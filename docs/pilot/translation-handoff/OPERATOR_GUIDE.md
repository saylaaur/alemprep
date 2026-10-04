# Инструкция владельцу: перевод всего банка RU → KK

5 октября 2026. Друг готовит/проверяет текст; владелец управляет billing,
доступом к БД и выпуском. Платные вызовы в этом проходе **не выполнялись**.

## 1. Что уже работает и что нужно дописать

| Компонент | Сейчас | Как использовать |
| --- | --- | --- |
| RU/KK routes и переключатель языка | Есть | Отдельный KK сайт не нужен |
| Read-only инвентаризация и coverage | Есть | Пересчитать перед каждой большой партией |
| Google NMT sample pipeline | Есть | 1–30 RU-источников; пишет приватные drafts |
| Формулы/JSON/таблицы/checkpoint | Есть технические защиты | Проверить ручные исключения и смысл |
| Приватная выгрузка 30 задач другу | Подготовлена 05.10 | В архиве, без credentials/учеников |
| Поддерживаемый full-bank export/batch driver | Ещё нет | Следующая задача KT1; не выдумывать --all |
| Импорт Google/Claude artifacts в versions | Ещё нет | KT2–KT3; не запускать legacy insert |
| Приёмка конкретной KK-партии человеком | Не выполнена | Друг/проверяющий возвращает review |
| Production immutable RU/KK банк | Пока пуст | Сначала RU-подборка, затем KK; до rollout |

Все команды ниже запускать из текущего trusted-practice checkout с зависимостями:

~~~sh
cd /Users/macbook/.codex/worktrees/trusted-practice/alemprep
~~~

Оператор использует существующий server-side environment для Supabase:
NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY. Не выдавать service-role
другу. Не менять .env.local ради перевода и не копировать секреты в архив/чат.
Read-only скрипты не меняют БД; --execute ниже вызывает только Google, не импорт.

## 2. Сначала инвентаризация и сухой запуск

~~~sh
npm run audit:production -- --output /private/tmp/production-inventory.md
npm run audit:kk -- \
  --output /private/tmp/kk-coverage.md \
  --manifest /private/tmp/kk-source-sample.json
npm run content:translate-google -- \
  --manifest /private/tmp/kk-source-sample.json \
  --output /private/tmp/kk-google-dryrun.json
~~~

По умолчанию последний скрипт НЕ вызывает API. Флага --dry-run нет и он не
нужен. В output проверить estimate, staleSourceIds, manualReview, drafts.

audit:kk выбирает технические 30 вопросов математики по темам/форматам.
У него нет --subject, --limit, --all или экспорта всех условий.
Sample manifest содержит schema="alemprep-kk-source-sample-v1" и
questions[{id,sourceHash}]. Google допускает 1–30 источников и повторно читает
их published RU body/explanation/context из БД. Изменившийся hash исключается.
Sample не является приёмкой исходника или готовым тематическим курсом.

Полученный Google output имеет schema="alemprep-google-nmt-drafts-v1".
В drafts есть kind, sourceId, sourceHash, state и после выполнения value.
Это объект с метаданными, не старый массив TranslatedQuestion[].

## 3. Бюджет: что можно обещать другу

Официальный NMT тариф: $20 за миллион входных Unicode code points. Пробелы
и placeholders также оплачиваются. Первые 500 000 символов покрывает кредит
до $10/месяц, общий для Basic/Advanced; остаток своего кредита проверить в Billing.
Налоги и проверка человеком в эти числа не включены.
[Тариф](https://cloud.google.com/translate/pricing),
[поддержка kk](https://docs.cloud.google.com/translate/docs/languages).

Fresh snapshot 05.10:

| Выборка | Что измерено | Предварительно, без кредита |
| --- | --- | ---: |
| Технические 30 | Deduplicated natural text: 6 671 символ | $0.13 |
| Первые 200 математики | Deduplicated natural text: 53 021 | $1.06 |
| Весь published RU | 1 719 637 unique / 1 848 084 raw natural characters | $34.39 / $36.96 |
| Реальный dry-run допустимой части sample | 4 993 initial, 14 979 maximum | $0.09986 / $0.29958 |

Coverage оценка дедуплицирует одинаковые строки, а execution runner — нет:
он переиспользует validated сущности по checkpoint, а не все одинаковые тексты.
Поэтому $34.39 **не является cap фактического массового запуска**.
В payload добавляются placeholders, часть задач/контекстов идёт вручную,
повторы могут оплачивать запрос снова. Maximum в sample резервирует три попытки.
Число вопросов не равно числу отправленных сущностей: общий контекст — отдельная сущность.

Для текущего sample подходит технический cap 15 000 символов / $0.31.
Сначала достаточно бюджета $1 и соответствующей квоты; это ограниченный
эксперимент, не обещание перевести весь банк за $1.
Для расширения разумно согласовать общий стартовый предел $50, останавливая
партии при достижении него; без full-bank dry-run это бюджет этапа, а не гарантия
полного перевода. Не умножать стоимость на число посещений: перевод храним один раз.

## 4. Подключение Google Cloud

1. В Google Cloud создать отдельный translation-проект и записать Project ID.
2. Привязать свой Cloud Billing account. Это оплата использования по счёту,
   а не пополнение баланса AlemPrep; не покупать кредиты Anthropic для Google.
3. В APIs & Services включить Cloud Translation API.
4. Оператору нужны права на translateText в этом проекте; обычно
   Cloud Translation API User, плюс Service Usage Consumer для quota project.
   Owner всего проекта передавать другу не требуется.
5. В Quotas уменьшить доступную квоту символов для general model per day
   до предела первой партии, если этот лимит доступен в вашем проекте.
   Не оставлять большой дневной лимит и считать $1 budget жёсткой остановкой.
6. Billing → Budgets & alerts: уведомления 50/90/100%. Budget уведомляет,
   **не отключает API**. Технический предел задают квота, caps скрипта и ledger.
7. Установить Google Cloud CLI по официальной инструкции, войти оператором:

~~~sh
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export GOOGLE_TRANSLATE_PROJECT_ID='YOUR_PROJECT_ID'
export GOOGLE_TRANSLATE_ACCESS_TOKEN="$(gcloud auth print-access-token)"
~~~

YOUR_PROJECT_ID заменить своим ID. Access token краткоживущий и хранится
только в текущем shell; не сохранять в Git, .env.local, NEXT_PUBLIC_* или Vercel.
Не присылать его в чат. Advanced v3 использует bearer token, не браузерный API key.

[Setup](https://docs.cloud.google.com/translate/docs/setup),
[gcloud install](https://docs.cloud.google.com/sdk/docs/install),
[authentication](https://docs.cloud.google.com/translate/docs/authentication),
[quotas](https://docs.cloud.google.com/translate/quotas),
[budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## 5. Платный запуск первой партии

Только после включённого billing и согласованного cap, по свежему dry-run:

~~~sh
npm run content:translate-google -- \
  --manifest /private/tmp/kk-source-sample.json \
  --output /private/tmp/kk-google-drafts.json \
  --checkpoint /private/tmp/kk-google.checkpoint.json \
  --execute --max-chars 15000 --max-usd 0.31
unset GOOGLE_TRANSLATE_ACCESS_TOKEN
~~~

Если estimate.maximumChargedCharacters или maximumUsd больше cap, команда
останавливается до платных запросов. Не увеличивать cap автоматически после ошибки.
Два entity одновременно внутри одного процесса; отдельные batch процессы
запускать **последовательно**, с одним сохраняемым checkpoint.
Контексты переиспользовать между партиями; перед большими партиями нужен KT1.

Output/checkpoint пишутся вне репозитория с mode 0600. /private/tmp подходит
для технической пробы, но может очищаться системой: перед реальным запуском
сохранить файлы в приватной постоянной папке вне Git и резервировать её.

## 6. Ручные исключения и восстановление

- exact glossary entry может переводиться локально без оплаты. Термин внутри
  предложения вызывает glossary-inflection-review; это не Google managed glossary.
- Русский внутри LaTeX, неоднозначная единица, текст на изображении и другие
  manualReview блокируют автоматический перевод данной сущности.
- Нет флага --manual-reviewed или override. Друг исправляет/переводит вручную;
  новую принятую запись обрабатывает будущий проверенный importer.
- Если общий context заблокирован, отдельный question draft всё равно возможен.
  **Не публиковать его без принятого KK context.**
- validated значит сохранена проверяемая структура, а не правильная математика
  или человеческая языковая приёмка.

Checkpoint: validated переиспользуется; sent означает, что запрос мог быть
оплачен, и даёт resume-required. received/rejected не имеют гарантии бесплатного
повторного запуска. Не удалять checkpoint и не сбрасывать sent, чтобы «починить».
У CLI нет реализованного решения resume-required; оператор разбирает результат
и фактический Billing, затем отдельное исправление recovery.
sent записывается перед chunks **сущности**, не перед каждым chunk.

При API exception итоговый draft output может не сохраниться, хотя checkpoint
уже содержит успешные сущности. Сначала проверить checkpoint/логи, сохранить
копию, не начинать всё заново. Логи не должны содержать tokens.

Google checkpoint имеет version:1 и entries. Coverage audit --checkpoint
ожидает другой формат sources/texts. Нельзя напрямую передавать один вместо другого.

## 7. Перевод через друга/Claude

Можно начать без Google API: выдать приватный source JSON и FRIEND_PROMPTS.md.
Друг работает в существующей подписке, возвращает кандидатов и review.
Это не API-автоматизация и не обещание неограниченного использования подписки.
Формат alemprep-kk-candidates-v1 в промпте — контракт кандидатов на будущий
validator KT2, а не уже реализованная команда импорта.

Google и Claude дают одинаковые этапы: draft → техническая проверка → языковая
и предметная проверка → exact accepted artifact → draft version → publication.
Изменение текста после review инвалидирует приёмку этой ревизии.

## 8. Безопасная загрузка: работа после получения файла

Не выполнять gen:insert --language kk с Google/Claude output: он ожидает другой
массив, сохраняет старую provenance и supplied context_id, не перепроверяет source
hash и не создаёт immutable versions/publications. --publish отвергается.
gen:translate-all запускает другой платный Haiku/Sonnet pipeline и выбирает
«последний JSON»; это не путь этого плана. audit:content также не понимает
Google artifact или новый candidate contract напрямую.

KT2–KT3 должны сделать следующее:

1. Парсить строго конкретный файл/его hash; не «самый новый файл в папке».
2. Повторно прочитать RU body/explanation/context и сверить sourceHash.
   Изменившийся источник уходит в stale, принятие не переносится.
3. Проверить структуру, формулы/числа, ключи, matching связи и полный контекст;
   отклонить unresolved/неполные записи.
4. Создать отдельный KK context; не ссылаться на RU context_id. Один общий
   переведённый контекст связывать с его вопросами один раз.
5. Сохранить questions.source_question_id = исходный RU question.id,
   тот же topic_id/type/difficulty. Новые строки сначала unpublished.
6. Создать question_versions: locale kk, public_body без correct,
   grading_body с ключом, объяснение и KK context_snapshot.
   family_id **тот же**, что у исходного RU accepted family: другой язык
   не должен заново давать XP за то же семейство.
7. Сначала publication=draft. Review references, source/translation hash и
   provider/revision фиксируются отдельно и привязываются к точному content hash.
8. Принятие конкретной версии → approved. RU/KK first-attempt/reward/report
   и повторный импорт проверяются локально до hosted записи.
9. Повтор той же партии не создаёт дубль/новое family и не перезаписывает ручные
   исправления. Новое содержимое создаёт новую revision, а не UPDATE immutable row.

Существующая production RU версия отсутствует: KT3 сперва создаёт RU draft
и family для маленькой проверенной подборки, затем перевод связывает с ним.
Не превращать все 4 646 legacy published вопросов в approved одной командой.

## 9. Как перевести «всё-всё»

Очередь — 5 формат → 30 проверка процесса → 100–200 первая полезная подборка →
все согласованные темы математики → физика/информатика → исключения/изображения.
Нужна ведомость каждого RU sourceId: candidate, manual, stale, reviewed,
draft-imported, approved, rejected с причиной.

Готовность банка считать отдельно:

- coverage legacy RU→KK pair;
- accepted/approved immutable versions по locale и теме;
- принятость contexts/таблиц/изображений;
- реально доступная ученику KK практика;
- названия тем/UI; никакой тихой подстановки RU в KK.

Нулевые или непроверенные темы не показывать как готовые. Генерация текста
может занять часы; проверка тысяч задач — отдельная работа. Масштабировать только
после измерения на 30 пар: минут на проверку, доли брака, retries и фактических трат.
Не обещать полную человеческую приёмку 4 646 задач за одно утро.

KK назначения в старой programme ветке пока RU-only. Для самостоятельного
пилота они не нужны: topic learning уже поддерживает kk. Не тратить время на
переписывание assignment flow, пока школа не попросила обязательные задания.

## 10. Утро владельца: последовательность

1. Применить recovery-safe 0035 → 0036 → 0037 по MIGRATIONS_0035_0037.md.
2. Передать другу архив, начать пять переводов и реальные review.
3. Реализовать RU version import/acceptance KT3 на маленькой подборке;
   не включать trusted flag на пустой production bank.
4. Проверить конкретный commit в preview, закрепить реального учителя/класс.
5. Ученику: вход → код класса → тема → ответ → reload → следующий вопрос.
   Учителю: только свой класс → принятые попытки/первые результаты.
6. Проверить графики на телефоне/слабом интернете. Native работает без Desmos;
   SDK включать только со своим разрешённым ключом, тест mock не подтверждает лицензию.
7. После принятой KK партии реализовать/прогнать KT2–KT3 KK путь, проверить
   полный KK сценарий. Затем увеличивать охват и бюджеты.

Код кабинета, локальные тесты и применение миграций — необходимые этапы,
но не подтверждение production deploy/пилота. Первая реальная репетиция
на отдельном ученическом и учительском аккаунте обязательна перед допуском класса.
