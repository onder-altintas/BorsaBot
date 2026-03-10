import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '';
const POLL_INTERVAL = 15 * 60 * 1000; // 15 dakika

export function useKapNews(selectedSymbols = []) {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const lastFetchRef = useRef(null);
    const lastNewsIdsRef = useRef(new Set());

    const fetchNews = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);

        try {
            let url = `${API_BASE}/api/kap-news?limit=50`;
            if (selectedSymbols.length > 0) {
                url += `&symbol=${selectedSymbols.join(',')}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.success) {
                const newItems = data.data || [];

                // Yeni haberleri tespit et (ilk yüklemede sayma)
                if (lastFetchRef.current) {
                    const newIds = new Set(newItems.map(n => n._id));
                    let newCount = 0;
                    newIds.forEach(id => {
                        if (!lastNewsIdsRef.current.has(id)) newCount++;
                    });
                    if (newCount > 0) setUnreadCount(prev => prev + newCount);
                }

                lastNewsIdsRef.current = new Set(newItems.map(n => n._id));
                lastFetchRef.current = Date.now();
                setNews(newItems);
                setLastUpdated(new Date());
            }
        } catch (err) {
            setError('Haberler yüklenemedi: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedSymbols.join(',')]);

    // İlk yükleme
    useEffect(() => {
        fetchNews(false);
    }, [fetchNews]);

    // 15 dakikada bir otomatik yenileme
    useEffect(() => {
        const interval = setInterval(() => {
            fetchNews(true); // Sessiz güncelleme
        }, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchNews]);

    const markAllRead = () => setUnreadCount(0);

    return { news, loading, error, lastUpdated, unreadCount, markAllRead, refresh: () => fetchNews(false) };
}
