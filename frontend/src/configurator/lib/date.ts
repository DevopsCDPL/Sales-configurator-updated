export function formatDate(dateLike?: string | number | Date): string {
  if (dateLike == null) return '';
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function formatTime(dateLike?: string | number | Date): string {
  if (dateLike == null) return '';
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return '';
  // 12-hour with minutes, no seconds
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(dateLike?: string | number | Date): string {
  const d = formatDate(dateLike);
  const t = formatTime(dateLike);
  return d && t ? `${d} ${t}` : d || t;
}