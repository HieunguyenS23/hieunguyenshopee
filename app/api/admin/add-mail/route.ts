import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';

type ResultItem = {
  source: string;
  ok: boolean;
  message: string;
  data?: unknown;
};

const OTISTX_ENDPOINT = 'https://otistx.com/add-email';

function parseRows(input: string) {
  return String(input || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildAuthHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
    headers['api-key'] = apiKey;
  }

  return headers;
}

async function readResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function normalizeResults(rows: string[], data: any): { results: ResultItem[]; summary: { total: number; ok: number; failed: number } } {
  const arr = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.items)
        ? data.items
        : null;

  if (arr && arr.length > 0) {
    const mapped: ResultItem[] = rows.map((line, index) => {
      const item = arr[index] || {};
      const ok = Boolean(item.ok ?? item.success ?? item.status === 'success');
      return {
        source: line,
        ok,
        message: String(item.message || item.msg || item.error || (ok ? 'Đã gửi' : 'Lỗi')),
      };
    });

    return {
      results: mapped,
      summary: {
        total: rows.length,
        ok: mapped.filter((item) => item.ok).length,
        failed: mapped.filter((item) => !item.ok).length,
      },
    };
  }

  const okCountRaw = Number(data?.okCount ?? data?.success ?? data?.successCount ?? data?.added ?? data?.done);
  const failCountRaw = Number(data?.failCount ?? data?.failed ?? data?.errorCount ?? data?.errors);

  const okCount = Number.isFinite(okCountRaw) ? Math.max(0, okCountRaw) : rows.length;
  const failCount = Number.isFinite(failCountRaw) ? Math.max(0, failCountRaw) : Math.max(0, rows.length - okCount);

  const results: ResultItem[] = rows.map((line, index) => ({
    source: line,
    ok: index < okCount,
    message: index < okCount ? 'Đã gửi' : 'Lỗi',
  }));

  return {
    results,
    summary: {
      total: rows.length,
      ok: Math.min(rows.length, okCount),
      failed: Math.min(rows.length, failCount),
    },
  };
}

async function tryPayload(endpoint: string, headers: Record<string, string>, rows: string[], apiKey: string) {
  const attempts: Array<() => Promise<Response>> = [
    () =>
      fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          emails: rows,
          data: rows,
          raw: rows.join('\n'),
          apiKey,
          key: apiKey,
          token: apiKey,
        }),
        cache: 'no-store',
      }),
    () =>
      fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: rows.join('\n'),
          content: rows.join('\n'),
          list: rows,
          api_key: apiKey,
        }),
        cache: 'no-store',
      }),
    () => {
      const form = new URLSearchParams();
      form.set('rows', rows.join('\n'));
      form.set('emails', rows.join('\n'));
      form.set('data', rows.join('\n'));
      form.set('apiKey', apiKey);
      form.set('key', apiKey);
      return fetch(endpoint, {
        method: 'POST',
        headers,
        body: form,
        cache: 'no-store',
      });
    },
  ];

  let lastStatus = 500;
  let lastData: any = null;

  for (const run of attempts) {
    const response = await run();
    const data = await readResponse(response);

    lastStatus = response.status;
    lastData = data;

    if (response.ok) {
      return { ok: true as const, data };
    }
  }

  return { ok: false as const, status: lastStatus, data: lastData };
}

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const body = await request.json();
    const rows = parseRows(String(body.rows || ''));
    const apiKey = String(body.apiKey || process.env.OTISTX_API_KEY || 'otis_9lGRopDaIopztPXQ4C8glIj2Xp717AIK').trim();

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Chưa có dữ liệu mail để gửi.' }, { status: 400 });
    }

    const headers = buildAuthHeaders(apiKey);
    const result = await tryPayload(OTISTX_ENDPOINT, headers, rows, apiKey);

    if (!result.ok) {
      return NextResponse.json(
        { error: String(result?.data?.error || result?.data?.message || 'API thêm mail trả lỗi.'), data: result.data },
        { status: result.status }
      );
    }

    const normalized = normalizeResults(rows, result.data);

    return NextResponse.json({
      ok: true,
      summary: normalized.summary,
      results: normalized.results,
      data: result.data,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thêm được mail.' }, { status: 500 });
  }
}

