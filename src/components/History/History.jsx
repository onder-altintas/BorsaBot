import React, { useState } from 'react';
import './History.css';

const History = ({ history }) => {
    const [filterText, setFilterText] = useState('');

    const filteredHistory = history.filter(item =>
        item.symbol.toLowerCase().includes(filterText.toLowerCase())
    );

    return (
        <div className="history-container fade-in">
            <div className="history-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2>İşlem Geçmişi</h2>
                    <p className="text-secondary">Tüm alım ve satım işlemlerinizin dökümü.</p>
                </div>
                <div className="history-filter">
                    <input
                        type="text"
                        placeholder="Hisse ara (örn. THYAO)..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="market-search" // Reusing standard search input style
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)', outline: 'none' }}
                    />
                </div>
            </div>

            <div className="card">
                {filteredHistory.length === 0 ? (
                    <p className="text-secondary text-center p-6">
                        {history.length === 0 ? "Henüz bir işlem yapmadınız." : "Arama kriterinize uygun işlem bulunamadı."}
                    </p>
                ) : (
                    <table className="history-table">
                        <thead>
                            <tr>
                                <th>Tarih</th>
                                <th>Tür</th>
                                <th>Hisse</th>
                                <th>Adet</th>
                                <th>Fiyat</th>
                                <th>Toplam</th>
                                <th>Sinyal / Neden</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredHistory.map(item => (
                                <tr key={item.id}>
                                    <td className="text-sm text-secondary">{item.date}</td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span className={`badge ${item.type === 'ALIM' ? 'badge-buy' : 'badge-sell'}`}>
                                                {item.type}
                                            </span>
                                            {item.isAuto && <span className="badge-auto">OTOMATİK</span>}
                                        </div>
                                    </td>
                                    <td className="font-bold">{item.symbol}</td>
                                    <td>{item.amount}</td>
                                    <td>₺{item.price.toFixed(2)}</td>
                                    <td className="font-bold">₺{item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                    <td className="text-sm">
                                        <span className="reason-text">{item.reason || '-'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default History;
