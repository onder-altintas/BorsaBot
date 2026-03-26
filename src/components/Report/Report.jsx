import React, { useEffect, useState, useCallback } from 'react';
import SignalHistoryTable from './SignalHistoryTable';
import './Report.css';

const API_URL = import.meta.env.VITE_API_URL || '';

const TF_LABELS = { '1h': 'QQE 1S', '4h': 'QQE 4S', '1d': 'QQE Günlük' };
const TIMEFRAMES = ['1h', '4h', '1d'];

const getRateClass = (rate) => {
    if (rate === null) return '';
    if (rate >= 60) return 'rate-good';
    if (rate >= 40) return 'rate-mid';
    return 'rate-bad';
};

const RateCell = ({ data }) => {
    if (!data || data.total === 0) {
        return <td className="rate-cell rate-empty">—</td>;
    }
    const { success, fail, open, rate } = data;
    return (
        <td className={`rate-cell ${getRateClass(rate)}`}>
            <span className="rate-pct">%{rate}</span>
            <span className="rate-detail">{success}✓ {fail}✗{open > 0 ? ` +${open}açık` : ''}</span>
        </td>
    );
};

const Report = ({ marketData }) => {
    const [view, setView] = useState('summary'); // 'summary' veya 'history'
    const [selectedStrategy, setSelectedStrategy] = useState('QQE'); // 'QQE' veya 'Fisher-BB-EMA'
    const [perfData, setPerfData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchPerformance = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/signals/performance`);
            const json = await res.json();
            if (json.success) {
                setPerfData(json.data);
                setLastUpdated(new Date().toLocaleTimeString('tr-TR'));
            }
        } catch (err) {
            console.error('Performans verisi alınamadı:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPerformance();
        const interval = setInterval(fetchPerformance, 60000); // 1 dk'da bir güncelle
        return () => clearInterval(interval);
    }, [fetchPerformance]);

    const symbols = marketData?.map(s => s.symbol) || [];

    return (
        <div className="report-container">
            <div className="report-header">
                <h2>📊 Strateji Raporu</h2>
                <div className="report-meta">
                    <span>QQE · AL→SAT çifti başarı analizi</span>
                    {lastUpdated && view === 'summary' && <span className="report-updated">Son güncelleme: {lastUpdated}</span>}
                    <div className="report-tabs">
                        <button 
                            className={`report-tab-btn ${view === 'summary' ? 'active' : ''}`}
                            onClick={() => setView('summary')}
                        >
                            📊 Başarı Oranları
                        </button>
                        <button 
                            className={`report-tab-btn ${view === 'history' ? 'active' : ''}`}
                            onClick={() => setView('history')}
                        >
                            📜 Sinyal Geçmişi
                        </button>
                    </div>
                    {view === 'summary' && (
                        <select 
                            className="strategy-select-minimal"
                            value={selectedStrategy}
                            onChange={(e) => setSelectedStrategy(e.target.value)}
                            style={{ marginLeft: '1rem', padding: '0.3rem', borderRadius: '4px', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                        >
                            <option value="QQE">Strateji: QQE</option>
                            <option value="Fisher-BB-EMA">Strateji: Fisher+</option>
                        </select>
                    )}
                    {view === 'summary' && <button className="report-refresh-btn" style={{ marginLeft: '0.5rem' }} onClick={fetchPerformance}>↻ Yenile</button>}
                </div>
            </div>

            {view === 'summary' ? (
                loading ? (
                    <div className="report-loading">
                        <div className="spinner" />
                        <p>Veriler yükleniyor…</p>
                    </div>
                ) : (
                    <>
                        <div className="report-legend">
                            <span className="badge rate-good">%60+ Başarılı</span>
                            <span className="badge rate-mid">%40–59 Orta</span>
                            <span className="badge rate-bad">%0–39 Zayıf</span>
                            <span className="badge rate-empty">— Veri yok</span>
                        </div>

                        <div className="report-table-wrap">
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th className="col-symbol">Hisse</th>
                                        <th className="col-best">🏆 En İyi Strateji</th>
                                        {TIMEFRAMES.map(tf => (
                                            <th key={tf} className="col-tf">{TF_LABELS[tf]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {symbols.map(symbol => {
                                        const stock = marketData.find(s => s.symbol === symbol);
                                        const d = perfData?.[symbol];
                                        const stratData = d?.[selectedStrategy];
                                        const best = d?.best;
                                        const shortName = stock?.name || symbol.replace('.IS', '');

                                        return (
                                            <tr key={symbol}>
                                                <td className="col-symbol-cell">
                                                    <span className="symbol-name">{shortName}</span>
                                                    <span className="symbol-code">{symbol}</span>
                                                </td>
                                                <td className="col-best-cell">
                                                    {best ? (
                                                        <span className={`best-badge ${getRateClass(best.rate)}`}>
                                                            {best.strategy === 'QQE' ? 'QQE' : 'Fisher+'} {TF_LABELS[best.timeframe].split(' ')[1]} · %{best.rate}
                                                        </span>
                                                    ) : (
                                                        <span className="no-data">Veri yok</span>
                                                    )}
                                                </td>
                                                {TIMEFRAMES.map(tf => (
                                                    <RateCell key={tf} data={stratData?.[tf]} />
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="report-info">
                            <p>ℹ️ Başarı = SAT fiyatı &gt; AL fiyatı + komisyon (%0.1 toplam). Açık pozisyonlar hesaba katılmaz.</p>
                            <p>⏳ SignalHistory tablosu yeni kuruldu — oran hesabı için AL→SAT çiftleri birikmesi gerekir.</p>
                        </div>
                    </>
                )
            ) : (
                <SignalHistoryTable />
            )}
        </div>
    );
};

export default Report;
