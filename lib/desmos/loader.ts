export type DesmosCalculator = {
  setExpression(expression: { id: string; latex: string; color?: string }): void;
  setMathBounds(bounds: { left: number; right: number; bottom: number; top: number }): void;
  resize(): void;
  destroy(): void;
};
export type DesmosApi = {
  GraphingCalculator(element: HTMLElement, options: Record<string, string | boolean | number>): DesmosCalculator;
};
let loading: Promise<DesmosApi> | null = null;

/** Only called after the pupil opens the optional SDK. No pupil data is sent. */
export function loadDesmos(apiKey: string): Promise<DesmosApi> {
  if (!apiKey.trim() || typeof window === 'undefined') return Promise.reject(new Error('Desmos unavailable'));
  if (loading) return loading;
  const promise = new Promise<DesmosApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = `https://www.desmos.com/api/v1.12/calculator.js?apiKey=${encodeURIComponent(apiKey)}`;
    const failed = () => { clearTimeout(timer); script.remove(); reject(new Error('Desmos unavailable')); };
    const timer = setTimeout(failed, 10000);
    script.onerror = failed;
    script.onload = () => {
      clearTimeout(timer);
      const api = (window as Window & { Desmos?: DesmosApi }).Desmos;
      if (typeof api?.GraphingCalculator !== 'function') { failed(); return; }
      resolve(api);
    };
    document.head.appendChild(script);
  });
  loading = promise.catch((error: unknown) => { loading = null; throw error; });
  return loading;
}
