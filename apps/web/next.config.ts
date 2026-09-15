import type { NextConfig } from "next";
// Node 26 currently makes Next's internal `tsc --showConfig` parser fail even
// though `npm run typecheck` succeeds. Keep typechecking explicit in CI/local
// scripts until the runtime/toolchain combination is updated.
const nextConfig: NextConfig = { reactStrictMode: true, typescript: { ignoreBuildErrors: true } };
export default nextConfig;
