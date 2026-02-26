const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const symbols = [
    'THYAO.IS', 'ASELS.IS', 'EREGL.IS', 'KCHOL.IS', 'SASA.IS',
    'TUPRS.IS', 'SISE.IS', 'GARAN.IS', 'AKBNK.IS', 'BIMAS.IS'
];

const test = async () => {
    console.log("Starting quote fetch...");
    try {
        const quotes = await yahooFinance.quote(symbols);
        console.log("Quotes fetched:", quotes.length);

        console.log("Starting chart fetch for all symbols...");
        for (let sym of symbols) {
            console.log(`Fetching chart for ${sym}...`);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            const chartData = await yahooFinance.chart(sym, {
                period1: startDate,
                interval: '1h'
            });
            console.log(`  Done. Extracted ${chartData.quotes.length} candles.`);
        }
        console.log("All done!");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
};

test();
