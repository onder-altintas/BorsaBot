import React, { useState, useEffect } from 'react';
import './Bots.css';

const Bots = ({ marketData, botConfigs, onUpdateBot }) => {
    const [activeTab, setActiveTab] = useState('management');
    const [, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bots-container fade-in">
            <div className="bots-header">
                <h2>Trading Bot Yönetimi</h2>
                <div className="bots-tabs">
                    <button 
                        className={`bot-tab-btn ${activeTab === 'management' ? 'active' : ''}`}
                        onClick={() => setActiveTab('management')}
                    >
                        ⚙️ Bot Yönetimi
                    </button>
                    <button 
                        className={`bot-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
                        onClick={() => setActiveTab('guide')}
                    >
                        📚 Strateji Rehberi
                    </button>
                </div>
            </div>

            {activeTab === 'management' ? (
                <div className="stock-list card fade-in">
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

                    {marketData.filter(s => !s.symbol.startsWith('XU')).map(stock => {
                        const botConfig = (botConfigs && typeof botConfigs.get === 'function'
                            ? botConfigs.get(stock.symbol)
                            : botConfigs?.[stock.symbol]) || { active: false, amount: 1 };

                        // 1. Önce veritabanındaki (backend'deki) aktif sinyali al (Botun o anki durumu bu)
                        let displaySignal = botConfig.lastSignal || 'BEKLİYOR';

                        // 2. Eğer canlı veri (marketData) varsa, indikatörlerden gelen taze sinyali kontrol et
                        const tf = botConfig.timeframe || '1h';
                        const strat = botConfig.strategy || 'QQE';
                        const stockData = marketData.find ? marketData.find(s => s.symbol === stock.symbol) : null;

                        if (stockData) {
                            const ind = stockData.indicators || {};
                            let liveSig = 'TUT';
                            if (strat === 'Fisher-BB-EMA') {
                                liveSig = tf === '4h' ? ind.fisher_4h : tf === '1d' ? ind.fisher_1d : ind.fisher_1h;
                            } else if (strat === 'MACD') {
                                liveSig = tf === '4h' ? ind.macd_4h : tf === '1d' ? ind.macd_1d : ind.macd_1h;
                            } else if (strat === 'RSI') {
                                liveSig = tf === '4h' ? ind.rsi_4h : tf === '1d' ? ind.rsi_1d : ind.rsi_1h;
                            } else {
                                liveSig = tf === '4h' ? ind.qqe_4h : tf === '1d' ? ind.qqe_1d : ind.qqe_1h;
                            }
                            
                            // Eğer canlı bir AL/SAT sinyali varsa onu göster. 
                            // Değilse (TUT ise) veritabanındaki lastSignal (AL/SAT olabilir) gösterilmeye devam eder.
                            if (liveSig === 'AL' || liveSig === 'SAT') {
                                displaySignal = liveSig;
                            }
                        }

                        // Eğer hala 'TUT' ise kullanıcıya 'BEKLİYOR' yerine 'BEKLE' veya 'TUT' gösterebiliriz ama 'BEKLİYOR' kalsın.
                        if (displaySignal === 'TUT') displaySignal = 'BEKLİYOR';


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
                                <div className="stock-bot-strategy" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <select
                                        className="bot-amount-input"
                                        style={{ width: '85px', padding: '0.2rem' }}
                                        value={botConfig.strategy || 'QQE'}
                                        onChange={(e) => onUpdateBot(stock.symbol, { strategy: e.target.value })}
                                        disabled={!botConfig.active}
                                    >
                                        <option value="QQE">QQE</option>
                                        <option value="Fisher-BB-EMA">Fisher+</option>
                                        <option value="MACD">MACD</option>
                                        <option value="RSI">RSI</option>
                                    </select>
                                    <select
                                        className="bot-amount-input"
                                        style={{ width: '65px', padding: '0.2rem' }}
                                        value={botConfig.timeframe || '1h'}
                                        onChange={(e) => onUpdateBot(stock.symbol, { timeframe: e.target.value })}
                                        disabled={!botConfig.active}
                                    >
                                        <option value="1h">1S</option>
                                        <option value="4h">4S</option>
                                        <option value="1d">GÜN</option>
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
            ) : (
                <div className="strategy-guide-grid fade-in">
                    <div className="strategy-card">
                        <div className="strategy-card-header">
                            <h3>QQE Stratejisi</h3>
                            <span className="strategy-badge">Trend Takipçisi</span>
                        </div>
                        <div className="strategy-content">
                            <section>
                                <h4>Nedir?</h4>
                                <p>Quantitative Qualitative Estimation (QQE), RSI temelli, gürültüden arındırılmış bir trend göstergesidir. Piyasadaki volatiliteyi ATR bantları kullanarak ölçer.</p>
                            </section>
                            <section>
                                <h4>Nasıl Çalışır?</h4>
                                <p>RSI'ın çoklu yumuşatılmış hali ile bir "Hızlı" ve bir "Yavaş" çizgi oluşturur. Bu çizgiler arasındaki mesafe piyasanın gücünü gösterir.</p>
                            </section>
                            <div className="signal-logic">
                                <h4>Sinyal Mantığı:</h4>
                                <ul>
                                    <li><strong>AL:</strong> Hızlı çizgi Yavaş çizgiyi yukarı kestiğinde üretilir.</li>
                                    <li><strong>SAT:</strong> Hızlı çizgi Yavaş çizgiyi aşağı kestiğinde üretilir.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="strategy-card">
                        <div className="strategy-card-header">
                            <h3>Fisher-BB-EMA</h3>
                            <span className="strategy-badge">Gelişmiş Karma</span>
                        </div>
                        <div className="strategy-content">
                            <section>
                                <h4>Nedir?</h4>
                                <p>Üç farklı indikatörün birleşimiyle çalışan güvenli bir sistemdir. Dönüş noktalarını (Fisher), volatiliteyi (BB) ve ana trendi (EMA) aynı anda kontrol eder.</p>
                            </section>
                            <section>
                                <h4>Nasıl Çalışır?</h4>
                                <p>Fiyatın Bollinger bandı dışına taşmasını, Fisher'ın aşırı uçlardan dönmesini ve 200 periyotluk EMA ile trend yönünü baz alır.</p>
                            </section>
                            <div className="signal-logic">
                                <h4>Sinyal Mantığı:</h4>
                                <ul>
                                    <li><strong>AL:</strong> Fisher dönüşü + BB Alt Bandı teyidi + Pozitif trend birleştiğinde.</li>
                                    <li><strong>SAT:</strong> Fisher zirvesi + BB Üst Bandı teyidi + Negatif trend birleştiğinde.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="strategy-card">
                        <div className="strategy-card-header">
                            <h3>MACD Filtresi</h3>
                            <span className="strategy-badge">Momentum</span>
                        </div>
                        <div className="strategy-content">
                            <section>
                                <h4>Nedir?</h4>
                                <p>Moving Average Convergence Divergence, iki hareketli ortalamanın birbirine yaklaşmasını veya uzaklaşmasını ölçen klasik bir momentum indikatörüdür.</p>
                            </section>
                            <section>
                                <h4>Nasıl Çalışır?</h4>
                                <p>12 ve 26 günlük EMA farkını (MACD Çizgisi) ve bunun 9 günlük ortalamasını (Sinyal Çizgisi) kullanır.</p>
                            </section>
                            <div className="signal-logic">
                                <h4>Sinyal Mantığı:</h4>
                                <ul>
                                    <li><strong>AL:</strong> MACD çizgisi Sinyal çizgisini yukarı kestiğinde.</li>
                                    <li><strong>SAT:</strong> MACD çizgisi Sinyal çizgisini aşağı kestiğinde.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="strategy-card">
                        <div className="strategy-card-header">
                            <h3>RSI Osilatörü</h3>
                            <span className="strategy-badge">Aşırı Alım/Satım</span>
                        </div>
                        <div className="strategy-content">
                            <section>
                                <h4>Nedir?</h4>
                                <p>Relative Strength Index, fiyatın içsel gücünü ve değişim hızını ölçer. 0-100 arasında değer alan bir osilatördür.</p>
                            </section>
                            <section>
                                <h4>Nasıl Çalışır?</h4>
                                <p>Belirli bir periyottaki ortalama kârlı ve zararlı günleri karşılaştırır. 70 seviyesi aşırı alım, 30 seviyesi aşırı satımdır.</p>
                            </section>
                            <div className="signal-logic">
                                <h4>Sinyal Mantığı:</h4>
                                <ul>
                                    <li><strong>AL:</strong> RSI 30 altından yukarı yönlü dönüp bölgesini kestiğinde.</li>
                                    <li><strong>SAT:</strong> RSI 70 üstünden aşağı yönlü dönüp bölgesini kestiğinde.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Bots;
