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

const calculateRMATV = (data, period) => {
    // TradingView RMA (used in RSI) is equivalent to EMA with alpha = 1 / period
    let rmaArray = [];
    let alpha = 1 / period;
    rmaArray[0] = data[0]; // Simple seeding, TV might use SMA for the first 'period' values

    for (let i = 1; i < data.length; i++) {
        const val = data[i] !== undefined ? data[i] : rmaArray[i - 1];
        rmaArray[i] = alpha * val + (1 - alpha) * rmaArray[i - 1];
    }
    return rmaArray;
};

const calculateRSITV = (data, period) => {
    let gains = [0];
    let losses = [0];

    for (let i = 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        gains.push(Math.max(0, change));
        losses.push(Math.max(0, -change));
    }

    let avgGains = calculateRMATV(gains, period);
    let avgLosses = calculateRMATV(losses, period);

    let rsiArray = [];
    for (let i = 0; i < data.length; i++) {
        if (avgLosses[i] === 0) {
            rsiArray.push(100);
        } else {
            let rs = avgGains[i] / avgLosses[i];
            rsiArray.push(100 - (100 / (1 + rs)));
        }
    }
    return rsiArray;
};

const calculateCustomQQE = (prices) => {
    // Pine Script Default Inputs:
    // length = 15
    // SSF = 14
    const length = 15;
    const SSF = 14;

    // RSII = ta.ema(ta.rsi(src, length), SSF)
    let rsiArr = calculateRSITV(prices, length);
    let RSII = calculateEMAArray(rsiArr, SSF);

    // TR = math.abs(RSII - RSII[1])
    let TR = [0];
    for (let i = 1; i < RSII.length; i++) {
        TR.push(Math.abs(RSII[i] - RSII[i - 1]));
    }

    // wwalpha = 1 / length
    let wwalpha = 1 / length;

    // WWMA = 0.0
    // WWMA := wwalpha * TR + (1 - wwalpha) * nz(WWMA[1])
    let WWMA = [0];
    for (let i = 1; i < TR.length; i++) {
        let prevWWMA = WWMA[i - 1] || 0;
        WWMA.push(wwalpha * TR[i] + (1 - wwalpha) * prevWWMA);
    }

    // ATRRSI = 0.0
    // ATRRSI := wwalpha * WWMA + (1 - wwalpha) * nz(ATRRSI[1])
    let ATRRSI = [0];
    for (let i = 1; i < WWMA.length; i++) {
        let prevATRRSI = ATRRSI[i - 1] || 0;
        ATRRSI.push(wwalpha * WWMA[i] + (1 - wwalpha) * prevATRRSI);
    }

    // QQEF = ta.ema(ta.rsi(src, length), SSF)  -> same as RSII
    let QQEF = RSII;

    let QUP = [];
    let QDN = [];
    let QQES = [];

    // QUP = QQEF + ATRRSI * 4.236
    // QDN = QQEF - ATRRSI * 4.236
    for (let i = 0; i < QQEF.length; i++) {
        QUP.push(QQEF[i] + ATRRSI[i] * 4.236);
        QDN.push(QQEF[i] - ATRRSI[i] * 4.236);

        if (i === 0) {
            QQES.push(0);
            continue;
        }

        let prevQQES = QQES[i - 1] || 0;
        let prevQQEF = QQEF[i - 1] || 0;

        let currentQQES = prevQQES;

        // QQES := QUP < nz(QQES[1]) ? QUP : QQEF > nz(QQES[1]) and QQEF[1] < nz(QQES[1]) ? QDN : QDN > nz(QQES[1]) ? QDN : QQEF < nz(QQES[1]) and QQEF[1] > nz(QQES[1]) ? QUP : nz(QQES[1])
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

    return { QQEF, QQES };
};

const prices = [100, 102, 101, 105, 104, 107, 106, 110, 109, 108, 105, 103, 100, 98, 97, 100, 102, 105, 106, 110, 112, 115, 114, 113, 118, 120, 119, 115, 110];
const result = calculateCustomQQE(prices);

console.log("Prices len:", prices.length);
console.log("Last 5 QQEF (Fast):", result.QQEF.slice(-5).map(v => v.toFixed(4)));
console.log("Last 5 QQES (Slow):", result.QQES.slice(-5).map(v => v.toFixed(4)));

// Sinyal (ta.crossover & ta.crossunder)
let buySignal = result.QQEF[result.QQEF.length - 1] > result.QQES[result.QQES.length - 1] && result.QQEF[result.QQEF.length - 2] <= result.QQES[result.QQES.length - 2];
let sellSignal = result.QQEF[result.QQEF.length - 1] < result.QQES[result.QQES.length - 1] && result.QQEF[result.QQEF.length - 2] >= result.QQES[result.QQES.length - 2];

console.log("Buy Signal:", buySignal);
console.log("Sell Signal:", sellSignal);
