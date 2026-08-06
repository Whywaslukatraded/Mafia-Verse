// Shared role/timer presets for room creation (Home.tsx) and the in-room
// Game Settings panel (Room.tsx). Defined once, in the same field shape the
// server settings already use (mafiaCount, detectiveCount, ... — see
// CreateRoomRequest.settings in shared/schema.ts), so both screens can apply
// a preset by spreading it straight into their existing settings state
// instead of introducing a second, parallel config path.

export type RolePresetId = "classic" | "chaos" | "beginner";

export interface RolePreset {
  id: RolePresetId;
  mafiaCount: number;
  detectiveCount: number;
  doctorCount: number;
  civilianCount: number;
  bodyguardCount: number;
  vigilanteCount: number;
  mayorCount: number;
  jesterCount: number;
  phaseDuration: number;
  mafiaDuration: number;
  doctorDuration: number;
  detectiveDuration: number;
  bodyguardDuration: number;
  vigilanteDuration: number;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    // Balanced default mix — same ratios as the app's existing DEFAULT_COUNTS.
    id: "classic",
    mafiaCount: 1, detectiveCount: 1, doctorCount: 1, civilianCount: 3,
    bodyguardCount: 0, vigilanteCount: 0, mayorCount: 0, jesterCount: 0,
    phaseDuration: 30, mafiaDuration: 15, doctorDuration: 15, detectiveDuration: 15,
    bodyguardDuration: 15, vigilanteDuration: 15,
  },
  {
    // More chaotic roles (Vigilante, Jester), shorter timers for a faster,
    // higher-variance match.
    id: "chaos",
    mafiaCount: 2, detectiveCount: 1, doctorCount: 1, civilianCount: 2,
    bodyguardCount: 0, vigilanteCount: 1, mayorCount: 0, jesterCount: 1,
    phaseDuration: 20, mafiaDuration: 10, doctorDuration: 10, detectiveDuration: 10,
    bodyguardDuration: 10, vigilanteDuration: 10,
  },
  {
    // Simpler roster (no Bodyguard/Vigilante/Mayor/Jester, which add extra
    // hidden-info to track), longer timers to think.
    id: "beginner",
    mafiaCount: 1, detectiveCount: 1, doctorCount: 1, civilianCount: 5,
    bodyguardCount: 0, vigilanteCount: 0, mayorCount: 0, jesterCount: 0,
    phaseDuration: 45, mafiaDuration: 20, doctorDuration: 20, detectiveDuration: 20,
    bodyguardDuration: 20, vigilanteDuration: 20,
  },
];

export function getRolePreset(id: RolePresetId): RolePreset {
  return ROLE_PRESETS.find(p => p.id === id) || ROLE_PRESETS[0];
}
