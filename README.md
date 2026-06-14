# OctoWP

OctoWP, Electron + React tabanli bir masaustu WhatsApp operasyon uygulamasidir.
Tek numara uzerinden kampanya yonetimi, kisi/liste segmentasyonu, otomatik takip ve loglama ozellikleri sunar.

Onemli not:
Bu proje resmi olmayan bir baglanti katmani kullanir. WhatsApp politikalarina aykiri kullanim ban riski dogurur. Sadece izinli ve riza temelli listelerle kullanin.

## Teknoloji

- Electron
- React + Vite
- TypeScript
- SQLite (better-sqlite3)
- Vitest

## Klasor yapisi

- electron/: main process, DB, kampanya motoru, IPC handler'lari
- src/: renderer UI ekranlari ve bilesenler
- shared/: main-renderer ortak tipler
- tests/: birim ve entegrasyon testleri
- docs/: tasarim ve manuel test dokumanlari

## Gereksinimler

- Node.js 22 veya ustu
- Windows

## Kurulum

1. Bagimliliklari kur:
	npm install
2. Gelistirme modunu baslat:
	npm run dev

## Scriptler

- npm run dev: gelistirme modu
- npm test: testleri calistir
- npm run build: proje derleme
- npm run package: Windows kurulum paketi uretimi

## Native moduller notu

better-sqlite3 native oldugu icin Electron ve Node ABI farki vardir.
Projedeki scriptler gerekli rebuild adimini otomatik yonetir:

- npm install / npm run dev / npm run package: Electron ABI tarafi
- npm test: Node ABI tarafi

## Test

Testleri calistirmak icin:

npm test

Manuel akislar icin:

- docs/MANUAL-TEST.md

## Lisans

MIT
