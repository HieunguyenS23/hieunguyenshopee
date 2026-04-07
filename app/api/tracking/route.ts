import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getOrders, getOrdersByUsername, updateOrder } from '@/lib/store';

const TRACK_API_BASE = 'https://dodanhvu.dpdns.org';

function isGTracking(tracking: string) {
  return /^g/i.test(String(tracking || '').trim());
}

function normalizeCookie(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.startsWith('SPC_ST=') ? value : `SPC_ST=${value}`;
}

function pickCurrentStatus(result: any) {
  const value = String(result?.status || result?.latest?.desc || '').trim();
  if (value) return value;

  const records = Array.isArray(result?.records) ? result.records : [];
  const first = records[0];
  const fallback = String(first?.desc || first?.status || '').trim();
  return fallback;
}

function pickStatusFromCheckData(data: any, tracking: string) {
  const rows = Array.isArray(data?.orders) ? data.orders : [];
  const trackingLower = String(tracking || '').trim().toLowerCase();
  const target = rows.find((item: any) => String(item?.tracking || item?.trackingCode || '').trim().toLowerCase() === trackingLower) || rows[0];
  if (!target) return '';
  const status = String(target?.statusText || target?.status || '').trim();
  return status;
}

function trackingMoreUrl(tracking: string) {
  return `https://www.trackingmore.com/track?number=${encodeURIComponent(tracking)}&express=ghn`;
}

export async function GET(request: Request) {
  const session = await requireSession();

  const { searchParams } = new URL(request.url);
  const tracking = String(searchParams.get('tracking') || '').trim();
  const orderId = String(searchParams.get('orderId') || '').trim();

  if (!tracking) {
    return NextResponse.json({ error: 'Thiếu mã vận đơn.' }, { status: 400 });
  }

  try {
    let targetOrder: any = null;
    if (orderId) {
      const pool = session.role === 'admin' ? await getOrders() : await getOrdersByUsername(session.username);
      targetOrder = pool.find((item) => item.id === orderId) || null;
      if (!targetOrder) {
        return NextResponse.json({ error: 'Không có quyền truy cập đơn này.' }, { status: 403 });
      }
    }

    if (isGTracking(tracking)) {
      let currentStatus = '';
      const cookie = normalizeCookie(String(targetOrder?.processingCookie || ''));

      if (cookie) {
        try {
          const checkRes = await fetch(`${TRACK_API_BASE}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookie }),
            cache: 'no-store',
          });
          const checkData = await checkRes.json().catch(() => ({}));
          if (checkRes.ok) {
            currentStatus = pickStatusFromCheckData(checkData, tracking);
          }
        } catch {
          // keep empty status
        }
      }

      if (orderId && currentStatus) {
        await updateOrder(orderId, {
          deliveryStatus: currentStatus,
          deliveryCheckedAt: new Date().toISOString(),
          deliveryTracking: tracking,
        });
      }

      return NextResponse.json({
        ok: true,
        tracking,
        currentStatus,
        provider: 'ghn',
        externalUrl: trackingMoreUrl(tracking),
        result: {
          tracking,
          status: currentStatus,
          records: [],
          timeline: [],
        },
      });
    }

    const response = await fetch(`${TRACK_API_BASE}/api/spx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackings: [tracking] }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: String(data?.error || 'Không tra được hành trình đơn.') }, { status: response.status });
    }

    const result = Array.isArray(data?.results)
      ? data.results.find((item: any) => String(item?.tracking || '').trim() === tracking) || data.results[0]
      : null;

    const currentStatus = pickCurrentStatus(result);

    if (orderId && currentStatus) {
      await updateOrder(orderId, {
        deliveryStatus: currentStatus,
        deliveryCheckedAt: new Date().toISOString(),
        deliveryTracking: tracking,
      });
    }

    return NextResponse.json({
      ok: true,
      tracking,
      result: result || null,
      currentStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không kết nối được API tra vận đơn.' }, { status: 500 });
  }
}

