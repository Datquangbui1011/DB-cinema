import axios from 'axios';
import 'dotenv/config';

const BACKEND_URL = 'http://localhost:3000';

async function testFiltering() {
    console.log("Testing CineBot filtering...");
    try {
        // Since we relaxed auth for discovery, we don't necessarily need a token for this test
        // but we'll try to find a movie we know exists vs one that doesn't have shows
        
        const response = await axios.post(`${BACKEND_URL}/api/bot/chat`, {
            message: "Show me all movies",
            history: []
        });
        
        console.log("Bot Message:", response.data.message);
        if (response.data.tool_result) {
            console.log("Filtered Movies Found:", response.data.tool_result.length);
            response.data.tool_result.forEach(m => console.log(` - ${m.title}`));
        } else {
            console.log("No movies returned in tool_result");
        }
    } catch (err) {
        console.error("Test Error:", err.message);
    }
}

testFiltering();
