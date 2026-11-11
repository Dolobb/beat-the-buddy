# Онбординг: как подключиться и начать

## Для Максима: как выдать доступ

Репозиторий приватный: в нём фото и имена друзей. Доступ даётся конкретному аккаунту GitHub.

```sh
# узнай у человека его логин на GitHub, затем:
gh api -X PUT repos/Dolobb/beat-the-buddy/collaborators/<ЛОГИН> -f permission=push
```

Либо через сайт: репо → **Settings → Collaborators → Add people** → логин → роль **Write**.
Человеку придёт письмо-приглашение, его надо принять.
Прав `push` хватает, чтобы создавать ветки и PR. Мерджит в `main` и выкладывает на сервер только Максим.

Убрать доступ: `gh api -X DELETE repos/Dolobb/beat-the-buddy/collaborators/<ЛОГИН>`.

---

## Для участника: установка

### 1. Что поставить

| Что | Как (macOS) | Как (Windows) |
|---|---|---|
| Git | `xcode-select --install` | [git-scm.com](https://git-scm.com/download/win) |
| Node 25 | `brew install node` | [nodejs.org](https://nodejs.org), версия 25 (минимум 24) |
| Python 3 | уже есть | [python.org](https://www.python.org/downloads/), галочка «Add to PATH» |
| GitHub CLI | `brew install gh` | `winget install GitHub.cli` |
| Claude Code | `npm i -g @anthropic-ai/claude-code` | то же |

Проверка: `node --version` (v24+), `gh --version`, `claude --version`.

### 2. Доступ и клон

```sh
gh auth login                       # войти в свой GitHub, принять приглашение из почты
gh repo clone Dolobb/beat-the-buddy
cd beat-the-buddy
npm i
python3 -m venv .venv && .venv/bin/pip install pillow     # Windows: .venv\Scripts\pip install pillow
```

### 3. Запуск

```sh
DEV=1 npm run app        # Windows PowerShell: $env:DEV=1; npm run app
```

Открой `http://127.0.0.1:8787/buddy/`, в DevTools включи мобильную эмуляцию (iPhone 14).
Хуки: `#hit`, `#ko`, `#friends`, `#top`, `#gun` в конце адреса.

В режиме `DEV=1` прогресс пишется в локальный `appdata.json`. Это твоя песочница, к проду отношения не имеет.

```sh
npm test                 # должно быть 67 pass, 0 fail
```

---

## Как сдавать работу

```sh
git switch -c textures/weapons            # своя ветка на задачу
# ... работа ...
npm test
git add -A && git commit -m "Weapons: sprites instead of emoji"
git push -u origin textures/weapons
gh pr create --fill                       # PR в main, приложи скриншот
```

- Одна задача — одна ветка — один PR. Так проще ревьюить и откатывать.
- В PR: что сделано, скриншот или гифка с телефона, `npm test` зелёный.
- **Не пушить в `main` и не трогать сервер.** Максим смерджит и выложит.
- Если меняешь `config.ts`, `appstate.ts` или `net.js`, сначала прочитай раздел «Жёсткие правила» в [CLAUDE.md](../CLAUDE.md).

## Если застрял

- Игра не открывается локально: проверь `node --version` (нужен 24+) и что порт 8787 свободен.
- Скрипт картинок падает: `.venv/bin/pip install pillow` ещё раз; фон должен быть ровно `#FF00FF`.
- Тесты падают на `main` без твоих правок: напиши Максиму, это не твоя проблема.
