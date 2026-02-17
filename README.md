# 📈 BorsaBot: BIST 100 Trading Simulator & Bot

Bu proje, Borsa İstanbul (BIST 100) verilerini simüle eden, teknik analiz göstergeleri sunan ve otomatik trading botları ile işlem yapılmasına olanak sağlayan kapsamlı bir web uygulamasıdır.

## 🚀 Öne Çıkan Özellikler

### 1. Canlı Piyasa Simülasyonu
- **Gerçekçi Veriler:** THYAO, ASELS, EREGL gibi 10 büyük BIST 100 hissesi için her 3 saniyede bir güncellenen fiyat simülasyonu.
- **Teknik Göstergeler:** Her hisse için anlık **RSI (14)**, **SMA 5** ve **SMA 10** değerleri otomatik hesaplanır.
- **Sinyal Üretimi:** Teknik verilere dayalı "GÜÇLÜ AL", "AL", "TUT", "SAT", "GÜÇLÜ SAT" önerileri.

### 2. Çoklu Kullanıcı & Güvenlik
- **Oturum Yönetimi:** `önder` ve `samet` kullanıcıları için şifreli (123) giriş sistemi.
- **Veri İzolasyonu:** Her kullanıcının bakiyesi, portföyü ve işlem geçmişi tamamen birbirinden bağımsızdır (Multi-user Isolation).
- **Session Persistence:** Tarayıcıyı kapatsanız bile oturumunuz açık kalır.

### 3. Otomatik Trading Botları
- **Strateji:** Botlar sadece "GÜÇLÜ AL" sinyalinde alım, "GÜÇLÜ SAT" sinyalinde satış yapar.
- **Esneklik:** Her hisse için ayrı ayrı bot aktif edilebilir ve işlem adedi belirlenebilir.
- **Arkaplan Çalışması:** Sunucu açık olduğu sürece botlar tüm kullanıcılar için simülasyonu takip eder.

### 4. Modern UI & UX
- **Responsive Tasarım:** Mobil ve masaüstü uyumlu koyu tema (Dark Mode) arayüz.
- **Dashboard:** Toplam varlık, kar/zarar durumu ve varlık gelişim grafiği (Recharts).
- **İşlem Onayları:** Yapılan her işlem için kullanıcıya anlık geri bildirimler sağlanır.

## 🛠️ Teknik Altyapı
- **Frontend:** React 19, Vite, Lucide-React, Recharts, Vanilla CSS.
- **Backend:** Node.js, Express, Cors.
- **Veri Depolama:** JSON tabanlı yerel veritabanı (db.json) ile otomatik göç (migration) desteği.
- **Dağıtım (Deployment):** Frontend Vercel'de, Backend Render üzerinde çalışacak şekilde yapılandırılmıştır.

## ⚙️ Kurulum ve Çalıştırma

### Yerel Geliştirme
1. **Frontend:** `npm run dev` (Port: 5173)
2. **Backend:** `cd server && npm run dev` (Port: 5000)

### Dağıtım Ayarları
- **Vercel Çevre Değişkeni:** `VITE_API_BASE_URL=https://borsabot.onrender.com/api`

## 💎 Tamamlanan Kritik Düzeltmeler
- Vercel üzerindeki "Permission Denied (126)" yetki hatası giderildi.
- API bağlantısındaki 401 Unauthorized ve CORS kısıtlamaları aşıldı.
- İnternet tarayıcılarının eski verileri göstermesini engelleyen "Cache Prevention" (timestamp) sistemi eklendi.

---
*Bu dosya projenin mevcut durumunu özetler. Yeni özellikler eklendikçe güncellenmelidir.*
