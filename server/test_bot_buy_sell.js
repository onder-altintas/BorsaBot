async function testBotLogic() {
    const url = 'http://localhost:3000/api/bot/config';
    const headers = { 'Content-Type': 'application/json', 'x-user': 'testuser' };

    // First, let's configure a bot for ASELS.IS
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            symbol: 'ASELS.IS',
            config: { active: true, amount: 2, stopLoss: 5, takeProfit: 10 }
        })
    });

    console.log("Config Result:", await res.json());
}
testBotLogic();
