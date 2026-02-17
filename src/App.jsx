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
    buyStock,
    sellStock,
    updateBotConfig,
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
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
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
                <div className="card">
                  <span className="text-secondary text-sm">Nakit Bakiye</span>
                  <h3>₺{balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h3>
                  <span className="text-secondary text-sm">Kullanılabilir Tutar</span>
                </div>
                <div className="card">
                  <span className="text-secondary text-sm">Toplam Kar/Zarar</span>
                  <h3 className={totalProfit >= 0 ? 'text-success' : 'text-error'}>
                    {totalProfit >= 0 ? '+' : ''}₺{totalProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </h3>
                  <span className={`text-sm font-bold ${totalProfit >= 0 ? 'text-success' : 'text-error'}`}>
                    {totalProfit >= 0 ? '+' : ''}{profitPercent}%
                  </span>
                </div>
                <div className="card">
                  <span className="text-secondary text-sm">Aktif Pozisyonlar</span>
                  <h3>{portfolio.length} Hisse</h3>
                  <span className="text-secondary text-sm">BIST Portföyü</span>
                </div>
              </div>

              <div className="chart-container card mt-6">
                <h4 className="mb-6">Varlık Gelişimi</h4>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <AreaChart data={wealthHistory}>
                      <defs>
                        <linearGradient id="colorWealth" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                        itemStyle={{ color: '#f8fafc' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="wealth"
                        stroke="#3b82f6"
                        fillOpacity={1}
                        fill="url(#colorWealth)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card mt-6">
                <h4 className="mb-4">Hızlı Takip (BIST 100)</h4>
                <div className="quick-market">
                  {marketData.slice(0, 4).map(stock => (
                    <div key={stock.symbol} className="quick-item">
                      <span className="font-bold">{stock.symbol}</span>
                      <span className="font-bold">₺{stock.price}</span>
                      <span className={stock.change >= 0 ? 'text-success' : 'text-error'}>
                        %{stock.changePercent}
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

          {activeTab === 'portfolio' && (
            <div className="fade-in">
              <h2 className="mb-6">Portföyüm</h2>
              <div className="card">
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
                        if (!marketInfo) return null; // Skip if stock data is missing

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
          )}

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
