import { defineConfig } from "waku/config"

export default defineConfig({
  vite: {
    environments: {
      ssr: {
        build: {
          rollupOptions: {
            input: {
              __server_html: "./src/server-html/ssr.ts",
            }
          }
        }
      }
    }
  }
})
