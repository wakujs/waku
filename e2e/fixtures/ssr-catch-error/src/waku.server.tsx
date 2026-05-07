import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';
import validatorMiddleware from './middleware/validator';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.tsx')), {
  middlewareFns: [validatorMiddleware],
});
