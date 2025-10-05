
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // For production, it's crucial to address TypeScript errors.
    ignoreBuildErrors: false,
  },
  eslint: {
    // For production, it's crucial to address ESLint issues.
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      }
    ],
  },
  experimental: {
    serverActions: true,
    serverComponentsExternalPackages: ['@react-email/components'],
    // Adding server.fs.allow to prevent 403 Forbidden errors on static assets like fonts
    // during development with Turbopack.
    server: {
      fs: {
        allow: ["./"],
      },
    },
    turbo: {
        rules: {
            '*.svg': {
                loaders: ['@svgr/webpack'],
                as: '*.js',
            },
        },
    },
  },
};

export default nextConfig;
