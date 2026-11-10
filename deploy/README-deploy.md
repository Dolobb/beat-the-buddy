# Выкладка мини-аппа

На сервере нужны Node 24/25, nginx и уже настроенный HTTPS-домен. Зависимости рантайма отсутствуют.
Путь `/usr/bin/node` в юните должен указывать на Node 24/25 (`node --version`).

1. Создай каталог на сервере: `sudo install -d -o www-data -g www-data /opt/buddy`.
2. Из корня локального репозитория скопируй приложение (замени `user@host`):
   ```sh
   rsync -av --rsync-path='sudo rsync' app/ user@host:/opt/buddy/app/
   rsync -av --rsync-path='sudo rsync' server.ts appstate.ts config.ts package.json deploy/ user@host:/opt/buddy/
   ```
   Эти команды не удаляют базу и `.env`. При следующих выкладках используй их же.
3. Создай `/opt/buddy/.env` непосредственно на сервере, впиши `BOT_TOKEN=...` и `PORT=8787`.
   `DEV=1` на публичном сервере быть не должно. Не отправляй токен в чат/репозиторий.
   Выставь владельца и права: `sudo chown -R www-data:www-data /opt/buddy`,
   `sudo chmod 600 /opt/buddy/.env`.
4. Для переноса прогресса один раз положи копию виджетного `data.json` в `/opt/buddy/` до первого запуска.
   Если `appdata.json` уже существует, переноса не будет. Сохранятся монеты/удары/рейтинг;
   оружие сбросится в бесплатные Руку и Кулак. Исходная база не изменяется.
5. Установи юнит:
   ```sh
   sudo cp /opt/buddy/buddy.service /etc/systemd/system/buddy.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now buddy
   sudo systemctl status buddy
   ```
6. Вставь `nginx-location.conf` в существующий `server {}` своего HTTPS-сайта:
   ```sh
   sudo nginx -t
   sudo systemctl reload nginx
   curl https://<домен>/buddy/api/config
   ```
   Прокси сохраняет `/buddy/`; сервер понимает также запросы без префикса.
7. В @BotFather: `/newapp` → выбери бота → название/описание/иконка → URL
   `https://<домен>/buddy/` → shortname. Ссылка запуска: `https://t.me/<bot>/<shortname>`.
   Кнопка меню: `/setmenubutton` → бот → текст «Играть» → тот же HTTPS URL.

Логи: `journalctl -u buddy -f`. Перезапуск: `sudo systemctl restart buddy`.
Сервер слушает только `127.0.0.1:8787`; наружу выходит через nginx.
При остановке SIGINT/SIGTERM записывается незаписанный прогресс; обычная запись раз в секунду атомарна (tmp+rename).
Для согласованной резервной копии останови юнит, скопируй `appdata.json`, затем запусти юнит.
При битой базе сервер отказывается запускаться: восстанови резервную копию, не удаляй базу ради пустого старта.

Проверяй drag/звук/вибрацию и производительность в настоящем Telegram на телефоне перед публичным запуском.
Награды рассчитывает клиент, сервер ограничивает дельты: это защита от грубой накрутки, не серверная симуляция игры.
`seq` общий для пользователя: одновременно играй в одной вкладке/на одном устройстве, иначе пакеты с совпавшими seq могут быть отвергнуты.
