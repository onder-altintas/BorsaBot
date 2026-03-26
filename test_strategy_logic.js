// simple-test-strategy.js
const { 
    calculateEMA, 
    calculateFisherTransform, 
    calculateVolumeMomentum, 
    calculateFisherBBEMASignal 
} = require('./server/index.js');

// Mock data
const history = [];
for (let i = 0; i < 60; i++) {
    history.push({
        price: 100 + i + (i % 5 === 0 ? 5 : 0),
        high: 105 + i,
        low: 95 + i,
        volume: 1000 + (i * 10),
        time: '12:00:00'
    });
}

console.log("EMA 20:", calculateEMA(history.map(h => h.price), 20));
console.log("Fisher Transform:", calculateFisherTransform(history, 10));
console.log("Volume Momentum:", calculateVolumeMomentum(history));
console.log("Signal:", calculateFisherBBEMASignal(history));
