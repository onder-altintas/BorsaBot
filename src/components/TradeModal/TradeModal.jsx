import React, { useState } from 'react';
import './TradeModal.css';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

const TradeModal = ({ stock, balance, ownedAmount, onBuy, onSell, onClose }) => {
    const [amount, setAmount] = useState(1);
    const totalCost = (stock.price * amount).toFixed(2);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2>{stock.symbol}</h2>
                        <p className="text-secondary">{stock.name}</p>
                    </div>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <div className="stock-mini-chart" style={{ height: 120, marginBottom: '1rem' }}>
                        <ResponsiveContainer>
                            <LineChart data={stock.priceHistory}>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                                    itemStyle={{ color: '#f8fafc' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="price"
                                    stroke={stock.change >= 0 ? '#10b981' : '#f43f5e'}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="price-info">
                        <span className="text-secondary">Cari Fiyat</span>
                        <span className="text-xl font-bold">₺{stock.price}</span>
                    </div>

                    <div className="trade-stats">
                        <div className="stat-item">
                            <span>Bakiye</span>
                            <span className="font-bold">₺{balance.toLocaleString('tr-TR')}</span>
                        </div>
                        <div className="stat-item">
                            <span>Elimde</span>
                            <span className="font-bold">{ownedAmount} Adet</span>
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Adet</label>
                        <input
                            type="number"
                            min="1"
                            value={amount}
                            onChange={e => setAmount(parseInt(e.target.value) || 0)}
                        />
                    </div>

                    <div className="total-box">
                        <span>Toplam Tutar</span>
                        <span className="text-lg font-bold">₺{parseFloat(totalCost).toLocaleString('tr-TR')}</span>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        className="btn-trade-buy"
                        disabled={amount <= 0 || parseFloat(totalCost) > balance}
                        onClick={() => onBuy(amount)}
                    >
                        Sanal Alım Yap
                    </button>
                    <button
                        className="btn-trade-sell"
                        disabled={amount <= 0 || ownedAmount < amount}
                        onClick={() => onSell(amount)}
                    >
                        Sanal Satış Yap
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TradeModal;
