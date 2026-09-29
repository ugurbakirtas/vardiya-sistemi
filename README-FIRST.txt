TURKMEDYA V62 - GITHUB MAIN SYNC - FIX7
========================================

AMAÇ
----
Firebase Hosting'te kabul edilen CORE RESERVATION FIX7 runtime ve Cuma 16:00 weekly automation dosyalarını GitHub main branch ile eşitlemek.

KRİTİK KORUMA
-------------
Bu overlay TELEGRAM/CLOUDFLARE webhook akışına dokunmaz.
Özellikle şu dosyalar BU PAKETTE YOKTUR ve mevcut repodaki halleri korunmalıdır:
- .github/workflows/telegram-request.yml
- automation/request-runner.mjs
- automation/telegram-poll.mjs

YÜKLENECEK DOSYALAR
-------------------
Root runtime:
- 404.html
- ilk_kurulum.json
- scheduler-v2.js
- app.js
- style.css
- v63-enhancements.js
- logo.png
- index.html

Weekly automation:
- automation/gate.mjs
- automation/weekly-runner.mjs
- automation/package.json
- automation/schedule-utils.mjs
- automation/test-schedule.mjs
- .github/workflows/weekly-vardiya.yml

GITHUB WEB YÜKLEME
------------------
1. Repo: ugurbakirtas/vardiya-sistemi, branch: main.
2. Add file > Upload files.
3. Bu klasörün İÇERİĞİNİ sürükleyip bırak. Klasör yapısı korunmalı.
4. Değişiklik listesinde telegram-request.yml veya request-runner.mjs görünürse COMMIT ETME.
5. Commit message: V62 FIX7 runtime + weekly automation sync
6. Commit directly to main.

SONRA
-----
Actions > TurkMedya Weekly Vardiya > Run workflow
- publish = false
- weeks_ahead = 1

Production'a yazmadan DRY-RUN sonucu kontrol edilir.
