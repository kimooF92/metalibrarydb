export const PRIVATE_READ_CACHE_CONTROL =
  "private, max-age=45, stale-while-revalidate=120";

export const PRIVATE_DETAIL_CACHE_CONTROL =
  "private, max-age=60, stale-while-revalidate=120";

export const PRIVATE_AUTH_VARY = "Cookie, Authorization, X-API-Secret";
