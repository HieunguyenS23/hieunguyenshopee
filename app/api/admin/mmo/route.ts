import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';

const FRIEND_BASE = process.env.FRIENDSHOUSE_BASE_URL || 'https://friendshouse.io.vn';
const FRIEND_TOKEN = process.env.FRIENDSHOUSE_BEARER_TOKEN || process.env.FRIEND_BEARER_TOKEN || process.env.AUTOPEE_BEARER_TOKEN || process.env.AUTOPEE_TOKEN || ''; 

type Action = 'packages' | 'dashboard' | 'usage' | 'links' | 'claim' | 'release' | 'open';

function endpointFor(action: Action, body: any) {
  if (action === 'packages') return '/api/payment/vip/packages';
  if (action === 'dashboard') return '/api/user/dashboard';
  if (action === 'usage') return '/api/user/service-usage';
  if (action === 'links') return '/api/netflix-free/links';
  if (action === 'claim') return '/api/netflix-free/claim';
  if (action === 'release') return '/api/netflix-free/release';
  if (action === 'open') return `/api/netflix-free/open?token=${encodeURIComponent(String(body?.token || ''))}`;
  return '/api/health';
}

function methodFor(action: Action) {
  if (action === 'claim' || action === 'release') return 'POST';
  return 'GET';
}

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const body = await request.json();
    const action = String(body?.action || '') as Action;

    if (!action) {
      return NextResponse.json({ error: 'Thiếu action.' }, { status: 400 });
    }

    if (!FRIEND_TOKEN.trim()) {
      return NextResponse.json({ error: 'Thieu token server. Dat FRIENDSHOUSE_BEARER_TOKEN (hoac FRIEND_BEARER_TOKEN/AUTOPEE_BEARER_TOKEN) trong Vercel Environment Variables.' }, { status: 400 });
    }

    const method = methodFor(action);
    const endpoint = endpointFor(action, body);
    const url = new URL(endpoint, FRIEND_BASE).toString();

    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${FRIEND_TOKEN.trim()}`,
    };

    const init: RequestInit = {
      method,
      headers,
      cache: 'no-store',
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      if (action === 'claim') {
        init.body = JSON.stringify({
          cookie_id: Number(body?.cookieId || 0),
          type: String(body?.type || 'pc'),
        });
      } else if (action === 'release') {
        init.body = JSON.stringify({ token: String(body?.token || '') });
      }
    }

    const response = await fetch(url, init);
    const text = await response.text();

    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const msg = String(data?.detail || data?.message || data?.error || `HTTP ${response.status}`);
      return NextResponse.json(
        {
          error: `Friendshouse API lỗi (${response.status}): ${msg}`,
          status: response.status,
          data,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi gọi Friendshouse API.' },
      { status: 500 }
    );
  }
}

