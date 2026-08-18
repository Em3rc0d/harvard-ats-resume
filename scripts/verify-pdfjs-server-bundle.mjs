import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const serverRoot = join(process.cwd(), '.next', 'server');
const pdfSpecifier = 'pdfjs-dist/legacy/build/pdf.mjs';

if (!existsSync(serverRoot)) {
  throw new Error('Next server output is missing; run `npm run build` before this verification.');
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(?:js|mjs|cjs)$/.test(entry) ? [path] : [];
  });
}

const emittedFiles = filesUnder(serverRoot);
const containingSpecifier = emittedFiles
  .map((path) => ({ path, content: readFileSync(path, 'utf8') }))
  .filter(({ content }) => content.includes(pdfSpecifier));

if (containingSpecifier.length === 0) {
  throw new Error('Built server output no longer contains the native PDF.js runtime specifier.');
}

const nativeImportPattern = /import\(\s*["']pdfjs-dist\/legacy\/build\/pdf\.mjs["']\s*\)/;
const nativeImportFiles = containingSpecifier.filter(({ content }) => nativeImportPattern.test(content));

if (nativeImportFiles.length === 0) {
  const paths = containingSpecifier.map(({ path }) => path).join(', ');
  throw new Error(
    `PDF.js specifier exists in the server build but is not preserved as a native dynamic import. Seen in: ${paths}`,
  );
}

console.log(
  `PDFJS_SERVER_RUNTIME_OK ${nativeImportFiles.map(({ path }) => path.replace(process.cwd(), '.')).join(', ')}`,
);
