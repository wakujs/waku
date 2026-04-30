import { STATIC_RENDER_SENTINEL } from '../lib/runtime-build-static.js';
import './runtime-build-static.css';

export default function RuntimeBuildStatic() {
  return (
    <h1 className="issue-1912-static-only-css">{STATIC_RENDER_SENTINEL}</h1>
  );
}

export const getConfig = async () => ({
  render: 'static' as const,
});
