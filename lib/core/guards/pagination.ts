export function clampPage(value: number, minimum = 1) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.floor(value));
}

export function clampPageSize(value: number, options?: { minimum?: number; maximum?: number; fallback?: number }) {
  const minimum = options?.minimum ?? 1;
  const maximum = options?.maximum ?? 100;
  const fallback = options?.fallback ?? 20;

  if (!Number.isFinite(value)) return fallback;

  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}
