'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OrderRecord } from '@/lib/types';
import { showToast } from '@/lib/client-toast';

const statusLabel: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  ordered: 'Đã đặt',
  canceled: 'Đã hủy',
};

function detectDeliveryTone(raw: string) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('giao hàng thành công') || value.includes('đã giao') || value.includes('da giao') || value.includes('order delivered')) return 'delivered';
  if (value.includes('hủy') || value.includes('huy') || value.includes('hoàn') || value.includes('hoan')) return 'failed';
  return 'shipping';
}

type Props = {
  initialOrders: OrderRecord[];
  initialError?: string;
};

type TrackingTimelineItem = {
  time?: string;
  title?: string;
  description?: string;
  currentLoc?: string;
  nextLoc?: string;
  reason?: string;
};

type TrackingResult = {
  tracking?: string;
  status?: string;
  timeline?: TrackingTimelineItem[];
  error?: string;
};

function toTimelineEpoch(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return Number.NEGATIVE_INFINITY;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) {
      if (n > 1_000_000_000_000) return n;
      if (n > 1_000_000_000) return n * 1000;
    }
  }
  const direct = Date.parse(text);
  if (Number.isFinite(direct)) return direct;

  const m = text.match(/^(\d{1,2}):(\d{2})(?:\:(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    const second = Number(m[3] || 0);
    const day = Number(m[4]);
    const month = Number(m[5]) - 1;
    const year = Number(m[6]);
    return new Date(year, month, day, hour, minute, second).getTime();
  }
  return Number.NEGATIVE_INFINITY;
}

function normalizeTimeline(result?: TrackingResult | null) {
  if (!result) return [] as TrackingTimelineItem[];

  const sources = [
    result.timeline,
    (result as any).histories,
    (result as any).history,
    (result as any).events,
    (result as any).records,
  ];

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const mapped = source
      .map((item: any) => {
        const time = String(item?.time || item?.datetime || item?.updatedAt || item?.timestamp || '').trim();
        const title = String(item?.title || item?.status || item?.description || item?.desc || '').trim();
        const description = String(item?.detail || item?.location || item?.address || item?.note || '').trim();
        if (!time && !title && !description) return null;
        const currentLoc = String(item?.currentLoc || item?.current_location || '').trim();
        const nextLoc = String(item?.nextLoc || item?.next_location || '').trim();
        const reason = String(item?.reason || '').trim();
        return { time, title: title || description || 'Cập nhật trạng thái', description, currentLoc, nextLoc, reason };
      })
      .filter(Boolean) as TrackingTimelineItem[];

    if (mapped.length > 0) {
      return [...mapped].sort((a, b) => toTimelineEpoch(b.time || '') - toTimelineEpoch(a.time || ''));
    }
  }

  return [] as TrackingTimelineItem[];
}

