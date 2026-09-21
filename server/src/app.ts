import cookieParser from 'cookie-parser';
import express from 'express';
import passport from 'passport';
import path from 'node:path';
import { configurePassport } from './auth/strategy.js';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export function createApp(): express.Express {
  const app = express();

  configurePassport();

  app.set('trust proxy', true);
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use('/api', apiRouter);
  app.use('/api', notFoundHandler);

  // The built front-end rides along, so one container is the whole thing.
  app.use(express.static(config.clientDir, { index: 'index.html' }));
  app.get('*splat', (_req, res, next) => {
    res.sendFile(path.join(config.clientDir, 'index.html'), (error) => (error ? next() : undefined));
  });

  app.use(errorHandler);
  return app;
}
