# 📈 BorsaBot: BIST 100 Trading Simulator & Bot

Bu proje, Borsa İstanbul (BIST 100) verilerini simüle eden, teknik analiz göstergeleri sunan ve otomatik trading botları ile işlem yapılmasına olanak sağlayan kapsamlı bir web uygulamasıdır.

## 🔐 Erişim Bilgileri (Giriş)
Uygulama çoklu kullanıcı desteği sunar. Aşağıdaki bilgilerle giriş yapabilirsiniz:

| Kullanıcı Adı | Şifre | Yetki |
| :--- | :--- | :--- |
| **önder** | 123 | Full Access (Default) |
| **samet** | 123 | Full Access |

---

## 🌐 Canlı Sistem Linkleri
| Bileşen | Servis | Link |
| :--- | :--- | :--- |
| **Frontend** | Vercel | [https://borsabot.vercel.app](https://borsabot.vercel.app) |
| **Backend API** | Render | [https://borsabot.onrender.com](https://borsabot.onrender.com) |
| **Kaynak Kod** | GitHub | [https://github.com/onder-altintas/BorsaBot](https://github.com/onder-altintas/BorsaBot) |

---

## 🚀 Öne Çıkan Özellikler

### 1. Canlı Piyasa Simülasyonu
- **Gerçekçi Veriler:** 10 büyük BIST 100 hissesi için her 3 saniyede bir güncellenen fiyat simülasyonu.
- **Teknik Göstergeler:** Anlık **RSI (14)**, **SMA 5** ve **SMA 10** değerleri otomatik hesaplanır.
- **Sinyaller:** Teknik verilere dayalı "GÜÇLÜ AL", "AL", "TUT", "SAT", "GÜÇLÜ SAT" önerileri.

### 2. Çoklu Kullanıcı & Güvenlik
- **Veri İzolasyonu:** Her kullanıcının bakiyesi, portföyü ve işlem geçmişi tamamen bağımsızdır.
- **Kalıcı Oturum:** `localStorage` entegrasyonu ile kapanmayan oturum yapısı.

### 3. Otomatik Trading Botları
- **Strateji:** Botlar sadece "GÜÇLÜ AL" sinyalinde alım, "GÜÇLÜ SAT" sinyalinde satış yapar.
- **Arkaplan Çalışması:** Sunucu açık olduğu sürece botlar tüm kullanıcılar için simülasyonu takip eder.

---

## 🛠️ Teknik Altyapı & Ortam Değişkenleri

### Ortam Değişkenleri (Environment Variables)
Frontend'in backend ile iletişim kurabilmesi için Vercel veya yerel ortamda aşağıdaki değişkenin tanımlı olması gerekir:

```env
VITE_API_BASE_URL=https://borsabot.onrender.com/api
```

### Kurulum ve Çalıştırma
1. **Frontend:** `npm run dev` (Local: `http://localhost:5173`)
2. **Backend:** `cd server && npm run dev` (Local: `http://localhost:5000`)

---

## 💎 Kritik Düzeltmeler (Geçmiş)
- **Yetki (126):** Vercel'deki `Permission Denied` hatası Git index'i sıfırlanarak ve `.gitignore` UTF-8 yapılarak çözüldü.
- **Önbellek (Cache):** Verilerin donmaması için API isteklerine `?t=timestamp` parametresi eklendi.
- **CORS:** Backend, `x-user` özel header'ına izin verecek şekilde yapılandırıldı.

---

## 🤖 Yapay Zeka Devir Notları (AI Handoff)
*Bu projeyi devralan AI asistanı için teknik notlar:*

- **Veritabanı:** `server/db.json` dosyasında `users` objesi altında kullanıcı bazlı tutulur.
- **Header:** Frontend her istekte `x-user` başlığı ile kullanıcı adını gönderir, Backend bu başlığa göre veri döner.
- **Simülasyon:** `server/index.js` içindeki `setInterval` blokları merkezi fiyat motorudur ve botları tetikler.
- **Dikkat:** Veri tipi çakışmalarını önlemek için `App.jsx` içinde `Array.isArray(portfolio)` gibi korumalar mevcuttur.

---
*Gelecek Geliştirmeler:* Daha fazla teknik gösterge (MACD, Bollinger), gelişmiş kullanıcı profili, gerçek borsa API entegrasyonu.
