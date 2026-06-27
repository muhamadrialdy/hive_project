// Base URL for the HIVE backend API.
// Override via hive_frontend/.env (VITE_API_URL=http://your-host:port/api).
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8088/api';
