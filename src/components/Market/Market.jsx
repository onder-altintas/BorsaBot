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
                    <span>Günlük Değişim</span>
                    <span>RSI (14)</span>
                    <span>SMA (5/10)</span>
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
                            <div className="stock-info">
                                <span className="stock-symbol">{stock.symbol}</span>
                                <span className="stock-name text-xs text-secondary">{stock.name}</span>
                            </div>
                            <div className="stock-price font-bold">
                                ₺{stock.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className={`stock-change ${stock.change >= 0 ? 'text-success' : 'text-error'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.changePercent}%
                            </div>
                            <div className={`stock-rsi font-bold ${rsiColor}`}>
                                {rsiValue.toFixed(1)}
                            </div>
                            <div className="stock-sma text-sm text-secondary">
                                <span className={stock.price > stock.indicators?.sma5 ? 'text-success' : 'text-error'}>
                                    {stock.indicators?.sma5.toFixed(1)}
                                </span>
                                <span className="mx-1">/</span>
                                <span>{stock.indicators?.sma10.toFixed(1)}</span>
                            </div>
                            <div className="stock-recommendation">
                                <span className={`recommendation-badge ${recClass}`}>
                                    {recommendation}
                                </span>
                            </div>
                            <div className="stock-actions">
                                <button
                                    className="btn-buy"
                                    onClick={() => onTrade(stock)}
                                >
                                    Al / Sat
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Market;
