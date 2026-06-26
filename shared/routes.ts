import { z } from "zod";

export const api = {
  auth: {
    signup: {
      path: "/api/auth/signup" as const,
      input: z.object({
        username: z.string().min(3),
        password: z.string().min(6),
        name: z.string().min(1),
        avatar: z.string().min(1),
      }),
    },
    login: {
      path: "/api/auth/login" as const,
      input: z.object({
        username: z.string().min(3),
        password: z.string().min(6),
      }),
    },
    forgotPassword: {
      path: "/api/auth/forgot-password" as const,
      input: z.object({
        username: z.string().min(1),
      }),
    },
    resetPassword: {
      path: "/api/auth/reset-password" as const,
      input: z.object({
        token: z.string().min(1),
        newPassword: z.string().min(6),
      }),
    },
  },
  rooms: {
    create: {
      path: "/api/rooms" as const,
      input: z.object({
        name: z.string().min(1),
        avatar: z.string().min(1),
        supabaseUserId: z.string().optional(),
        avatarConfig: z.object({
          skin: z.string(),
          outfit: z.string(),
          accessory: z.string().optional(),
        }).optional(),
        settings: z.object({
          mafiaCount: z.number().min(1),
          detectiveCount: z.number().min(0),
          doctorCount: z.number().min(0),
          civilianCount: z.number().min(1),
          phaseDuration: z.number().min(10),
          mafiaDuration: z.number().min(5),
          doctorDuration: z.number().min(5),
          detectiveDuration: z.number().min(5),
          roomName: z.string().optional(),
          showVoteResults: z.boolean().optional(),
          showRoleReveal: z.boolean().optional(),
        }),
      }),
    },
    join: {
      path: "/api/rooms/join" as const,
      input: z.object({
        name: z.string().min(1),
        avatar: z.string().min(1),
        code: z.string().min(1),
        avatarConfig: z.object({
          skin: z.string(),
          outfit: z.string(),
          accessory: z.string().optional(),
        }).optional(),
        supabaseUserId: z.string().optional(),
      }),
    },
    get: {
      path: "/api/rooms/:code" as const,
    },
  },
  feedback: {
    path: "/api/feedback" as const,
  },
};