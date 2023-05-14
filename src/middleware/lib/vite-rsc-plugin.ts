import type { Plugin } from "vite";
import * as RSDWNodeLoader from "react-server-dom-webpack/node-loader";

export const rscPlugin = (): Plugin => {
  return {
    name: "rsc-plugin",
    async resolveId(id, importer, options) {
      if (!id.endsWith(".js")) {
        return id;
      }
      for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
        const resolved = await this.resolve(id.slice(0, -3) + ext, importer, {
          ...options,
          skipSelf: true,
        });
        if (resolved) {
          return resolved;
        }
      }
    },
    async transform(code, id) {
      const resolve = async (
        specifier: string,
        { parentURL }: { parentURL: string }
      ) => {
        if (!specifier) {
          return { url: "" };
        }
        const url = (await this.resolve(specifier, parentURL, {
          skipSelf: true,
        }))!.id;
        return { url };
      };
      const load = async (url: string) => {
        let source = url === id ? code : (await this.load({ id: url })).code;
        // HACK move directives before import statements.
        source = source!.replace(
          /^(import {.*?} from ".*?";)\s*"use (client|server)";/,
          '"use $2";$1'
        );
        return { format: "module", source };
      };
      RSDWNodeLoader.resolve(
        "",
        { conditions: ["react-server"], parentURL: "" },
        resolve
      );
      return (await RSDWNodeLoader.load(id, null, load)).source;
    },
  };
};
