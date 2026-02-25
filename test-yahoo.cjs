const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const test = async () => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const chartData = await yahooFinance.chart('THYAO.IS', {
            period1: startDate,
            interval: '1h'
        });

        let history = chartData.quotes.map(h => ({
            time: h.date.toLocaleTimeString(),
            price: h.close,
            volume: h.volume,
            high: h.high,
            low: h.low
        }));

        let hasNulls = history.some(h => h.price === null || h.high === null || h.low === null);
        console.log("Total quotes:", history.length);
        console.log("Has nulls:", hasNulls);

        if (hasNulls) {
            console.log("Null entries:", history.filter(h => h.price === null || h.high === null || h.low === null));
        }

    } catch (e) {
        console.error(e);
    }
};

test();
