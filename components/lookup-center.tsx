'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/lib/client-toast';

type LookupOrder = {
  orderId?: number;
  statusText?: string;
  shopName?: string;
  total?: string;
  products?: Array<{ name?: string; model?: string; amount?: number; price?: string }>;
  recipient?: string;
  phone?: string;
  address?: string;
  tracking?: string;
  carrier?: string;
  shipPhone?: string;
  driverName?: string;
  orderTime?: string;
  canCancel?: boolean;
  isCheckout?: boolean;
  _cookie?: string;
};

type SpxResult = {
  tracking?: string;
  status?: string;
  timeline?: Array<{ time?: string; description?: string }>;
  records?: Array<{ time?: string; desc?: string; status?: string }>;
  error?: string;
};

function toTimelineEpoch(raw?: string) {
  const value = String(raw || '').trim();
  if (!value) return 0;

  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) return direct;

  const normalized = value.replace(/\s+/g, ' ');
  const match = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const hour = Number(match[1] || 0);
    const minute = Number(match[2] || 0);
    const second = Number(match[3] || 0);
    const day = Number(match[4] || 1);
    const month = Number(match[5] || 1) - 1;
    const year = Number(match[6] || 1970);
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  const dateOnly = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dateOnly) {
    const day = Number(dateOnly[1] || 1);
    const month = Number(dateOnly[2] || 1) - 1;
    const year = Number(dateOnly[3] || 1970);
    return new Date(year, month, day).getTime();
  }

  return 0;
}

function getSortedTimeline(detail: SpxResult | null) {
  if (!detail) return [] as Array<{ time?: string; description?: string; desc?: string; status?: string }>;
  const source = Array.isArray(detail.timeline) && detail.timeline.length > 0 ? detail.timeline : (detail.records || []);
  return [...source].sort((a, b) => toTimelineEpoch((b as any).time) - toTimelineEpoch((a as any).time));
}

function normalizeCookie(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.startsWith('SPC_ST=') ? value : `SPC_ST=${value}`;
}

