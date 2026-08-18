type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type GetDocumentInput = Parameters<PdfJsModule['getDocument']>[0];
type LoadingTask = ReturnType<PdfJsModule['getDocument']>;

/**
 * Webpack must not transform PDF.js' Node ESM namespace. The server webpack
 * alias routes the existing resume-import request here; this adapter then
 * performs the real package import at Node runtime. `webpackIgnore` is the
 * explicit Webpack contract for leaving a dynamic import untouched.
 */
export function getDocument(source: GetDocumentInput): Pick<LoadingTask, 'promise'> {
  const promise = import(
    /* webpackIgnore: true */
    'pdfjs-dist/legacy/build/pdf.mjs'
  ).then((pdfjs) => pdfjs.getDocument(source).promise);

  return { promise } as Pick<LoadingTask, 'promise'>;
}
