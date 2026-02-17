import React from 'react';
import './History.css';

const History = ({ history }) => {
    return (
        <div className="history-container fade-in">
            <div className="history-header">
                <h2>İşlem Geçmişi</h2>
                <p className="text-secondary">Tüm alım ve satım işlemlerinizin dökümü.</p>
            </div>

            <div className="card">
                {history.length === 0 ? (
                    <p className="text-secondary text-center p-6">Henüz bir işlem yapmadınız.</p>
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
                            </tr>
                        </thead>
                        <tbody>
                            {history.map(item => (
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