function normalizeQrImageSource(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';

  if (/^data:image\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;

  const base64 = value.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
  if (!base64) return '';
  return `data:image/png;base64,${base64}`;
}

function extractOrderProductName(order: LookupOrder) {
  const names = (order.products || []).map((item) => String(item?.name || '').trim()).filter(Boolean);
  if (names.length > 0) return names.join(' | ');
  return 'Chưa có';
}

function parseBatchLines(input: string) {
  return String(input || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function LookupCenter() {
  const [tab, setTab] = useState<'cookie' | 'account' | 'qr' | 'spx'>('cookie');
  const [loading, setLoading] = useState(false);

  const [cookieInput, setCookieInput] = useState('');
  const [accountInput, setAccountInput] = useState('');
  const [spxInput, setSpxInput] = useState('');

  const [username, setUsername] = useState('');
  const [cookieOutput, setCookieOutput] = useState('');
  const [orders, setOrders] = useState<LookupOrder[]>([]);

  const [qrSessionId, setQrSessionId] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrStatusText, setQrStatusText] = useState('Chưa tạo QR.');
  const [qrCookieText, setQrCookieText] = useState('');

  const [spxResults, setSpxResults] = useState<SpxResult[]>([]);
  const [spxDetail, setSpxDetail] = useState<SpxResult | null>(null);

  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, []);

  const orderStats = useMemo(() => {
    const total = orders.length;
    const cancelable = orders.filter((item) => item.canCancel).length;
    const shipping = orders.filter((item) => String(item.statusText || '').toLowerCase().includes('giao')).length;
    return { total, cancelable, shipping };
  }, [orders]);

  const sortedSpxTimeline = useMemo(() => getSortedTimeline(spxDetail), [spxDetail]);

  async function callLookup(payload: Record<string, unknown>) {
    const response = await fetch('/api/admin/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(data.error || 'Gọi API tra cứu thất bại.'));
    }

    return data;
  }

  async function checkSingleCookie(cookieRaw: string) {
    const cookie = normalizeCookie(cookieRaw);
    if (!cookie) return null;

    const data = await callLookup({ action: 'check', cookie });
    const payload = data.data || {};
    const ordersRaw = Array.isArray(payload.orders) ? payload.orders : [];
    const cookieNormalized = String(payload.cookie || cookie);
    const usernameDetected = String(payload.username || '');

    const mappedOrders = ordersRaw.map((order: LookupOrder) => ({ ...order, _cookie: cookieNormalized }));

    return {
      cookie: cookieNormalized,
      username: usernameDetected,
      orders: mappedOrders,
    };
  }

  async function runCheckByCookieBatch() {
    const lines = parseBatchLines(cookieInput);
    if (lines.length === 0) {
      showToast('Bạn chưa nhập cookie SPC_ST.', 'error');
      return;
    }

    setLoading(true);
    try {
      const allOrders: LookupOrder[] = [];
      const cookiesOk: string[] = [];
      const usernamesOk: string[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const line of lines) {
        try {
          const item = await checkSingleCookie(line);
          if (!item) continue;
          successCount += 1;
          allOrders.push(...item.orders);
          cookiesOk.push(item.cookie);
          if (item.username) usernamesOk.push(item.username);
        } catch {
          failCount += 1;
        }
      }

      setOrders(allOrders);
      setCookieOutput(cookiesOk.join('\n'));
      setCookieInput(cookiesOk.join('\n') || cookieInput);
      setUsername(Array.from(new Set(usernamesOk)).join(' | '));

      if (successCount === 0) {
        showToast('Không cookie nào tra cứu thành công.', 'error');
        return;
      }

      showToast(`Đã xử lí ${successCount}/${lines.length} cookie.`, failCount > 0 ? 'info' : 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không kiểm tra được cookie.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function runLoginAndCheckBatch() {
    const lines = parseBatchLines(accountInput);
    if (lines.length === 0) {
      showToast('Bạn chưa nhập user|pass|SPC_F.', 'error');
      return;
    }

    setLoading(true);
    try {
      const allOrders: LookupOrder[] = [];
      const cookiesOk: string[] = [];
      const usernamesOk: string[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const input of lines) {
        try {
          const login = await callLookup({ action: 'login', input });
          const payload = login.data || {};
          const cookie = normalizeCookie(String(payload.cookie || ''));
          if (!cookie) {
            failCount += 1;
            continue;
          }

          const ordersRaw = Array.isArray(payload.orders) ? payload.orders : [];
          const usernameDetected = String(payload.username || '');
          const mapped = ordersRaw.map((order: LookupOrder) => ({ ...order, _cookie: cookie }));

          if (mapped.length > 0) {
            allOrders.push(...mapped);
          } else {
            const checked = await checkSingleCookie(cookie);
            if (checked) {
              allOrders.push(...checked.orders);
            }
          }

          cookiesOk.push(cookie);
          if (usernameDetected) usernamesOk.push(usernameDetected);
          successCount += 1;
        } catch {
          failCount += 1;
        }
      }

      setOrders(allOrders);
      setCookieOutput(cookiesOk.join('\n'));
      setCookieInput(cookiesOk.join('\n'));
      setUsername(Array.from(new Set(usernamesOk)).join(' | '));

      if (successCount === 0) {
        showToast('Không account nào lấy được SPC_ST.', 'error');
        return;
      }

      showToast(`Đã xử lí ${successCount}/${lines.length} account.`, failCount > 0 ? 'info' : 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không lấy được SPC_ST.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function startQrLogin() {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    setLoading(true);
    try {
      const result = await callLookup({ action: 'qr_generate' });
      const payload = result.data || {};
      const source = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
      const sessionId = String(source.sessionId || source.session_id || payload.sessionId || payload.session_id || '');
      const qrRaw = String(source.qrBase64 || source.qr_base64 || source.qr || source.qrcode || source.qrUrl || source.qr_url || '');
      const qrImageSrc = normalizeQrImageSource(qrRaw);

      if (!sessionId || !qrImageSrc) throw new Error('API không trả sessionId hoặc ảnh QR hợp lệ.');

      setQrSessionId(sessionId);
      setQrImage(qrImageSrc);
      setQrStatusText('Đang chờ quét QR...');
      setQrCookieText('');

      pollTimer.current = window.setInterval(async () => {
        try {
          const statusResult = await callLookup({ action: 'qr_status', sessionId });
          const statusPayload = statusResult.data || {};
          const statusData = statusPayload?.data && typeof statusPayload.data === 'object' ? statusPayload.data : statusPayload;
          const status = String(statusData?.status || statusData?.state || '').trim().toLowerCase();
          const cookieFromStatus = normalizeCookie(String(statusData?.cookie || statusPayload?.cookie || ''));

          if (cookieFromStatus) {
            if (pollTimer.current) {
              window.clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            setQrStatusText('Đăng nhập QR thành công.');
            setQrCookieText(cookieFromStatus);
            setQrSessionId('');
            setQrImage('');
            setCookieOutput(cookieFromStatus);
            setCookieInput(cookieFromStatus);
            showToast('QR login thành công, đã lấy cookie.', 'success');

            const checked = await checkSingleCookie(cookieFromStatus);
            if (checked) {
              setOrders(checked.orders);
              setUsername(checked.username || '');
              setCookieOutput(checked.cookie);
              setCookieInput(checked.cookie);
            }
            return;
          }

          if (!status) {
            setQrStatusText('Đang chờ quét QR...');
            return;
          }
          if (status === 'waiting') {
            setQrStatusText('Đang chờ quét QR...');
            return;
          }
          if (status === 'scanned') {
            setQrStatusText('Đã quét QR, chờ xác nhận trên app Shopee...');
            return;
          }

          if (status === 'success') {
            if (pollTimer.current) {
              window.clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            const cookie = normalizeCookie(String(statusPayload.cookie || ''));
            setQrStatusText('Đăng nhập QR thành công.');
            setQrCookieText(cookie);
            setQrSessionId('');
            setQrImage('');
            setCookieOutput(cookie);
            setCookieInput(cookie);
            showToast('QR login thành công, đã lấy cookie.', 'success');

            const checked = await checkSingleCookie(cookie);
            if (checked) {
              setOrders(checked.orders);
              setUsername(checked.username || '');
              setCookieOutput(checked.cookie);
              setCookieInput(checked.cookie);
            }
            return;
          }

          if (status === 'failed') {
            if (pollTimer.current) {
              window.clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            setQrStatusText('Phiên QR thất bại hoặc đã hết hạn.');
            showToast('QR login thất bại hoặc hết hạn.', 'error');
          }
        } catch {
          // ignore transient errors
        }
      }, 2500);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không tạo được QR login.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function cancelQr() {
    const sessionId = String(qrSessionId || '').trim();
    if (!sessionId) return;

    try {
      await callLookup({ action: 'qr_cancel', sessionId });
    } catch {
      // ignore
    }

    if (pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    setQrSessionId('');
    setQrImage('');
    setQrCookieText('');
    setQrStatusText('Đã hủy phiên QR.');
    showToast('Đã hủy phiên QR.', 'success');
  }

  async function cancelOrder(order: LookupOrder) {
    const cookie = normalizeCookie(order._cookie || cookieInput || cookieOutput.split(/\r?\n/)[0] || '');
    if (!cookie || !order.orderId) {
      showToast('Thiếu cookie hoặc mã đơn để hủy.', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await callLookup({
        action: 'cancel',
        cookie,
        orderId: order.orderId,
        isCheckout: Boolean(order.isCheckout),
      });
      showToast(String(result?.data?.message || `Đã hủy đơn #${order.orderId}.`), 'success');
      await runCheckByCookieBatch();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể hủy đơn này.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function runSpxLookup() {
    const trackings = parseBatchLines(spxInput);
    if (trackings.length === 0) {
      showToast('Bạn chưa nhập mã vận đơn.', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await callLookup({ action: 'spx', trackings });
      const rows = Array.isArray(result?.data?.results) ? result.data.results : [];
      setSpxResults(rows);
      setSpxDetail(rows[0] || null);
      showToast(`Đã tra ${rows.length} vận đơn.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không tra được vận đơn.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copyQrCookie() {
    const text = String(qrCookieText || '').trim();
    if (!text) {
      showToast('Chưa có SPC_ST từ QR để copy.', 'error');
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('Đã copy SPC_ST từ QR.', 'success');
  }
  async function copyCookie() {
    const text = String(cookieOutput || '').trim();
    if (!text) {
      showToast('Chưa có cookie để copy.', 'error');
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('Đã copy SPC_ST.', 'success');
  }

  return (
    <section className="phone-card users-manager-wrap lookup-shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Tra cứu</h2>
        </div>
        <span className="chip">{orderStats.total} đơn</span>
      </div>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Đăng nhập và tra đơn Shopee</h3>
        </div>

        <div className="lookup-tabs">
          <button type="button" className={tab === 'cookie' ? 'is-active' : ''} onClick={() => setTab('cookie')}>Cookie</button>
          <button type="button" className={tab === 'account' ? 'is-active' : ''} onClick={() => setTab('account')}>User|Pass</button>
          <button type="button" className={tab === 'qr' ? 'is-active' : ''} onClick={() => setTab('qr')}>QR Login</button>
          <button type="button" className={tab === 'spx' ? 'is-active' : ''} onClick={() => setTab('spx')}>Tra MVĐ</button>
        </div>

        {tab === 'cookie' ? (
          <div className="form-grid compact lookup-form-grid">
            <label className="full-span">
              <span>Cookie SPC_ST (mỗi dòng 1 cookie)</span>
              <textarea value={cookieInput} onChange={(e) => setCookieInput(e.target.value)} placeholder={'SPC_ST=...\nSPC_ST=...'} />
            </label>
            <div className="lookup-action-row full-span">
              <button className="primary-button lookup-main-btn" type="button" disabled={loading} onClick={runCheckByCookieBatch}>Kiểm tra đơn</button>
              <button className="ghost-button lookup-copy-btn" type="button" disabled={loading} onClick={copyCookie}>Copy</button>
            </div>
          </div>
        ) : null}

        {tab === 'account' ? (
          <div className="form-grid compact lookup-form-grid">
            <label className="full-span">
              <span>User|Pass|SPC_F (mỗi dòng 1 account)</span>
              <textarea value={accountInput} onChange={(e) => setAccountInput(e.target.value)} placeholder={'user|pass|SPC_F\nuser|pass|SPC_F'} />
            </label>
            <div className="lookup-action-row full-span">
              <button className="primary-button lookup-main-btn" type="button" disabled={loading} onClick={runLoginAndCheckBatch}>Lấy SPC_ST + Tra đơn</button>
              <button className="ghost-button lookup-copy-btn" type="button" disabled={loading} onClick={copyCookie}>Copy</button>
            </div>
          </div>
        ) : null}

        {tab === 'qr' ? (
          <div className="lookup-qr-wrap">
            <div className="lookup-qr-actions">
              <button className="primary-button" type="button" disabled={loading} onClick={startQrLogin}>Tạo QR</button>
              <button className="ghost-button" type="button" onClick={cancelQr}>Hủy QR</button>
            </div>
            <p className="lookup-qr-status">{qrStatusText}</p>
            {qrImage ? <img className="lookup-qr-image" src={qrImage} alt="QR Login" /> : null}
            <label className="full-span lookup-qr-cookie-box">
              <span>SPC_ST từ QR</span>
              <textarea value={qrCookieText} onChange={(e) => setQrCookieText(e.target.value)} placeholder="SPC_ST=..." />
            </label>
            <button className="ghost-button lookup-copy-btn" type="button" onClick={copyQrCookie}>Copy SPC_ST QR</button>
          </div>
        ) : null}

        {tab === 'spx' ? (
          <div className="form-grid compact lookup-form-grid">
            <label className="full-span">
              <span>Mã vận đơn (mỗi dòng 1 mã)</span>
              <textarea value={spxInput} onChange={(e) => setSpxInput(e.target.value)} placeholder={'SPXVN...\nG...'} />
            </label>
            <button className="primary-button" type="button" disabled={loading} onClick={runSpxLookup}>Tra cứu vận đơn</button>
          </div>
        ) : null}

        <div className="lookup-output">
          <div><span>Username:</span><strong>{username || 'Chưa có'}</strong></div>
          <div><span>SPC_ST:</span><strong>{cookieOutput ? `${parseBatchLines(cookieOutput).length} cookie` : 'Chưa có'}</strong></div>
        </div>
      </article>

      {tab === 'spx' ? (
        <article className="hub-card">
          <div className="hub-card-head">
            <h3>Kết quả vận đơn</h3>
            <span className="chip">{spxResults.length} mã</span>
          </div>

          <div className="lookup-spx-grid">
            <div className="lookup-spx-list">
              {spxResults.length === 0 ? <div className="empty-state">Chưa có kết quả tra vận đơn.</div> : null}
              {spxResults.map((row, index) => (
                <button key={`${row.tracking || 'tracking'}-${index}`} className={`lookup-spx-item ${spxDetail?.tracking === row.tracking ? 'is-active' : ''}`} type="button" onClick={() => setSpxDetail(row)}>
                  <strong>{row.tracking || 'Không rõ mã'}</strong>
                  <span>{row.error || row.status || 'Chưa có trạng thái'}</span>
                </button>
              ))}
            </div>

            <div className="lookup-spx-detail">
              {!spxDetail ? <div className="empty-state">Chọn một vận đơn để xem timeline.</div> : null}
              {spxDetail ? (
                <>
                  <h4>{spxDetail.tracking}</h4>
                  <p className="lookup-spx-current">{spxDetail.error || spxDetail.status || 'Chưa có trạng thái'}</p>
                  <div className="lookup-timeline">
                    {(spxDetail.timeline || spxDetail.records || []).length === 0 ? <div className="empty-state">Chưa có timeline.</div> : null}
                    {(spxDetail.timeline || spxDetail.records || []).map((item, idx) => (
                      <div className="lookup-timeline-item" key={`${item.time || idx}-${idx}`}>
                        <strong>{(item as any).description || (item as any).desc || (item as any).status || 'Không rõ mô tả'}</strong>
                        <small>{item.time || 'Không rõ thời gian'}</small>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </article>
      ) : null}

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Danh sách đơn</h3>
          <div className="lookup-order-stats">
            <span>Tổng: {orderStats.total}</span>
            <span>Hủy được: {orderStats.cancelable}</span>
            <span>Đang giao: {orderStats.shipping}</span>
          </div>
        </div>

        <div className="lookup-orders-grid">
          {orders.length === 0 ? <div className="empty-state">Chưa có đơn để hiển thị.</div> : null}
          {orders.map((order, idx) => (
            <article className="lookup-order-card" key={`${order.orderId || idx}-${idx}`}>
              <div className="lookup-order-head">
                <strong>#{order.orderId || '---'}</strong>
                <span className="status-pill status-ordered">{order.statusText || 'Chưa rõ trạng thái'}</span>
              </div>

              <p><b>Người nhận:</b> {order.recipient || 'Chưa có'}</p>
              <p><b>SĐT:</b> {order.phone || 'Chưa có'}</p>
              <p><b>Địa chỉ:</b> {order.address || 'Chưa có'}</p>
              <p><b>Sản phẩm:</b> {extractOrderProductName(order)}</p>
              <p><b>Tổng:</b> {order.total || 'Chưa có'}</p>
              <p><b>Mã vận đơn:</b> {order.tracking || 'Chưa có'}</p>
              <p><b>Thời gian:</b> {order.orderTime || 'Chưa có'}</p>

              <div className="lookup-order-actions">
                <button
                  type="button"
                  className="mini-action"
                  onClick={() => cancelOrder(order)}
                  disabled={loading || !order.canCancel}
                >
                  Hủy đơn
                </button>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}









