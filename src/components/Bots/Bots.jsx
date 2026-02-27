import React, { useState, useEffect } from 'react';
import './Bots.css';

const Bots = ({ marketData, botConfigs, onUpdateBot }) => {
    const [, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);
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
                    <span>Strateji</span>
                    <span>Bot Durumu</span>
                    <span>Adet</span>
                    <span>Stop-Loss</span>
                    <span>Take-Profit</span>
                </div>

                {marketData.map(stock => {
                    const botConfig = (botConfigs && typeof botConfigs.get === 'function'
                        ? botConfigs.get(stock.symbol)
                        : botConfigs?.[stock.symbol]) || { active: false, amount: 1 };

                    let displaySignal = botConfig.lastSignal;
                    if (displaySignal !== 'AL' && displaySignal !== 'SAT') displaySignal = 'BEKLİYOR';

                    let timerDisplay = '--:--';
                    if (botConfig.signalStartTime && (displaySignal === 'AL' || displaySignal === 'SAT')) {
                        const elapsed = Date.now() - botConfig.signalStartTime;
                        const totalSeconds = Math.floor(elapsed / 1000);
                        const hrs = Math.floor(totalSeconds / 3600);
                        const mins = Math.floor((totalSeconds % 3600) / 60);
                        const secs = totalSeconds % 60;

                        if (hrs > 0) {
                            timerDisplay = `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                        } else {
                            timerDisplay = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                        }
                    }

                    let recClass = 'badge-hold';
                    if (displaySignal === 'AL') recClass = 'badge-buy';
                    else if (displaySignal === 'SAT') recClass = 'badge-sell';

                    return (
                        <div key={stock.symbol} className={`stock-row ${botConfig.active ? 'bot-active-row' : ''}`}>
                            <div className="stock-info">
                                <span className="stock-symbol">{stock.symbol}</span>
                                <span className="stock-name text-xs text-secondary">{stock.name}</span>
                            </div>
                            <div className="stock-price font-bold">
                                ₺{stock.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="stock-recommendation" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                <span className={`recommendation-badge ${recClass}`}>
                                    {displaySignal}
                                </span>
                                {botConfig.active && timerDisplay !== '--:--' && (
                                    <span className="text-xs font-bold text-accent" style={{ whiteSpace: 'nowrap' }}>
                                        ⏱ {timerDisplay}
                                    </span>
                                )}
                            </div>
                            <div className="stock-bot-strategy">
                                <select
                                    className="bot-amount-input"
                                    style={{ width: '90px', padding: '0.2rem' }}
                                    value={botConfig.strategy || 'QQE'}
                                    onChange={(e) => onUpdateBot(stock.symbol, { strategy: e.target.value })}
                                    disabled={!botConfig.active}
                                >
                                    <option value="QQE">QQE</option>
                                    <option value="4COMBO">4-Combo</option>
                                </select>
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
                            <div className="stock-bot-sl">
                                <input
                                    type="number"
                                    className="bot-amount-input"
                                    placeholder="Stop %"
                                    value={botConfig.stopLoss || ''}
                                    onChange={(e) => onUpdateBot(stock.symbol, { stopLoss: parseFloat(e.target.value) || 0 })}
                                    disabled={!botConfig.active}
                                />
                            </div>
                            <div className="stock-bot-tp">
                                <input
                                    type="number"
                                    className="bot-amount-input"
                                    placeholder="Kar %"
                                    value={botConfig.takeProfit || ''}
                                    onChange={(e) => onUpdateBot(stock.symbol, { takeProfit: parseFloat(e.target.value) || 0 })}
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
