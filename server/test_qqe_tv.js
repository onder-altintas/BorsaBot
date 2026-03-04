const fs = require('fs');

const calculateRSI = (data, period) => {
    let rsiArray = [];
    if (data.length < period) return data.map(() => 50);

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    rsiArray[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        let rs = avgGain / avgLoss;
        rsiArray[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    }

    for (let i = 0; i <= period; i++) {
        if (rsiArray[i] === undefined) rsiArray[i] = rsiArray[period] || 50;
    }
    return rsiArray;
};

const calculateEMAArray = (data, period) => {
    let emaArray = [];
    let alpha = 2 / (period + 1);
    emaArray[0] = data[0];

    for (let i = 1; i < data.length; i++) {
        const val = data[i] !== undefined ? data[i] : emaArray[i - 1];
        emaArray[i] = alpha * val + (1 - alpha) * emaArray[i - 1];
    }
    return emaArray;
};

const calculateQQE = (prices) => {
    const rsiLength = 14;
    const ssf = 5;
    const qqeFactor = 4.236;

    let rsiRaw = calculateRSI(prices, rsiLength);
    let RSII = calculateEMAArray(rsiRaw, ssf);
    let QQEF = RSII;

    let TR = [0];
    for (let i = 1; i < RSII.length; i++) {
        TR.push(Math.abs(RSII[i] - RSII[i - 1]));
    }

    // dar = ema(ema(TR, 27), 27) * 4.236
    // wilders_period = 27 -> alpha = 2 / 28 = 1 / 14
    let emaPeriod = 27; // equivalent to alpha = 2/28
    let MaAtrRsi = calculateEMAArray(TR, emaPeriod);
    let dar_ema = calculateEMAArray(MaAtrRsi, emaPeriod);

    let dar = dar_ema.map(v => v * qqeFactor);

    let QUP = [];
    let QDN = [];
    let QQES = [];

    for (let i = 0; i < QQEF.length; i++) {
        QUP.push(QQEF[i] + dar[i]);
        QDN.push(QQEF[i] - dar[i]);

        if (i === 0) {
            QQES.push(0);
            continue;
        }

        let prevQQES = QQES[i - 1] || 0;
        let prevQQEF = QQEF[i - 1] || 0;

        let currentQQES = prevQQES;

        if (QUP[i] < prevQQES) {
            currentQQES = QUP[i];
        } else if (QQEF[i] > prevQQES && prevQQEF < prevQQES) {
            currentQQES = QDN[i];
        } else if (QDN[i] > prevQQES) {
            currentQQES = QDN[i];
        } else if (QQEF[i] < prevQQES && prevQQEF > prevQQES) {
            currentQQES = QUP[i];
        }

        QQES.push(currentQQES);
    }

    return { QQEF, QQES, rsiRaw, dar };
};

const prices = [100, 102, 101, 105, 104, 107, 106, 110, 109, 108, 105, 103, 100, 98, 97, 100, 102, 105, 106, 110, 112, 115, 114, 113, 118, 120, 119, 115, 110];
const result = calculateQQE(prices);

console.log("Prices len:", prices.length);
console.log("Last 5 QQEF (Fast):", result.QQEF.slice(-5).map(v => v.toFixed(4)));
console.log("Last 5 QQES (Slow):", result.QQES.slice(-5).map(v => v.toFixed(4)));

// Sinyal
let buySignal = result.QQEF[result.QQEF.length - 1] > result.QQES[result.QQES.length - 1] && result.QQEF[result.QQEF.length - 2] <= result.QQES[result.QQES.length - 2];
let sellSignal = result.QQEF[result.QQEF.length - 1] < result.QQES[result.QQES.length - 1] && result.QQEF[result.QQEF.length - 2] >= result.QQES[result.QQES.length - 2];

console.log("Buy Signal:", buySignal);
console.log("Sell Signal:", sellSignal);
