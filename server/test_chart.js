const yahooFinance = require('yahoo-finance2').default;

async function test() {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const chartData = await yahooFinance.chart('ASELS.IS', {
            period1: startDate,
            interval: '1h'
        });
        console.log(`Quotes length: ${chartData?.quotes?.length}`);
    } catch (e) {
        console.error("ERROR:", e);
    }
}
test();
