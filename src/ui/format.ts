// Formatos de números, tiempos y fechas para la interfaz.

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
  return `${seconds} s`;
}

export function formatPercent(fraction: number): string {
  return `${Math.floor(Math.min(1, Math.max(0, fraction)) * 100)} %`;
}

const numberFormat = new Intl.NumberFormat('es');
export const formatNumber = (n: number) => numberFormat.format(Math.round(n));

export function formatRelativeDate(time: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(time)) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Date(time).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
