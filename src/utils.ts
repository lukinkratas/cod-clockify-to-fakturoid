export async function fetchJson<T>(url: string | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid year-month: "${dateStr}"`);
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = (d: number) => `${year}-${pad(month)}-${pad(d)}`;

  return { startDay: day(1), endDay: day(lastDay) };
}
