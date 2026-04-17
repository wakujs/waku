import { STATIC_RENDER_SENTINEL } from '../lib/runtime-build-static.js';

const RuntimeBuildStatic = () => {
  return <h2>{STATIC_RENDER_SENTINEL}</h2>;
};

export const getConfig = () => {
  return {
    render: 'static',
  } as const;
};

export default RuntimeBuildStatic;
