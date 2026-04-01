import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@pathways/config', '@pathways/imports', '@pathways/shared', '@pathways/ui'],
}

export default nextConfig
