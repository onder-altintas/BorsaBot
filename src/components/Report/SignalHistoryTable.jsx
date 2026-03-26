import React, { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const SignalHistoryTable = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);
    const [symbolFilter, setSymbolFilter] = useState('');
    const [tfFilter, setTfFilter] = useState('');
    const [stratFilter, setStratFilter] = useState('');

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page,
                limit: 50,
                symbol: symbolFilter,
                timeframe: tfFilter,
                strategy: stratFilter
            });
            const res = await fetch(`${API_URL}/api/signals/history?${params}`);
            const json = await res.json();
            if (json.success) {
                setHistory(json.data);
                setTotalPages(json.totalPages);
                setTotal(json.total);
            }
        } catch (err) {
            console.error('Sinyal geçmişi yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    }, [page, symbolFilter, tfFilter, stratFilter]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    return (
        <div className="history-table-container fade-in">
            <div className="history-filters">
                <div className="filter-group">
                    <input 
                        type="text" 
                        placeholder="Hisse ara (örn: THYAO)" 
                        value={symbolFilter}
                        onChange={(e) => { setSymbolFilter(e.target.value); setPage(1); }}
                        className="history-input"
                    />
                    <select 
                        value={tfFilter} 
                        onChange={(e) => { setTfFilter(e.target.value); setPage(1); }}
                        className="history-select"
                    >
                        <option value="">Tüm Zaman Dilimleri</option>
                        <option value="1h">1 Saat</option>
                        <option value="4h">4 Saat</option>
                        <option value="1d">Günlük</option>
                    </select>
                    <select 
                        value={stratFilter} 
                        onChange={(e) => { setStratFilter(e.target.value); setPage(1); }}
                        className="history-select"
                    >
                        <option value="">Tüm Stratejiler</option>
                        <option value="QQE">QQE</option>
                        <option value="Fisher-BB-EMA">Fisher-BB-EMA</option>
                        <option value="MACD">MACD</option>
                        <option value="RSI">RSI</option>
                    </select>
                </div>
                <div className="history-total-info">
                    Toplam <strong>{total}</strong> kayıt bulundu
                </div>
            </div>

            <div className="report-table-wrap">
                <table className="report-table">
                    <thead>
                        <tr>
                            <th>Tarih / Saat</th>
                            <th>Hisse</th>
                            <th>Strateji</th>
                            <th>Süre</th>
                            <th>Sinyal</th>
                            <th style={{textAlign: 'right'}}>Fiyat</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6" className="text-center p-8">Sinyaller yükleniyor...</td></tr>
                        ) : history.length === 0 ? (
                            <tr><td colSpan="6" className="text-center p-8">Kayıt bulunamadı.</td></tr>
                        ) : history.map((rec, idx) => (
                            <tr key={rec._id || idx}>
                                <td className="text-secondary" style={{fontSize: '0.8rem', whiteSpace: 'nowrap'}}>
                                    {rec.date} {rec.time}
                                </td>
                                <td className="font-bold">{rec.symbol}</td>
                                <td>{rec.strategy}</td>
                                <td>{rec.timeframe === '1h' ? '1S' : rec.timeframe === '4h' ? '4S' : 'GÜN'}</td>
                                <td>
                                    <span className={`badge ${rec.signal === 'AL' ? 'rate-good' : 'rate-bad'}`} style={{padding: '0.2rem 0.6rem', minWidth: '40px', textAlign: 'center'}}>
                                        {rec.signal}
                                    </span>
                                </td>
                                <td className="font-bold" style={{textAlign: 'right'}}>
                                    ₺{rec.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="history-pagination">
                    <button 
                        disabled={page === 1} 
                        onClick={() => setPage(p => p - 1)}
                        className="page-btn"
                    >
                        ← Önceki
                    </button>
                    <span className="page-info">Sayfa {page} / {totalPages}</span>
                    <button 
                        disabled={page === totalPages} 
                        onClick={() => setPage(p => p + 1)}
                        className="page-btn"
                    >
                        Sonraki →
                    </button>
                </div>
            )}
        </div>
    );
};

export default SignalHistoryTable;
