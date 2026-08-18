/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Temporary compatibility bridge for the legacy inline Optimize buttons.
  // The browser no longer calls an external n8n workflow; requests stay inside
  // this application and are handled by /api/optimize-content.
  env: {
    NEXT_PUBLIC_N8N_OPTIMIZE_URL: '/api/optimize-content',
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;

    if (isServer) {
      // The resume Route Handler imports PDF.js through this exact package
      // subpath. Route it through a tiny adapter whose own dynamic import is
      // marked webpackIgnore, so Node executes the ESM package natively during
      // both `next dev --webpack` and `next start` instead of Webpack rewriting
      // PDF.js' module namespace.
      config.resolve.alias['pdfjs-dist/legacy/build/pdf.mjs$'] =
        `${__dirname}/lib/infrastructure/import/PdfJsNodeRuntime.ts`;
    } else {
      // Certificate parsing runs in the browser and needs the generic legacy
      // PDF.js entry. Keep this contract independent from native resume import.
      config.resolve.alias['pdfjs-dist$'] = 'pdfjs-dist/legacy/build/pdf.mjs';
    }

    return config;
  },
};

module.exports = nextConfig;
