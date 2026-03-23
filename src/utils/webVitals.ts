/**
 * Web Vitals reporting utility.
 *
 * Uses a dynamic import of the `web-vitals` package so the dependency is
 * entirely optional — if the package is not installed the function silently
 * does nothing.
 *
 * Call `reportWebVitals()` once from main.tsx to start collecting Core Web
 * Vitals metrics (CLS, FID, LCP, TTFB, INP) and logging them to the console.
 */

interface Metric {
  name: string;
  value: number;
  rating: string;
  id: string;
}

function logMetric(metric: Metric): void {
  const label = `[Web Vitals] ${metric.name}`;
  const detail = `${metric.value.toFixed(2)} (${metric.rating}) id=${metric.id}`;

  if (metric.rating === 'poor') {
    console.warn(label, detail);
  } else {
    console.log(label, detail);
  }
}

export async function reportWebVitals(): Promise<void> {
  try {
    const { onCLS, onFID, onLCP, onTTFB, onINP } = await import('web-vitals');

    onCLS(logMetric);
    onFID(logMetric);
    onLCP(logMetric);
    onTTFB(logMetric);
    onINP(logMetric);
  } catch {
    // web-vitals package is not installed — silently skip reporting.
  }
}
