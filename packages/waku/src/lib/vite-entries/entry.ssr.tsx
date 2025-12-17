import renderHtmlEnhancer from 'virtual:vite-rsc-waku/render-html-enhancer';

export {
  renderHtmlStream as INTERNAL_renderHtmlStream,
  renderHtmlFallback as INTERNAL_renderHtmlFallback,
} from '../vite-rsc/ssr.js';

export async function INTERNAL_enhanceRenderHtml(
  render: () => Promise<Response>,
): Promise<Response> {
  if (renderHtmlEnhancer) {
    return renderHtmlEnhancer(render);
  }
  return render();
}
