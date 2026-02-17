import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const useTrading = (currentUser) => {
    const [balance, setBalance] = useState(100000);
    const [portfolio, setPortfolio] = useState([]);
    const [history, setHistory] = useState([]);
    const [marketData, setMarketData] = useState([]);
    const [wealthHistory, setWealthHistory] = useState([]);
    const [botConfigs, setBotConfigs] = useState({});

    const fetchData = async () => {
        if (!currentUser) return;
        try {
            const [marketRes, userRes] = await Promise.all([
                fetch(`${API_BASE_URL}/market`),
                fetch(`${API_BASE_URL}/user/data`, {
                    headers: { 'x-user': currentUser }
                })
            ]);

            const mData = await marketRes.json();
            const uData = await userRes.json();

            if (marketRes.ok) setMarketData(mData);

            if (userRes.ok && uData && !uData.error) {
                setBalance(uData.balance ?? 100000);
                setPortfolio(uData.portfolio ?? []);
                setHistory(uData.history ?? []);
                setWealthHistory(uData.wealthHistory ?? []);
                setBotConfigs(uData.botConfigs ?? {});
            }
        } catch (error) {
            console.error('Veri çekme hatası:', error);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, [currentUser]);

    const buyStock = async (symbol, amount) => {
        if (!currentUser) return { success: false, message: 'Giriş yapılmalı.' };
        try {
            const res = await fetch(`${API_BASE_URL}/trade/buy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user': currentUser
                },
                body: JSON.stringify({ symbol, amount })
            });
            const result = await res.json();
            if (result.success) {
                fetchData();
                return { success: true };
            }
            return { success: false, message: result.message };
        } catch (error) {
            return { success: false, message: 'Sunucu hatası.' };
        }
    };

    const sellStock = async (symbol, amount) => {
        if (!currentUser) return { success: false, message: 'Giriş yapılmalı.' };
        try {
            const res = await fetch(`${API_BASE_URL}/trade/sell`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user': currentUser
                },
                body: JSON.stringify({ symbol, amount })
            });
            const result = await res.json();
            if (result.success) {
                fetchData();
                return { success: true };
            }
            return { success: false, message: result.message };
        } catch (error) {
            return { success: false, message: 'Sunucu hatası.' };
        }
    };

    const updateBotConfig = async (symbol, config) => {
        if (!currentUser) return;
        try {
            const res = await fetch(`${API_BASE_URL}/bot/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user': currentUser
                },
                body: JSON.stringify({ symbol, config })
            });
            const result = await res.json();
            if (result.success) {
                setBotConfigs(result.data);
            }
        } catch (error) {
            console.error('Bot ayarı güncelleme hatası:', error);
        }
    };

    return {
        balance,
        portfolio,
        history,
        marketData,
        wealthHistory,
        botConfigs,
        buyStock,
        sellStock,
        updateBotConfig
    };
};
