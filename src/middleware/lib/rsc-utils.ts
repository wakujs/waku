// FIXME rsc-utils isn't a good name

import { Buffer } from "node:buffer";
import { Transform } from "node:stream";

export const generatePrefetchCode = (
  entryItemsIterable: Iterable<readonly [rscId: string, props: unknown]>,
  moduleIds: Iterable<string>
) => {
  const entryItems = Array.from(entryItemsIterable);
  let code = "";
  if (entryItems.length) {
    const rscIds = [...new Set(entryItems.map(([rscId]) => rscId))];
    code += `
globalThis.__WAKUWORK_PREFETCHED__ = {
${rscIds
  .map((rscId) => {
    const value =
      "{" +
      entryItems
        .flatMap(([id, props]) => {
          if (id !== rscId) return [];
          // FIXME we blindly expect JSON.stringify usage is deterministic
          const serializedProps = JSON.stringify(props);
          const searchParams = new URLSearchParams();
          searchParams.set("props", serializedProps);
          return [
            `'${serializedProps}': fetch('/RSC/${rscId}/${searchParams}')`,
          ];
        })
        .join(",") +
      "}";
    return `  '${rscId}': ${value}`;
  })
  .join(",\n")}
};`;
  }
  for (const moduleId of moduleIds) {
    code += `
import('${moduleId}');`;
  }
  return code;
};

// HACK Patching stream is very fragile.
export const transformRsfId = (
  prefixToRemove: string,
  convert = (id: string) => id
) =>
  new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ("buffer" as any)) {
        throw new Error("Unknown encoding");
      }
      const data = chunk.toString();
      const lines = data.split("\n");
      let changed = false;
      for (let i = 0; i < lines.length; ++i) {
        const match = lines[i].match(
          new RegExp(`^([0-9]+):{"id":"${prefixToRemove}(.*?)"(.*)$`)
        );
        if (match) {
          lines[i] = `${match[1]}:{"id":"${convert(match[2])}"${match[3]}`;
          changed = true;
        }
      }
      callback(null, changed ? Buffer.from(lines.join("\n")) : chunk);
    },
  });
