# Mafia Party Game

## Overview

This is a real-time multiplayer Mafia party game built as a full-stack web application. Players can create or join game rooms using room codes, and the game manages roles (Mafia, Detective, Doctor, Civilian), day/night phases, voting, and player eliminations through WebSocket connections for live updates.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Animations**: Framer Motion for smooth transitions and game phase animations
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a pages-based structure with reusable components. Game state is synchronized via WebSocket connections, with REST API fallback for initial data loading.

### Backend Architecture
- **Framework**: Express.js 5 on Node.js
- **Language**: TypeScript with ESM modules
- **Real-time Communication**: Native WebSocket (ws library) for game state updates
- **API Design**: REST endpoints for room creation/joining, WebSocket for live game events

The server handles game logic including role assignment, phase transitions, voting tallies, and player elimination with creative death stories.

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with Zod schema validation (drizzle-zod)
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Tables**: `rooms` (game state, settings), `players` (participants, roles, status)

### Session Management
- Session IDs stored in localStorage per room code
- Players reconnect using their sessionId via WebSocket
- No traditional auth - sessions are room-scoped identifiers

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts`: Database schemas, Zod validators, TypeScript types
- `routes.ts`: API route definitions with input/output schemas

### Build System
- Development: Vite dev server with HMR, proxied through Express
- Production: Vite builds frontend to `dist/public`, esbuild bundles server to `dist/index.cjs`
- Common dependencies are bundled to reduce cold start times

## External Dependencies

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- Connection pooling with `pg` library
- Session storage with `connect-pg-simple`

### UI Components
- Full shadcn/ui component library (Radix UI primitives)
- Lucide React for icons
- Google Fonts: Cinzel, Inter, DM Sans, Fira Code, Geist Mono

### Key Runtime Dependencies
- `ws`: WebSocket server implementation
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `zod`: Runtime type validation
- `@tanstack/react-query`: Async state management
- `framer-motion`: Animation library
- `wouter`: Client-side routing

## Recent Features Added

### Phase Timer (v1)
- **Location**: `PhaseIndicator.tsx` + `Room.tsx`
- **Functionality**: 
  - Real-time countdown shows seconds remaining in current phase
  - Timer respects role-specific durations (Mafia vs Detective vs Doctor)
  - Pulses and turns red when <= 5 seconds remaining
  - Hides during lobby and game end screens
  - Syncs with room phase/status changes
- **UI**: Displays as animated badge next to phase label in phase header

### Vote Results & Role Reveal Toggles (v1)
- **Location**: `Home.tsx` create room form + `Room.tsx` game chronicle
- **Functionality**:
  - Room creator can toggle "Vote Results" visibility (on/off at game start)
  - Room creator can toggle "Role Reveal" animation (on/off at game start)
  - Vote results show detailed breakdown ("A voted for B") in game chronicle if enabled
  - Role reveal animation plays on first night if enabled
  - Settings persist in room.settings and are respected throughout game

### Emoji Reactions (v1)
- **Location**: `ChatWindow.tsx`
- **Functionality**:
  - Hover over any chat message to reveal emoji picker
  - 8 quick reactions: 😂 🤔 👀 😱 👍 ❤️ 🎉 🔥
  - Click emoji to add/remove your reaction
  - Reactions display below messages with counter (e.g., "😂 3")
  - Click reaction pill to toggle own reaction
  - Session-based (persist during active game)

### Settings Page (v1)
- **Location**: `/settings` route, accessible from Home and Profile pages
- **Features**:
  - Dark/Light mode toggle (persists in localStorage)
  - Sound effects toggle (persists in localStorage)
  - Volume slider (0-100%, persists in localStorage)
  - Chat notifications toggle (persists in localStorage)
  - Accessible via Settings button on Home page or gear icon on Profile page

### Game Statistics Dashboard (v1)
- **Location**: Profile page, new "Role Performance" section
- **Features**:
  - Tracks wins by role (Mafia, Detective, Doctor, Civilian)
  - Shows emoji + role name + win count for each role
  - Auto-tracks role-specific wins when game ends
  - Only displays if player has played at least 1 game
  - Data persists in localStorage