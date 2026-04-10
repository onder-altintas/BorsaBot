# 📈 BorsaBot: BIST 100 Trading Simulator & Bot

Bu proje, Borsa İstanbul (BIST 100) verilerini simüle eden, gelişmiş teknik analiz göstergeleri sunan ve bulut tabanlı veritabanı ile verileri kalıcı olarak saklayan profesyonel bir trading simülasyonudur.

---

## 🌐 Canlı Sistem Bilgileri
| Bileşen | Servis | Durum |
| :--- | :--- | :--- |
| **Frontend** | Vercel | [Canlı Sitede Görüntüle](https://borsabot.vercel.app) |
| **Veritabanı** | MongoDB Atlas | Bulut Tabanlı (Kalıcı) |
| **Kaynak Kod** | GitHub | [GitHub Repository](https://github.com/onder-altintas/BorsaBot) |

---

## 🚀 Öne Çıkan Özellikler

### 1. Gelişmiş Piyasa Analizi
- **Canlı Simülasyon:** 10 büyük BIST 100 hissesi için gerçek zamanlı fiyat hareketleri.
- **Profesyonel Göstergeler:**
  - **MACD (12, 26, 9):** Trend yönü ve momentum takibi.
  - **Bollinger Bantları (20, 2):** Volatilite ve aşırı alım/satım bölgeleri.
  - **RSI (14) & SMA (5, 10):** Temel teknik analiz desteği.
- **Sinyal Motoru:** Tüm göstergeleri harmanlayan dinamik "GÜÇLÜ AL" / "GÜÇLÜ SAT" kararları.

### 2. Premium UI/UX (Glassmorphism)
- **Modern Tasarım:** Karanlık mod tabanlı, cam efekti (glassmorphism) ve yumuşak geçişler.
- **Tipografi:** Okunabilirliği yüksek 'Outfit' Google Font entegrasyonu.
- **Dashboard:** Anlık varlık gelişimi grafiği, win-rate hesaplaması ve "En İyi Hisse" istatistiği.

### 3. Akıllı Trading Botları
- **SL/TP Yönetimi:** Her bot için özel **Stop-Loss** ve **Take-Profit** seviyeleri tanımlanabilir.
- **Otomatik İşlem:** Botlar, belirlenen stratejiye göre kullanıcı adına 7/24 (sunucu açıkken) işlem yapar.
- **Sinyal Takibi:** İşlem geçmişinde her bir işlemin hangi sinyal (QQE, MACD vb.) ile tetiklendiği kaydedilir.
- **Bulut Senkronizasyonu:** Bot ayarları MongoDB üzerinden her kullanıcı için bağımsız ve kalıcıdır.

---

## 📊 Proje Analizi
Projenin mimarisi, teknik detayları ve gelecek planları hakkında detaylı inceleme raporuna [ANALYSIS.md](./ANALYSIS.md) dosyasından ulaşabilirsiniz.

---

## 🛠️ Teknik Altyapı & Kurulum

### Kritik Ortam Değişkenleri (Environment Variables)
Uygulamanın çalışması için aşağıdaki değişkenlerin tanımlanması **şarttır**:

**Backend (.env):**
```env
PORT=5000
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/borsabot
```

**Frontend (.env):**
```env
VITE_API_BASE_URL=http://localhost:5000/api  # Yerelde
# Veya Vercel'deki Backend URL'niz
```

### Kurulum
1. **Server:** `cd server && npm install && node index.js`
2. **Frontend:** `npm install && npm run dev`

---

## 🤖 Yapay Zeka Devir Notları (AI Handoff)
*Bu projeyi devralan AI asistanı veya geliştiriciler için kritik teknik bilgiler:*

- **Veritabanı (Faz 3):** `db.json` devri kapandı. Artık `mongoose` ve MongoDB Atlas kullanılıyor. Şemalar `server/models/User.js` içindedir.
- **Simülasyon Motoru:** `server/index.js` içindeki asenkron `setInterval` bloğu hem market fiyatlarını belirler hem de veritabanındaki tüm kullanıcıların botlarını tetikler.
- **Güvenlik & Auth:** JWT yerine basitlik için `x-user` header yapısı kullanılmıştır. Frontend her istekte bu başlığı gönderir.
- **Veri Göçü (Migration):** Sunucuda `migrateFromJson()` fonksiyonu mevcuttur; eğer yerelde bir `db.json` bulursa onları otomatik olarak bulut veritabanına taşır.
- **Bağlantı Robustness:** Sunucu, MongoDB bağlantısı kopsa bile market verilerini stream etmeye devam edecek şekilde (resilient) tasarlanmıştır.

---
*Geliştirici:* Önder Altıntaş | **BorsaBot v2.0 - Cloud Edition**

