import { useState, useEffect, useCallback } from 'react';

const getApiBaseUrl = () => {
    // Vercel veya production ortamlarında dışarıdaki backend'e bağlanabilmek için
    // artık VITE_API_BASE_URL'i dinlemesine izin veriyoruz.
    if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
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
    const [nextFetchIn, setNextFetchIn] = useState(20);

    const fetchData = async () => {
        if (!currentUser) return;
        // Strict 5s timeout removed to accommodate Vercel cold starts which take 5-8s combined.

        try {
            const [marketRes, userRes] = await Promise.all([
                fetch(`${API_BASE_URL}/market?t=${Date.now()}`),
                fetch(`${API_BASE_URL}/user/data?t=${Date.now()}`, {
                    headers: { 'x-user': currentUser }
                })
            ]);

            if (marketRes.ok && userRes.ok) {
                setIsConnected(true);
            } else {
                console.warn('API Yanıt Hatası:', marketRes.status, userRes.status);
                setIsConnected(false);
            }

            const mData = await marketRes.json();
            const uData = await userRes.json();

            if (marketRes.ok) {
                // Backend'den gelen yeni yapıyı (version/data) veya eski yapıyı destekle
                const stocks = mData.data || mData;
                setMarketData(stocks);
                if (mData.version) {
                    window.backendVersion = mData.version; // Basitlik için window objesine atalım
                }
            }

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
            console.error('Veri çekme hatası:', error);
            setIsConnected(false);
        } finally {
            setNextFetchIn(20); // Geri sayımı sıfırla
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 20000);

        const countdownInterval = setInterval(() => {
            setNextFetchIn(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => {
            clearInterval(interval);
            clearInterval(countdownInterval);
        };
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
        nextFetchIn,
        buyStock,
        sellStock,
        updateBotConfig,
        resetAccount
    };
};
