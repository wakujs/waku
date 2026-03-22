import { fsRouter as createRouter } from 'waku';
import adapter from 'waku/adapters/default';

export default adapter(createRouter({} as never));
