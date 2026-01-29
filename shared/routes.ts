import { z } from 'zod';

export const api = {
  rooms: {
    create: {
      method: 'POST' as const,
      path: '/api/rooms',
      input: z.object({
        settings: z.object({
          mafiaCount: z.number().min(1),
          detectiveCount: z.number().min(0),
          doctorCount: z.number().min(0),
          civilianCount: z.number().min(0),
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

