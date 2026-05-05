import { DYNAMIC_RENDER_SENTINEL } from '../lib/runtime-build-dynamic.js';

export default function RuntimeBuildDynamic() {
  return <h1>{DYNAMIC_RENDER_SENTINEL}</h1>;
}

export const getConfig = async () => ({
  render: 'dynamic' as const,
});
