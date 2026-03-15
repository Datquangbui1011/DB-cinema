import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // We can't directly check quota via SDK, but we can list active models
        // and perhaps try a very simple request to check if it's currently blocked
        const models = [
            "gemini-1.5-flash", 
            "gemini-1.5-flash-8b", 
            "gemini-2.0-flash-exp",
            "gemini-pro"
        ];
        
        for (const m of models) {
            console.log(`Checking ${m}...`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("Hi");
                console.log(` - ${m} is WORKING. Response: ${result.response.text().substring(0, 20)}...`);
            } catch (err) {
                console.log(` - ${m} FAILED: ${err.message}`);
            }
        }
    } catch (err) {
        console.error("Error listing models:", err.message);
    }
}

listModels();
