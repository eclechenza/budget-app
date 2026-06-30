# Budget App

Локальный трекер личного бюджета с мультивалютностью (KZT/RUB/USD). Работает полностью в браузере — сервера нет, все данные в `localStorage`.

Прод: https://budget-app-rho-nine.vercel.app/ (деплоится из ветки `main`).

## Стек

- React 18 + Vite 5, JSX (не TypeScript)
- Chart.js 4 + react-chartjs-2 для графиков
- Никаких CSS-фреймворков — один файл `src/index.css` с CSS-переменными и `data-theme`

## Структура

```
src/
  App.jsx                  # корень: 5 вкладок, глобальный state, тема
  index.css                # все стили, тёмная тема через [data-theme="dark"]
  components/
    Overview.jsx           # обзор: саммари + хронология + 5 графиков
    ExpenseAnalysis.jsx    # анализ расходов по категориям (пай-чарт)
    FinancialRoute.jsx     # прогноз капитала: цели, плановые траты/сбережения
    Entry.jsx              # ввод данных за месяц
    Settings.jsx           # настройки категорий, экспорт/импорт JSON
    NetWorthChart.jsx      # графики (переиспользуются в Overview)
    SavingsChart.jsx
    BurnRateChart.jsx
    IncomeChart.jsx
    AverageSixMonths.jsx
  utils/
    storage.js             # loadState/saveState, fmt/sym/sumByCur/closedMonths/genMonths
    analytics.js           # getMonthlyData, calculateSavings, CUR_COLORS
    forecast.js            # getInitialCapital, getAvgSavings, fmtInput/parseInput
    exportImport.js        # JSON-бэкап (скачать/загрузить)
    exportAnalytics.js     # экспорт статистики в Markdown
```

## Архитектурные решения

**Хранилище.** Единый объект state в `localStorage` под ключом `budget_app`. Роутные параметры (прогноз) — отдельный ключ `budget_route`. Логика загрузки/миграции в `storage.js`.

**Аналитика только по закрытым месяцам.** Месяц попадает в графики и хронологию только если `entry.closed === true`. Флаг ставится вручную в «Вводе данных».

**Мультивалютность.** Базовая валюта — KZT. Конвертация: `amount × rates[from] / rates[to]`, где `rates = { KZT: 1, RUB: <KZT за 1 RUB>, USD: <KZT за 1 USD> }`. Курсы подгружаются с `api.exchangerate-api.com`.

**Типы счетов.** `Карта` — текущие средства, `Актив` — базовый капитал для прогноза (`getInitialCapital` берёт только активы).

**Возвраты.** `refundMapping: { refundCat → expenseCat }` — привязка возврата к категории расхода. Чистые расходы = расходы − возвраты (с учётом привязки и валюты).

**Переименование категорий.** Settings собирает `renames: { accounts, sources, expenses, refunds }` и передаёт в `App.handleSaveSettings`, который переименовывает ключи во всех `entries` одновременно.

## CSS-токены и темизация

Все цвета задаются через CSS-переменные из `index.css`. При добавлении любого нового UI-элемента использовать токены — не хардкодить цвета. Переменные автоматически переключаются между светлой и тёмной темой через `[data-theme="dark"]`.

Основные токены: `--text`, `--text-2`, `--text-muted`, `--bg`, `--bg-card`, `--bg-tile`, `--border`, `--green`, `--red`, `--yellow` и др. Уточнять у пользователя цвет для новых элементов не нужно — подбирать подходящий токен самостоятельно.

## Рабочий процесс

**Превью.** Можно запускать dev-сервер и использовать preview-инструменты в фоне (скриншоты, снэпшоты, resize) для изучения UI и проверки изменений. Нельзя открывать вкладку в браузере пользователя — он держит проект открытым сам и проверяет изменения самостоятельно.
