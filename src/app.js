import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './config/database.js';
import { env } from './config/environment.js';
import authRoutes from './routes/auth.routes.js';
import linkRoutes from './routes/links.routes.js';
import routineRoutes from './routes/routines.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import messageRoutes from './routes/messages.routes.js';
import nutritionRoutes from './routes/nutrition.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import { attachCsrf, verifyCsrf } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PgStore = connectPgSimple(session);
export const sessionMiddleware = session({
  store: new PgStore({ pool, tableName: 'user_sessions' }),
  name: 'gymtrack.sid',
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

export const app = express();
app.set('trust proxy', env.nodeEnv === 'production' ? 1 : false);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        frameSrc: [
          "'self'",
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com',
          'https://player.vimeo.com',
        ],
      },
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
/* Van juntos y justo después de la sesión: el primero entrega el token y el
   segundo lo exige. Antes de las rutas, para que ninguna quede sin cubrir. */
app.use(attachCsrf);
app.use(verifyCsrf);
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
  authRoutes,
);
app.use('/api/links', linkRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});
app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));
app.use('/api', notFound);
app.use(errorHandler);
