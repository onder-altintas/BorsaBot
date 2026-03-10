import React, { useState } from 'react';
import { useKapNews } from '../../hooks/useKapNews';
import { NewsCard } from './NewsCard';
import './News.css';

// Mevcut projedeki tüm hisseler
const ALL_SYMBOLS = [
    'THYAO', 'ASELS', 'EREGL', 'KCHOL', 'SASA',
    'TUPRS', 'SISE', 'GARAN', 'AKBNK', 'BIMAS'
];

function LoadingSkeleton() {
    return (
        <div className="news-skeleton">
            {[1, 2, 3].map(i => (
                <div key={i} className="news-skeleton-card">
                    <div className="skeleton-line" style={{ width: '15%', height: '22px', marginBottom: '12px' }} />
                    <div className="skeleton-line" style={{ width: '80%', height: '18px' }} />
                    <div className="skeleton-line" style={{ width: '35%', height: '13px' }} />
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '12px 0 8px' }} />
                    <div className="skeleton-line" style={{ width: '60%', height: '13px' }} />
                    <div className="skeleton-line" style={{ width: '90%', height: '13px' }} />
                </div>
            ))}
        </div>
    );
}

function News({ portfolio = [] }) {
    // Portföydeki sembollerden filtre listesi oluştur
    const portfolioSymbols = portfolio
        .map(p => p.symbol.replace('.IS', ''))
        .filter(s => ALL_SYMBOLS.includes(s));

    const [filterMode, setFilterMode] = useState('all'); // 'all' | 'portfolio'
    const [selectedSymbol, setSelectedSymbol] = useState(''); // '' = tümü

    const symbolsToFetch = filterMode === 'portfolio' && portfolioSymbols.length > 0
        ? portfolioSymbols
        : [];

    const { news, loading, error, lastUpdated, unreadCount, markAllRead, refresh } = useKapNews(symbolsToFetch);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        markAllRead();
        await refresh();
        setTimeout(() => setIsRefreshing(false), 800);
    };

    // Seçili sembol filtrelemesi
    const filteredNews = selectedSymbol
        ? news.filter(n => n.symbol === selectedSymbol)
        : news;

    // Hangi sembollerin haberi var (filtre chip'leri için)
    const symbolsInNews = [...new Set(news.map(n => n.symbol))].sort();

    return (
        <div className="news-page fade-in">
            {/* Başlık */}
            <div className="news-header">
                <div className="news-header-left">
                    <h2>📰 KAP Haberleri</h2>
                    {unreadCount > 0 && (
                        <span style={{
                            background: '#ef4444', color: '#fff',
                            borderRadius: '50px', padding: '2px 8px',
                            fontSize: '0.7rem', fontWeight: 800,
                            minWidth: '20px', textAlign: 'center'
                        }}>
                            {unreadCount} yeni
                        </span>
                    )}
                </div>
                <div className="news-header-right">
                    {lastUpdated && (
                        <span className="news-last-updated">
                            Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
                        </span>
                    )}
                    <button
                        className={`news-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                        onClick={handleRefresh}
                        disabled={loading}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                        </svg>
                        Yenile
                    </button>
                </div>
            </div>

            {/* Bilgi banner: İlk yüklemede haberler henüz taranamazsa */}
            {!loading && news.length === 0 && !error && (
                <div className="news-info-banner">
                    ℹ️ Haberler 15 dakikada bir güncellenir. İlk tarama başlangıçtan 10 saniye sonra başlar.
                </div>
            )}

            {/* Filtre: Portföy / Tümü */}
            <div className="news-filters">
                <span className="news-filter-label">Kaynak:</span>
                <button
                    className={`news-filter-chip ${filterMode === 'all' ? 'active' : ''}`}
                    onClick={() => { setFilterMode('all'); setSelectedSymbol(''); }}
                >
                    Tüm BIST Hisseleri
                </button>
                {portfolioSymbols.length > 0 && (
                    <button
                        className={`news-filter-chip ${filterMode === 'portfolio' ? 'active' : ''}`}
                        onClick={() => { setFilterMode('portfolio'); setSelectedSymbol(''); }}
                    >
                        💼 Portföyüm ({portfolioSymbols.length})
                    </button>
                )}
            </div>

            {/* Sembol bazlı filtreler */}
            {symbolsInNews.length > 1 && (
                <div className="news-filters" style={{ marginBottom: '1.5rem' }}>
                    <span className="news-filter-label">Hisse:</span>
                    <button
                        className={`news-filter-chip ${selectedSymbol === '' ? 'active' : ''}`}
                        onClick={() => setSelectedSymbol('')}
                    >
                        Tümü
                    </button>
                    {symbolsInNews.map(sym => (
                        <button
                            key={sym}
                            className={`news-filter-chip ${selectedSymbol === sym ? 'active' : ''}`}
                            onClick={() => setSelectedSymbol(selectedSymbol === sym ? '' : sym)}
                        >
                            {sym}
                        </button>
                    ))}
                </div>
            )}

            {/* İçerik */}
            {loading ? (
                <LoadingSkeleton />
            ) : error ? (
                <div className="news-error-card">
                    ⚠️ {error}
                </div>
            ) : filteredNews.length === 0 ? (
                <div className="news-empty">
                    <span className="news-empty-icon">📭</span>
                    <strong>Haber bulunamadı</strong>
                    <p>15 dakikada bir otomatik kontrol yapılır.</p>
                </div>
            ) : (
                <div className="news-list">
                    {filteredNews.map(item => (
                        <NewsCard key={item._id} news={item} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default News;
