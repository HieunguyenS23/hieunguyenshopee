import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';

const DEFAULT_BASE = process.env.AUTOPEE_BASE_URL || 'https://www.autopee.com';
const DEFAULT_LIST_ENDPOINT = process.env.AUTOPEE_VOUCHER_LIST_ENDPOINT || '/api/shopee/voucher/list';
const DEFAULT_SAVE_ENDPOINT = process.env.AUTOPEE_VOUCHER_SAVE_ENDPOINT || '/api/shopee/voucher/save';

function toUrl(endpointRaw: string) {
  const endpoint = String(endpointRaw || '').trim();
  const fallback = endpoint || DEFAULT_LIST_ENDPOINT;

  if (/^https?:\/\//i.test(fallback)) {
    const url = new URL(fallback);
    if (!url.hostname.endsWith('autopee.com')) {
      throw new Error('Chỉ cho phép gọi API thuộc autopee.com');
    }
    return url.toString();
  }

  return new URL(fallback.startsWith('/') ? fallback : `/${fallback}`, DEFAULT_BASE).toString();
}

function normalizeMethod(methodRaw: string, fallback: 'GET' | 'POST' | 'PUT') {
  const method = String(methodRaw || '').toUpperCase();
  if (method === 'GET' || method === 'POST' || method === 'PUT') return method;
  return fallback;
}

function normalizeCookie(raw: string) {
  const value = String(raw || '').trim().replace(/^"+|"+$/g, '');
  if (!value) return '';
  if (/^SPC_ST=/i.test(value)) return value;
  return `SPC_ST=${value}`;
}

function extractSpcSt(cookie: string) {
  const match = String(cookie || '').match(/SPC_ST=([^;]+)/i);
  return String(match?.[1] || '').trim();
}

function pickUpstreamError(data: any) {
  const message =
    data?.error ||
    data?.message ||
    data?.msg ||
    data?.detail ||
    data?.raw ||
    '';
  return String(message || '').trim();
}

async function callAutopee(input: {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT';
  token: string;
  cookie: string;
  payload?: Record<string, unknown>;
}) {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Origin: DEFAULT_BASE,
    Referer: `${DEFAULT_BASE}/shopee/voucher`,
  };

  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  if (input.cookie) headers.Cookie = input.cookie;

  const init: RequestInit = {
    method: input.method,
    headers,
    cache: 'no-store',
  };

  if (input.method !== 'GET') {
    init.body = JSON.stringify(input.payload || {});
  }

  const response = await fetch(input.endpoint, init);
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const body = await request.json();
    const action = String(body.action || '').toLowerCase();
    const token = String(body.token || process.env.AUTOPEE_BEARER_TOKEN || process.env.AUTOPEE_TOKEN || '').trim();
    const cookie = normalizeCookie(String(body.cookie || ''));
    const spcSt = extractSpcSt(cookie);

    if (!token) {
      return NextResponse.json({ error: 'Thiếu Bearer token Autopee.' }, { status: 400 });
    }

    if (action === 'list') {
      if (!cookie) {
        return NextResponse.json({ error: 'Thiếu cookie SPC_ST để tải danh sách voucher.' }, { status: 400 });
      }

      const endpoint = toUrl(String(body.endpoint || DEFAULT_LIST_ENDPOINT));
      const method = normalizeMethod(String(body.method || ''), 'POST');
      const payload = method === 'GET' ? undefined : {
        cookie,
        spc_st: spcSt || cookie,
      };

      const result = await callAutopee({ endpoint, method, token, cookie, payload });
      if (!result.ok) {
        const upstream = pickUpstreamError(result.data as any);
        return NextResponse.json(
          {
            error: `API Autopee trả lỗi khi tải danh sách voucher (${result.status})${upstream ? `: ${upstream}` : ''}`,
            status: result.status,
            data: result.data,
          },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'save') {
      if (!cookie) {
        return NextResponse.json({ error: 'Thiếu cookie SPC_ST để lưu voucher.' }, { status: 400 });
      }

      const endpoint = toUrl(String(body.endpoint || DEFAULT_SAVE_ENDPOINT));
      const method = normalizeMethod(String(body.method || ''), 'POST');
      const voucher = (body.voucher || {}) as Record<string, unknown>;
      const payload = {
        cookie,
        spc_st: spcSt || cookie,
        voucher_id: String(voucher.id || ''),
        voucher_code: String(voucher.code || ''),
        voucher_name: String(voucher.title || ''),
      };

      const result = await callAutopee({ endpoint, method, token, cookie, payload });
      if (!result.ok) {
        const upstream = pickUpstreamError(result.data as any);
        return NextResponse.json(
          {
            error: `API Autopee trả lỗi khi lưu voucher (${result.status})${upstream ? `: ${upstream}` : ''}`,
            status: result.status,
            data: result.data,
          },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    return NextResponse.json({ error: 'Action không hợp lệ. Dùng: list | save' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi gọi API Autopee.' }, { status: 500 });
  }
}
