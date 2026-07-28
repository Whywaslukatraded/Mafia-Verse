# 🍷 Mafia Verse

A high-performance, real-time multiplayer party game where players create custom rooms, assign secret roles, and compete with friends to see who can survive the night. 

**Play Live:** [https://mafia-verse.onrender.com/](https://mafia-verse.onrender.com/)


---

## 💡 The Story Behind Mafia Verse (7 Months of Grit)

### 🚗 The Spark
It all started at a birthday party. On the car ride there, the birthday boy's friend showed me an app he built in Replit—a cool dodgeball game with power-ups and custom abilities. When I asked how he did it, he said he just gave Replit some prompts. My mind was blown. 

I immediately wanted to build my own game. I chose Mafia because whenever my friends and I play it in person, someone always peeks or cheats. I realized that putting it online would automate the rules and completely stop the cheating. I opened Replit, started prompting, and built a decent prototype with the four classic roles: Mafia, Civilian, Doctor, and Detective. It even had a rating system, custom game configuration timers, achievements, and live text chats.

### 💳 Stepping Into Monetization & The Credit Wall
As the feature list grew, I added cosmetics, credits, and tipping using **Stripe**. Players could earn credits through wins, but some cosmetics cost real money—I had put too much work into this not to try and monetize it. This taught me real-world engineering concepts: API keys, statement descriptors, sandboxes, and juggling live vs. test modes. I tried setting up **Clerk** for user accounts and 2FA, but then I hit a wall: I ran out of Replit credits.

My dad, being the awesome dad he is, bought me Replit Core for a month. I grinded hard, added Clerk 2FA, but quickly realized the environment limits were too tight, so I migrated the database backend to **Supabase**. 

Then disaster struck. My Replit membership ended, and I tried to manually edit the code. Because my premium integrations (like Stripe) were disabled, the database endpoints completely broke. I tried fixing the code using Google AI, but failed. Out of options, I initialized a GitHub repository, synced my Replit codebase, and exported everything to **Bolt.new**.

### 📉 The Defeating "Platform Hop" (Bolt & Lovable)
Bolt added some great features—a profanity filter and a referral system—but its automated compiler completely shredded my database logic. The features looked pretty on screen, but none of the actual buttons worked. Desperate, I went to Claude and tried out **Lovable.dev** for a brief moment. Instead of fixing my code, Lovable tried to rebuild my entire 7-month project from scratch. I was devastated. 

### 🔧 Back to Basics: Rebuilding with Claude Sonnet
I stopped relying on automatic generation platforms, went straight back to raw Claude Sonnet, and decided to do the heavy lifting manually. 
1. I wiped the broken Replit database structures clean.
2. I linked **Supabase** from scratch to handle all signups, logins, 2FA profiles, and core data tables.
3. Slowly and painfully, I stitched the features back together until the login and referral systems worked perfectly again.

I kept pushing. I removed the old feedback form because I couldn't see the incoming logs properly, kept the rating star engine, and launched a dedicated **Discord Server** for community suggestions and hangouts. To offset operational costs, I integrated credit-earning advertisements to unlock a massive catalog of **118 custom avatars**. 

### 🐛 Fighting Logic Bugs & Engine Polish
As I pushed the game further, the complexity exploded. I built a dual-language toggle (English & Spanish), custom spatial game audio, and Light/Dark display modes. Claude Sonnet 3.5 kept throwing syntax errors, breaking my core game loops. 

I expanded the roster with 4 new game-changing roles: **Vigilante, Mayor, Jester, and Bodyguard**, building custom turn-timers for each. Then, I engineered a **Graveyard Chat** so dead or executed players could spectate and gossip without ruining the live game. 

But the logic was broken. Even when the town voted out the Mafia, the win-state wouldn't trigger. I spent nights manually mapping and rewriting the win/loss state conditions until the game rules were bulletproof. 

### 👑 Final UX Polish & Marketing
One evening, my dad came up to me and told me it was highly inconvenient to scroll so far down on a phone screen just to see the players. To fix this UX flaw, I shrunk the player asset cards down to a crisp mobile layout, capped room sizes to a chaotic **20-player limit**, and launched an automated **Leaderboard** powered by dedicated API keys that filtered out test developer accounts to show true win rates and matches played.

To help onboard beginners, I created a **How to Play** pop-up wizard and a deep **Mafia Handbook** outlining phases, tactics, and role basics. I added an advanced native device **Share Link** window capable of generating instant QR codes or forwarding invites directly via WhatsApp and Facebook. Finally, I listed the production build on **Itch.io** to open the floodgates for early users.

### 🚂 The Deployment Machine: Crossing the Finish Line
To stop spam bots and handle password resets automatically, I wired the app into **Brevo's** transactional email service. 

After the Lovable breakdown, I was hosting the server infrastructure on Railway, but after just 15 days, my credits were draining rapidly. I made the permanent executive switch to **Render Web Services**. 

My deployment process became a strict, repetitive cycle:
```text
Download updated source file ➡️ Replace & rename asset local path ➡️ Open Command Prompt ➡️ Run 'npm run build' ➡️ Push to GitHub ➡️ Wait for Render CDN to build successfully
```

This application represents **550+ code commits, 16 distinct API keys, 7 months of relentless vibe-coding dedication, and every single ounce of my commitment.**

---

## 🚀 Technical Highlights & Performance Engineering

This project was built with a strict focus on web performance, mobile responsiveness, and optimal asset delivery. Recent engineering audits brought initial rendering milestones down to elite levels.

### 📊 Current Lighthouse & Browser Performance Metrics
* **First Contentful Paint (FCP):** 895ms
* **Largest Contentful Paint (LCP):** 895ms
* **Time to Interactive (TTI):** 895ms
* **Speed Index:** 841ms
* **Total Blocking Time (TBT):** 0ms
* **Cumulative Layout Shift (CLS):** 0
* **Time to First Byte (TTFB):** 170ms
* **Fully Loaded Time:** 896ms

### ⚙️ Optimizations Implemented
* **Aggressive Edge Caching:** Tailored Render CDN header configurations using a 1-year long-term, immutable cache policy (`public, max-age=31536000, immutable`) for static assets, dropping repeat-visit load times from **1.3s to under 300ms**.
* **Zero-Cache Lobby Engine:** To protect real-time gameplay integrity, explicitly configured `no-store, no-cache, must-revalidate` directives on entry-point HTML and API layers so players always interact with a flawless, fresh game state.
* **Strict W3C Specification Compliance:** Refactored layout architecture to eliminate non-standard `http-equiv` headers and URL-encoded dynamic inline SVGs to achieve a 100% error-free validation pass.
* **Critical Rendering Path Management:** Removed render-blocking `@import` CSS layers and optimized animation code to leverage GPU-composited layers, stabilizing the interface at a smooth **60 FPS** during heavy real-time lobby state changes.

---

## 🛠️ Architecture & Tech Stack

### 💻 Frontend (Client Side)
* **Core Interface:** Built using React, TypeScript, and modern JSX components (`.tsx`) to manage real-time lobby views, player status badges, and interactive chat logs securely and type-safely.
* **Progressive Enhancements:** Configured web app manifests and cross-platform styling tweaks tailored smoothly for target iOS (`apple-mobile-web-app-capable`) and Android devices.

### ⚙️ Backend (Server Side)
* **Real-time Synchronization Engine:** Runs a persistent networking layer utilizing Node.js, TypeScript, and real-time event emitters to manage concurrent game spaces, synchronize countdown timers, and securely execute state operations without database blocking overhead.
* **Hosting Configuration:** Orchestrated and deployed completely via Render Web Services with customizable static mapping routers.

---

## 📈 Codebase & Architecture Statistics

Verified via recursive terminal diagnostics to show explicit file breakdowns, granular language distribution, and a total multi-million-line framework dependencies footprint:

### 💻 Core Project Statistics (My Written Code)
* **Total Core Lines (Physical):** 19,202 Lines
* **Raw Code Logic (Source):** 17,021 Lines
* **Core Managed Code Files:** 116 Active Script Files *(plus media and environment configurations)*
* **Languages & Formats Present:** TSX, JSON, TS, SQL, CSS, JS, HTML, CJS, TOML, SH

#### Granular Core Language Distribution
* **TypeScript React (.tsx):** 79 Files | 12,266 Lines
* **Data & Project Configurations (.json):** 7 Files | 11,796 Lines
* **Pure TypeScript (.ts):** 25 Files | 4,615 Lines
* **Database, Environment & Tooling (.sql, .env, .replit, .sh, .toml, .cjs, .md):** 46 Files | 12,183 Lines
* **Cascading Style Sheets (.css):** 1 File | 96 Lines
* **JavaScript (.js):** 3 Files | 70 Lines
* **HyperText Markup Language (.html):** 1 File | 29 Lines

### 📦 Ecosystem Footprint (Full Infrastructure & Dependencies Stack)
* **Total Project Files Managed:** 28,574 Total Files
* **Ecosystem Source Files Scanned:** 17,468 Active Code Assets
* **Total Ecosystem Lines (Physical):** 3,183,466 Lines
* **Total Active Source Code Lines:** 2,456,087 Lines
* **Total Internal Comments Block:** 630,548 Lines
* **Structural Blueprint Scale:** Powered safely through enterprise Node.js environments and runtime dependency engines.

---

## 📦 Key Features
* **Real-Time Multiplayer:** Instant room creation, synchronization, and seamless message/action propagation.
* **Dynamic Role Engine:** Automated role generation and secret assignments tailored to the room's player count.

---

## 🔧 Local Development & Installation

The installation and compilation steps below can be executed directly across **Command Prompt** (Windows), **PowerShell** (Windows), or **Terminal** (macOS):

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd mafia-verse
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server locally:**
   ```bash
   npm start
   ```

---

## 📜 License

This project is licensed under the **MIT License** — granting full permission for personal, open-source deployment, modifications, and code usage. See the `LICENSE` file in this repository for additional terms.





