/** Supabase settings come from the build environment (see README). Without them the app stays purely local. */
export const cloudConfig = {
  url: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
};
export const cloudConfigured = cloudConfig.url !== '' && cloudConfig.anonKey !== '';
