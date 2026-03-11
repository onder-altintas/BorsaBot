require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
    const key = process.env.GEMINI_API_KEY;
    if(!key) {
        console.log("No key");
        return;
    }
    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent('Merhaba!');
        console.log(result.response.text());
    } catch(e) {
        console.log(e);
    }
}
test();
