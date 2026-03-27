import React from 'react';
import './Market.css';

const Market = ({ stocks, onTrade, botConfigs = {}, onUpdateBot }) => {
    // Endeksleri ana listeden ayır (Kendi özel kartında gösterilecek)
    const bist30 = stocks.find(s => s.symbol === 'XU030.IS');
    
    // XU ile başlayan tüm sembolleri (BIST 100, BIST 30 vb.) ana listeden çıkar
    const filteredStocks = stocks.filter(s => !s.symbol.startsWith('XU'));

    return (
        <div className="market-container fade-in">
            {bist30 && (
                <div className="index-dashboard">
                    <div className={`index-card ${bist30.change >= 0 ? 'trend-up' : 'trend-down'}`}>
                        <div className="index-card-header">
                            <span className="index-title">BIST 30 Endeksi</span>
                            <span className="index-icon">{bist30.change >= 0 ? '📈' : '📉'}</span>
                        </div>
                        <div className="index-value-container">
                            <span className="index-price">
                                {bist30.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </span>
                            <div className={`index-change-badge ${bist30.change >= 0 ? 'up' : 'down'}`}>
                                {bist30.change >= 0 ? '▲' : '▼'} %{bist30.changePercent}
                            </div>
                        </div>
                        <div className="index-card-footer">
                            <div className="live-dot"></div>
                            <span>Canlı Veri • Son Güncelleme: {new Date().toLocaleTimeString('tr-TR')}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="market-header">
                <h2>Borsa İstanbul (BIST 100)</h2>
                <p className="text-secondary">Veriler 15 dakika gecikmelidir (Simüle edildi).</p>
            </div>

            <div className="stock-list card">
                <div className="stock-table-header">
                    <span>Sembol</span>
                    <span>Fiyat</span>
                    <span>Değişim</span>
                    <span>EMA 7</span>
                    <span>RSI</span>
                    <span>BB (Üst/Alt)</span>
                    <span>Fisher</span>
                    <span>İşlem</span>
                </div>

                {filteredStocks.map(stock => {
                    const rsiValue = stock.indicators?.rsi || 50;
                    const rsiColor = rsiValue > 70 ? 'text-error' : rsiValue < 30 ? 'text-success' : 'text-secondary';
                    const botConfig = botConfigs[stock.symbol] || { active: false, amount: 1 };

                    return (
                        <div key={stock.symbol} className={`stock-row ${botConfig.active ? 'bot-active-row' : ''}`}>
                            {/* Masaüstü Görünümü Sütunları */}
                            <div className="stock-info desktop-only">
                                <span className="stock-symbol">{stock.symbol}</span>
                                <span className="stock-name text-xs text-secondary">{stock.name}</span>
                            </div>
                            <div className="stock-price font-bold desktop-only">
                                ₺{stock.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className={`stock-change desktop-only font-bold ${stock.change >= 0 ? 'text-success' : 'text-error'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.changePercent}%
                            </div>
                            <div className="stock-ema font-bold text-accent desktop-only">
                                {stock.indicators?.ema7?.toFixed(1) || '0.0'}
                            </div>
                            <div className={`stock-rsi desktop-only font-bold ${rsiColor}`}>
                                {rsiValue.toFixed(1)}
                            </div>
                            <div className="stock-bb desktop-only text-xs text-secondary">
                                <div className={stock.price >= stock.indicators?.bollinger?.upper ? 'text-error' : ''}>
                                    {stock.indicators?.bollinger?.upper?.toFixed(1) || '0.0'}
                                </div>
                                <div className={stock.price <= stock.indicators?.bollinger?.lower ? 'text-success' : ''}>
                                    {stock.indicators?.bollinger?.lower?.toFixed(1) || '0.0'}
                                </div>
                            </div>
                            <div className={`stock-fisher desktop-only font-bold text-xs ${(stock.indicators?.fisher?.val1 || 0) >= (stock.indicators?.fisher?.val2 || 0) ? 'text-success' : 'text-error'}`}>
                                {stock.indicators?.fisher?.val1?.toFixed(2) || '0.00'}/
                                {stock.indicators?.fisher?.val2?.toFixed(2) || '0.00'}
                            </div>
                            <div className="stock-actions desktop-only">
                                <button
                                    className="btn-buy"
                                    onClick={() => onTrade(stock)}
                                >
                                    İşlem
                                </button>
                            </div>

                            {/* Mobile View Card Layout */}
                            <div className="mobile-only-card">
                                <div className="card-header">
                                    <div className="stock-info">
                                        <span className="stock-symbol">{stock.symbol}</span>
                                        <span className="text-secondary text-xs">{stock.name}</span>
                                    </div>
                                    <div className="card-price-info">
                                        <div className="font-bold">₺{stock.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                                        <div className={`text-xs font-bold ${stock.change >= 0 ? 'text-success' : 'text-error'}`}>
                                            {stock.change >= 0 ? '+' : ''}{stock.changePercent}%
                                        </div>
                                    </div>
                                </div>
                                <div className="card-indicators">
                                    <div className="indicator-chip">
                                        <span className="label">EMA7</span>
                                        <span className="value text-accent">{stock.indicators?.ema7?.toFixed(1)}</span>
                                    </div>
                                    <div className="indicator-chip">
                                        <span className="label">RSI</span>
                                        <span className={`value ${rsiColor}`}>{rsiValue.toFixed(0)}</span>
                                    </div>
                                    <div className="indicator-chip">
                                        <span className="label">Fisher</span>
                                        <span className={`value ${(stock.indicators?.fisher?.val1 || 0) >= (stock.indicators?.fisher?.val2 || 0) ? 'text-success' : 'text-error'}`}>
                                            {stock.indicators?.fisher?.val1?.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                                <div className="card-footer">
                                    <button
                                        className="btn-buy"
                                        onClick={() => onTrade(stock)}
                                    >
                                        İşlem
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Market;
