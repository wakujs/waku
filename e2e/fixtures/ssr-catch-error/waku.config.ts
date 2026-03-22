import { defineConfig } from 'waku/config';

export default defineConfig({
  /**
   * Base path for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscBase: 'RSC', // Just for clarification in tests
});
