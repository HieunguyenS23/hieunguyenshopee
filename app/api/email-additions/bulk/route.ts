import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';

type Entry = { source: string; cookie: string; email: string; proxy: string };
type ResultRow = { source: string; cookie: string; email: string; proxy: string; status: boolean; message: string };

const DEFAULT_EXTERNAL_ENDPOINT = process.env.OTISTX_ENDPOINT || 'https://otistx.com/add-email';
const DEFAULT_API_KEY = process.env.OTISTX_API_KEY || 'otis_9lGRopDaIopztPXQ4C8glIj2Xp717AIK';

function normalizeCookie(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return /^SPC_ST=/i.test(value) ? value : `SPC_ST=${value}`;
}

function parseRows(rowsText: string) {
  const rows = String(rowsText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const valid: Entry[] = [];
  const invalid: ResultRow[] = [];

  for (const row of rows) {
    const parts = row.split('|').map((x) => x.trim()).filter(Boolean);
    const emailPart = parts.find((x) => x.includes('@')) || '';
    const cookiePart = normalizeCookie(parts.find((x) => /SPC_ST=/i.test(x)) || '');
    const leftovers = parts.filter((x) => x !== emailPart && x !== cookiePart);
    const proxy = leftovers.join('|').trim();

    if (!emailPart || !cookiePart) {
      invalid.push({ source: row, cookie: cookiePart, email: emailPart, proxy, status: false, message: 'Sai format. Dùng: mail|SPC_ST hoặc mail|SPC_ST|proxy' });
      continue;
    }

    valid.push({ source: row, cookie: cookiePart, email: emailPart, proxy });
  }

  return { valid, invalid };
}

function authHeaders(apiKey: string) {
  const headers: Record<string, string> = { Accept: 'application/json, text/plain, */*' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
    headers['api-key'] = apiKey;
  }
  return headers;
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

function mapResponsePerEntry(entries: Entry[], data: any): ResultRow[] {
  const arr = Array.isArray(data?.results) ? data.results : Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : [];
  if (arr.length > 0) {
    return entries.map((entry, idx) => {
      const item = arr[idx] || {};
      const ok = Boolean(item.status ?? item.ok ?? item.success);
      return { source: entry.source, cookie: entry.cookie, email: entry.email, proxy: entry.proxy, status: ok, message: String(item.message || item.msg || item.error || (ok ? 'Thành công' : 'Thất bại')) };
    });
  }
  const globalOk = Boolean(data?.status ?? data?.ok ?? data?.success);
  const globalMsg = String(data?.message || data?.msg || data?.error || (globalOk ? 'Thành công' : 'Thất bại'));
  return entries.map((entry) => ({ source: entry.source, cookie: entry.cookie, email: entry.email, proxy: entry.proxy, status: globalOk, message: globalMsg }));
}

async function sendBatch(endpoint: string, apiKey: string, entries: Entry[]) {
  const baseHeaders = authHeaders(apiKey);
  const attempts: Array<() => Promise<Response>> = [
    () => fetch(endpoint, { method: 'POST', headers: { ...baseHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: entries.map((e) => ({ cookie: e.cookie, email: e.email, proxy: e.proxy || '' })) }), cache: 'no-store' }),
    () => fetch(endpoint, { method: 'POST', headers: { ...baseHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: entries.map((e) => `${e.email}|${e.cookie}${e.proxy ? `|${e.proxy}` : ''}`), entries: entries.map((e) => ({ cookie: e.cookie, email: e.email, proxy: e.proxy || '' })), apiKey, key: apiKey }), cache: 'no-store' }),
  ];

  for (const run of attempts) {
    const response = await run();
    const data = await parseJsonSafe(response);
    if (response.ok) return { ok: true as const, data };
  }
  return { ok: false as const };
}

async function sendSingleFallback(endpoint: string, apiKey: string, entry: Entry): Promise<ResultRow> {
  const headers = authHeaders(apiKey);
  const tries: Array<() => Promise<Response>> = [
    () => fetch(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ cookie: entry.cookie, email: entry.email, proxy: entry.proxy || '' }), cache: 'no-store' }),
    () => fetch(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ entry: { cookie: entry.cookie, email: entry.email, proxy: entry.proxy || '' } }), cache: 'no-store' }),
  ];

  for (const run of tries) {
    try {
      const response = await run();
      const data = await parseJsonSafe(response);
      if (response.ok) {
        const ok = Boolean(data?.status ?? data?.ok ?? data?.success ?? true);
        return { source: entry.source, cookie: entry.cookie, email: entry.email, proxy: entry.proxy, status: ok, message: String(data?.message || data?.msg || (ok ? 'Thành công' : 'Thất bại')) };
      }
      return { source: entry.source, cookie: entry.cookie, email: entry.email, proxy: entry.proxy, status: false, message: String(data?.message || data?.error || `HTTP ${response.status}`) };
    } catch {
      // try next payload format
    }
  }

  return { source: entry.source, cookie: entry.cookie, email: entry.email, proxy: entry.proxy, status: false, message: 'Không gọi được API thêm email.' };
}

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const body = await request.json();
    const rowsText = String(body.rows || '');
    const endpoint = String(body.endpoint || DEFAULT_EXTERNAL_ENDPOINT).trim();
    const apiKey = String(body.apiKey || DEFAULT_API_KEY).trim();

    if (!rowsText.trim()) return NextResponse.json({ error: 'Chưa có dữ liệu mail|SPC_ST để gửi.' }, { status: 400 });

    const parsed = parseRows(rowsText);
    if (parsed.valid.length === 0) {
      return NextResponse.json({ summary: { total: parsed.invalid.length, ok: 0, failed: parsed.invalid.length }, results: parsed.invalid });
    }

    let results: ResultRow[] = [];
    const bulk = await sendBatch(endpoint, apiKey, parsed.valid);
    if (bulk.ok) {
      results = mapResponsePerEntry(parsed.valid, bulk.data);
    } else {
      const fallbackRows: ResultRow[] = [];
      for (const entry of parsed.valid) {
        // eslint-disable-next-line no-await-in-loop
        fallbackRows.push(await sendSingleFallback(endpoint, apiKey, entry));
      }
      results = fallbackRows;
    }

    const merged = [...results, ...parsed.invalid];
    const ok = merged.filter((item) => item.status).length;
    const failed = merged.length - ok;

    return NextResponse.json({ summary: { total: merged.length, ok, failed }, results: merged });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thêm được email.' }, { status: 500 });
  }
}
