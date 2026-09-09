# Модель угроз и решение об открытом GitHub

Дата: 09.09.2026. Это план защиты с проверяемыми сценариями, не сертификат безопасности.

## Публичность исходников

Рекомендация на время школьного пилота — **основной рабочий repo private**: проще ограничить доступ к внутренним обсуждениям, ещё не выпущенным исправлениям, методическим материалам и операционным документам. Отдельный публичный showcase можно сделать позже с понятной лицензией и очищенным содержимым. Это организационный выбор, а не техническое исправление уязвимости.

Открытый исходный код совместим с безопасным продуктом: права проверяются на сервере/БД, секреты не публикуются. Закрытый repo не скрывает клиентский JavaScript и browser API key и не останавливает запросы к публичным endpoints. RLS/транзакции/валидация нужны в обоих случаях.

GitHub API 09.09: `saylaaur/alemprep` — public, owner User, forks_count0, license null. Это не доказывает отсутствие скачанных копий/утечки секретов. `package.json private:true` относится к npm-публикации. Полноценный выбор open-source лицензии и права на банк заданий — отдельные вопросы.

**Vercel может деплоить private repo.** Нужно сохранить доступ Vercel GitHub App к конкретному repo и проверить commit author/team связь. Ограничение: private repo организации не деплоится на Vercel Hobby; personal repo — иной случай, текущий владелец User. Перед переносом в organization/сменой тарифа проверить условия, а не делать repo public ради обхода. [Официальные правила Vercel](https://vercel.com/docs/git).

Public→private не закрывает уже существующие публичные forks и не отзовёт ранее скопированный секрет. При найденном секрете нужна ротация, а не только смена visibility. Изменятся некоторые возможности GitHub в зависимости от тарифа; required protections проверяются заново. [Последствия смены видимости GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

Ключи: Supabase public/anon key допускается в браузере с минимальными grants/RLS. Service/secret key — серверный секрет, обходит RLS; ни репозиторий, ни NEXT_PUBLIC переменная не место для него. [Supabase security](https://supabase.com/docs/guides/database/secure-data).

## Активы и атакующие

Активы: учётки/сессии, принадлежность к школе, личные результаты, достоверность отчёта, учебные эталоны, бюджет, доступность урока, ключи CI/runtime/DB, резервные копии. Атакующие сценарии: анонимный бот, ученик со своим JWT/DevTools, учитель за пределами своей группы, случайная ошибка оператора, скомпрометированный token/dependency, пользователь общего компьютера. Не предполагаем, что все ученики злоумышленники; проверяем границы, которые нельзя строить на доверии браузеру.

| ID | Сценарий / поверхность | Защита | Доказательство |
| --- | --- | --- | --- |
| T01 | Ученик POST attempts is_correct=true, PATCH свой score/xp | REVOKE writes + closed RPC + trusted grading | L04 own-write REST matrix и DB value unchanged |
| T02 | Выбрать себе только лёгкие вопросы, изменить manifest/режим | Server issuance, immutable session_items, mode/runtime bounds | L02/L03 direct action, NULL/unknown/duplicate inputs |
| T03 | Пропустить неправильные ответы и получить100% | MaxScore от полного issued manifest, missing→0 | L02 denominator test |
| T04 | Повторные запросы/две вкладки дают XP2× | Unique operation/payload hash, transaction/locks/reward ledger | L02 двадцать concurrent retries и две session гонки |
| T05 | Ошибка после attempts оставляет score/XP/audit частично | Всё обязательное в одной DB transaction | L02 injected audit exception rollback |
| T06 | Чужая школа/group/user ID в URL/POST/query | Membership scope/RLS/composite FKs/privileged checks | S04 полный role/resource matrix |
| T07 | Учитель сам повышает роль либо использует отозванный доступ | Operator provisioning, direct grant denial, fresh DB checks | S01/S04 revoke гонка и metadata injection |
| T08 | Получить correct из props/RSC/raw questions/review | DTO allowlist, запрет raw table, review policy | L01/L03/L04 marker secrecy и direct join |
| T09 | Старый localStorage/Next cache показывает ученика A ученику B | Auth-bound drafts, no-store, logout/bfcache checks | U02 две context/две вкладки/browser back |
| T10 | XSS в задаче, таблице, имени, CSV formula | Safe text render/KaTeX trust false/URL allowlist/CSV neutralize/CSP | C02/R02/O01 hostile synthetic strings |
| T11 | CSRF/open redirect/session replay на action/callback | Session verification, same-origin restrictions, safe next, membership checks | E02/U02 и O01 origin tests |
| T12 | Сотни запросов/дорогой report/огромный payload | Request/actor/school quotas, bounded body/pages/dates/jobs | O01/O03 NAT и burst tests |
| T13 | Общий IP школы заблокирован как бот | Actor/school budgets, IP дополнительный, наблюдение denied reasons | O03 N учеников за NAT |
| T14 | AI запущен напрямую или global overspend на гонке | School AI off server-side, atomic reservation/limits | O01 provider mock0 + concurrent budget test |
| T15 | Desmos недоступен/неправильный SDK/данные уходят наружу | Optional lazy load, лицензия, network audit, fallback | V02 blocked host/KK/атрибуция |
| T16 | Вывод малого класса из соседних агрегатов | Fixed audience/slices, complementary suppression, no public roster | R02 small-cell/differencing fixtures |
| T17 | Старый результат «исправлен» новой редакцией задания | Immutable versions, quarantine, new correction/report IDs | C02/R01 snapshot tests |
| T18 | Старые подделанные результаты попадают в отчёт | integrity=0 excluded, demo/test server flag, snapshot provenance | R01 legacy+demo fixtures |
| T19 | Секрет в git history/CI logs/preview/untrusted fork | Redacted scan/rotation, separate env, least CI permissions | E03 history scan + preview settings |
| T20 | Случайный production reset/необратимая миграция | Test target guard, additive migrations, backup/rehearsal | E02/O04/P01 |
| T21 | DB outage/region loss/плохой deploy | Pending, no duplicate, backup+restore, compatible rollback | U01/O04/P02 |
| T22 | Удалённый ребёнок появляется после restore | Privacy state machine, tombstones replay before access | R03/O04 |
| T23 | Аудит обойдён runtime/администратором | No client writes, atomic audit, protected backup/reconciliation | L02/R03/O04; DB admin всё ещё доверенный риск |
| T24 | Dependency compromise / abandoned runtime | Lockfile, pinned CI actions, dependency alerts, patched supported runtime | E03/P01, supply-chain review |

## Обязательные границы тестирования

- Exploit/concurrency/load — только local/synthetic staging, контролируемые аккаунты и allowlisted target.
- Production read-only metadata разрешены в пределах задачи; новые synthetic smoke writes — только выделенный согласованный scope.
- Не печатать secrets даже в отрицательном тесте. Scanner должен redacted output; не публиковать network traces с cookies.
- Не называть metadata proof реальным воспроизведением exploit. Текущие grants показывают риск own-write, full behavioral suite ещё предстоит.
- Не использовать секретность source как acceptance condition для T01–T18: эти тесты обязаны проходить независимо от visibility.

## Остаточные ограничения

Две школы не дают доказанного causal learning effect; известные пользователям задачи не секретный экзамен; shared device требует фактического выхода; privacy текста AI не решается одним удалением имени; managed provider protection не гарантирует бесконечную нагрузку/нулевой счёт. Эти ограничения объясняются честно, не маскируются новой функцией.
