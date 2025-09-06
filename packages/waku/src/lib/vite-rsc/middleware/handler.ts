import type { Middleware } from '../../types.js';
import { handleRequest } from '../handler.js';

const handler: Middleware = () => handleRequest;

export default handler;
