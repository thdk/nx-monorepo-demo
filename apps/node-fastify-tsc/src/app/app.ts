import { FastifyInstance } from 'fastify';
import sensible from './plugins/sensible';
import rootRoute from './routes/root';

/* eslint-disable-next-line */
export interface AppOptions {}

export async function app(fastify: FastifyInstance) {
  // Load general plugins
  fastify.register(sensible);

  // Load domain/feature plugins
  // ...

  // TODO: Don't load routes here, instead load them from domain/feature plugins
  fastify.register(rootRoute);
}
