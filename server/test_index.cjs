const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function testIndex() {
    try {
        const quote = await yahooFinance.quote('XU100.IS');
        console.log('BIST 100:', quote.regularMarketPrice, quote.regularMarketChangePercent);
        
        const quote30 = await yahooFinance.quote('XU030.IS');
        console.log('BIST 30:', quote30.regularMarketPrice, quote30.regularMarketChangePercent);
    } catch (err) {
        console.error('Error:', err);
    }
}

testIndex();
