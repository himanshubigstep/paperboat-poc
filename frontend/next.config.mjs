/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // lets a CI/check build use its own folder (NEXT_DIST_DIR=.next-check) without clobbering a running `next dev`
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['antd', '@ant-design/icons', '@ant-design/charts'],
};
export default nextConfig;
