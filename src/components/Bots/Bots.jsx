import React from 'react';
import './Bots.css';

const Bots = ({ marketData, botConfigs, onUpdateBot }) => {
    return (
        <div className="bots-container fade-in">
            <div className="bots-header">
                <h2>Trading Bot Yönetimi</h2>
                <p className="text-secondary">Her hisse için otomatik alım-satım stratejilerini buradan yönetebilirsiniz.</p>
            </div>

            <div className="stock-list card">
                <div className="stock-table-header">
                    <span>Hisse</span>
                    <span>Anlık Fiyat</span>
                    <span>Öneri</span>
                    <span>Bot Durumu</span>
                    <span>İşlem Adedi</span>
                </div>

                {marketData.map(stock => {
                    const botConfig = botConfigs[stock.symbol] || { active: false, amount: 1 };
                    const recommendation = stock.indicators?.recommendation || 'TUT';

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
                            <div className="stock-recommendation">
                                <span className={`recommendation-badge ${recClass}`}>
                                    {recommendation}
                                </span>
                            </div>
                            <div className="stock-bot-status">
                                <div className="bot-toggle">
                                    <input
                                        type="checkbox"
                                        id={`bot-page-${stock.symbol}`}
                                        checked={botConfig.active}
                                        onChange={(e) => onUpdateBot(stock.symbol, { active: e.target.checked })}
                                    />
                                    <label htmlFor={`bot-page-${stock.symbol}`}>
                                        {botConfig.active ? 'Aktif' : 'Pasif'}
                                    </label>
                                </div>
                            </div>
                            <div className="stock-bot-amount">
                                <input
                                    type="number"
                                    className="bot-amount-input"
                                    value={botConfig.amount}
                                    min="1"
                                    onChange={(e) => onUpdateBot(stock.symbol, { amount: parseInt(e.target.value) || 1 })}
                                    disabled={!botConfig.active}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Bots;
