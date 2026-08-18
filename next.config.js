/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Route Handlers bundle server dependencies by default. pdfjs-dist v5 ships
  // its Node-compatible legacy entry as ESM; letting the Next/Webpack server
  // bundle transform that module can corrupt its namespace initialization at
  // runtime. Keep PDF.js external so Node loads the package natively.
  serverExternalPackages: ['pdfjs-dist'],

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

    // Certificate parsing runs in the browser and still needs the generic
    // legacy entry. Native resume ingestion runs on the Node server and is
    // isolated above through serverExternalPackages.
    if (!isServer) {
      config.resolve.alias['pdfjs-dist$'] = 'pdfjs-dist/legacy/build/pdf.mjs';
    }

    return config;
  },
};

module.exports = nextConfig;
