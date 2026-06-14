# OctoWP v2 — Tasarım Dokümanı (Spec)

**Tarih:** 2026-06-14
**Durum:** Onaylandı (brainstorming + pazar araştırması) — implementasyon
**Önceki:** [v1 spec](2026-06-13-octowp-design.md)

## Amaç

OctoWP'yi tek yönlü "blaster"dan **iki yönlü, etkileşim-farkında** bir gönderim aracına çıkarmak. Pazar araştırması (5 ajanlı web taraması) en kritik bulguyu verdi: **yanıt oranı, Meta'nın 2025-26 ban modelinde en ağır davranışsal sinyaldir.** Dolayısıyla gelen yanıt + teslim/okundu takibi hem #1 eksik analitik hem #1 eksik anti-ban sinyalidir ve gelişmiş her özelliğin (oto-yanıt, drip, guard) temelidir.

## Kapsam (3 faz, bağımlılık sırası)

Her faz bağımsız çalışır ve test edilir. Sıra: Faz 1 → 2 → 3.

### Faz 1 — İki yönlü temel
1. **Gelen yanıt yakalama:** tüm gelen 1:1 mesajları `inbound_messages`'a yaz; kişinin `replied_at`'ini güncelle. (Mevcut opt-out keyword kontrolü korunur.)
2. **Teslim/okundu takibi:** her gönderilen mesajın WA `key.id`'sini sakla; `messages.update` (status ladder) ile `delivered_at`/`read_at` güncelle. `WhatsAppPort.sendText/sendMedia` → `{ ok, id?, banned?, error? }`.
3. **Funnel + KPI:** kampanya detay + dashboard'da Gönderildi→İletildi→Okundu→Başarısız + **yanıt oranı**.
4. **Typing presence:** gönderimden önce `composing` presence + mesaj uzunluğuna orantılı kısa rastgele süre, sonra gönder.
5. **Reconnect ramp:** reconnect sonrası ilk N mesajda ekstra yavaşlama.
6. **Başarısızları yeniden dene:** failed/undelivered recipient'leri `pending`'e geri al, kampanyayı sürdür.
7. **Sonuç export:** kampanya alıcılarını xlsx olarak dışa aktar (ad, telefon, durum, sent/delivered/read zaman, hata).

### Faz 2 — Etkileşim & güvenli içerik
8. **Gelen Kutusu** ekranı: gelen mesajlı kişiler listesi, sohbet görünümü, manuel yanıt kutusu.
9. **Oto-yanıt kural motoru:** kurallar `{ keywords[], matchType: contains|exact|starts, reply, enabled }` + away + greeting (yeni kişinin ilk mesajı). Kişi başına cooldown (döngü önleme). STOP/DUR'u genelleştirir.
10. **Poll** ve **vCard** gönderimi: kampanya içerik tipi olarak (`{ poll: {name, values, selectableCount} }`, `{ contacts: ... }`).

