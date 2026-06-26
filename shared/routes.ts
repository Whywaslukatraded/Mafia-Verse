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
    setup2FA: {
      method: 'POST' as const,
      path: '/api/auth/2fa/setup',
      input: z.object({
        userId: z.number(),
      }),
      responses: {
        200: z.object({
          secret: z.string(),
          qrCodeUri: z.string(),
        }),
        400: z.object({ message: z.string() }),
      },
    },
    verify2FA: {
      method: 'POST' as const,
      path: '/api/auth/2fa/verify',
      input: z.object({
        userId: z.number(),
        code: z.string().length(6),
      }),
      responses: {
        200: z.object({ enabled: z.boolean() }),
        400: z.object({ message: z.string() }),
      },
    },
    disable2FA: {
      method: 'POST' as const,
      path: '/api/auth/2fa/disable',
      input: z.object({
        userId: z.number(),
        password: z.string(),
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
        }),
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

