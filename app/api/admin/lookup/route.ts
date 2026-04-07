import { NextResponse } from 'next/server';
import { requireAdminOrCtv } from '@/lib/session';

const BASE_URL = process.env.DODANHVU_BASE_URL || 'https://dodanhvu.dpdns.org';

type Action =
  | 'login'
  | 'check'
  | 'cancel'
  | 'spx'
  | 'qr_generate'
  | 'qr_status'
  | 'qr_cancel'
  | 'history_list'
  | 'history_detail';

function normalizeCookie(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.startsWith('SPC_ST=') ? value : `SPC_ST=${value}`;
}

async function callUpstream(pathname: string, init: RequestInit) {
  const url = new URL(pathname, BASE_URL).toString();
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

export async function POST(request: Request) {
  await requireAdminOrCtv();

  try {
    const body = await request.json();
    const action = String(body.action || '').toLowerCase() as Action;

    if (!action) {
      return NextResponse.json({ error: 'Thiếu action.' }, { status: 400 });
    }

    if (action === 'login') {
      const input = String(body.input || '').trim();
      const deviceId = String(body.deviceId || '').trim();
      if (!input) return NextResponse.json({ error: 'Thiếu user|pass|SPC_F.' }, { status: 400 });

      const result = await callUpstream('/api/login', {
        method: 'POST',
        body: JSON.stringify({ input, deviceId }),
      });

      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Login thất bại.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'check') {
      const cookie = normalizeCookie(String(body.cookie || ''));
      const deviceId = String(body.deviceId || '').trim();
      if (!cookie) return NextResponse.json({ error: 'Thiếu cookie SPC_ST.' }, { status: 400 });

      const result = await callUpstream('/api/check', {
        method: 'POST',
        body: JSON.stringify({ cookie, deviceId }),
      });

      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Check đơn thất bại.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'cancel') {
      const cookie = normalizeCookie(String(body.cookie || ''));
      const orderId = Number(body.orderId || 0);
      const isCheckout = Boolean(body.isCheckout);
      if (!cookie || !orderId) {
        return NextResponse.json({ error: 'Thiếu cookie hoặc orderId.' }, { status: 400 });
      }

      const result = await callUpstream('/api/cancel', {
        method: 'POST',
        body: JSON.stringify({ cookie, orderId, isCheckout }),
      });

      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Hủy đơn thất bại.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'spx') {
      const trackings = Array.isArray(body.trackings)
        ? body.trackings.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [];

      if (trackings.length === 0) {
        return NextResponse.json({ error: 'Thiếu danh sách mã vận đơn.' }, { status: 400 });
      }

      const result = await callUpstream('/api/spx', {
        method: 'POST',
        body: JSON.stringify({ trackings }),
      });

      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Tra cứu SPX thất bại.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'qr_generate') {
      const result = await callUpstream('/api/qr/generate', { method: 'POST', body: JSON.stringify({}) });

      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Không tạo được QR.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'qr_status') {
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) return NextResponse.json({ error: 'Thiếu sessionId.' }, { status: 400 });

      const result = await callUpstream(`/api/qr/status/${encodeURIComponent(sessionId)}`, { method: 'GET' });
      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Không kiểm tra được trạng thái QR.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'qr_cancel') {
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) return NextResponse.json({ error: 'Thiếu sessionId.' }, { status: 400 });

      const result = await callUpstream('/api/qr/cancel', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });

      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Không hủy được phiên QR.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'history_list') {
      const deviceId = String(body.deviceId || '').trim();
      const query = deviceId ? `/api/history?d=${encodeURIComponent(deviceId)}` : '/api/history';
      const result = await callUpstream(query, { method: 'GET' });

      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Không tải được lịch sử.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === 'history_detail') {
      const id = String(body.id || '').trim();
      const deviceId = String(body.deviceId || '').trim();
      if (!id) return NextResponse.json({ error: 'Thiếu id lịch sử.' }, { status: 400 });

      const query = deviceId
        ? `/api/history/${encodeURIComponent(id)}?d=${encodeURIComponent(deviceId)}`
        : `/api/history/${encodeURIComponent(id)}`;

      const result = await callUpstream(query, { method: 'GET' });
      if (!result.ok) {
        return NextResponse.json({ error: String((result.data as any)?.error || 'Không tải được chi tiết lịch sử.'), data: result.data }, { status: result.status });
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    return NextResponse.json({ error: 'Action không hợp lệ.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi gọi API tra cứu.' }, { status: 500 });
  }
}
