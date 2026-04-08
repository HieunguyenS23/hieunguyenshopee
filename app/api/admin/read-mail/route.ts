import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';

const URL_REGEX = /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;

function extractLinks(input: unknown): string[] {
  const found = new Set<string>();

  const walk = (value: unknown) => {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
      const matches = value.match(URL_REGEX) || [];
      for (const item of matches) found.add(item.trim());
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    if (typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) walk(item);
    }
  };

  walk(input);
  return Array.from(found);
}

function parseRows(input: string) {
  return String(input || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|');
      return {
        input: line,
        email: String(parts[0] || '').trim(),
        password: String(parts[1] || '').trim(),
        refreshToken: String(parts[2] || '').trim(),
        clientId: String(parts[3] || '').trim(),
      };
    });
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function callMailApi(
  apiType: 'oauth2' | 'graph',
  email: string,
  refreshToken: string,
  clientId: string
) {
  const endpoint = apiType === 'oauth2'
    ? 'https://tools.dongvanfb.net/api/get_messages_oauth2'
    : 'https://tools.dongvanfb.net/api/graph_messages';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
    },
    body: JSON.stringify({
      email,
      refresh_token: refreshToken,
      client_id: clientId,
    }),
    cache: 'no-store',
  });

  const data = await parseJsonSafe(response);
  return { response, data };
}

function isEmptyFailPayload(data: any) {
  return (
    (data?.status === false || data?.success === false) &&
    (data?.code === '' || typeof data?.code === 'undefined') &&
    (data?.messages === null || typeof data?.messages === 'undefined') &&
    (data?.content === '' || typeof data?.content === 'undefined')
  );
}

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const body = await request.json();
    const rows = parseRows(String(body.rows || ''));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Bạn chưa nhập danh sách mail.' }, { status: 400 });
    }

    const results: Array<{
      input: string;
      email: string;
      ok: boolean;
      message: string;
      apiType: string;
      raw?: unknown;
      links: string[];
    }> = [];

    const allLinks = new Set<string>();

    for (const row of rows) {
      if (!row.email || !row.refreshToken || !row.clientId) {
        results.push({
          input: row.input,
          email: row.email,
          ok: false,
          message: 'Sai format. Dùng: email|pass|refresh_token|client_id',
          apiType: '-',
          links: [],
        });
        continue;
      }

      let selectedApi: 'oauth2' | 'graph' = 'oauth2';
      let selectedData: any = null;
      let success = false;

      for (const apiType of ['oauth2', 'graph'] as const) {
        // eslint-disable-next-line no-await-in-loop
        const { response, data } = await callMailApi(apiType, row.email, row.refreshToken, row.clientId);

        if (!response.ok || data?.success === false || isEmptyFailPayload(data)) {
          selectedApi = apiType;
          selectedData = data;
          continue;
        }

        selectedApi = apiType;
        selectedData = data;
        success = true;
        break;
      }

      const links = extractLinks(selectedData);
      for (const link of links) allLinks.add(link);

      results.push({
        input: row.input,
        email: row.email,
        ok: success,
        message: success
          ? `Đọc mail thành công (${selectedApi}).`
          : String(selectedData?.message || 'Đọc thất bại chọn kiểu đọc mail khác'),
        apiType: selectedApi,
        raw: selectedData,
        links,
      });
    }

    const ok = results.filter((item) => item.ok).length;
    const failed = results.length - ok;

    return NextResponse.json({
      results,
      allLinks: Array.from(allLinks),
      summary: {
        total: results.length,
        ok,
        failed,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không đọc được mail.' }, { status: 500 });
  }
}
