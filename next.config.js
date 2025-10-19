/** @type {import('next').NextConfig} */
const nextConfig = {
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
    serverComponentsExternalPackages: ['sharp', 'onnxruntime-node'],
  }
};

module.exports = nextConfig;
