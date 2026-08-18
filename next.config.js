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
      // All PDF.js execution is server-owned. Route the exact package subpath
      // through a tiny adapter whose dynamic import is marked webpackIgnore so
      // Node executes PDF.js natively in dev and production runtimes.
      config.resolve.alias['pdfjs-dist/legacy/build/pdf.mjs$'] =
        `${__dirname}/lib/infrastructure/import/PdfJsNodeRuntime.ts`;
    }

    return config;
  },
};

module.exports = nextConfig;
