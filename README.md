# Dido-Live-Run-Viewer

Публична уебкарта за Dido Live Run. Тук се публикува само статичната страница; Android приложението и Firebase правилата остават в частното хранилище. Няма реални GPS записи, активни линкове или администраторски ключове. Тестовите позиции са синтетични.

Адрес: **https://dido-hub-create.github.io/Dido-Live-Run-Viewer/**

## Първоначално публикуване

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables: добавете `FIREBASE_DATABASE_URL` с точния HTTPS Realtime Database URL на същия Firebase Spark проект, който използва Android. Този адрес е публична клиентска конфигурация, не ключ. Не добавяйте Firebase API key, UID, сесиен token, service account или GPS данни тук.
3. Actions → **Publish viewer to GitHub Pages** → Run workflow → main. Проверете успешното завършване на job `deploy` и deployment URL.
4. Ново бягане в конфигурирания Android APK → СПОДЕЛИ ЛИНК. Линкът трябва да започва с адреса по-горе и да съдържа личния fragment. Не записвайте реалния линк в това хранилище или Issues.

Без Database URL сайтът все пак се публикува: адресът без личен fragment показва съобщение за невалиден линк, а личен fragment без конфигурация показва съобщение за липсваща настройка. Реални позиции се показват само при конфигурирана Firebase база и активна сесия. Firebase правилата се прилагат от частния Android проект — никога не разрешавайте публичен запис за този сайт.

## Проверки и обновяване

`npm ci --ignore-scripts`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:browser`.

Картата използва Leaflet/OpenStreetMap, без платен API. GitHub Pages и стандартните Ubuntu Actions runners са безплатни за публичното хранилище. Workflow публикува само `web/`, а не тестовете и настройките на repository.

При промени по уебкартата прехвърляйте само проверените `web/index.html`, `web/model.js`, `web/viewer.js`, `web/style.css` от частния проект и обновените тестове при нужда. Не копирайте цялото хранилище, `.git`, локален `config.json`, GPX файлове или build артефакти. Няма автоматичен междурепозиториен token и не е необходима платена услуга.


Проверки при подготовката: 7 unit теста + 5 Chromium теста са успешни; включен е тест за GitHub Pages project path. Workflow е проверен с actionlint. Това не е доказателство за завършен GitHub Pages deployment: то се потвърждава от успешен Actions run и отваряне на публичния адрес след включване на Pages.
