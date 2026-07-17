/** Model selection via env var, one place so all pipeline scripts stay in sync. */
export function resolveModel(envVar: string, fallback: string): string {
  return process.env[envVar]?.trim() || fallback;
}
