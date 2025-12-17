import renderHtmlEnhancer from 'virtual:vite-rsc-waku/render-html-enhancer';
import type { Unstable_RenderHtml as RenderHtml } from '../types.js';

export {
  renderHtmlStream as INTERNAL_renderHtmlStream,
  renderHtmlFallback as INTERNAL_renderHtmlFallback,
} from '../vite-rsc/ssr.js';

export async function INTERNAL_enhanceRenderHtml(renderHtml: RenderHtml) {
  if (renderHtmlEnhancer) {
    renderHtml = renderHtmlEnhancer(renderHtml);
  }
  return renderHtml;
}
