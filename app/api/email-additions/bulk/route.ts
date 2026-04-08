import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';

type Entry = { source: string; cookie: string; email: string; proxy: string };
type ResultRow = { source: string; cookie: string; email: string; proxy: string; status: boolean; message: string };

const EXTERNAL_ENDPOINT = process.env.OTISTX_ENDPOINT || 'https://otistx.com/api/email-additions/bulk';
const API_KEY = process.env.OTISTX_API_KEY || 'otis_9lGRopDaIopztPXQ4C8glIj2Xp717AIK';

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
    const parts = row.split('|').map((x) => x.trim());
    const email = parts[0] || '';
    const cookie = normalizeCookie(parts[1] || '');
    const proxy = parts.slice(2).join('|').trim();

    if (!email || !email.includes('@') || !cookie) {
      invalid.push({
        source: row,
        cookie,
        email,
        proxy,
        status: false,
        message: 'Sai format. Dùng: mail|SPC_ST hoặc mail|SPC_ST|proxy',
      });
      continue;
    }

    valid.push({ source: row, cookie, email, proxy });
  }

  return { valid, invalid };
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function callExternal(entries: Entry[]) {
  const response = await fetch(EXTERNAL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'x-api-key': API_KEY,
      'api-key': API_KEY,
      Origin: 'https://otistx.com',
      Referer: 'https://otistx.com/add-email',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({
      entries: entries.map((entry) => ({
        cookie: entry.cookie,
        email: entry.email,
        proxy: entry.proxy || undefined,
      })),
    }),
    cache: 'no-store',
  });

  const data = await parseJsonSafe(response);
  return { response, data };
}

function mapResults(entries: Entry[], data: any): ResultRow[] {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

  if (rows.length === 0) {
    const message = String(data?.message || data?.error || 'API không trả chi tiết kết quả.');
    return entries.map((entry) => ({
      source: entry.source,
      cookie: entry.cookie,
      email: entry.email,
      proxy: entry.proxy,
      status: false,
      message,
    }));
  }

  return entries.map((entry, idx) => {
    const item = rows[idx] || {};
    const status = Boolean(item.status ?? item.ok ?? item.success);
    return {
      source: entry.source,
      cookie: entry.cookie,
      email: entry.email,
      proxy: item.proxy || entry.proxy,
      status,
      message: String(item.message || item.msg || item.error || (status ? 'Thành công' : 'Thất bại')),
    };
  });
}

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const body = await request.json();
    const rowsText = String(body.rows || '');

    if (!rowsText.trim()) {
      return NextResponse.json({ error: 'Chưa có dữ liệu mail|SPC_ST để gửi.' }, { status: 400 });
    }

    const parsed = parseRows(rowsText);
    let apiResults: ResultRow[] = [];

    if (parsed.valid.length > 0) {
      const { response, data } = await callExternal(parsed.valid);
      if (!response.ok) {
        const message = String(data?.message || data?.error || `API trả lỗi HTTP ${response.status}`);
        apiResults = parsed.valid.map((entry) => ({
          source: entry.source,
          cookie: entry.cookie,
          email: entry.email,
          proxy: entry.proxy,
          status: false,
          message,
        }));
      } else {
        apiResults = mapResults(parsed.valid, data);
      }
    }

    const merged = [...apiResults, ...parsed.invalid];
    const ok = merged.filter((item) => item.status).length;
    const failed = merged.length - ok;

    return NextResponse.json({
      summary: { total: merged.length, ok, failed },
      results: merged,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thêm được email.' }, { status: 500 });
  }
}
