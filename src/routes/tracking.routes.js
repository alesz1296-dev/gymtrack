import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/tracking.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
const r = Router();
r.use(requireAuth);
const n = (min, max) => z.union([z.number().min(min).max(max), z.null()]).optional();
r.get('/measurements', asyncHandler(c.measurements));
r.post(
  '/measurements',
  validate(
    z.object({
      athleteId: z.uuid().optional(),
      measuredAt: z.string(),
      weightKg: n(1, 1000),
      bodyFatPercent: n(0, 100),
      waistCm: n(1, 500),
      hipCm: n(1, 500),
      chestCm: n(1, 500),
      armCm: n(1, 500),
      thighCm: n(1, 500),
      notes: z.string().max(2000).optional(),
    }),
  ),
  asyncHandler(c.addMeasurement),
);
r.get('/checkins', asyncHandler(c.checkins));
r.post(
  '/checkins',
  requireRole('athlete'),
  validate(
    z.object({
      trainerId: z.uuid(),
      checkinDate: z.string(),
      energy: z.number().int().min(1).max(10),
      sleepHours: z.number().min(0).max(24),
      stress: z.number().int().min(1).max(10),
      hunger: z.number().int().min(1).max(10),
      adherence: z.number().int().min(0).max(100),
      painDetails: z.string().max(2000).optional(),
      wins: z.string().max(2000).optional(),
      difficulties: z.string().max(2000).optional(),
    }),
  ),
  asyncHandler(c.addCheckin),
);
r.put(
  '/checkins/:id/review',
  requireRole('trainer'),
  validate(z.object({ feedback: z.string().min(1).max(3000) })),
  asyncHandler(c.review),
);
/* Los planes de alimentación vivían aquí cuando eran un solo formulario.
   Al crecer se separaron a su propio módulo, en `/api/nutrition`. */
export default r;
