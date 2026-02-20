import React, { useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import Market from './components/Market/Market';
import TradeModal from './components/TradeModal/TradeModal';
import { useTrading } from './hooks/useTrading';
import './App.css';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line
} from 'recharts';
import History from './components/History/History';
import Bots from './components/Bots/Bots';
import Login from './components/Login/Login';
import { useEffect } from 'react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedStock, setSelectedStock] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const {
    balance,
    portfolio,
    history,
    marketData,
    wealthHistory,
    botConfigs,
    stats,
    buyStock,
    sellStock,
    updateBotConfig,
    resetAccount,
    isConnected
  } = useTrading(currentUser);

  useEffect(() => {
    const savedUser = localStorage.getItem('borsabot_user');
    if (savedUser) {
      setIsAuthenticated(true);
      setCurrentUser(savedUser);
    }
  }, []);

  const handleLogin = (username) => {
    localStorage.setItem('borsabot_user', username);
    setIsAuthenticated(true);
    setCurrentUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem('borsabot_user');
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const filteredMarket = marketData.filter(stock =>
    stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPortfolioValue = Array.isArray(portfolio) ? portfolio.reduce((acc, item) => {
    const marketInfo = marketData.find(s => s.symbol === item.symbol);
    const currentPrice = marketInfo ? marketInfo.price : 0;
    return acc + (currentPrice * item.amount);
  }, 0) : 0;

  const totalWealth = balance + totalPortfolioValue;
  const initialWealth = 100000;
  const totalProfit = totalWealth - initialWealth;
  const profitPercent = initialWealth > 0 ? ((totalProfit / initialWealth) * 100).toFixed(2) : "0.00";

  const handleBuy = async (amount) => {
    const result = await buyStock(selectedStock.symbol, amount);
    if (result.success) {
      setSelectedStock(null);
      alert('Alım işlemi başarıyla gerçekleştirildi! ✅');
    } else {
      alert(result.message);
    }
  };

  const handleSell = async (amount) => {
    const result = await sellStock(selectedStock.symbol, amount);
    if (result.success) {
      setSelectedStock(null);
      alert('Satış işlemi başarıyla gerçekleştirildi! ✅');
    } else {
      alert(result.message);
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        onReset={resetAccount}
      />
      <main className="main-content">
        <header className="header">
          <div className="header-search">
            <input
              type="text"
              placeholder="Hisse ara... (örn: THYAO)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={() => setActiveTab('market')}
            />
          </div>
          <div className="header-profile">
            {!isConnected && (
              <div className="connection-error-badge">
                Sunucu Bağlantısı Yok
              </div>
            )}
            <div className="budget-badge">
              <span className="text-secondary text-sm">Toplam Varlık</span>
              <span className="font-bold">₺{totalWealth.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </header>

        <section className="content">
          {activeTab === 'dashboard' && (
            <div className="fade-in">
              <h2 className="mb-6">Yatırımcı Paneli</h2>
              <div className="stats-grid">
                <div className="card-premium">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-secondary text-sm">Nakit Bakiye</span>
                      <h3>₺{balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <div className="stats-icon bg-accent-subtle p-2 rounded-lg">
                      💰
                    </div>
                  </div>
                  <span className="text-secondary text-xs">Kullanılabilir Tutar</span>
                </div>
                <div className="card-premium">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-secondary text-sm">Toplam Kar/Zarar</span>
                      <h3 className={totalProfit >= 0 ? 'text-success' : 'text-error'}>
                        {totalProfit >= 0 ? '+' : ''}₺{totalProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </h3>
                    </div>
                    <div className={`stats-icon p-2 rounded-lg ${totalProfit >= 0 ? 'bg-success-subtle' : 'bg-error-subtle'}`}>
                      📈
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${totalProfit >= 0 ? 'text-success' : 'text-error'}`}>
                    {totalProfit >= 0 ? '+' : ''}{profitPercent}%
                  </span>
                </div>
                <div className="card-premium">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-secondary text-sm">Aktif Pozisyonlar</span>
                      <h3>{portfolio.length} Hisse</h3>
                    </div>
                    <div className="stats-icon bg-accent-subtle p-2 rounded-lg">
                      💼
                    </div>
                  </div>
                  <span className="text-secondary text-xs">BIST Portföyü</span>
                </div>
                <div className="card-premium">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-secondary text-sm">Başarı Oranı</span>
                      <h3>%{stats?.winRate || 0}</h3>
                    </div>
                    <div className="stats-icon bg-success-subtle p-2 rounded-lg">
                      🎯
                    </div>
                  </div>
                  <span className="text-secondary text-xs">Karlı İşlem Oranı</span>
                </div>
                <div className="card-premium">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-secondary text-sm">En İyi Hisse</span>
                      <h3>{stats?.bestStock || '-'}</h3>
                    </div>
                    <div className="stats-icon bg-accent-subtle p-2 rounded-lg">
                      🏆
                    </div>
                  </div>
                  <span className="text-secondary text-xs">En Çok Kar Ettiren</span>
                </div>
              </div>

              <div className="chart-container card-premium mt-6">
                <div className="flex justify-between items-center mb-6">
                  <h4>Varlık Gelişimi</h4>
                  <div className="badge-hold rounded-full px-3 py-1 text-xs">Canlı Takip</div>
                </div>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <AreaChart data={wealthHistory}>
                      <defs>
                        <linearGradient id="colorWealth" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.9)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '12px',
                          backdropFilter: 'blur(8px)'
                        }}
                        itemStyle={{ color: '#f8fafc' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="wealth"
                        stroke="#3b82f6"
                        strokeWidth={4}
                        fillOpacity={1}
                        fill="url(#colorWealth)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card-premium mt-6">
                <h4 className="mb-4">Hızlı Takip (BIST 100)</h4>
                <div className="quick-market">
                  {marketData.slice(0, 4).map(stock => (
                    <div key={stock.symbol} className="quick-item glass">
                      <span className="font-bold">{stock.symbol}</span>
                      <span className="font-bold">₺{stock.price}</span>
                      <span className={stock.change >= 0 ? 'text-success' : 'text-error'}>
                        {stock.change >= 0 ? '▲' : '▼'} %{stock.changePercent}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'market' && (
            <Market
              stocks={filteredMarket}
              botConfigs={botConfigs}
              onUpdateBot={updateBotConfig}
              onTrade={(stock) => setSelectedStock(stock)}
            />
          )}

          {activeTab === 'portfolio' && (() => {
            // --- Portföy İstatistik Hesaplamaları ---
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfWeek = new Date(startOfDay);
            startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const parseTradeDate = (dateStr) => {
              // "dd.MM.yyyy HH:mm:ss" formatını parse et
              if (!dateStr) return null;
              const parts = dateStr.split(' ');
              if (!parts[0]) return null;
              const [day, month, year] = parts[0].split('.');
              return new Date(`${year}-${month}-${day}T${parts[1] || '00:00:00'}`);
            };

            let profitDaily = 0, profitWeekly = 0, profitMonthly = 0;
            let volumeTotal = 0;
            let commissionTotal = 0;

            (history || []).forEach(trade => {
              const tradeDate = parseTradeDate(trade.date);
              const tradeVolume = trade.amount * trade.price;
              const tradeCommission = trade.commission || 0;

              volumeTotal += tradeVolume;
              commissionTotal += tradeCommission;

              // Sadece SATIMLAR'dan kar/zarar hesaplanır
              if (trade.type === 'SATIM') {
                // Kâr = Net Gelir - (Tahmini alış maliyeti)
                // trade.total = net gelir (komisyon düşülmüş), trade.price * trade.amount = brüt satış tutarı
                // Alış maliyetini burada elimizde yoksa, gelir bazlı kâr olarak bu kısmı portföy kar/zarar ile gösterelim
                // Günlük/Haftalık/Aylık: o süredeki işlemlerden elde edilen net gelir - brüt alış maliyeti oranı
                // Burada basitçe [net gelir] kaydını gösteriyoruz (alış maliyeti avg ile)
                // Daha doğru alternatif: her satımın net geliri ekle, her alımın toplam maliyet çıkart

                if (tradeDate && tradeDate >= startOfDay) profitDaily += trade.total;
                if (tradeDate && tradeDate >= startOfWeek) profitWeekly += trade.total;
                if (tradeDate && tradeDate >= startOfMonth) profitMonthly += trade.total;
              }
              if (trade.type === 'ALIM') {
                if (tradeDate && tradeDate >= startOfDay) profitDaily -= trade.total;
                if (tradeDate && tradeDate >= startOfWeek) profitWeekly -= trade.total;
                if (tradeDate && tradeDate >= startOfMonth) profitMonthly -= trade.total;
              }
            });

            const fmt = (val) => `${val >= 0 ? '+' : ''}₺${Math.abs(val).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
            const fmtPos = (val) => val >= 0 ? 'text-success' : 'text-error';

            return (
              <div className="fade-in">
                <h2 className="mb-6">Portföyüm</h2>

                {/* İstatistik Kartları */}
                <div className="portfolio-stats-grid">
                  <div className="card-premium portfolio-stat-card">
                    <div className="portfolio-stat-icon">📅</div>
                    <span className="text-secondary text-sm">Günlük Kâr/Zarar</span>
                    <h3 className={fmtPos(profitDaily)}>{fmt(profitDaily)}</h3>
                    <span className="text-secondary text-xs">Bugünkü net işlem kârı</span>
                  </div>
                  <div className="card-premium portfolio-stat-card">
                    <div className="portfolio-stat-icon">📆</div>
                    <span className="text-secondary text-sm">Haftalık Kâr/Zarar</span>
                    <h3 className={fmtPos(profitWeekly)}>{fmt(profitWeekly)}</h3>
                    <span className="text-secondary text-xs">Bu haftaki net işlem kârı</span>
                  </div>
                  <div className="card-premium portfolio-stat-card">
                    <div className="portfolio-stat-icon">🗓️</div>
                    <span className="text-secondary text-sm">Aylık Kâr/Zarar</span>
                    <h3 className={fmtPos(profitMonthly)}>{fmt(profitMonthly)}</h3>
                    <span className="text-secondary text-xs">Bu ayki net işlem kârı</span>
                  </div>
                  <div className="card-premium portfolio-stat-card">
                    <div className="portfolio-stat-icon">📊</div>
                    <span className="text-secondary text-sm">Toplam İşlem Hacmi</span>
                    <h3>₺{volumeTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h3>
                    <span className="text-secondary text-xs">Tüm zamanlar</span>
                  </div>
                  <div className="card-premium portfolio-stat-card commission-card">
                    <div className="portfolio-stat-icon">🏦</div>
                    <span className="text-secondary text-sm">Toplam Ödenen Komisyon</span>
                    <h3 className="text-warning">₺{commissionTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h3>
                    <span className="text-secondary text-xs">%0.05 komisyon oranı</span>
                  </div>
                </div>

                {/* Portföy Tablosu */}
                <div className="card mt-6">
                  {portfolio.length === 0 ? (
                    <p className="text-secondary text-center p-6">Henüz bir hisse senediniz bulunmuyor.</p>
                  ) : (
                    <table className="portfolio-table">
                      <thead>
                        <tr>
                          <th>Hisse</th>
                          <th>Adet</th>
                          <th>Ort. Maliyet</th>
                          <th>Cari Fiyat</th>
                          <th>K/Z</th>
                          <th>İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.map(item => {
                          const marketInfo = marketData.find(s => s.symbol === item.symbol);
                          if (!marketInfo) return null;

                          const currentVal = marketInfo.price * item.amount;
                          const costVal = item.averageCost * item.amount;
                          const profit = currentVal - costVal;
                          return (
                            <tr key={item.symbol}>
                              <td>{item.symbol}</td>
                              <td>{item.amount}</td>
                              <td>₺{item.averageCost.toFixed(2)}</td>
                              <td>₺{(marketInfo.price || 0).toFixed(2)}</td>
                              <td className={profit >= 0 ? 'text-success' : 'text-error'}>
                                ₺{profit.toFixed(2)}
                              </td>
                              <td>
                                <button className="btn-small" onClick={() => setSelectedStock(marketInfo)}>
                                  Yönet
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}


          {activeTab === 'history' && (
            <History history={history} />
          )}

          {activeTab === 'bots' && (
            <Bots
              marketData={marketData}
              botConfigs={botConfigs}
              onUpdateBot={updateBotConfig}
            />
          )}
        </section>
      </main>

      {selectedStock && (
        <TradeModal
          stock={selectedStock}
          balance={balance}
          ownedAmount={portfolio.find(p => p.symbol === selectedStock.symbol)?.amount || 0}
          onBuy={handleBuy}
          onSell={handleSell}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </div>
  );
}

export default App;
