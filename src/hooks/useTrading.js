import { useState, useEffect, useCallback } from 'react';

const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
    // Vercel'de çalışıyorsa veya production build ise mevcut host üzerinden /api'ye gider
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return '/api';
    }
    return 'http://localhost:5000/api';
};

const API_BASE_URL = getApiBaseUrl();

export const useTrading = (currentUser) => {
    const [balance, setBalance] = useState(100000);
    const [portfolio, setPortfolio] = useState([]);
    const [history, setHistory] = useState([]);
    const [marketData, setMarketData] = useState([]);
    const [wealthHistory, setWealthHistory] = useState([]);
    const [wealthSnapshots, setWealthSnapshots] = useState({});
    const [botConfigs, setBotConfigs] = useState({});
    const [stats, setStats] = useState({ winRate: 0, bestStock: '-', totalTrades: 0 });
    const [isConnected, setIsConnected] = useState(true);

    const fetchData = async () => {
        if (!currentUser) return;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 saniye zaman aşımı

        try {
            const [marketRes, userRes] = await Promise.all([
                fetch(`${API_BASE_URL}/market?t=${Date.now()}`, { signal: controller.signal }),
                fetch(`${API_BASE_URL}/user/data?t=${Date.now()}`, {
                    headers: { 'x-user': currentUser },
                    signal: controller.signal
                })
            ]);

            clearTimeout(timeoutId);

            if (marketRes.ok && userRes.ok) {
                setIsConnected(true);
            } else {
                console.warn('API Yanıt Hatası:', marketRes.status, userRes.status);
                setIsConnected(false);
            }

            const mData = await marketRes.json();
            const uData = await userRes.json();

            if (marketRes.ok) setMarketData(mData);

            if (userRes.ok && uData && !uData.error) {
                setBalance(uData.balance ?? 100000);
                setPortfolio(uData.portfolio ?? []);
                setHistory(uData.history ?? []);
                setWealthHistory(uData.wealthHistory ?? []);
                setWealthSnapshots(uData.wealthSnapshots ?? {});
                setBotConfigs(uData.botConfigs ?? {});
                setStats(uData.stats ?? { winRate: 0, bestStock: '-', totalTrades: 0 });
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.error('İstek zaman aşımına uğradı (Timeout).');
            } else {
                console.error('Veri çekme hatası:', error);
            }
            setIsConnected(false);
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

    const resetAccount = async () => {
        if (!currentUser) return { success: false, message: 'Giriş yapılmalı.' };
        try {
            const res = await fetch(`${API_BASE_URL}/user/reset`, {
                method: 'POST',
                headers: { 'x-user': currentUser }
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

    return {
        balance,
        portfolio,
        history,
        marketData,
        wealthHistory,
        wealthSnapshots,
        botConfigs,
        stats,
        isConnected,
        buyStock,
        sellStock,
        updateBotConfig,
        resetAccount
    };
};
