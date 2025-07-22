import type { Middleware } from '../../config.js';
import { handleRequest } from '../entry.rsc.js';

const handler: Middleware = () => handleRequest;

export default handler;
