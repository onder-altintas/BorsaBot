async function test() {
    for (let i = 0; i < 5; i++) {
        try {
            const r = await fetch('https://borsa-bot-khaki.vercel.app/api/market', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept': 'application/json',
                    'Origin': 'https://borsa-bot-khaki.vercel.app'
                }
            });
            const text = await r.text();
            console.log("STATUS:", r.status);
            try {
                const j = JSON.parse(text);
                console.log("VERSION:", j.version);
                if (j.error) console.log("FETCH_ERROR:", j.error);
                if (j.data && j.data[0]) console.log("PRICE:", j.data[0].price);
            } catch (ex) {
                console.log("BODY:", text.substring(0, 300));
            }
        } catch (e) {
            console.log("ERR:", e);
        }
    }
}
test();