export function CustomerOrders({ initialOrders, initialError = '' }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState('');
  const [trackingLoading, setTrackingLoading] = useState('');
  const [trackingDetail, setTrackingDetail] = useState<{ tracking: string; productName: string; result: TrackingResult } | null>(null);
  const [orderImagePreview, setOrderImagePreview] = useState('');
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    if (message) showToast(message, 'success');
    if (error) showToast(error, 'error');
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    if (!portalReady) return;
    const hasModal = Boolean(trackingDetail || orderImagePreview);
    if (!hasModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [portalReady, trackingDetail, orderImagePreview]);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      try {
        const response = await fetch('/api/orders', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không tải được lịch sử đơn.');
        if (!stopped) setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch (pollError) {
        if (!stopped) setError(pollError instanceof Error ? pollError.message : 'Không tải được lịch sử đơn.');
      }
    };

    load();
    const timer = window.setInterval(load, 20000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  async function openTracking(order: OrderRecord) {
    const tracking = order.deliveryTracking || '';
    if (!tracking) return;

    setTrackingLoading(tracking);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/api/tracking?tracking=${encodeURIComponent(tracking)}&orderId=${encodeURIComponent(order.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tra được hành trình vận đơn.');

      const result = data.result || {};
      const currentStatus = String(data?.currentStatus || result?.status || result?.latest?.desc || '').trim();

      setTrackingDetail({ tracking, productName: order.productName || 'Chưa có', result });

      if (currentStatus) {
        setOrders((prev) => prev.map((item) => (item.id === order.id ? { ...item, deliveryStatus: currentStatus } : item)));
      }

      setMessage('Đã tải hành trình vận đơn thành công.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tra được hành trình vận đơn.');
    } finally {
      setTrackingLoading('');
    }
  }

  const timelineItems = useMemo(() => normalizeTimeline(trackingDetail?.result), [trackingDetail]);

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return orders.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!keyword) return true;
      return [item.orderPublicId, item.recipientName, item.orderCode, item.productName, item.phone, item.deliveryTracking]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => ({
    total: orders.length,
    canceled: orders.filter((item) => item.status === 'canceled').length,
    inProgress: orders.filter((item) => item.status !== 'canceled').length,
  }), [orders]);

  return (
    <section className="phone-card ui-polish-history">
      <div className="section-head">
        <div>
          <p className="eyebrow">Lịch sử đơn hàng</p>
          <h2>Danh sách đơn của bạn</h2>
        </div>
        <span className="chip">{orders.length} đơn</span>
      </div>

      <div className="stats-grid">
        <div className="stats-card"><span>Tổng đơn</span><strong>{stats.total}</strong></div>
        <div className="stats-card"><span>Đang xử lí</span><strong>{stats.inProgress}</strong></div>
        <div className="stats-card"><span>Đã hủy</span><strong>{stats.canceled}</strong></div>
      </div>

      <div className="filter-bar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo ID đơn, người nhận, mã đơn, sản phẩm..." />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ xác nhận</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="ordered">Đã đặt</option>
          <option value="canceled">Đã hủy</option>
        </select>
      </div>

      <div className="order-list">
        {!error && filteredOrders.length === 0 ? <div className="empty-state">Không có đơn phù hợp bộ lọc.</div> : null}
        {filteredOrders.map((order) => {
          const isCanceled = order.status === 'canceled';
          const deliveryTone = detectDeliveryTone(order.deliveryStatus || '');
          return (
            <article className="order-card order-card-rich" key={order.id}>
              <div className="order-row order-top-row">
                <strong>{order.recipientName}</strong>
                <div className="order-status-wrap">
                  <span className={`order-code-chip order-chip-admin status-${order.status}`}>Admin: {statusLabel[order.status] || 'Chờ xác nhận'}</span>
                  {!isCanceled && order.deliveryTracking ? <span className="tracking-tag">{order.deliveryTracking}</span> : null}
                  {!isCanceled && order.deliveryTracking ? (
                    <button className="mini-action" type="button" onClick={() => openTracking(order)} disabled={trackingLoading === order.deliveryTracking}>
                      {trackingLoading === order.deliveryTracking ? 'Đang tra...' : 'Xem hành trình'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="order-meta-grid">
                <span className="order-code-chip">ID đơn: {order.orderPublicId || 'Chưa có'}</span>
                <span className="order-code-chip">Mã đơn hàng: {order.orderCode || 'Chưa có'}</span>
                {!isCanceled ? <span className="amount-text">{order.orderAmount || 'Chưa có thành tiền'}</span> : null}
              </div>

              {!isCanceled ? (
                <div className="order-row muted">
                  <span className={`order-code-chip order-chip-delivery delivery-${deliveryTone}`}>Trạng thái giao hàng: {order.deliveryStatus || 'Chưa kiểm tra'}</span>
                </div>
              ) : null}

              <p>{order.addressLine}, {order.ward}, {order.district}, {order.province}</p>
              {order.adminNote ? <p className="order-admin-note">Ghi chú admin: {order.adminNote}</p> : null}
              {!isCanceled ? <p className="product-name-line">{order.productName || 'Tên sản phẩm sẽ được admin cập nhật'}</p> : null}
              <p>{order.variant ? `${order.variant} · SL ${order.quantity}` : `SL ${order.quantity}`}</p>

              <div className="order-row">
                <a className="order-link" href={order.productLink} target="_blank" rel="noreferrer">Mở link sản phẩm</a>
                {order.orderImage ? <button className="mini-action" type="button" onClick={() => setOrderImagePreview(order.orderImage || '')}>Xem ảnh đơn</button> : null}
              </div>

              <div className="order-row muted">
                <span>{new Date(order.createdAt).toLocaleString('vi-VN')}</span>
                <span>@{order.username}</span>
              </div>
            </article>
          );
        })}
      </div>

      {portalReady && trackingDetail ? createPortal(
        <div className="modal-backdrop tracking-modal-backdrop tracking-fullscreen" onClick={() => setTrackingDetail(null)}>
          <div className="modal-card modal-card-clean tracking-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head modern modal-head-clean">
              <div>
                <p className="eyebrow">Vận đơn</p>
                <h3>{trackingDetail.tracking}</h3>
              </div>
              <button className="mini-action modal-close" onClick={() => setTrackingDetail(null)} type="button">Đóng</button>
            </div>
            <div className="modal-body modern modal-body-clean">
              <div className="tracking-summary-grid">
                <div className="tracking-summary-item">
                  <span>Tên sản phẩm</span>
                  <strong>{trackingDetail.productName || 'Chưa có'}</strong>
                </div>
                <div className="tracking-summary-item">
                  <span>Trạng thái hiện tại</span>
                  <strong>{trackingDetail.result?.status || trackingDetail.result?.error || 'Chưa có dữ liệu'}</strong>
                </div>
              </div>

              <div className="detail-block tracking-timeline-block">
                <span>Lịch sử giao hàng</span>
                {timelineItems.length > 0 ? (
                  <ul className="timeline-list timeline-rich timeline-clean">
                    {timelineItems.map((item, idx) => (
                      <li key={`${item.time || ''}-${idx}`}>
                        <strong>{item.time || '--:--'}</strong>
                        <p className="timeline-title">{item.title || 'Cập nhật trạng thái'}</p>
                        {item.description ? <p>{item.description}</p> : null}
                        {item.currentLoc ? <p><strong>Từ:</strong> {item.currentLoc}</p> : null}
                        {item.nextLoc ? <p><strong>Đến:</strong> {item.nextLoc}</p> : null}
                        {item.reason ? <p><strong>Lý do:</strong> {item.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Chưa có timeline chi tiết cho vận đơn này.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      , document.body) : null}

      {portalReady && orderImagePreview ? createPortal(
        <div className="modal-backdrop tracking-modal-backdrop tracking-fullscreen" onClick={() => setOrderImagePreview('')}>
          <div className="modal-card tracking-modal-card image-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head modern modal-head-clean">
              <h3>Ảnh đơn hàng</h3>
              <button className="mini-action modal-close" onClick={() => setOrderImagePreview('')} type="button">Đóng</button>
            </div>
            <div className="modal-body modern modal-body-clean">
              <img src={orderImagePreview} alt="Ảnh đơn hàng" className="order-image-preview" />
            </div>
          </div>
        </div>
      , document.body) : null}
    </section>
  );
}
