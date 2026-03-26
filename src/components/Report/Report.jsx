import React, { useEffect, useState, useCallback } from 'react';
import SignalHistoryTable from './SignalHistoryTable';
import './Report.css';

const API_URL = import.meta.env.VITE_API_URL || '';

const QQE_LABELS = { '1h': 'QQE 1S', '4h': 'QQE 4S', '1d': 'QQE GÜN' };
const FISHER_LABELS = { '1h': 'Fisher 1S', '4h': 'Fisher 4S', '1d': 'Fisher GÜN' };
const MACD_LABELS = { '1h': 'MACD 1S', '4h': 'MACD 4S', '1d': 'MACD GÜN' };
const RSI_LABELS = { '1h': 'RSI 1S', '4h': 'RSI 4S', '1d': 'RSI GÜN' };
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
                    {view === 'summary' && <button className="report-refresh-btn" style={{ marginLeft: '1rem' }} onClick={fetchPerformance}>↻ Yenile</button>}
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
                                            <th key={`q-${tf}`} className="col-tf" style={{ borderLeft: tf === '1h' ? '2px solid var(--border-color)' : '' }}>{QQE_LABELS[tf]}</th>
                                        ))}
                                        {TIMEFRAMES.map(tf => (
                                            <th key={`f-${tf}`} className="col-tf" style={{ borderLeft: tf === '1h' ? '2px solid var(--border-color)' : '' }}>{FISHER_LABELS[tf]}</th>
                                        ))}
                                        {TIMEFRAMES.map(tf => (
                                            <th key={`m-${tf}`} className="col-tf" style={{ borderLeft: tf === '1h' ? '2px solid var(--border-color)' : '' }}>{MACD_LABELS[tf]}</th>
                                        ))}
                                        {TIMEFRAMES.map(tf => (
                                            <th key={`r-${tf}`} className="col-tf" style={{ borderLeft: tf === '1h' ? '2px solid var(--border-color)' : '' }}>{RSI_LABELS[tf]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {symbols.map(symbol => {
                                        const stock = marketData.find(s => s.symbol === symbol);
                                        const d = perfData?.[symbol];
                                        const qqeData = d?.QQE;
                                        const fisherData = d?.['Fisher-BB-EMA'];
                                        const macdData = d?.MACD;
                                        const rsiData = d?.RSI;
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
                                                            {best.strategy === 'QQE' ? 'QQE' : best.strategy === 'MACD' ? 'MACD' : best.strategy === 'RSI' ? 'RSI' : 'Fisher+'} {best.timeframe === '1h' ? '1S' : best.timeframe === '4h' ? '4S' : 'GÜN'} · %{best.rate}
                                                        </span>
                                                    ) : (
                                                        <span className="no-data">Veri yok</span>
                                                    )}
                                                </td>
                                                {TIMEFRAMES.map(tf => (
                                                    <RateCell key={`q-${tf}`} data={qqeData?.[tf]} />
                                                ))}
                                                {TIMEFRAMES.map(tf => (
                                                    <RateCell key={`f-${tf}`} data={fisherData?.[tf]} />
                                                ))}
                                                {TIMEFRAMES.map(tf => (
                                                    <RateCell key={`m-${tf}`} data={macdData?.[tf]} />
                                                ))}
                                                {TIMEFRAMES.map(tf => (
                                                    <RateCell key={`r-${tf}`} data={rsiData?.[tf]} />
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
