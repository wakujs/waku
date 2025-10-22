declare module 'waku/adapters/default' {
  import type { unstable_createServerEntryAdapter } from 'waku/internals';
  const default_: ReturnType<typeof unstable_createServerEntryAdapter>;
  export default default_;
}
