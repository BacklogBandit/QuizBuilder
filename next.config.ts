import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '192.168.0.7:3000'],
    },
  },
  allowedDevOrigins: ['192.168.0.7'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'chart.googleapis.com' },
    ],
  },
}

export default nextConfig
