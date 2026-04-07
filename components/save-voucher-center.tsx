'use client';

import { useEffect, useMemo, useState } from 'react';
import { showToast } from '@/lib/client-toast';

type RemoteVoucher = {
  id: string;
  code: string;
  title: string;
  kind: 'discount' | 'freeship';
  expiresAt: string;
  raw: Record<string, unknown>;
};

type InternalLink = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
};

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function normalizeKind(input: string) {
  const value = input.toLowerCase();
  return value.includes('ship') || value.includes('fsv') || value.includes('free') ? 'freeship' : 'discount';
}

function pickArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const anyPayload = payload as Record<string, unknown>;

  const candidates = [
    anyPayload.vouchers,
    anyPayload.items,
    (anyPayload.data as any)?.vouchers,
    (anyPayload.data as any)?.items,
    (anyPayload.data as any)?.list,
    anyPayload.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function normalizeVouchers(payload: unknown): RemoteVoucher[] {
  const rows = pickArray(payload);
  return rows
    .map((row, index) => {
      const item = (row || {}) as Record<string, unknown>;
      const code = cleanText(item.code || item.voucher_code || item.voucherCode || item.promotion_code || item.promotionCode);
      const id = cleanText(item.id || item.voucher_id || item.voucherId || item.promotion_id || item.promotionId || code || `row-${index}`);
      const title = cleanText(item.title || item.name || item.label || item.voucher_name || item.voucherName || `Voucher ${index + 1}`);
      const expiresAt = cleanText(item.expires_at || item.expire_at || item.expired_at || item.end_time || item.endTime);
      const kind = normalizeKind(cleanText(item.kind || item.type || item.category || title || code));

      return {
        id,
        code: code || id,
        title,
        kind,
        expiresAt,
        raw: item,
      } satisfies RemoteVoucher;
    })
    .filter((item) => item.code && item.title);
}

export function SaveVoucherCenter() {
  const [loading, setLoading] = useState(false);
  const [cookieText, setCookieText] = useState('');
  const [activeTab, setActiveTab] = useState<'discount' | 'freeship'>('discount');
  const [catalog, setCatalog] = useState<RemoteVoucher[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Record<string, boolean>>({});

  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [internalLinks, setInternalLinks] = useState<InternalLink[]>([]);

  const cookieLines = useMemo(() => cookieText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [cookieText]);
  const catalogByTab = useMemo(() => catalog.filter((item) => item.kind === activeTab), [catalog, activeTab]);

  useEffect(() => {
    loadInternalLinks();
  }, []);

  async function loadInternalLinks() {
    try {
      const response = await fetch('/api/save-voucher/internal-links', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Khong tai duoc link noi bo.');
      setInternalLinks(Array.isArray(data.links) ? data.links : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Khong tai duoc link noi bo.', 'error');
    }
  }

  function toggleSelect(code: string) {
    setSelectedCodes((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  async function fetchCatalog() {
    setLoading(true);
    try {
      const response = await fetch('/api/save-voucher/autopee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list',
          cookie: cookieLines[0] || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Khong tai duoc danh sach voucher tu Autopee.');

      const vouchers = normalizeVouchers(data.data);
      setCatalog(vouchers);

      if (vouchers.length === 0) {
        showToast('Chua doc duoc du lieu voucher tu API.', 'error');
      } else {
        showToast(`Da tai ${vouchers.length} voucher.`, 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Loi tai danh sach voucher.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function saveSelectedVouchers() {
    const selected = catalog.filter((item) => selectedCodes[item.code]);
    if (selected.length === 0) {
      showToast('Ban chua chon voucher can luu.', 'error');
      return;
    }
    if (cookieLines.length === 0) {
      showToast('Ban chua nhap cookie SPC_ST.', 'error');
      return;
    }

    setLoading(true);
    let okCount = 0;
    let failCount = 0;

    try {
      for (const cookie of cookieLines) {
        for (const voucher of selected) {
          const response = await fetch('/api/save-voucher/autopee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save',
              cookie,
              voucher,
            }),
          });

          if (response.ok) okCount += 1;
          else failCount += 1;
        }
      }

      if (failCount === 0) showToast(`Da gui ${okCount} yeu cau luu voucher.`, 'success');
      else showToast(`Hoan tat: ${okCount} thanh cong, ${failCount} loi.`, 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Co loi khi luu voucher.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function addInternalLink() {
    const title = cleanText(linkTitle);
    const url = cleanText(linkUrl);

    if (!title || !url) {
      showToast('Vui long nhap tieu de va link.', 'error');
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      showToast('Link phai bat dau bang http:// hoac https://', 'error');
      return;
    }

    try {
      const response = await fetch('/api/save-voucher/internal-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Khong them duoc link noi bo.');

      setLinkTitle('');
      setLinkUrl('');
      await loadInternalLinks();
      showToast('Da them link noi bo. Chi web cua ban thay link nay.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Khong them duoc link noi bo.', 'error');
    }
  }

  async function deleteInternalLink(id: string) {
    try {
      const response = await fetch(`/api/save-voucher/internal-links?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Khong xoa duoc link.');
      await loadInternalLinks();
      showToast('Da xoa link noi bo.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Khong xoa duoc link.', 'error');
    }
  }

  return (
    <section className="phone-card users-manager-wrap voucher-save-shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>LUU VOUCHER</h2>
        </div>
        <span className="chip">{catalog.length} voucher</span>
      </div>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Tu dong cau hinh API</h3>
          <span className="muted">Da dung API co dinh tren server, khong can nhap token/endpoint/method.</span>
        </div>
        <div className="voucher-top-actions">
          <button type="button" className="mini-action" onClick={fetchCatalog} disabled={loading}>Tai danh sach voucher</button>
          <button type="button" className="ghost-button" onClick={() => setSelectedCodes({})} disabled={loading}>Bo chon</button>
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Cookie Shopee</h3>
          <span className="muted">Moi dong 1 cookie SPC_ST</span>
        </div>
        <textarea className="voucher-cookie-input" value={cookieText} onChange={(e) => setCookieText(e.target.value)} placeholder={'SPC_ST=...\nSPC_ST=...'} />
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Danh muc voucher</h3>
          <div className="voucher-tabs">
            <button type="button" className={activeTab === 'discount' ? 'is-active' : ''} onClick={() => setActiveTab('discount')}>Ma giam gia</button>
            <button type="button" className={activeTab === 'freeship' ? 'is-active' : ''} onClick={() => setActiveTab('freeship')}>Freeship</button>
          </div>
        </div>

        <div className="voucher-list">
          {catalogByTab.length === 0 ? <div className="empty-state">Chua co du lieu voucher. Bam "Tai danh sach voucher" truoc.</div> : null}
          {catalogByTab.map((item) => (
            <label key={`${item.code}-${item.id}`} className="voucher-item voucher-checkbox-item">
              <input type="checkbox" checked={Boolean(selectedCodes[item.code])} onChange={() => toggleSelect(item.code)} />
              <div>
                <strong>{item.code}</strong>
                <p>{item.title}</p>
                <small>{item.expiresAt || 'Khong co han dung'}</small>
              </div>
            </label>
          ))}
        </div>

        <div className="voucher-top-actions">
          <button className="primary-button" type="button" disabled={loading} onClick={saveSelectedVouchers}>Luu voucher da chon</button>
          <button className="ghost-button" type="button" disabled={loading} onClick={() => setSelectedCodes({})}>Bo chon</button>
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Gui link voucher noi bo</h3>
          <span className="muted">Chi luu trong web con, web me khong co.</span>
        </div>

        <div className="form-grid compact">
          <label><span>Tieu de</span><input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="VD: Link san 100K" /></label>
          <label><span>URL</span><input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." /></label>
          <button className="primary-button" type="button" disabled={loading} onClick={addInternalLink}>Them link noi bo</button>
        </div>

        <div className="voucher-link-list">
          {internalLinks.length === 0 ? <div className="empty-state">Chua co link noi bo.</div> : null}
          {internalLinks.map((link) => (
            <div key={link.id} className="voucher-link-item">
              <div>
                <strong>{link.title}</strong>
                <a href={link.url} target="_blank" rel="noreferrer">{link.url}</a>
              </div>
              <button type="button" className="mini-action" onClick={() => deleteInternalLink(link.id)}>Xoa</button>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
