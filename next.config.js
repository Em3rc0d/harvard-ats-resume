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

    // pdfjs-dist v5's modern browser entry caused a runtime crash in the
    // Next.js 14 client bundle. PDF.js publishes a generic legacy build for
    // environments that need the compatibility path. Keep the server import
    // used by native resume ingestion untouched.
    if (!isServer) {
      config.resolve.alias['pdfjs-dist$'] = 'pdfjs-dist/legacy/build/pdf.mjs';
    }

    return config;
  },
};

module.exports = nextConfig;
