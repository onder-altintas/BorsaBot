// QQE Prototype in JS
const prices = [100, 102, 101, 105, 104, 107, 106, 110, 109, 108, 105, 103, 100, 98, 97, 100, 102, 105, 106, 110];

const rsiLength = 15;
const ssf = 14;

// Calculate RSI correctly standard Wilder's Smoothing
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

    // Fill initial values to match array length
    for (let i = 0; i <= period; i++) {
        if (rsiArray[i] === undefined) rsiArray[i] = rsiArray[period] || 50;
    }
    return rsiArray;
};

// Calculate EMA correctly standard
const calculateEMAArray = (data, period) => {
    // PineScript ta.ema uses alpha = 2 / (period + 1)
    let emaArray = [];
    let alpha = 2 / (period + 1);
    emaArray[0] = data[0]; // Simple seeding

    for (let i = 1; i < data.length; i++) {
        // Handle undefined data gracefully
        const val = data[i] !== undefined ? data[i] : emaArray[i - 1];
        emaArray[i] = alpha * val + (1 - alpha) * emaArray[i - 1];
    }
    return emaArray;
};

let rsiRaw = calculateRSI(prices, rsiLength);
let RSII = calculateEMAArray(rsiRaw, ssf);
let QQEF = RSII; // Both are ta.ema(ta.rsi(src, length), SSF)

let TR = [0];
for (let i = 1; i < RSII.length; i++) {
    TR.push(Math.abs(RSII[i] - RSII[i - 1]));
}

let wwalpha = 1 / rsiLength;
let WWMA = [0];
for (let i = 1; i < TR.length; i++) {
    let prevWWMA = WWMA[i - 1] || 0;
    WWMA.push(wwalpha * TR[i] + (1 - wwalpha) * prevWWMA);
}

let ATRRSI = [0];
for (let i = 1; i < WWMA.length; i++) {
    let prevATRRSI = ATRRSI[i - 1] || 0;
    ATRRSI.push(wwalpha * WWMA[i] + (1 - wwalpha) * prevATRRSI);
}

let QUP = [];
let QDN = [];
let QQES = [0];

for (let i = 0; i < QQEF.length; i++) {
    QUP.push(QQEF[i] + ATRRSI[i] * 4.236);
    QDN.push(QQEF[i] - ATRRSI[i] * 4.236);

    if (i === 0) {
        QQES.push(0);
        continue;
    }

    let prevQQES = QQES[i - 1] || 0;
    let prevQQEF = QQEF[i - 1] || 0;

    let currentQQES = prevQQES; // nz(QQES[1])

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

// Ensure array alignment (QQES has one extra element due to [0] seeding offset in loop or just use standard alignment)
QQES.shift();

console.log("Prices: ", prices.length);
console.log("QQEF (Fast): ", QQEF[QQEF.length - 1]);
console.log("QQES (Slow): ", QQES[QQES.length - 1]);

let buySignal = QQEF[QQEF.length - 1] > QQES[QQES.length - 1] && QQEF[QQEF.length - 2] <= QQES[QQES.length - 2];
let sellSignal = QQEF[QQEF.length - 1] < QQES[QQES.length - 1] && QQEF[QQEF.length - 2] >= QQES[QQES.length - 2];

console.log("Buy Signal:", buySignal);
console.log("Sell Signal:", sellSignal);