### Faz 3 — Kampanya gücü
11. **Şablon kütüphanesi:** kayıtlı mesajlar ({değişken}'li), composer'a yükle.
12. **Etiket/segment:** kişi etiketleri (M:N) + dinamik segment (etiket / yanıtladı / opt-out / son temas) → kampanya hedefi.
13. **Zamanlanmış gönderim:** kampanya `scheduled_at`; main'de zamanlayıcı due olanları `engine.start`. App kapalıyken kaçan pencere → açılışta yakalanır (uyarı).
14. **Drip/sequence kampanyalar:** çok adımlı dizi `{ order, message/template, delay_hours, condition: always|if_no_reply }`, yanıt gelince duraklat, yanıt vermeyene takip. Yanıt takibi + zamanlama üstüne kurulur.

## Mimari etkiler

- **wa-engine:** `WhatsAppPort` genişler — `sendText/sendMedia` mesaj id döndürür; yeni `onAck(cb)`, presence (`sendPresence`), `sendPoll`, `sendVCard`. Adapter `messages.update` → ack; `messages.upsert` (fromMe=false) → inbound (zaten kısmen var). FakeWhatsApp: ack/inbound simülasyon yardımcıları.
- **campaign-engine:** gönderimden önce typing presence; gönderim sonucundan `id` alıp recipient'a yaz; reconnect ramp.
- **autoreply-engine** *(yeni)*: inbound → kural eşleştir → cooldown'lı yanıt.
- **sequence-engine** *(yeni, Faz 3)*: enrollment'ları adımlar arası gecikme + koşulla ilerletir (engine ile benzer throttle/clock enjeksiyonu).
- **scheduler** *(yeni, Faz 3)*: main'de interval + startup taraması; due kampanya/sequence başlatır.
- **db:** yeni tablolar + kolonlar (aşağıda). Migration sürümlü; `migrate` idempotent (IF NOT EXISTS + ALTER guard).

## Veri modeli eklemeleri

```
inbound_messages(id, phone, text, ts, contact_id NULL)
campaign_recipients + wa_msg_id TEXT, delivered_at TEXT, read_at TEXT, replied_at TEXT
contacts + replied_at TEXT, last_contacted_at TEXT
autoreply_rules(id, name, keywords TEXT(json), match_type, reply TEXT, enabled INT, created_at)
autoreply_state(phone, last_reply_ts)        -- cooldown
templates(id, name, body, media_path NULL, media_type NULL, created_at)
tags(id, name, color, created_at)
contact_tags(tag_id, contact_id) PK(tag_id, contact_id)
sequences(id, name, status, created_at)
sequence_steps(id, sequence_id, ord, body, media_path NULL, media_type NULL, delay_hours, condition)
sequence_enrollments(id, sequence_id, contact_id, phone, vars TEXT, cur_step, status, next_run_at, last_sent_at)
campaigns + scheduled_at TEXT NULL, content_type TEXT default 'message'  -- message|poll|vcard
campaign_poll(campaign_id, question, options TEXT(json), selectable INT)  -- poll payload
```

Migration: ALTER TABLE ADD COLUMN'ler `migrate()` içinde, kolon var mı kontrolüyle (PRAGMA table_info) sarmalanır.

## Ack durum makinesi (recipient)

```
pending → sent (wa_msg_id alındı)
sent → delivered (messages.update DELIVERY_ACK) → read (READ)
sent/delivered/read → replied (inbound geldi; ayrı bayrak, durumu ezmez)
sent → failed (hata) / skipped (WA'da yok) / optout
```
`status` ana alan (gönderim sonucu); `delivered_at/read_at/replied_at` ek sinyaller. Funnel bunlardan hesaplanır.

## Anti-ban etkileşimi

- Typing presence + reconnect ramp = ek realizm/yavaşlama (mevcut jitter/cap üstüne).
- Yanıt oranı KPI ileride guard'a bağlanabilir (Faz "anti-ban derinliği", v2 dışı) — şimdilik sadece ölçülüyor + gösteriliyor.
- Oto-yanıt: kişi başına cooldown + günlük oto-yanıt tavanı → bot-loop ve aşırı yanıt ban riskini önler.

## Hata yönetimi
- Ack/inbound event'leri best-effort; eşleşmeyen `messages.update` (bizim olmayan) yok sayılır.
- Scheduler: kaçan pencere → açılışta başlat + log uyarısı; iki kez başlatmayı önlemek için `status` guard.
- Sequence: enrollment ilerlemesi idempotent (cur_step + next_run_at ile); app restart'ta kaldığı yerden.

## Test stratejisi
- **Unit (TDD):** ack durum geçiş reducer'ı, oto-yanıt eşleştirici (matchType + cooldown), segment filtre değerlendirici, sequence adım ilerleme + koşul (if_no_reply), scheduler due hesabı, funnel/yanıt-oranı hesaplayıcı.
- **Integration (FakeWhatsApp + sahte saat):** kampanya gönderiminde id yakalama + ack güncelleme; inbound → replied bayrağı; oto-yanıt tetikleme + cooldown; sequence çok-adım ilerleme + pause-on-reply; scheduler due → start.
- Mevcut 67 test korunur.

## v2 dışı (bilinçli atlananlar — araştırma "yapma" dedi)
Buton/liste/carousel (Baileys'ten kaldırıldı, ban-riskli) · çoklu numara rotasyonu (premis dışı) · no-code chatbot/flow builder (ban riski) · link tıklama takibi (sunucu ister) · numara harvesting (LID duvarı, yapısal ölü) · HSM şablon/WhatsApp Pay/katalog (resmi API) · cihaz-fingerprint churn (tek numarada daha kötü). Ayrıca "anti-ban derinliği" paketi (Gaussian jitter, risk skoru, post-ban recovery) sonraki sürüme bırakıldı.
