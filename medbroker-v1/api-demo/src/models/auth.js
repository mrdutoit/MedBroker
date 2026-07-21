/**
 * models/auth.js — NEW. Validation schemas for the local-auth endpoints.
 */

import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const BootstrapAdminSchema = z.object({
  bootstrapSecret: z.string().min(1),
  displayName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

export const UpdateSystemConfigSchema = z.object({
  maxCallAttempts:                z.number().int().min(1).optional(),
  leadAutoUnassignMonths:         z.number().int().min(1).optional(),
  qrTokenExpiryHours:             z.number().int().min(1).optional(),
  brokerFreeAppointmentsPerMonth: z.number().int().min(0).optional(),
  // 0 = disabled for either. Frontend presents 30/60/90/180 + custom for
  // rotation, 3/5/10 + custom for lockout — this schema just bounds sane values.
  passwordRotationDays:           z.number().int().min(0).max(3650).optional(),
  passwordLockoutAttempts:        z.number().int().min(0).max(100).optional(),
});
