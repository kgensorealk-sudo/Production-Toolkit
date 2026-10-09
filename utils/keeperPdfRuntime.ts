/** Explicit imports let serverless dependency tracing include PDF.js's native runtime. */
export async function loadKeeperPdfRuntime() {
  const canvas = await import('@napi-rs/canvas');
  const runtime = globalThis as any;
  for (const name of ['DOMMatrix','ImageData','Path2D'] as const) {
    if (!runtime[name]) runtime[name] = canvas[name];
  }
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}
