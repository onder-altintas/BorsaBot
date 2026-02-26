const http = require('http');

http.get('http://localhost:5000/api/market?t=1', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.data) {
                const alSignals = parsed.data.filter(s => s.indicators && s.indicators.recommendation === 'AL');
                console.log(`Current AL signals: ${alSignals.map(s => s.symbol).join(', ')}`);
                if (alSignals.length > 0) {
                    console.log("AL Signal Example:", alSignals[0].symbol, alSignals[0].indicators);
                } else {
                    console.log("No AL signals currently active in market data.");
                }
            } else {
                console.log("No data array in response.", parsed);
            }
        } catch (e) {
            console.error("Parse error:", e);
        }
    });
}).on("error", (err) => {
    console.log("Error: " + err.message);
});
