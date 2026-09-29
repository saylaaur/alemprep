import { PENDING_KEY } from './pending';

export function clearPendingLearning(): void {
  try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
  // Invalidate any mounted practice before the server logout redirects.
  window.dispatchEvent(new Event('alemprep:learning-clear'));
}
