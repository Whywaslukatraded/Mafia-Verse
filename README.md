# Mafia Verse

Mafia Verse is a high-quality, free-to-play, multiplayer game and is based on the party game Mafia combined with modern game elements such as cosmetics. Players can create rooms, play with their friends or bots, and assign many different roles to see who wins. 


**Play Live:** [https://mafia-verse.onrender.com/](https://mafia-verse.onrender.com/)

## How to Play
In Mafia Verse, players are secretly divided into two or three teams depending on whether there is a jester. At night, the Mafia(s) choose to eliminate a player while special roles such as Doctor, Detective, and Vigilante use their abilities to investigate, attack, and protect suspects. These special roles are with a bodyguard and a civilian to form a team. Jester tries to vote themselves out by pretending that they are the Mafia. When daytime arrives, the survivors tell their suspicions in the chat and try to execute the person behind the eliminations.

## The Story behind Mafia Verse (7 long months of determination)

### The Start
The birth of this website begins at a birthday party in Urban Air in January of 2026. During the car ride there, a friend of the birthday boy showed us all a website he built in Replit. It was a cool game that involved dodgeball with power-ups and custom abilities for hitting and dodging the ball. My curiosity got the best of me, and when I asked how he made it, he said he just gave Replit some prompts. He impressed me. I couldn’t have imagined that such an app could be made with just 15-20 prompts.

I immediately felt that I should also create my own game. I was thinking about choosing Mafia because whenever I played it with my friends or family, it is played in person and there is always someone who tries to cheat and spoil the game. I realized that this problem could be solved by putting it online to stop the cheating from happening. I created an account on Replit and started prompting. After 20-30 prompts, it built a decent prototype with the four original Mafia roles: Mafia, Doctor, Detective, and Civilian. The home screen had a rating system, custom timers for all roles plus voting, a place to change the number of players playing, achievements, bots, and chats.

### Monetization & The Credits Ending
My app kept getting new features such as a cosmetic shop, credits for new clothing, and tipping using **Stripe**. Players could earn credits through wins, but some cosmetics cost real money. I thought that I had put too much hard work into this website to not try and monetize it. I then tried setting up **Clerk** for login and signup accounts (to save progress permanently) as well as 2FA (to secure the account), but then I hit a huge problem: I ran out of Replit credits for the whole month. 

The hardest part of this phase wasn’t just the credits running out, but the pressure at home. My mom regularly told me that this was a waste of time and an excessive use of screen time. Luckily, my awesome dad, seeing my dedication, bought me Replit Core for a month to complete my project. I put a ton of effort into it, added Clerk 2FA, but quickly realized that the authenticator limits were way too low. This led me to migrate the 2FA and login/signup to **Supabase**.

Then once again disaster struck. My Replit membership had ended, so I tried to manually edit the code. However, premium integrations (like Stripe) were disabled, and I couldn’t publish it because the database endpoints were completely broken and disabled. I tried fixing the code using Google AI, but was unsuccessful. I thought that maybe I could use a similar tool to Replit, so I created a GitHub repository and synced my Replit files with code. I then exported all of this to **Bolt.new**. 

### The Platform Change (Bolt & Lovable)
Within a few prompts, Bolt added some great features like a profanity filter and a referral system. However, it destroyed my database, and none of the buttons actually work. Desperate for a working game, I went to Claude, and it suggested me to try out **Lovable.dev**. I tried it out, but within the first couple of prompts, it created a whole different game from scratch. I was devastated.

### Back to the Basics: Rebuilding with Claude Sonnet 5
I stopped relying on such platforms, completely changed my approach, and returned to Claude Sonnet. I knew that this would increase my manual work, but I thought that it would all be worth it if I could create the app. These 3 steps set up the platform for a successful website:
1. I deleted the entire broken Replit database structure.
2. I linked **Supabase** to handle all signups, logins, 2FA both code to Gmail and Google Authenticator, core data tables, and most importantly, the entire database. 
3. Slowly, I rebuilt the features back together until the whole login and referral system worked flawlessly.

I kept putting my 100%. I removed the old feedback form because I couldn’t see the real feedback from users. I kept the rating system the same and created and launched a **Discord Server** for feature suggestions, bugs, and hangouts. I also added custom ads that are optional to watch to earn credits. These credits, when earned, randomly unlocked an avatar out of the massive **118 custom avatars**. I also added a **Daily Rewards** button to keep users coming back to claim credits. 

### Fighting Logic Bugs & Polishing the UI
As I kept adding new additions, the game became very complex. I asked for feedback from my family. My dad suggested that I add another language in the U.S.; Spanish seemed like a good choice because it is the second most spoken language in the U.S. Additionally, my brother told me to add light and dark mode to vary how the game looks. I thought of adding custom audio to make the game seem better, but also making an option to turn it off. However, when I went to Claude, it kept throwing syntax errors and breaking my game loops. 

I fixed these errors through better prompting and decided to add on from the original 4 roles: **Bodyguard, Vigilante, Mayor, and Jester**. Additionally, I added the same customizable timers for them. Then, I thought of an idea: what if I add a **Graveyard Chat** where dead or voted-out players could spectate the game and talk without ruining the ongoing game. I also added a Mafia chat so that their selections could be coordinated and they could plan a strategy.

But like before, the logic was broken. Even when the town voted out the Mafia, or the detective selected the Mafia, the game still didn’t end. I spent many days planning and rewriting the win/loss conditions until they fulfilled the original game logic.

### Final UX Additions & Marketing
One evening, my dad came up to me and told me that it was very inconvenient to scroll all the way down just to see all of the players. To fix this UX issue, I reduced the size of the player cards to fit a mobile screen and added a room cap of **20-players** to limit the chaos. I also added an automated **Leaderboard** powered by an API key that allowed me to remove test accounts to show win rates, matches played, and matches won.

To help beginners play the game, I created a **How to Play** pop-up as soon as the website is opened for the very first time. Additionally, in the room, there is a detailed **Mafia Handbook** explaining tactics, phases, roles, and giving tips. I added a **Share Link** window which is capable of generating links, QR codes, or forwarding invites directly through apps installed on the device such as WhatsApp and Facebook. Finally, I added my website on **Itch.io** to open user feedback.

### Putting the final touches
To stop spam accounts, I made sure that an email was confirmed before the account was ready for 2FA setup. Additionally, I added a forgot password button which reset the password if the password was forgotten. To handle the email confirmation and password resets automatically, I first created a new email and connected the website to **Brevo’s** email service using an API key. 

After failing with Lovable, I was temporarily hosting my website on Railway, but after just 15 days, my credits were running out and would only last for 15 more days. I chose to permanently switch to **Render** to host my app. 

Every time I need or needed any iterations, I used a repetitive cycle:

I downloaded the old file from my folder -> Put it into Claude with a prompt -> Once the response was given, I downloaded the new file -> Replaced and renamed the file -> Ran ‘npm run build’ in the command prompt -> Put the commit message from the prompt and pushed to GitHub -> Waited for Render to build my app successfully.

This website is made from **550+ code commits, 16 different API keys from a variety of services, 7 months of nonstop vibe-coding perseverance, and every single piece of my commitment.**

---

## Future Steps (as of July 2026)
1. Test with my family and friends
2. Make iterations from their feedback

---

## Concepts Learnt
* **API keys:** are unique codes used by developers that connect different software. They act as a username and a password for a specific API, which acts like a messenger between the user and the system. It gives the necessary data to the system while allowing the user to perform a function, while preventing unauthorized users from abusing the data.
* **Statement descriptors:** are the text that appears on a customer’s bank statement after a purchase. It is designed by businesses so that customers don’t accidentally report payments as fraud. It usually contains the business name, a small description, and a support number.
* **Sandboxes:** are places where developers can run tests without affecting real data, and it separates from the main network to avoid any security issues or bugs.
* **Live mode:** is the real environment where financial transactions are processed, and real payments are made.
* **Test mode:** uses a fake environment where a dummy credit card number is used to make sure that when live mode is on, it processes the real payment.
* **First Contentful Paint:** is how fast the screen loads.
* **Largest Contentful Paint:** is how fast the main game board loads.
* **Time to Interactive (TTI):** is how fast you can actually click the buttons.
* **Speed Index:** is a metric that measures how quickly the parts of the page are visually filled in while it loads.
* **Total Blocking Time (TBT):** is the amount of code that is making the browser lag and freeze.
* **Cumulative Layout Shift (CLS):** is the amount of movement while movement.
* **Time to First Byte (TTFB):** is how fast Render’s server responds to a user.
* **Fully Loaded Time:** is how fast the entire app loads.

---

## Speed, Performance & Making the Game responsive

I built this project making sure that the game loads nearly instantly no matter the device and remains completely lag-free. I ran some speed tests using **GTmetrix** and **Lighthouse**, and the results showed that all speeds were below 1 second. 

### Current Speed & Performance Metrics
* **First Contentful Paint (FCP):** 839ms 
* **Largest Contentful Paint (LCP):** 839ms 
* **Time to Interactive (TTI):** 839ms 
* **Speed Index:** 782ms
* **Total Blocking Time (TBT):** 0ms 
* **Cumulative Layout Shift (CLS):** 0
* **Time to First Byte (TTFB):** 125ms 
* **Fully Loaded Time:** 840ms 

### How I Optimized the Code
* **CDN Caching (For Static Assets):** I set up Render’s Content Delivery Network (CDN), which is a global network of servers that caches, or temporarily stores files closer to where the users live. I used this for **Static Assets**(files that never change) using a 1-year cache rule, which is (`public, max-age=31536000, immutable`). Since the browser pulls these static assets instantly instead of downloading them from the main server every time, return times dropped from 1.3 seconds to under 300 ms. 
* **Zero-Cache Lobby Engine:** Even though static files should be stored, multiplayer game data should never be cached. **Zero-Cache** means making the browser forget the previous data and getting new information from the server. This prevents old lobbies from being seen by players, and I implemented a `no-store, no-cache, must-revalidate` rule on HTML and API parts. This ensures that live data such as the number of players remains accurate on all screens for every millisecond.
* **Cleaning the Code Layout:** I removed broken tags and fixed my vector graphic paths (SVG’s). This allowed the browser to read and draw the shapes given in my code while preventing errors.
* **Fixing Logic & Syntax Errors:** While coding with Claude Sonnet 5, I ran into a lot of **Syntax Errors**, which are small code mistakes such as typos or missing brackets, and it causes the entire script to crash.
* **Stopping Page Lag (60 FPS)** I deleted some styling sheets that weren’t used (`@import` CSS) that were slowing down the FCP. To keep the room at a stable 60 FPS even when 20 players are in 1 live room, I replaced the CPU with a GPU, which is the device’s graphics hardware.

## The Game’s Engine & Languages

### Frontend (What the user sees) 
* **React & TypeScript (.tsx):** I used this combination to build what the user sees, such as live lobbies, live chat, and player badges. 
* **Mobile Layouts & UI Manifests:** I added custom styling sheets and web configurations so that the game looks like an application on both iOS and Android devices.
      
### Backend (The hidden background code)    
* **Node.js & WebSockets (.ts):** This handles all the players’ network connections, synchronizes the countdowns, and performs room actions, making sure that the server doesn’t crash.     
* **Database & Hosting:** I connected all user logins, accounts with 2FA, and in game logs through a secure **Supabase** layer that created my database. This was completely hosted on **Render Web Services**.    


---

## Codebase & Ecosystem Statistics

I ran some commands in Windows PowerShell and Command Prompt to see how large the entire ecosystem is and how large my written code is.

### My Written Code
* **Total Core Lines (Physical):** 19,202 Lines
* **Raw Code Logic (Source):** 17,021 Lines
* **Core Managed Code Files:** 116 Active Script Files *(plus my media assets and configurations)*
* **Languages & Formats Present:** TSX, JSON, TS, SQL, CSS, JS, HTML, CJS, TOML, SH

#### Language Breakdown for My Code
* **TypeScript React (.tsx):** 79 Files | 12,266 Lines
* **Data & Project Configurations (.json):** 7 Files | 11,796 Lines
* **Pure TypeScript (.ts):** 25 Files | 4,615 Lines
* **Database, Environment & Tooling (.sql, .env, .replit, .sh, .toml, .cjs, .md):** 46 Files | 12,183 Lines
* **Cascading Style Sheets (.css):** 1 File | 96 Lines
* **JavaScript (.js):** 3 Files | 70 Lines
* **HyperText Markup Language (.html):** 1 File | 29 Lines

### Ecosystem Footprint (All Node Modules & Dependencies)
* **Total Project Files Managed:** 28,574 Total Files
* **Ecosystem Source Files Scanned:** 17,468 Active Code Assets
* **Total Ecosystem Lines (Physical):** 3,183,466 Lines
* **Total Active Source Code Lines:** 2,456,087 Lines
* **Total Internal Comments Block:** 630,548 Lines
* **Significance:** Even though my code is efficient, it connects with a multi-million-line ecosystem of node modules and dependency libraries to make sure that, in the background, the game is processed properly.

---

## Key Features
* **Multiplayer & Bots:** Instant room creation, message updates, and synchronization across every player’s screen no matter the location. For Solo, 5 bots that can do everything a real player can.
* **Random Role Engine** Automatically assigns all players roles, and the number is matched to the room’s player count.  

— 

## Cloning and Development of this Repository 
The following commands can be run in **PowerShell** and **Command Prompt** for Windows and **Terminal** for Mac.      

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd mafia-verse
   ```

2. **Install the dependencies:**
   ```bash
   npm install
   ```
 
3. **Run the development server:**
   ```bash
   npm start
   ```


## License

This project is licensed under the **MIT License**. This grants full permission for personal usage, cloning, deployment, modifications, and use of this project’s code. See the `LICENSE` file in this repository for additional terms.



                                                                                                                                                                                                                                    
