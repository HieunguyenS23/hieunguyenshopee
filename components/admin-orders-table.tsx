'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OrderRecord, OrderStatus, VoucherType } from '@/lib/types';
import { showToast } from '@/lib/client-toast';

type Props = { initialOrders: OrderRecord[] };

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'ordered', label: 'Đã đặt' },
  { value: 'canceled', label: 'Đã hủy' },
];

const voucherOptions: { value: VoucherType; label: string }[] = [
  { value: '100k', label: 'Mã 100k' },
  { value: '80k', label: 'Mã 80k' },
  { value: '60k', label: 'Mã 60k' },
];

const statusLabel: Record<OrderStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  ordered: 'Đã đặt',
  canceled: 'Đã hủy',
};

const ONE_HOUR_MS = 60 * 60 * 1000;

function detectDeliveryTone(raw: string) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('giao hàng thành công') || value.includes('đã giao') || value.includes('da giao') || value.includes('order delivered')) return 'delivered';
  if (value.includes('hủy') || value.includes('huy') || value.includes('hoàn') || value.includes('hoan')) return 'failed';
  return 'shipping';
}

export function AdminOrdersTable({ initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [voucherFilter, setVoucherFilter] = useState('all');
  const [savingId, setSavingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [detailOrder, setDetailOrder] = useState<OrderRecord | null>(null);
  const [detailDraft, setDetailDraft] = useState<OrderRecord | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [modalActionLoading, setModalActionLoading] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [portalReady, setPortalReady] = useState(false);
  const ordersRef = useRef<OrderRecord[]>(initialOrders);
  const batchRunningRef = useRef(false);

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
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!portalReady) return;
    const hasModal = Boolean(detailOrder || previewImage);
    if (!hasModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [portalReady, detailOrder, previewImage]);

  async function patchOrder(orderId: string, payload: any, successText?: string, silent = false) {
    setSavingId(orderId);
    if (!silent) {
      setMessage('');
      setError('');
    }

    try {
      const response = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không cập nhật được đơn.');

      const updated = data.order as OrderRecord;
      setOrders((prev) => prev.map((item) => (item.id === orderId ? updated : item)));
      if (detailOrder?.id === updated.id) {
        setDetailOrder(updated);
        setDetailDraft(updated);
      }
      if (!silent) setMessage(successText || 'Đã cập nhật đơn thành công.');
      return updated;
    } catch (updateError) {
      if (!silent) setError(updateError instanceof Error ? updateError.message : 'Đã có lỗi xảy ra.');
      return null;
    } finally {
      setSavingId('');
    }
  }

  async function removeOrder(order: OrderRecord) {
    if (!confirm(`Xóa đơn #${order.id.slice(0, 8)}?`)) return;
    setSavingId(order.id);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/orders?orderId=${encodeURIComponent(order.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không xóa được đơn.');
      setOrders((prev) => prev.filter((item) => item.id !== order.id));
      setMessage('Đã xóa đơn thành công.');
      if (detailOrder?.id === order.id) {
        setDetailOrder(null);
        setDetailDraft(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được đơn.');
    } finally {
      setSavingId('');
    }
  }

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    const runHourlyBatch = async () => {
      if (batchRunningRef.current) return;
      batchRunningRef.current = true;
      try {
        for (const order of ordersRef.current) {
          if (order.status === 'canceled') continue;
          let current = order;

          if ((order.processingAccount || '').trim()) {
            const updated = await patchOrder(order.id, {
              processingAccount: order.processingAccount,
              refreshCookieFromAccount: true,
            }, undefined, true);
            if (updated) current = updated;
          }

          const cookieForCheck = (current.processingCookie || '').trim();
          if (cookieForCheck) {
            await patchOrder(order.id, {
              processingCookie: cookieForCheck,
              refreshDeliveryStatus: true,
            }, undefined, true);
          }
        }
      } finally {
        batchRunningRef.current = false;
      }
    };

    runHourlyBatch();
    const timer = window.setInterval(runHourlyBatch, ONE_HOUR_MS);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshCookie(order: OrderRecord) {
    if (order.status === 'canceled') return;
    await patchOrder(order.id, {
      processingAccount: order.processingAccount,
      refreshCookieFromAccount: true,
    }, 'Đã cập nhật cookie mới thành công.');
  }

  async function refreshDeliveryStatus(order: OrderRecord) {
    if (order.status === 'canceled') return;
    await patchOrder(order.id, {
      processingCookie: order.processingCookie,
      deliveryTracking: order.deliveryTracking || '',
      refreshDeliveryStatus: true,
    }, 'Đã cập nhật trạng thái giao hàng.');
  }

  function openDetail(order: OrderRecord) {
    setDetailOrder(order);
    setDetailDraft(order);
  }

  async function saveDetailEdits() {
    if (!detailOrder || !detailDraft) return;
    setDetailSaving(true);
    const updated = await patchOrder(detailOrder.id, {
      recipientName: detailDraft.recipientName,
      phone: detailDraft.phone,
      addressLine: detailDraft.addressLine,
      ward: detailDraft.ward,
      district: detailDraft.district,
      province: detailDraft.province,
      voucherType: detailDraft.voucherType,
      productLink: detailDraft.productLink,
      variant: detailDraft.variant,
      quantity: detailDraft.quantity,
      processingCookie: detailDraft.processingCookie,
      processingAccount: detailDraft.processingAccount,
      orderImage: detailDraft.orderImage || '',
      adminNote: detailDraft.adminNote || '',
    }, 'Đã lưu chỉnh sửa đơn hàng.');

    if (updated) {
      setDetailOrder(updated);
      setDetailDraft(updated);
    }
    setDetailSaving(false);
  }

  function handleOrderImageFile(file: File) {
    if (!detailDraft) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setDetailDraft({ ...detailDraft, orderImage: result });
    };
    reader.readAsDataURL(file);
  }

  async function runModalAction(type: 'cookie' | 'status') {
    if (!detailDraft) return;
    setModalActionLoading(type);

    const payload = type === 'cookie'
      ? { processingAccount: detailDraft.processingAccount, refreshCookieFromAccount: true }
      : { processingCookie: detailDraft.processingCookie, deliveryTracking: detailDraft.deliveryTracking || '', refreshDeliveryStatus: true };

    const successText = type === 'cookie' ? 'Đã cập nhật cookie mới thành công.' : 'Đã cập nhật trạng thái giao hàng.';
    const updated = await patchOrder(detailDraft.id, payload, successText);

    if (updated) {
      setDetailOrder(updated);
      setDetailDraft(updated);
    }
    setModalActionLoading('');
  }

  const total = useMemo(() => orders.length, [orders.length]);
  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((item) => item.status === 'pending').length,
    confirmed: orders.filter((item) => item.status === 'confirmed').length,
    ordered: orders.filter((item) => item.status === 'ordered').length,
    canceled: orders.filter((item) => item.status === 'canceled').length,
  }), [orders]);

  const voucherFilters = useMemo(() => Array.from(new Set(orders.map((item) => item.voucherType))).filter(Boolean), [orders]);

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return orders.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (voucherFilter !== 'all' && item.voucherType !== voucherFilter) return false;
      if (!keyword) return true;
      return [item.recipientName, item.orderCode, item.phone, item.username, item.deliveryTracking, item.productName, item.orderPublicId || '']
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [orders, search, statusFilter, voucherFilter]);

  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">Danh sách đơn</p>
          <h2>Bảng quản lí</h2>
        </div>
        <span className="chip">{total} đơn</span>
      </div>

      <div className="stats-grid">
        <div className="stats-card"><span>Tổng</span><strong>{stats.total}</strong></div>
        <div className="stats-card"><span>Chờ xác nhận</span><strong>{stats.pending}</strong></div>
        <div className="stats-card"><span>Đã xác nhận</span><strong>{stats.confirmed}</strong></div>
        <div className="stats-card"><span>Đã đặt</span><strong>{stats.ordered}</strong></div>
        <div className="stats-card"><span>Đã hủy</span><strong>{stats.canceled}</strong></div>
      </div>

      <div className="filter-bar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, mã đơn, SĐT, username..." />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}>
          <option value="all">Tất cả trạng thái</option>
          {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={voucherFilter} onChange={(e) => setVoucherFilter(e.target.value)}>
          <option value="all">Tất cả voucher</option>
          {voucherFilters.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      <div className="sheet-wrap">
        <table className="sheet-table">
          <thead>
            <tr>
              <th>Mã đơn hàng</th>
              <th>Người nhận</th>
              <th>Check</th>
              <th>Thành tiền</th>
              <th className="col-delivery">Trạng thái giao hàng</th>
              <th>Mã vận đơn</th>
              <th>Tác vụ</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td className="sheet-empty" colSpan={7}>Không có đơn phù hợp bộ lọc.</td>
              </tr>
            ) : null}
            {filteredOrders.map((order) => {
              const deliveryStatus = order.status === 'canceled' ? 'Đơn đã hủy' : (order.deliveryStatus || 'Chưa kiểm tra');
              const tone = detectDeliveryTone(deliveryStatus);
              return (
                <tr key={order.id}>
                  <td><span className="order-code-chip">{order.orderPublicId || 'Chưa có'}</span></td>
                  <td>{order.recipientName}</td>
                  <td className="col-check">
                    <select
                      className={`status-select status-${order.status}`}
                      value={order.status}
                      disabled={savingId === order.id}
                      onChange={(event) => patchOrder(order.id, { status: event.target.value as OrderStatus }, 'Đã cập nhật trạng thái đơn.')}
                    >
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                  <td><strong className="amount-text">{order.orderAmount || 'Chưa có'}</strong></td>
                  <td className="col-delivery">
                    <div className="delivery-cell">
                      <span className={`delivery-pill delivery-${tone}`}>{deliveryStatus}</span>
                      <small>{order.deliveryCheckedAt ? new Date(order.deliveryCheckedAt).toLocaleString('vi-VN') : 'Chưa có thời gian'}</small>
                    </div>
                  </td>
                  <td><span className="tracking-cell">{order.deliveryTracking || 'Chưa có'}</span></td>
                  <td>
                    <div className="icon-actions">
                      <button className="icon-action-btn" title="Cập nhật cookie" aria-label="Cập nhật cookie" disabled={savingId === order.id || !order.processingAccount || order.status === 'canceled'} onClick={() => refreshCookie(order)} type="button">↻</button>
                      <button className="icon-action-btn" title="Cập nhật trạng thái giao hàng" aria-label="Cập nhật trạng thái giao hàng" disabled={savingId === order.id || !order.processingCookie || order.status === 'canceled'} onClick={() => refreshDeliveryStatus(order)} type="button">⌛</button>
                      <button className="icon-action-btn" title="Xem chi tiết" aria-label="Xem chi tiết" onClick={() => openDetail(order)} type="button">ⓘ</button>
                      <button className="icon-action-btn" title="Xóa đơn" aria-label="Xóa đơn" onClick={() => removeOrder(order)} disabled={savingId === order.id} type="button">🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {portalReady && detailOrder && detailDraft ? createPortal(
        <div className="modal-backdrop" onClick={() => setDetailOrder(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head modern">
              <div>
                <p className="eyebrow">Đơn hàng</p>
                <h3>Chi tiết #{detailOrder.id.slice(0, 8)}</h3>
              </div>
              <div className="modal-actions">
                <button className="primary-button compact" onClick={saveDetailEdits} disabled={detailSaving} type="button">
                  {detailSaving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
                </button>
                <button className="mini-action modal-close" onClick={() => setDetailOrder(null)} type="button">Đóng</button>
              </div>
            </div>

            <div className="modal-body modern">
              <div className="modal-status-row">
                <span className={`status-pill status-${detailDraft.status}`}>{statusLabel[detailDraft.status]}</span>
                <span className="modal-muted">{new Date(detailDraft.createdAt).toLocaleString('vi-VN')}</span>
              </div>

              <div className="detail-grid editable-grid">
                <div className="detail-item"><span>Mã đơn hàng</span><strong>{detailDraft.orderPublicId || 'Chưa có'}</strong></div>
                <div className="detail-item"><span>Mã hệ thống</span><strong>{detailDraft.orderCode || 'Chưa có'}</strong></div>
                <div className="detail-item"><span>Thành tiền</span><strong>{detailDraft.orderAmount || 'Chưa có'}</strong></div>
                <div className="detail-item"><span>Username</span><strong>@{detailDraft.username}</strong></div>
                <div className="detail-item"><span>Tên sản phẩm</span><strong>{detailDraft.productName || 'Chưa có'}</strong></div>

                <label className="detail-item edit-field"><span>Người nhận</span><input value={detailDraft.recipientName} onChange={(e) => setDetailDraft({ ...detailDraft, recipientName: e.target.value })} /></label>
                <label className="detail-item edit-field"><span>SĐT</span><input value={detailDraft.phone} placeholder="Để trống = ảo" onChange={(e) => setDetailDraft({ ...detailDraft, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></label>
                <label className="detail-item edit-field"><span>Loại mã</span>
                  <select value={detailDraft.voucherType} onChange={(e) => setDetailDraft({ ...detailDraft, voucherType: e.target.value as VoucherType })}>
                    {voucherOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <label className="detail-item edit-field"><span>Phường/Xã</span><input value={detailDraft.ward} onChange={(e) => setDetailDraft({ ...detailDraft, ward: e.target.value })} /></label>
                <label className="detail-item edit-field"><span>Quận/Huyện</span><input value={detailDraft.district} onChange={(e) => setDetailDraft({ ...detailDraft, district: e.target.value })} /></label>
                <label className="detail-item edit-field"><span>Tỉnh/Thành</span><input value={detailDraft.province} onChange={(e) => setDetailDraft({ ...detailDraft, province: e.target.value })} /></label>
                <label className="detail-item edit-field"><span>Số lượng</span><input min={1} type="number" value={detailDraft.quantity} onChange={(e) => setDetailDraft({ ...detailDraft, quantity: Number(e.target.value || 1) })} /></label>
              </div>

              <label className="detail-block edit-field">
                <span>Địa chỉ cụ thể</span>
                <input value={detailDraft.addressLine} onChange={(e) => setDetailDraft({ ...detailDraft, addressLine: e.target.value })} />
              </label>

              <label className="detail-block edit-field">
                <span>Link sản phẩm</span>
                <input value={detailDraft.productLink} onChange={(e) => setDetailDraft({ ...detailDraft, productLink: e.target.value })} />
              </label>

              <label className="detail-block edit-field">
                <span>Phân loại sản phẩm</span>
                <input value={detailDraft.variant} onChange={(e) => setDetailDraft({ ...detailDraft, variant: e.target.value })} />
              </label>

              <div className="detail-grid">
                <div className="detail-item"><span>Trạng thái giao hàng</span><strong>{detailDraft.deliveryStatus || 'Chưa kiểm tra'}</strong></div>
                <div className="detail-item"><span>Mã vận đơn</span><strong>{detailDraft.deliveryTracking || 'Chưa có'}</strong></div>
              </div>

              <div className="detail-grid editable-grid">
                <label className="detail-item edit-field">
                  <span>Cookie xử lí</span>
                  <input value={detailDraft.processingCookie || ''} placeholder="SPC_ST=..." onChange={(e) => setDetailDraft({ ...detailDraft, processingCookie: e.target.value })} />
                </label>
                <label className="detail-item edit-field">
                  <span>Account xử lí</span>
                  <input value={detailDraft.processingAccount || ''} placeholder="user|pass|SPC_F" onChange={(e) => setDetailDraft({ ...detailDraft, processingAccount: e.target.value })} />
                </label>
              </div>

              <label className="detail-block edit-field">
                <span>Ghi chú admin</span>
                <textarea value={detailDraft.adminNote || ''} onChange={(e) => setDetailDraft({ ...detailDraft, adminNote: e.target.value })} placeholder="Ghi chú hiển thị bên lịch sử khách" />
              </label>

              <div className="detail-block">
                <span>Ảnh đơn hàng</span>
                <div className="detail-image-tools">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleOrderImageFile(file);
                      e.currentTarget.value = '';
                    }}
                  />
                  {detailDraft.orderImage ? (
                    <>
                      <button className="mini-action" type="button" onClick={() => setPreviewImage(detailDraft.orderImage || '')}>Xem ảnh</button>
                      <button className="mini-action" type="button" onClick={() => setDetailDraft({ ...detailDraft, orderImage: '' })}>Xóa ảnh</button>
                    </>
                  ) : <small>Chưa có ảnh</small>}
                </div>
              </div>

              <div className="modal-actions">
                <button className="mini-action" onClick={() => runModalAction('cookie')} disabled={modalActionLoading === 'cookie' || !detailDraft.processingAccount} type="button">
                  {modalActionLoading === 'cookie' ? 'Đang cập nhật...' : 'Cập nhật cookie'}
                </button>
                <button className="mini-action" onClick={() => runModalAction('status')} disabled={modalActionLoading === 'status' || !detailDraft.processingCookie} type="button">
                  {modalActionLoading === 'status' ? 'Đang cập nhật...' : 'Cập nhật trạng thái giao'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body) : null}

      {portalReady && previewImage ? createPortal(
        <div className="modal-backdrop" onClick={() => setPreviewImage('')}>
          <div className="modal-card image-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Ảnh đơn hàng</h3>
              <button className="mini-action" type="button" onClick={() => setPreviewImage('')}>Đóng</button>
            </div>
            <div className="modal-body">
              <img src={previewImage} alt="Ảnh đơn hàng" className="order-image-preview" />
            </div>
          </div>
        </div>
      , document.body) : null}
    </>
  );
}

