# Beat the Buddy

Игра для Telegram в духе Kick the Buddy / Beat the Boss. Выбираешь одного из шести друзей, бьёшь его рэгдолл,
копишь монеты, покупаешь оружие. У всех общий рейтинг.

- **Играть:** `t.me/beat_the_muzh_bot/game` (Telegram Mini App).
- **Прод:** `https://pisarenkovmax.ru/buddy/`, сервер reg.ru, выкладывает только Максим.
- **Статус:** первая версия в проде, друзья играют. Что сделано и что дальше — [docs/STATUS.md](docs/STATUS.md).

## С чего начать

| Ты кто | Читай |
|---|---|
| Новый человек в проекте | [docs/ONBOARDING.md](docs/ONBOARDING.md): установка, запуск, как сдавать работу |
| AI-агент (Claude Code, Codex) | [CLAUDE.md](CLAUDE.md): правила и карта репозитория |
| Рисуешь текстуры | [docs/TEXTURES.md](docs/TEXTURES.md): **главная задача сейчас** |
| Полируешь игру | [docs/POLISH.md](docs/POLISH.md) |
| Хочешь понять, как устроено | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

## Быстрый старт

```sh
git clone https://github.com/Dolobb/beat-the-buddy.git && cd beat-the-buddy
npm i                      # нужен Node 24+ (лучше 25)
DEV=1 npm run app          # http://127.0.0.1:8787/buddy/ в браузере
npm test                   # 67 тестов, все должны быть зелёными
```

`DEV=1` отключает проверку подписи Telegram, и игра открывается в обычном браузере. Токен бота для этого не нужен.

Дев-хуки через адрес: `/buddy/#hit`, `#ko`, `#friends`, `#top`, `#gun` сразу показывают нужное состояние.

## Остальное

- [docs/SPEC-APP.md](docs/SPEC-APP.md) — исходное ТЗ мини-аппа. Местами устарело, правда в коде и ARCHITECTURE.
- [docs/WIDGET.md](docs/WIDGET.md) — первая версия игры, HTML-виджет Bot API 10.4 (`bot.ts`, `widget/`). Заморожена.
- [deploy/README-deploy.md](deploy/README-deploy.md) — выкладка на сервер.
- [docs/history/](docs/history/) — старые ТЗ, планы и отчёты.
- [docs/tg/](docs/tg/) — копия документации Telegram по виджетам.
