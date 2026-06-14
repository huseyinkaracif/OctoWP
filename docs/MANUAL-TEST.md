# OctoWP — Manuel E2E Test Listesi

Otomatik testler WhatsApp'ı `FakeWhatsApp` ile taklit eder. Gerçek gönderim öncesi bu listeyi **kendi numaranla, küçük bir test listesiyle** uygula.

## Hazırlık
- [ ] `npm install && npm run dev` — uygulama açılıyor.
- [ ] Açık/koyu tema geçişi çalışıyor (sağ üst).

## 1. Hesap bağlama
- [ ] **Hesap** ekranı → **Bağlan** → QR görünüyor.
- [ ] Telefon → WhatsApp → Ayarlar → Bağlı Cihazlar → Cihaz Bağla → QR okut.
- [ ] Durum **Bağlı** oluyor; numara + isim görünüyor (sidebar + üst bar yeşil).

## 2. Rehber içe aktarma
- [ ] Küçük bir `.xlsx`/`.csv` hazırla: `Telefon`, `Ad` sütunları, **5-10 kendi/test numaran**.
- [ ] **Rehber → Excel/CSV içe aktar** → dosya seç → sütunları eşleştir → yeni liste → içe aktar.
- [ ] Özet doğru: eklenen / tekrar / atlanan sayıları. Numaralar `+90 ...` biçiminde.
- [ ] Bir numarayı **Engelle** (🚫) → Engellenenler sekmesinde görünüyor.

## 3. Kampanya
- [ ] **Kampanyalar → Yeni kampanya**. Ad ver, listeyi seç.
- [ ] Mesaj: `{Merhaba|Selam} {ad}, bu bir testtir.` Önizleme doğru render ediyor.
- [ ] (Opsiyonel) küçük bir resim ekle.
- [ ] Tahmin (alıcı sayısı / gün) görünüyor → **Oluştur**.
- [ ] Detayda **Başlat**. Mesajlar telefonlara ulaşıyor; her birinde isim/spintax farklı.
- [ ] Canlı sayaçlar artıyor (gönderildi/bekleyen). Geçersiz numara **Atlandı** oluyor.
- [ ] **Duraklat** → durur; **Devam et** → kaldığı yerden sürer.
- [ ] Engelli numaraya **gönderilmiyor**.

## 4. Opt-out (gelen yanıt)
- [ ] Test numaralarından biriyle uygulamaya **"DUR"** yaz.
- [ ] O numara otomatik **Engellenenler**'e düşüyor; sonraki kampanyalarda atlanıyor.

## 5. Dayanıklılık
- [ ] Kampanya çalışırken uygulamayı kapat-aç → kampanya **kaldığı yerden** devam ediyor (gönderilenler tekrar gitmiyor).

## 6. Ayarlar & yedek
- [ ] Preset değiştir (Dengeli/Konservatif/Agresif) → değerler güncelleniyor.
- [ ] Gecikmeyi <5 sn yap → düşük gecikme uyarısı çıkıyor.
- [ ] **Yedek al** (parola) → `.octw` dosyası oluşuyor.
- [ ] **Yedek yükle** → uyarı sonrası uygulama yeniden başlıyor, veriler geri geliyor.

## 7. Güvenlik gözlemi
- [ ] Yoğun/agresif ayarda bir numara ban sinyali alırsa kampanya **otomatik duruyor** ve uyarı gösteriyor.

> Not: Gerçek ban davranışını test ederken **yakmayı göze aldığın** numara kullan.
