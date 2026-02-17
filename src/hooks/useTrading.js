import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const useTrading = () => {
    const [balance, setBalance] = useState(100000.00);
    const [portfolio, setPortfolio] = useState([]);
    const [history, setHistory] = useState([]);
    const [marketData, setMarketData] = useState([]);
    const [wealthHistory, setWealthHistory] = useState([]);
    const [botConfigs, setBotConfigs] = useState({});

    const fetchData = useCallback(async () => {
        try {
            const [marketRes, userRes] = await Promise.all([
                fetch(`${API_BASE_URL}/market`),
                fetch(`${API_BASE_URL}/user/data`)
            ]);

            const marketJson = await marketRes.json();
            const userJson = await userRes.json();

            setMarketData(marketJson);
            setBalance(userJson.balance);
            setPortfolio(userJson.portfolio);
            setHistory(userJson.history);
            setWealthHistory(userJson.wealthHistory);
            setBotConfigs(userJson.botConfigs);
        } catch (error) {
            console.error('Failed to fetch data from server:', error);
        }
    }, []);

    // Initial fetch and periodic refresh
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const buyStock = async (symbol, amount) => {
        try {
            const res = await fetch(`${API_BASE_URL}/trade/buy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        try {
            const res = await fetch(`${API_BASE_URL}/trade/sell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        try {
            const res = await fetch(`${API_BASE_URL}/bot/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, config })
            });
            const result = await res.json();
            if (result.success) {
                fetchData();
            }
        } catch (error) {
            console.error('Failed to update bot config:', error);
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
