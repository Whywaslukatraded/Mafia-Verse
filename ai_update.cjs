const fs = require('fs');

const filesToRead = ['server.js', 'package.json']; 

const userPrompt = `
Please update the "Free Credits" sub-page. focus entirely on a high-quality visual layout. Build a custom internal ad container styled to look like a premium digital billboard.Program the code to completely randomize which of the following four advertisements displays inside the billboard container every single time a user loads or refreshes the page:Ad 1 (Item Shop Promo): "🔥 GEAR UP IN THE SHOP! Check out the Item Shop right now to unlock exclusive limited-edition mystery costumes and special rare items before they fly off the shelves!"Ad 2 (Buy Credits Promo): "💼 NO MORE WAITING: Need credits right now for a rare item? Skip the daily limit and visit our store page to instantly buy bundles of credits securely powered by Stripe!"Ad 3 (Referral Program Promo): "📣 GROW YOUR CREW: Want even more rewards? Use our Referral System to invite your friends! Share your unique invite link with your crew to earn a massive 25 bonus credits together when they join."Ad 4 (Security Promo): "🔒 BACKUP SECURED: Your game profile is protected. Ensure your account is fully secure by linking your login profile with Google 2-Step Authentication via Supabase."Please ensure our core game logic remains securely programmed:Keep the 15-second visual countdown timer right above this billboard.Maintain the backend server rule limiting users to 5 credit claims every 24 hours.Securely award the 5 credits to the player's profile balance only when the timer successfully hits zero.Ensure the layout looks sharp and centers properly on mobile screens. also crates are still not their and bring back fahionista as a achievement
`;

async function runUpdate() {
    console.log("Reading workspace files...");
    let codeContext = "";
    filesToRead.forEach(file => {
        if (fs.existsSync(file)) {
            codeContext += `\n--- FILE: ${file} ---\n${fs.readFileSync(file, 'utf8')}\n`;
        }
    });

    console.log("Sending files directly to Qwen Coding Engine...");
    try {
        const response = await fetch('https://openrouter.ai', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openrouter/qwen/qwen-2.5-coder-32b-instruct:free',
                messages: [
                    { role: 'system', content: 'You are an expert coder. Return ONLY the fully updated, fixed code content for the files. Wrap code cleanly in markdown format.' },
                    { role: 'user', content: `Code files:\n${codeContext}\n\nInstructions:\n${userPrompt}` }
                ]
            })
        });

        const textData = await response.text();
        if (textData.trim().startsWith('<!DOCTYPE') || !response.ok) {
            throw new Error("Server overloaded with traffic.");
        }

        const data = JSON.parse(textData);
        if (data.choices && data.choices[0]) {
            console.log("\n--- FIXED CODE FROM AI ---");
            console.log(data.choices[0].message.content);
        } else {
            throw new Error("Invalid API response format.");
        }
    } catch (err) {
        console.log(`[Error]: ${err.message}. Retrying...`);
        process.exit(1);
    }
}

runUpdate();
