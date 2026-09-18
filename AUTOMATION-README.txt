TURKMEDYA V62 - FIX11 WEEKLY AUTO / SAFE GITHUB AUTOMATION
===========================================================

BASELINE
--------
Bu paket kabul edilmiş FIX10 algoritmasını DEĞİŞTİRMEZ.
app/scheduler-v2.js, app/app.js ve app/index.html FIX10 ile byte-byte aynıdır.
Otomasyon ayrı automation/ ve .github/workflows/ katmanındadır.

AMAÇ
----
Belirlenen gün/saatte gelecek haftayı otomatik üretmek.
- Önce Firebase vardiya_data okunur.
- Harici Yıllık İzin Talep Sistemi Firestore'dan okunur.
- FIX10 motoru gelecek haftayı üretir.
- Algoritma FAIL ise HİÇBİR ŞEY YAYINLANMAZ.
- DRY-RUN modunda HİÇBİR ŞEY YAYINLANMAZ.
- PUBLISH modunda, üretim sırasında vardiya_data başka biri tarafından değişmişse YAYIN İPTAL edilir (drift koruması).
- Başarılı PUBLISH tek bir Firebase set() işlemiyle atomik yazılır ve tekrar okunarak doğrulanır.

ÖNEMLİ
------
Bu pakette otomatik yayın varsayılan olarak KAPALIDIR.
GitHub repository variable VARDIYA_AUTO_ENABLED=true yapılmadan scheduled run üretime geçmez.
VARDIYA_AUTO_PUBLISH=true yapılmadan Firebase'e otomatik yazmaz.

GITHUB SECRETS
--------------
Repository > Settings > Secrets and variables > Actions > Secrets:

VARDIYA_ADMIN_EMAIL
  Firebase yönetici hesabının e-postası.

VARDIYA_ADMIN_PASSWORD
  Firebase yönetici hesabının şifresi.

Opsiyonel Telegram bildirimleri için:
VARDIYA_TELEGRAM_BOT_TOKEN
VARDIYA_TELEGRAM_CHAT_ID

Bu değerler repository dosyalarına YAZILMAZ.

GITHUB VARIABLES
----------------
Repository > Settings > Secrets and variables > Actions > Variables:

VARDIYA_AUTO_ENABLED = false
  İlk testlerde false bırak.
  Otomatik haftalık çalışma kabul edilince true yap.

VARDIYA_AUTO_PUBLISH = false
  false = DRY-RUN, Firebase'e yazmaz.
  true  = PASS ise Firebase vardiya_data'ya yazar.

VARDIYA_AUTO_WEEKDAY = THURSDAY
  Örnek: MONDAY / TUESDAY / WEDNESDAY / THURSDAY / FRIDAY / SATURDAY / SUNDAY
  Türkçe PZT/SAL/ÇAR/PER/CUM/CMT/PAZ da gate tarafından kabul edilir.

VARDIYA_AUTO_HOUR_TR = 10
  Türkiye saati 0-23.
  Örnek: 10 => seçilen gün 10:00-10:59 zaman penceresi.

VARDIYA_AUTO_WEEKS_AHEAD = 1
  1 = gelecek hafta.

VARDIYA_AUTO_TELEGRAM_NOTIFY = false
  true yapılırsa PASS/FAIL sonucu Telegram'a gider.
  Bot token ve chat id yalnız GitHub Secrets'tan okunur.

İLK TEST - MANUEL DRY-RUN
-------------------------
1. Dosyaları GitHub test branch'ine koy.
2. Sadece VARDIYA_ADMIN_EMAIL ve VARDIYA_ADMIN_PASSWORD secrets'larını ekle.
3. GitHub > Actions > TurkMedya Weekly Vardiya > Run workflow.
4. publish = false
5. weeks_ahead = 1
6. Çalışma sonunda Summary ve weekly-vardiya-report artifact'ını kontrol et.
7. Bu test Firebase vardiya_data'yı DEĞİŞTİRMEZ.

MANUEL PUBLISH KABUL TESTİ
--------------------------
Dry-run sonucu doğruysa test için Run workflow:
  publish = true
  weeks_ahead = 1
Bu işlem production vardiya_data'ya yazar. Yalnız kabul testinden sonra kullan.

HAFTALIK OTOMASYONU AÇMA
------------------------
Örnek Perşembe 10:00 Türkiye:
  VARDIYA_AUTO_ENABLED = true
  VARDIYA_AUTO_PUBLISH = true
  VARDIYA_AUTO_WEEKDAY = THURSDAY
  VARDIYA_AUTO_HOUR_TR = 10
  VARDIYA_AUTO_WEEKS_AHEAD = 1

Workflow saat başına bir kere tetiklenir ve Türkiye saatini kontrol eder.
GitHub Actions scheduled jobs platform yoğunluğunda birkaç dakika gecikebilir; saniye/dakika kesinliği garanti edilmez.

FAIL-SAFE
---------
Algoritma liste oluşturamazsa:
  - Firebase'e yazılmaz.
  - Mevcut yayınlanmış liste korunur.

Otomasyon çalışırken başka bir yönetici vardiya_data'yı değiştirirse:
  - Drift algılanır.
  - Otomatik publish iptal edilir.
  - İnsan değişikliği ezilmez.

FIX10 KORUMA
------------
Bu katman FIX10 davranışlarına dokunmaz:
- MCR sabit döngü
- MCR aynı uzman yedek sürekliliği
- INGEST haftalık rotasyon
- INGEST yedek yoksa carry-forward/acil 6+1 modu
- yıllık izin HARD LOCK
- PLAYOUT/KJ/SES MIN5/fairness/dinlenme/haftalar arası rotasyon
- Excel/Kameraman koruma

TELEGRAM
--------
Otomasyon bildirimi opsiyoneldir ve frontend config'teki tokenı kullanmaz.
VARDIYA_AUTO_TELEGRAM_NOTIFY=true ise token/chat id yalnız GitHub Secrets'tan okunur.
PASS, FAIL, DRY-RUN ve publish-abort sonucu yöneticiye gönderilebilir.
