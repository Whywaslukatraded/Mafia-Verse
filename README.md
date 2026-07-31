# Mafia Verse

Mafia Verse is a high-quality, free-to-play, multiplayer game based on the party game Mafia, combined with modern elements such as cosmetics. Players can create rooms, play with their friends or bots, and assign many different roles to see who wins. 


**Play Live:** [https://mafia-verse.onrender.com/](https://mafia-verse.onrender.com/)

---

## Key Features
* **Multiplayer & Bots:** Instant room creation, message updates, and synchronization across every player’s screen no matter the location. For Solo, 5 bots that can do everything a real player can.
* **Random Role Engine** Automatically assigns all players roles, and the number is matched to the room’s player count.  
* **8 Roles:** Includes the original 4 Mafia roles(Mafia, Detective, Doctor, and Civilian) plus Bodyguard, Vigilante, Jester, and Mayor.
* **3 Chats:** There are 3 chats: 1 for the entire room to talk about suspicious players, 1 for eliminated players to talk about strategy in the future, and 1 for the Mafia to communicate their attacks.
* **Daily Rewards & Cosmetics** features a **Daily Rewards** button and custom ads to earn credits, which unlock an avatar out of a 118-avatar collection. Costumes that can be unlocked in **Shop** with wins. 
* **Leaderboard:** An automated **Leaderboard** that tells players their win rate, number of games, and number of wins.
* **Language Support and Customizable UX** Contains a full Spanish version of the game and has a built-in light and dark mode switch.

---

## The Story behind Mafia Verse & Lessons Learnt 

The idea for this website started at a birthday party in January 2026. A friend of the birthday boy showed me a cool dodgeball-style game built using only a few prompts on Replit. When I looked at the game, I was eager to build a game of my own. I decided that I would create the popular game, Mafia, because a common caveat of playing it in person is that it always leads to accidental peaking during the night, which completely ruins the point of the game. I built the game with the original 4 roles used in Mafia on Replit with a customizable voting time and timer system for each role. I ran into my first roadblock when I ran out of Replit credits for a month. My dad, however, seeing the dedication I put into this game, decided to help me complete my project by giving me Replit core for a month. 

To add depth to the website, I added modern elements to the game such as a cosmetic store and costumes that could be earned or bought (certain ones). I connected **Stripe** to handle payments and also added a login and signup system with 2FA with **Clerk**. I realized that **Clerk’s** low Google Authenticator limits forced me to migrate all login and 2FA data to **Supabase**. Additionally, I added bots, a rating system, achievements, and a chat box for communication. After a lot of progress, unfortunately, my Replit membership ended, and my credits ran out. Stripe was a premium integration, and the free tier didn’t have Stripe; the database endpoints had been disabled, and I couldn’t edit my website further. I then chose to sync my code and files to GitHub and tried using similar platforms such as **Bolt.new** and **Lovable.dev**. When I tried using Bolt, it added my desired features such as a profanity filter and a referral system, but the database was completely broken, and none of the buttons worked. Lovable tried to rebuild my entire game from scratch. I was devastated, but still I wanted to finish this project. I started by opening Claude Sonnet 5, completely deleting the broken Replit database, and tried to rebuild the entire backend of my project. This left my project without a database, so I re-linked **Supabase** to handle all logins, 2FA setups and codes, and data. I also connected **Brevo** through an API key to handle account verification and the forgot password emails. 

I added new features like 4 new roles (Bodyguard, Vigilante, Jester, and Mayor), a Spanish option, a light and dark mode switch, and a Discord server. I also thought of adding custom ads that earn credits to unlock avatars, a graveyard and mafia chat, and a daily reward system. These new features made my game extremely complex and caused my logic and loops to crash. In-game, even when players voted out the Mafia (when there was only 1), the game wouldn’t end. I spent many days rewriting all the possible win/loss situations, which would fix the game’s logic. I received some feedback that the player cards were unsuitable for mobile use, so I shrunk them to fit. I added a 20-player room cap to limit the chaos and added a leaderboard that, with an API key, could delete test accounts. To help new users, I added a How to Play popup and a Mafia Handbook before finally hosting this entire project on Render. This website is made from **550+ code commits, 16 different API keys from a variety of services, and 7 months of hard work and learning**

---

## Future Steps (as of July 2026)
1. Test with my family and friends
2. Make iterations from their feedback

---

## Concepts Learnt & Platforms Used

**Concepts Learnt:** API keys, Statement descriptors, Sandboxes, Live mode, Test mode, First Contentful Paint, Largest Contentful Paint, Time to Interactive (TTI), Speed Index, Total Blocking Time (TBT), Cumulative Layout Shift (CLS), Time to First Byte (TTFB), Fully Loaded Time. 

**Platforms and Integrations Used:** Replit, Claude, Brevo, Supabase, Render, and Stripe.

---

## Speed, Performance & Making the Game responsive

I built this project ensuring that the game loads nearly instantly no matter the device and remains completely lag-free. I ran some speed tests using **GTmetrix** and **Lighthouse**, and the results showed that all speeds were below 1 second. 

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
* **Stopping Page Lag (60 FPS)** To keep the room at a stable 60 FPS even when 20 players are in 1 live room, I deleted some styling sheets that weren’t used (`@import` CSS) that were slowing down the FCP. 

## The Game’s Engine & Languages

### Frontend 
* **React & TypeScript (.tsx):** Used this combination to build live visual interfaces, such as live lobbies, live chat, and player badges. 
* **Mobile Layouts & UI Manifests:** I added custom styling sheets and web configurations so that the game looks like an application on both iOS and Android devices.
      
### Backend 
* **Node.js & WebSockets (.ts):** This handles all the players’ network connections, synchronizes the countdowns, and performs room actions, making sure that the server doesn’t crash.     
* **Database & Hosting:** I connected all user logins, accounts with 2FA, and in game logs through a secure **Supabase** layer that created my database. This was completely hosted on **Render Web Services**.    
* **Game State Management:** The server constantly checks the live status of each game and automatically switches rooms between **Day Phase** (for discussion and voting) and **Night Phase** (for role actions for certain roles) based on set timers.
* **User Data Security:** Handles player logins, signups, and 2FA via Supabase with Row-Level Security (RLS), which sends database requests through the Node.js backend server to manage 2FA and email verification without compromising user data.

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

## Prerequisites
[Node.js](https://nodejs.org) (LTS version is highly recommended) must be installed on your local computer before cloning this repository.

### Cloning and Development of this Repository 
The following commands can be run in **PowerShell** and **Command Prompt** for Windows and **Terminal** for Mac.      

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Whywaslukatraded/Mafia-Verse
   cd mafia-verse
   ```

2. **Set up local variables**
Create a `.env` file in the root directory and add your own API keys and database URLs.

3. **Install dependencies:**
   ```bash
   npm install
   ```

 
4. **Run the local development server:**
   ```bash
   npm start
   ```


## License

This project is licensed under the **MIT License**. This grants full permission for personal usage, cloning, deployment, modifications, and use of this project’s code. See the `LICENSE` file in this repository for additional terms.



                                                                                                                                                                                                     
