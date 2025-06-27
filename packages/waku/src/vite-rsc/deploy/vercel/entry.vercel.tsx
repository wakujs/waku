import { getRequestListener } from '@hono/node-server';
import { app } from '../../entry.rsc.node.js';

export default getRequestListener(app.fetch);
