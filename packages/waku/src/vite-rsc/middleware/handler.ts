import type { Middleware } from '../../config.js';
import { handleRequest } from '../lib/handler.js';

const handler: Middleware = () => handleRequest;

export default handler;
