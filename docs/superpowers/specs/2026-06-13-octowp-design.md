# OctoWP — Tasarım Dokümanı (Spec)

**Tarih:** 2026-06-13
**Durum:** Onaylandı (brainstorming) — uygulama planı bekliyor
**Tip:** Masaüstü uygulaması (Electron)

---

## 1. Amaç

Tek WhatsApp numarası ile, **güvenlik öncelikli**, **parti parti (batch)** toplu mesaj gönderen hafif bir masaüstü uygulaması. Birincil senaryo: ~2000 kişilik bir listeye, ban riskini minimize ederek, günlere yayılan **sürebilir/devam ettirilebilir kampanya** olarak ulaşmak.

### Hedefler
- Excel/CSV'den kişi listesi içe aktarma.
- Metin + medya mesajı (spintax + `{değişken}` ile kişiselleştirme).
- Anti-ban katmanı: jitter'lı gecikme, günlük tavan, aktif saat, ısınma, opt-out, circuit-breaker.
- Yeniden başlatmaya dayanıklı kampanya (app kapanıp açılınca kaldığı yerden devam).
- Canlı ilerleme: gönderildi / bekleyen / başarısız / atlandı.
- Tamamen yerel veri (çevrimdışı, gizli).

### Hedef olmayanlar (v2+)
- Sohbet/gruplardan numara toplama.
- Gruplara toplu gönderim.
- Çoklu numara havuzu + rotasyon/failover (mimari hazır olacak ama v1'de tek numara).
- Bulut senkron / çoklu kullanıcı / SaaS.
- Açılış kilidi (PIN/şifre) — şimdilik yok.

---

## 2. Kısıtlar ve Temel Kararlar

| Karar | Seçim | Gerekçe |
|---|---|---|
| Platform | **Electron masaüstü** | Baileys 7/24 kalıcı oturum ister; Netlify/serverless yapamaz. Kullanıcının kendi makinesi = bedava 7/24 host + residential IP (daha düşük ban riski) + giriş sistemi gereksiz. |
| Motor | **Baileys** (@whiskeysockets/baileys) | Tarayıcısız (websocket), hafif, toplu işte verimli, Electron Node ana sürecinde temiz tek-süreç mimarisi. |
| Numara | **Tek numara** | Kullanıcının gerçekliği. Rotasyon yok → ban sinyalinde **halt + uyarı** (devralacak numara yok). |
| Teslimat modeli | **Parti parti, sürebilir kampanya** | Tek numarada 2000'i tek seferde göndermek = kesin ban. Günlük tavan + günlere yayma tek güvenli yol (~10-20 gün). |
| Depolama | **Yerel SQLite** | Çevrimdışı, gizli (kişi listesi buluta gitmez), basit, hızlı. Bulut/Supabase'e gerek yok. |
| Güvenli giriş | **QR ile cihaz bağlama** (Hesap ekranı) | WhatsApp "credential" = QR eşleştirme; API anahtarı yok. Açılış kilidi v1'de yok. |
| Tema | WhatsApp yeşili aksan, açık + koyu tema geçişi | "Profesyonel ve modern" + tanıdık his. |
| Navigasyon | Sol kenar menü, 5 ekran | Modern masaüstü standardı, ölçeklenir. |

### Dürüst risk notu (ToS)
Resmi olmayan kütüphane = **WhatsApp ToS ihlali, numara ban riski her zaman var.** Anti-ban katmanı riski *azaltır, sıfırlamaz*. Banın #1 sebebi alıcıların **engelleme/şikâyet oranı** (liste kalitesi + rıza), kütüphane veya gecikme değil. Bu bilinçle ilerleniyor.

---

## 3. Mimari

İki Electron süreci, IPC ile haberleşir.

```
┌───────────────────────────── Electron ─────────────────────────────┐
│                                                                     │
│  Renderer (React + Vite + Tailwind)                                 │
│    - 5 ekran, tema sağlayıcı, IPC istemcisi                         │
│        ▲                                                            │
│        │  preload (contextBridge) — dar, tipli API                  │
│        ▼                                                            │
│  Main (Node)                                                        │
│    - ipc          : renderer ↔ servisler köprüsü                    │
│    - wa-engine    : Baileys soketi, QR, gönderim, doğrulama         │
│    - campaign-engine : throttle'lı send-loop (KALP)                 │
│    - db           : SQLite (better-sqlite3)                         │
│    - contacts     : Excel/CSV import, normalize, listeler           │
│    - settings     : presetler, knob'lar, yedek                      │
│                                                                     │
│  Disk: SQLite dosyası + Baileys auth-state klasörü (userData)       │
└─────────────────────────────────────────────────────────────────────┘
```

**Güvenlik ayarları:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer'a sadece preload üzerinden tanımlı kanallar açılır.

---

## 4. Modüller

### Main süreci

#### `wa-engine`
- Baileys bağlantısı: QR / pairing kodu üretimi, bağlantı durumu olayları (`connecting`, `qr`, `open`, `close`).
- Oturum kalıcılığı: `useMultiFileAuthState` → `userData/wa-session/`.
- Reconnect: `connection.update` ile `lastDisconnect` koduna göre exponential backoff; `loggedOut` (401) → yeniden bağlanma gerektir, **uyar**.
- Primitifler: `sendText(jid, text)`, `sendMedia(jid, filePath, caption, type)`, `exists(phone) → onWhatsApp` (numara WA'da mı).
- Gelen mesaj dinleyici: opt-out anahtar kelimesi (`DUR`/`STOP`, ayarlanabilir) → `opt_outs`'a ekle.
- **Arayüz soyutlaması:** `WhatsAppPort` interface'i → gerçek `BaileysAdapter` + test için `FakeWhatsApp`.

#### `campaign-engine` (kalp)
Bir kampanyayı (mesaj şablonu + alıcı listesi + ayar snapshot'ı) throttle'lı döngüde yürütür:
- Sıradaki `pending` alıcıyı seç.
- Kapılar: günlük tavan dolu mu? aktif saat içinde mi? parti molası gerekiyor mu? ısınma limiti?
- Mesajı render et: spintax çöz (`{Merhaba|Selam}`) + değişken yerleştir (`{ad}` → kişi alanı).
- `wa-engine.exists()` ile doğrula → geçersizse `skipped`.
- Gönder → başarı/hata → durum güncelle → `send_log`'a yaz.
- Jitter'lı gecikme bekle (medya için ayrı/uzun aralık).
- İlerleme olayı yay → renderer canlı güncellenir.
- **Pause/resume:** kullanıcı duraklatabilir; app yeniden açılınca `running` kampanya `pending`'lerden devam eder. `sent` olanlar **tekrar gönderilmez** (idempotent).
- **Circuit-breaker:** ban/oturum sinyali → kampanyayı `halted` yap, **dur**, kullanıcıyı uyar.

#### `db`
SQLite şema + erişim (better-sqlite3, senkron, basit). Migration mekanizması (sürümlü).

#### `contacts`
- Excel/CSV import (sheetjs/xlsx). Sütun eşleştirme (telefon, ad, ekstra değişkenler).
- Telefon normalizasyon → E.164 (varsayılan ülke kodu ayarlanabilir, ör. +90).
- Dedupe (aynı numara tekrar etmez).
- Liste yönetimi (oluştur, kişi ekle/çıkar).
- do-not-contact / opt-out zorlaması: gönderimde her zaman kontrol.

#### `settings`
- Risk preset (Dengeli/Konservatif/Agresif) + tüm knob'lar (aşağıda §6).
- Şifreli yedek al/yükle (DB export → şifreli dosya; import → geri yükle).

### Renderer süreci
5 ekran (§8) + paylaşılan bileşenler: sol kenar menü, üst durum çubuğu (bağlantı + numara + günlük sayaç), tema sağlayıcı (açık/koyu), IPC istemci sarmalayıcı.

---

## 5. Veri Modeli (SQLite)

```
contacts
  id INTEGER PK
  phone TEXT UNIQUE        -- E.164
  name TEXT
  vars TEXT                -- JSON: {sehir: "...", ...}
  created_at TEXT

lists
  id INTEGER PK
  name TEXT
  created_at TEXT

list_members
  list_id INTEGER FK
  contact_id INTEGER FK
  PRIMARY KEY (list_id, contact_id)

campaigns
  id INTEGER PK
  name TEXT
  message_template TEXT     -- spintax + {değişken}
  media_path TEXT NULL
  media_type TEXT NULL      -- image/document/video
  settings_snapshot TEXT    -- JSON: kampanya başlatıldığındaki knob'lar
  status TEXT               -- draft | running | paused | halted | done
  created_at TEXT
  stats TEXT                -- JSON: {sent, failed, skipped, optout, pending}

campaign_recipients
  id INTEGER PK
  campaign_id INTEGER FK
  contact_id INTEGER FK
  phone TEXT
  status TEXT               -- pending | sent | failed | skipped | optout
  error TEXT NULL
  sent_at TEXT NULL

opt_outs
  phone TEXT PK            -- do-not-contact
  reason TEXT              -- "user_reply" | "manual" | "import"
  created_at TEXT

settings
  key TEXT PK
  value TEXT               -- JSON

send_log
  id INTEGER PK
  campaign_id INTEGER NULL
  phone TEXT
  status TEXT
  ts TEXT                  -- günlük tavan sayımı + audit
```

**WhatsApp oturumu** SQLite'ta değil; Baileys file-auth-state olarak `userData/wa-session/`'da.

---

## 6. Anti-Ban Motoru

İki katman.

### Katman 1 — Her zaman açık (preset'ten bağımsız)
- **Jitter:** her gecikme `[min, max]` aralığında rastgele. Sabit ritim (1.30s gibi) = robot imzası, yasak.
- **Numara ısınması:** ilk N gün otomatik düşük günlük limit, kademeli artış.
- **Spintax + değişken:** `{Merhaba|Selam} {ad}` → byte-aynı toplu mesaj yok.
- **WA doğrulama:** gönderimden önce `onWhatsApp`; kayıtsız numara atlanır.
- **Opt-out:** gelen `DUR`/`STOP` → `opt_outs`, her yerde atlanır.
- **Circuit-breaker:** ban/oturum sinyali → halt + uyarı.
- **do-not-contact:** `opt_outs`'taki numaralar asla gönderilmez.

### Katman 2 — Ayarlanabilir knob'lar (preset ile gelir, hepsi düzenlenebilir)

| Knob | Konservatif | **Dengeli (varsayılan)** | Agresif |
|---|---|---|---|
| Mesaj arası gecikme | 45–90 sn | **20–45 sn** | 5–15 sn |
| Medya arası gecikme | 90–180 sn | **45–90 sn** | 15–30 sn |
| Parti molası | her 15–20'de 10–20 dk | **her 20–30'da 5–15 dk** | her 40–50'de 3–5 dk |
| Günlük tavan / numara | 40 → 150 | **50 → 300** (ısınma ile) | yüksek, zayıf tavan |
| Aktif saat | 10:00–20:00 | **09:00–21:00** | 7/24 |
| Isınma süresi | 7 gün | 5 gün | yok |

- Tüm değerler elle düzenlenebilir; kullanıcı gecikmeyi 1-2 sn'ye çekebilir → **çok düşükte görünür uyarı** (tek numarada ban riski).
- Varsayılan preset: **Dengeli**.

---

## 7. Kampanya Yaşam Döngüsü (durum makinesi)

```
draft ──başlat──▶ running ──tavan dolu / aktif saat dışı──▶ (bekle, running'de kalır)
  │                  │
  │                  ├──kullanıcı duraklat──▶ paused ──devam──▶ running
  │                  ├──ban sinyali──────────▶ halted (kullanıcı çözünce ──▶ running)
  │                  └──tüm alıcılar bitti────▶ done
```

- **Resume:** app açılışında `running` kampanyalar otomatik kaldığı yerden.
- **Idempotent:** sadece `pending` alıcılar işlenir; `sent` tekrar etmez.
- Günlük tavan `send_log`'dan o günün sayımıyla hesaplanır (numara bazlı).

---

## 8. IPC API Yüzeyi (taslak)

Renderer → Main (preload kanalları):
- `wa:getStatus`, `wa:connect`, `wa:disconnect`, `wa:onQr` (event), `wa:onStatus` (event)
- `contacts:import(file)`, `contacts:list`, `lists:create/list/addMembers`
- `optout:list/add/remove`
- `campaign:create`, `campaign:list`, `campaign:start/pause/resume`, `campaign:onProgress` (event)
- `settings:get/set`, `backup:export/import`

Tüm girdiler **zod** ile doğrulanır.

---

## 9. UI Ekranları

Sol kenar menü · WhatsApp yeşili aksan · açık/koyu geçiş · üst durum çubuğu.

**Genel Bakış:** bağlantı durumu, bugün gönderilen / günlük tavan, aktif kampanya ilerleme çubuğu + canlı sayaçlar (gönderildi/başarısız/sıradaki), hızlı eylemler.

**Hesap:** QR kod ile bağlama, bağlantı durumu, profil (ad/numara), bağlantıyı kes, oturum sıfırla.

**Rehber:** Excel/CSV içe aktar (sütun eşleştirme önizleme), kişi tablosu (ara/filtrele), listeler, do-not-contact/opt-out yönetimi.

**Kampanyalar:** mesaj oluştur (metin + spintax + değişken ekle + medya ekle) → alıcı listesi seç → önizleme (örnek render + tahmini süre/gün) → ayar özeti → başlat. Çalışan kampanya: canlı ilerleme, duraklat/devam, alıcı durum tablosu.

**Ayarlar:** risk preset seçimi + tüm knob'lar (gecikme/jitter aralıkları, günlük tavan, aktif saat, ısınma, parti molası), opt-out anahtar kelimesi, varsayılan ülke kodu, tema, yedek al/yükle.

---

## 10. Hata Yönetimi
- Bağlantı kopması → backoff'lu reconnect, oturum korunur. `loggedOut` → yeniden bağla uyarısı.
- Gönderim hatası → 1 retry (gecikmeyle), sonra `failed` + devam.
- Geçersiz numara → `skipped` + log.
- App çökme/restart → kalıcı durumdan devam (idempotent).
- Ban sinyali → `halted`, daha fazla yakma yok.
- Import hatası (bozuk dosya/sütun) → satır bazlı rapor, kısmi import.

---

## 11. Güvenlik ve Gizlilik
- Tüm veri yerel (SQLite + auth-state). Bulut yok.
- Yedek dosyası şifreli (kullanıcı parolası ile).
- Electron sıkılaştırma: contextIsolation, sandbox, nodeIntegration kapalı, dar IPC.
- v2: SQLite şifreleme (SQLCipher) + opsiyonel açılış kilidi.

---

## 12. Test Stratejisi (TDD)
- **Unit:** spintax render, değişken yerleştirme, telefon normalizasyon (E.164), jitter/delay hesaplayıcı, günlük-tavan sayacı, aktif-saat kapısı, ısınma limiti, CSV/Excel parser, opt-out eşleştirici. (Saf fonksiyonlar → TDD.)
- **Integration:** `campaign-engine` + `FakeWhatsApp` adapter → pacing, tavan zorlaması, pause/resume, durum geçişleri, circuit-breaker halt, idempotent resume.
- **Manuel E2E:** gerçek QR bağlama + küçük gerçek gönderim (5-10 numara) — toplu öncesi zorunlu doğrulama.
- `wa-engine` testlerde mock'lanır (CI'da gerçek WhatsApp yok).

---

## 13. Teknoloji Yığını
Electron + electron-vite · React + TypeScript · Tailwind CSS · better-sqlite3 · @whiskeysockets/baileys · xlsx (sheetjs) · zod · electron-builder (paketleme/installer).

---

## 14. Proje Yapısı
```
octowp/
  package.json
  electron.vite.config.ts
  electron/                 # main süreci
    main.ts
    preload.ts
    wa-engine/              # WhatsAppPort, BaileysAdapter, FakeWhatsApp
    campaign-engine/        # send-loop, state machine
    db/                     # şema, migration, erişim
    contacts/               # import, normalize, listeler
    settings/               # preset, knob, backup
    ipc/                    # kanal kayıtları
  src/                      # renderer (React)
    screens/                # Dashboard, Account, Contacts, Campaigns, Settings
    components/             # sidebar, statusbar, ortak UI
    lib/                    # ipc istemci, tema, biçimlendiriciler
  shared/                   # main ↔ renderer paylaşılan tipler
  tests/
```

---

## 15. Açık Riskler / Notlar
- **Ban riski sıfırlanamaz** — liste kalitesi/rıza belirleyici. UI'da kullanıcıyı bilgilendir.
- Tek numara → 2000 = ~10-20 günlük kampanya. Gerçekçi beklenti UI'da gösterilmeli (tahmini bitiş).
- Baileys protokol değişikliğine duyarlı → kütüphane güncel tutulmalı.
- Bilgisayar uzun kampanyalarda açık kalmalı (uyku engelleme: Electron `powerSaveBlocker`).

---

## 16. v2 Yol Haritası
Numara toplama (sohbet/grup) · gruplara toplu gönderim · çoklu numara rotasyon+failover · SQLite şifreleme + açılış kilidi · zamanlanmış kampanya (cron) · lisans/aktivasyon sistemi.
