import { STATIC_RENDER_SENTINEL } from '../lib/runtime-build-static.js';

export default function RuntimeBuildStatic() {
  return <h1>{STATIC_RENDER_SENTINEL}</h1>;
}

export const getConfig = async () => ({
  render: 'static' as const,
});
