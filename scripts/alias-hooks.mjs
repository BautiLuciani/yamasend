// Hook de resolución para correr módulos TypeScript de la app con Node
// (--experimental-strip-types): traduce el alias "@/..." a la raíz del repo.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(raiz, specifier.slice(2));
    for (const sufijo of [".ts", ".tsx", "/index.ts"]) {
      if (fs.existsSync(base + sufijo)) {
        return nextResolve(pathToFileURL(base + sufijo).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
