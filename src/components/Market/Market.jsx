import React from 'react';
import './Market.css';

const Market = ({ stocks, onTrade, botConfigs = {}, onUpdateBot }) => {
    return (
        <div className="market-container fade-in">
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
                    <span>Öneri</span>
                    <span>İşlem</span>
                </div>

                {stocks.map(stock => {
                    const rsiValue = stock.indicators?.rsi || 50;
                    const rsiColor = rsiValue > 70 ? 'text-error' : rsiValue < 30 ? 'text-success' : 'text-secondary';
                    const recommendation = stock.indicators?.recommendation || 'TUT';
                    const botConfig = botConfigs[stock.symbol] || { active: false, amount: 1 };

                    let recClass = 'badge-hold';
                    if (recommendation === 'GÜÇLÜ AL') recClass = 'badge-strong-buy';
                    else if (recommendation === 'AL') recClass = 'badge-buy';
                    else if (recommendation === 'GÜÇLÜ SAT') recClass = 'badge-strong-sell';
                    else if (recommendation === 'SAT') recClass = 'badge-sell';

                    return (
                        <div key={stock.symbol} className={`stock-row ${botConfig.active ? 'bot-active-row' : ''}`}>
                            {/* Desktop View Columns */}
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
                            <div className="stock-recommendation desktop-only">
                                <span className={`recommendation-badge ${recClass}`}>
                                    {recommendation}
                                </span>
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
                                    <span className={`recommendation-badge ${recClass}`}>
                                        {recommendation}
                                    </span>
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
