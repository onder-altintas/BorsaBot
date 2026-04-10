# 📉 BorsaBot Proje Analiz Raporu

BorsaBot, Borsa İstanbul (BIST) verilerini temel alan, teknik analiz göstergeleri ile desteklenmiş, otomatik trading bot yeteneklerine sahip ve AI entegrasyonlu bir simülasyon/platformdur.

## 🏗️ Proje Mimarisi

### 1. Frontend (İstemci)
- **Teknoloji**: React + Vite
- **Stil**: Vanilla CSS (Modern Glassmorphism tasarımı)
- **Grafik**: Recharts (Varlık gelişimi ve piyasa verileri için)
- **Durum Yönetimi**: `useTrading` özel hook'u üzerinden merkezi API etkileşimi.
- **Kimlik Doğrulama**: `localStorage` tabanlı basit kullanıcı yönetimi (`x-user` header ile backend'e iletilir).

### 2. Backend (Sunucu)
- **Teknoloji**: Node.js + Express
- **Veritabanı**: MongoDB (Mongoose üzerinden)
- **Veri Kaynağı**: `yahoo-finance2` kütüphanesi ile anlık BIST verileri (THYAO.IS gibi semboller).
- **İndikatör Motoru**: SMA, EMA, RSI, MACD, Bollinger Bands ve komplex QQE & Fisher Transform hesaplamaları.
- **Bot Motoru**: Kullanıcı tanımlı stratejilere göre arka planda çalışan otomatik alım-satım döngüsü.

### 3. Servisler & AI
- **KAP Servisi**: Google News RSS üzerinden KAP haberlerini takip eder.
- **AI Servisi**: Gemini ve OpenRouter (Llama 3/4) kullanarak KAP haberlerini analiz eder ve yatırımcıya özet/yorum sunar.

---

## 🚀 Mevcut Temel Özellikler

- **Piyasa Takibi**: 30'dan fazla BIST sembolünün (BIST 30 ağırlıklı) anlık fiyat, değişim ve teknik gösterge takibi.
- **4 Farklı Strateji**: 
  - **QQE**: Profesyonel trend takip indikatörü.
  - **Fisher-BB-EMA**: Hibrit, trend ve volatilite tabanlı strateji.
  - **MACD**: Momentum tabanlı sinyaller.
  - **RSI**: Aşırı alım/satım bölgeleri (30/70).
- **Zaman Dilimleri**: 1 Saatlik (1h), 4 Saatlik (4h) ve Günlük (1d) grafik/sinyal desteği.
- **Akıllı Botlar**: Kullanıcı başına her hisse için ayrı ayrı konfigüre edilebilen, Stop-Loss ve Take-Profit destekli botlar.
- **Performans Raporu**: Tüm stratejilerin geçmiş sinyal başarı oranlarını (Win Rate) analiz eden raporlama ekranı.
- **AI-Analiz**: KAP bildirimlerinin yatırımcı gözüyle yapay zeka tarafından yorumlanması.
- **İşlem Geçmişi Takibi**: Tüm işlemlerin hangi sinyal (örn: QQE-1h) ile yapıldığının dökümü.

---

## 🔍 Teknik İnceleme Notları

### Güçlü Yanlar
- **Hesaplama Hassasiyeti**: QQE ve Fisher Transform gibi karmaşık indikatörler Pine Script (TradingView) mantığıyla birebir eşlenmiş durumda.
- **Resilient Polling**: Yahoo Finance hatalarında veya MongoDB gecikmelerinde sistemin hayatta kalması için cache ve hata yönetim mekanizmaları (jitter, retry) kurulmuş.
- **UI/UX**: Estetik açıdan oldukça güçlü, modern bir finans dashboard görünümü sunuyor.

### İyileştirme Fırsatları
- **Hata Yönetimi**: Frontend'de bazı API hataları `alert()` ile kullanıcıya gösteriliyor; daha modern bir notification sistemi (toast vb.) kullanılabilir.
- **Backend Yapısı**: `server/index.js` dosyası 1500 satırı aşmış durumda. Route'lar ve iş mantığı (indicator hesaplamaları) ayrı modüllere taşınarak sürdürülebilirlik artırılabilir.
- **Güvenlik**: Şu anki `x-user` yapısı geliştirme aşaması için uygun olsa da, gerçek bir sistem için JWT tabanlı bir auth sistemi (Sign In/Up) gereklidir.
- **Websocket**: Veriler şu an 20 saniyede bir polling ile çekiliyor. Daha akışkan bir deneyim için (eğer veri kaynağı desteklerse) Websocket entegrasyonu düşünülebilir.

---

## 🎯 Sonuç
Proje, bir trading simülasyonunun ötesinde, gerçek verilerle çalışan ve karmaşık teknik analiz stratejilerini başarıyla uygulayan olgun bir altyapıya sahip. Geliştirme süreci boyunca "Clean Code" prensiplerine uygun olarak backend'in modülerleştirilmesi, projenin ölçeklenebilirliğini ciddi oranda artıracaktır.
