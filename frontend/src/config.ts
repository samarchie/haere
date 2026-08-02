// no .env file needed for local dev. Production sets VITE_DATA_BASE_URL as a
// Cloudflare Pages build environment variable, never a committed or gitignored
// file.
export const DATA_BASE_URL: string =
  import.meta.env.VITE_DATA_BASE_URL ?? "/data";
