/**
 * The console shares the monorepo's source packages rather than published
 * builds, so Next has to compile them itself.
 */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@masalim/types', '@masalim/validation', '@masalim/ui'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
