import { z } from 'zod';

export const api = {
  auth: {
    signup: {
      method: 'POST' as const,
      path: '/api/auth/signup',
      input: z.object({
        username: z.string().min(3).max(20),
        password: z.string().min(6),
        name: z.string().min(1),
        avatar: z.string().min(1),
      }),
      responses: {
        201: z.object({
          userId: z.number(),
          username: z.string(),
          name: z.string(),
          avatar: z.string(),
        }),
        400: z.object({ message: z.string() }),
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/auth/login',
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.object({
          userId: z.number(),
          username: z.string(),
          name: z.string(),
          avatar: z.string(),
        }),
        401: z.object({ message: z.string() }),
      },
    },
    forgotPassword: {
      method: 'POST' as const,
      path: '/api/auth/forgot-password',
      input: z.object({
        username: z.string().min(1),
      }),
      responses: {
        200: z.object({ message: z.string(), resetToken: z.string().optional() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
    resetPassword: {
      method: 'POST' as const,
      path: '/api/auth/reset-password',
      input: z.object({
        token: z.string().min(1),
        newPassword: z.string().min(6),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
      },
    },
    // Corrected: the real endpoint keys 2FA off the Supabase auth user (a
    // string UUID), not the local numeric userId — this previously didn't
    // match server/routes.ts, which always read supabaseUserId from req.body.
    setup2FA: {
      method: 'POST' as const,
      path: '/api/auth/2fa/setup',
      input: z.object({
        supabaseUserId: z.string(),
      }),
      responses: {
        200: z.object({
          secret: z.string(),
          qrCodeUri: z.string(),
        }),
        400: z.object({ message: z.string() }),
      },
    },
    // Feature: Email 2FA option — sends a first verification code to confirm
    // the chosen email and switches the account's mfaMethod to "email".
    setup2FAEmail: {
      method: 'POST' as const,
      path: '/api/auth/2fa/setup-email',
      input: z.object({
        supabaseUserId: z.string(),
        email: z.string().email(),
      }),
      responses: {
        200: z.object({ sent: z.boolean() }),
        400: z.object({ message: z.string() }),
        503: z.object({ message: z.string() }),
      },
    },
    // Sends a fresh login-time code to an account already using email 2FA.
    sendLoginCode2FA: {
      method: 'POST' as const,
      path: '/api/auth/2fa/send-login-code',
      input: z.object({
        supabaseUserId: z.string(),
      }),
      responses: {
        200: z.object({ sent: z.boolean() }),
        400: z.object({ message: z.string() }),
        503: z.object({ message: z.string() }),
      },
    },
    verify2FA: {
      method: 'POST' as const,
      path: '/api/auth/2fa/verify',
      input: z.object({
        supabaseUserId: z.string(),
        code: z.string().length(6),
      }),
      responses: {
        200: z.object({ enabled: z.boolean() }),
        400: z.object({ message: z.string() }),
      },
    },
    status2FA: {
      method: 'GET' as const,
      path: '/api/auth/2fa/status',
      responses: {
        200: z.object({
          isEnabled: z.boolean(),
          method: z.enum(['totp', 'email']),
        }),
        400: z.object({ message: z.string() }),
      },
    },
    disable2FA: {
      method: 'POST' as const,
      path: '/api/auth/2fa/disable',
      input: z.object({
        supabaseUserId: z.string(),
      }),
      responses: {
        200: z.object({ disabled: z.boolean() }),
        400: z.object({ message: z.string() }),
      },
    },
  },
  rooms: {
    create: {
      method: 'POST' as const,
      path: '/api/rooms',
      input: z.object({
        name: z.string().min(1),
        avatar: z.string().min(1),
        avatarConfig: z.object({
          accessory: z.string().optional(),
          clothing: z.string().optional(),
          bg: z.string().optional(),
        }).optional(),
        settings: z.object({
          mafiaCount: z.number().min(1),
          detectiveCount: z.number().min(0),
          doctorCount: z.number().min(0),
          civilianCount: z.number().min(0),
          phaseDuration: z.number().min(5),
          mafiaDuration: z.number().min(5),
          doctorDuration: z.number().min(5),
          detectiveDuration: z.number().min(5),
          roomName: z.string().optional(),
          showVoteResults: z.boolean().optional(),
          showRoleReveal: z.boolean().optional(),
          // Feature: bot dialogue and server-generated system messages (kill/
          // vote-out reveals, win announcements, notifications) are localized
          // server-side based on this — sent from the client's current i18n
          // language at room-creation time so bots/system text matches the
          // language the room is actually being played in.
          language: z.enum(['en', 'es']).optional(),
          // New roles — all optional, default to 0/unused if omitted.
          bodyguardCount: z.number().min(0).optional(),
          vigilanteCount: z.number().min(0).optional(),
          mayorCount: z.number().min(0).optional(),
          jesterCount: z.number().min(0).optional(),
          bodyguardDuration: z.number().min(5).optional(),
          vigilanteDuration: z.number().min(5).optional(),
        }),
        // Ties this player record to a real signed-in account (if any) so
        // server-side activity tracking — used to gate referral payouts —
        // actually has an account to attach to. Omitted for guest play.
        supabaseUserId: z.string().optional(),
      }),
      responses: {
        201: z.object({
          code: z.string(),
          playerId: z.number(),
          sessionId: z.string(),
        }),
        400: z.object({ message: z.string() }),
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/rooms/join',
      input: z.object({
        code: z.string().min(4),
        name: z.string().min(1),
        avatar: z.string().min(1),
        supabaseUserId: z.string().optional(),
      }),
      responses: {
        200: z.object({
          code: z.string(),
          playerId: z.number(),
          sessionId: z.string(),
        }),
        404: z.object({ message: z.string() }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/rooms/:code',
      responses: {
        200: z.any(), // Returns full GameState
        404: z.object({ message: z.string() }),
      },
    },
  },
};

// Helper to build URL with params
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
