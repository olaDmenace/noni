import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { agentRouter } from './routes/agent.routes.js';
import { aiRouter } from './routes/ai.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { paymentRouter } from './routes/payment.routes.js';
import { scheduleRouter } from './routes/schedule.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { subscriptionRouter } from './routes/subscription.routes.js';
import { userRouter } from './routes/user.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());

  // Webhook routes need raw body — mount BEFORE express.json().
  app.use('/v1/payments', paymentRouter);

  app.use(express.json({ limit: '64kb' }));
  app.use(pinoHttp({ logger }));
  app.use(generalLimiter);

  app.use('/', healthRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/sessions', sessionRouter);
  app.use('/v1/ai', aiRouter);
  app.use('/v1/agents', agentRouter);
  app.use('/v1/subscriptions', subscriptionRouter);
  app.use('/v1/schedule', scheduleRouter);
  app.use('/v1/users', userRouter);
  app.use('/v1/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
