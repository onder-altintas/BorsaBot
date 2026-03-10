import React, { useState } from 'react';

// Tarih formatlama
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dakika önce`;
    if (diffHour < 24) return `${diffHour} saat önce`;

    return date.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function isNew(dateStr) {
    if (!dateStr) return false;
    const diffMs = Date.now() - new Date(dateStr).getTime();
    return diffMs < 2 * 60 * 60 * 1000; // Son 2 saat
}

export function NewsCard({ news }) {
    const [expanded, setExpanded] = useState(false);
    const newsIsNew = isNew(news.publishedAt);

    return (
        <div className={`news-card ${newsIsNew ? 'is-new' : ''}`}>
            <div className="news-card-header">
                <span className="news-symbol-badge">{news.symbol}</span>
                <div className="news-meta">
                    {news.url ? (
                        <a
                            href={news.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="news-title-link"
                        >
                            {news.title}
                        </a>
                    ) : (
                        <span className="news-title-link" style={{ cursor: 'default' }}>{news.title}</span>
                    )}
                    <span className="news-date">{formatDate(news.publishedAt)}</span>
                </div>
                {newsIsNew && <span className="news-new-badge">YENİ</span>}
            </div>

            {/* Haber özeti (varsa) */}
            {news.summary && (
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '0.5rem' }}>
                    {expanded ? news.summary : news.summary.substring(0, 150)}
                    {news.summary.length > 150 && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.78rem', padding: '0 4px' }}
                        >
                            {expanded ? 'daha az' : '...devamı'}
                        </button>
                    )}
                </div>
            )}

            {/* AI Yorum Bölümü */}
            <div className="news-ai-section">
                <div className="news-ai-header">
                    <span className="news-ai-icon">🤖</span>
                    <span className="news-ai-label">Yapay Zeka Yorumu</span>
                </div>

                {news.aiComment ? (
                    <p className="news-ai-comment">{news.aiComment}</p>
                ) : (
                    <div className="news-ai-pending">
                        <div className="ai-dots">
                            <span /><span /><span />
                        </div>
                        <span>Yorum hazırlanıyor...</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default NewsCard;
