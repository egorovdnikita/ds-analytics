# ds-analytics

Плагин Figma для дизайнеров и мейнтейнеров дизайн-систем: показывает, насколько файл живёт на дизайн-системе, и ведёт к слою с проблемой.

**Статус: pre-alpha.** Правил ещё нет, отчёт adoption работает — подробнее в [docs/status.md](docs/status.md).

## Что умеет

- **Отчёт adoption.** Доля компонентов из библиотеки, покрытие токенами, источники токенов.
- **С чего начать.** Приоритеты, выведенные из отчёта.
- **Impact-анализ токенов.** Сколько мест сломается, если удалить или изменить токен.
- **Переход к слою.** Клик в отчёте выделяет слой и приближает к нему вид.
- **Тренд.** Снимки хранятся в документе, отчёт показывает охват по замерам во времени.
- **Экспорт.** Отчёт в Markdown.
- **Скан без зависаний.** Обход по частям, страницы грузятся по одной, отмена возвращает частичный результат.

## Запуск

Нужны Node 22 и Figma desktop.

```bash
npm ci
npm run build
```

Затем в Figma: **Plugins → Development → Import plugin from manifest…** → выбери `manifest.json` из корня репозитория. Запуск: **Plugins → Development → Design System Auditor**.

Проверка как в CI — `npm run verify` (typecheck, lint, format, тесты, сборка). Только тесты — `npm test`.

## Стек

TypeScript · Figma Plugin API · React · Vite · Tailwind · Box UI · Vitest

## Устройство

Плагин состоит из двух частей: sandbox (`src/main`, доступ к `figma.*`, без DOM) и интерфейс в iframe (`src/ui`, React). Границы держат раздельные `tsconfig` и ESLint: React в `src/main` не компилируется, `figma.*` в `src/ui` не линтуется, синхронные Figma-API запрещены правилом.

| Модуль                 | Что делает                                                  |
| ---------------------- | ----------------------------------------------------------- |
| `scanner/traversal.ts` | Обход с чанкингом, ленивой постраничной загрузкой и отменой |
| `scanner/cache.ts`     | Инкрементальная инвалидация по `nodechange`                 |
| `scanner/variables.ts` | Индекс переменных: `local` / `library` / `unavailable`      |
| `fixes/journal.ts`     | Собственный откат массового фикса                           |
| `storage/config.ts`    | Конфиг правил: устойчивый разбор, авторство, лимит          |
| `analysis/adoption.ts` | Отчёт adoption: откуда компоненты и токены                  |
| `analysis/usage.ts`    | Обратный индекс: токен → где используется                   |
| `analysis/snapshot.ts` | Снимки во времени и тренд по охвату                         |
| `storage/snapshots.ts` | История в документе: версия формата и ротация               |
| `shared/advice.ts`     | «С чего начать»: приоритеты, выведенные из отчёта           |
| `shared/export.ts`     | Отчёт в Markdown                                            |
| `ui/parts/`            | Дизайн-система интерфейса и экраны отчёта                   |

Целевой размер UI-бандла — до 500 KB.

## Документация

- [Паспорт проекта](CLAUDE.md) — архитектура, каталог правил, ограничения, соглашения, roadmap
- [Статус и ближайший гейт](docs/status.md)
- [Позиционирование](docs/positioning.md)
- [Как добавить правило](CONTRIBUTING.md) — границы модулей, порядок скана
- [Архитектурные решения](docs/decisions/) — где паспорт расходился с Figma API
- [Протокол валидации сигнала](docs/validation/protocol.md) · [результаты](docs/validation/results.md)
- [Pre-launch аудит](docs/audits/2026-08-23-pre-launch.md)
- [Политика приватности](PRIVACY.md) — черновик, требует проверки

## Лицензия

[MIT](LICENSE). Интерфейс использует токены и иконки дизайн-системы [Box UI](https://github.com/egorovdnikita/box-ui) (MIT). Иконки — набор [Solar](https://www.figma.com/community/file/1166831539721848736) © 480 Design, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
