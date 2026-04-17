import { DYNAMIC_RENDER_SENTINEL } from '../lib/runtime-build-dynamic.js';

const RuntimeBuildDynamic = () => {
  return <h2>{DYNAMIC_RENDER_SENTINEL}</h2>;
};

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default RuntimeBuildDynamic;
