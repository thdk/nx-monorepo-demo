import { FastifyInstance } from 'fastify';
import { libC } from '@thdk/lib-c';
import { libB } from '@thdk/lib-b';
import { libA } from '@thdk/lib-a';

export default async function (fastify: FastifyInstance) {
  fastify.get('/', async function () {
    return { message: `Hello from ${libA()}, ${libB()}, ${libC()}` };
  });
}
