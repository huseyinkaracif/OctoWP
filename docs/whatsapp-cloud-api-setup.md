# WhatsApp Cloud API — Kurulum Rehberi (OctoWP resmî mod)

OctoWP artık resmî **WhatsApp Cloud API** kullanır (Baileys kaldırıldı). Bu
rehber, sıfırdan gönderim yapana kadar tüm adımları içerir. Sadece **giden**
şablon kampanyaları desteklenir (gelen kutusu / otomatik yanıt yoktur).

## Önce bilmen gerekenler
- **Onaylı şablon zorunlu.** Soğuk pazarlamada serbest metin atılamaz; Meta'nın
  onayladığı bir **Marketing** şablonu gönderirsin.
- **Mesaj başına ücret** vardır (kategori + ülkeye göre). Türkiye'nin kendi
  tarifesi için Meta'nın güncel fiyat sayfasına bak.
- **Kademeli limit:** yeni numara 24 saatte **250** kişiyle başlar; kalite +
  hacme göre otomatik 1.000 → 10.000 → 100.000 → sınırsıza çıkar.
- **Kalite puanı:** çok engellenir/şikâyet alırsan numara kısıtlanır. İçerik
  kalitesi burada da önemlidir.

## 1. Meta Business hesabı
1. <https://business.facebook.com> → işletme hesabı oluştur.
2. **Business Settings → Security Center**'dan **İşletme Doğrulaması**'nı yap
   (limitleri ve özellikleri açar; şiddetle önerilir).

## 2. Uygulama (App) + WhatsApp ürünü
1. <https://developers.facebook.com> → **My Apps → Create App** → tür: **Business**.
2. Uygulamaya **WhatsApp** ürününü ekle (Add Product → WhatsApp → Set up).
3. Açılan ekranda bir **test numarası** ve bir **WhatsApp Business Account
   (WABA)** otomatik oluşur.

## 3. Numara bağla ve doğrula
1. WhatsApp → **API Setup** ekranında **Add phone number** ile kendi numaranı ekle.
   - ⚠️ Bu numara normal WhatsApp / WhatsApp Business **uygulamasında kayıtlı
     olmamalı**. Kayıtlıysa o hesabı sil ya da yeni numara kullan.
2. Numarayı **SMS / arama** ile doğrula.

## 4. Kimlik bilgilerini topla
API Setup ekranından / Business Settings'ten şunları al:
- **Phone Number ID** — API Setup ekranında numaranın altında.
- **WhatsApp Business Account ID (WABA ID)** — API Setup ekranında veya
  Business Settings → Accounts → WhatsApp Accounts.
- **Access Token (süresiz):**
  1. **Business Settings → Users → System Users → Add** ile bir System User oluştur
     (rol: Admin).
  2. Bu System User'a WhatsApp uygulamanı/WABA'nı **Assign assets** ile ata
     (Full control / Manage).
  3. **Generate token** → uygulamayı seç → izinler: `whatsapp_business_messaging`
     ve `whatsapp_business_management` → token'ı kopyala (bir daha gösterilmez).

## 5. Şablon oluştur ve onaya gönder
1. **WhatsApp Manager → Account tools → Message templates → Create template**.
2. Kategori: **Marketing**. Dil: **Turkish (tr)**.
3. Gövdede değişken için `{{1}}`, `{{2}}` kullan (ör. "Merhaba {{1}}, ...").
4. İstersen **Header → Media → Image** seç (kampanyada görsel göndereceksen).
5. **Submit** → onay dakikalar–24 saat sürer. Durum **Approved** olunca kullanılır.

## 6. OctoWP'ye gir
1. OctoWP → **Hesap** ekranı.
2. **Access Token**, **Phone Number ID**, **WABA ID** alanlarını doldur.
3. **Bağlantıyı test et** → doğrulanırsa işletme adın, numaran ve kalite puanın görünür.

## 7. İlk kampanya
1. **Kampanyalar → Yeni kampanya**.
2. Hedef liste/etiket seç.
3. **Şablon** listesinden onaylı şablonunu seç (liste Meta'dan canlı çekilir).
4. Her `{{n}}` için **Sütun** (ör. `ad`) ya da **Sabit** metin eşle.
5. Şablonun görsel başlığı varsa **Görsel seç** ile yerel fotoğrafı ekle
   (gönderimde bir kez Meta'ya yüklenir, tüm alıcılarda yeniden kullanılır).
6. **Oluştur → Başlat**. Önce küçük bir test listesiyle dene.

## Notlar
- **Günlük gönderim limiti** (Ayarlar) = mesajlaşma kademen. Yeni numarada 250 ile
  başla, kalite arttıkça yükselt. Limit dolunca motor gün sonuna kadar bekler,
  ertesi gün devam eder.
- **Gönderim hızı** (Ayarlar) ban için değil, Cloud API hız limitine takılmamak
  içindir; medya için biraz daha uzun tut.
- **Token süresiz** olsa da iptal edilebilir; "geçersiz token" hatası alırsan
  System User token'ını yenile.
