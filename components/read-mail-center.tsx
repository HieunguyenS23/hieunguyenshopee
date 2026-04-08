'use client';

import { useMemo, useState } from 'react';
import { showToast } from '@/lib/client-toast';

type MailReadItem = {
  input: string;
  email: string;
  ok: boolean;
  message: string;
  apiType: string;
  raw?: unknown;
  links: string[];
};

type ReadMailResponse = {
  results: MailReadItem[];
  allLinks: string[];
  summary: { total: number; ok: number; failed: number };
};

export function ReadMailCenter() {
  const [rowsInput, setRowsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReadMailResponse>({
    results: [],
    allLinks: [],
    summary: { total: 0, ok: 0, failed: 0 },
  });
  const [openedLinks, setOpenedLinks] = useState<string[]>([]);

  const newLinks = useMemo(
    () => data.allLinks.filter((link) => !openedLinks.includes(link)),
    [data.allLinks, openedLinks]
  );

  async function fetchMails() {
    const rows = rowsInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (rows.length === 0) {
      showToast('Bạn chưa nhập danh sách mail.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/read-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rows.join('\n') }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || 'Không đọc được mail.'));

      setData({
        results: Array.isArray(payload.results) ? payload.results : [],
        allLinks: Array.isArray(payload.allLinks) ? payload.allLinks : [],
        summary: payload.summary || { total: rows.length, ok: 0, failed: rows.length },
      });
      showToast(`Đã đọc ${rows.length} mail.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không đọc được mail.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openAllNewLinks() {
    if (newLinks.length === 0) {
      showToast('Không có link mới để mở.', 'error');
      return;
    }

    for (const link of newLinks) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
    setOpenedLinks((prev) => [...prev, ...newLinks]);
    showToast(`Đã mở ${newLinks.length} link mới.`, 'success');
  }

  async function copyAllLinks() {
    if (data.allLinks.length === 0) {
      showToast('Chưa có link để copy.', 'error');
      return;
    }

    await navigator.clipboard.writeText(data.allLinks.join('\n'));
    showToast('Đã copy toàn bộ link.', 'success');
  }

  return (
    <section className="phone-card users-manager-wrap read-mail-shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Đọc mail</h2>
        </div>
        <span className="chip">{data.summary.ok}/{data.summary.total || 0} OK</span>
      </div>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Nhập danh sách mail</h3>
          <span className="muted">Mỗi dòng: email|pass|refresh_token|client_id</span>
        </div>

        <textarea
          className="voucher-cookie-input"
          value={rowsInput}
          onChange={(e) => setRowsInput(e.target.value)}
          placeholder={'mail1@hotmail.com|pass|refresh_token|client_id\nmail2@hotmail.com|pass|refresh_token|client_id'}
        />

        <div className="voucher-top-actions add-mail-actions">
          <button className="ghost-button" type="button" onClick={() => setRowsInput('')} disabled={loading}>Xóa ô nhập</button>
          <button className="primary-button" type="button" onClick={fetchMails} disabled={loading}>{loading ? 'Đang đọc...' : 'Đọc mail'}</button>
          <button className="ghost-button" type="button" onClick={openAllNewLinks}>Mở tất cả link mới</button>
          <button className="ghost-button" type="button" onClick={copyAllLinks}>Copy links</button>
        </div>
      </article>

      <article className="hub-card read-mail-content">
        <div className="read-mail-left">
          <div className="hub-card-head">
            <h3>Kết quả đọc mail</h3>
            <span className="muted">Thành công: {data.summary.ok} • Lỗi: {data.summary.failed}</span>
          </div>

          <div className="lookup-orders-grid">
            {data.results.length === 0 ? <div className="empty-state">Chưa có kết quả.</div> : null}
            {data.results.map((item, index) => (
              <div key={`${item.email}-${index}`} className={`mail-read-item ${item.ok ? 'ok' : 'error'}`}>
                <div className="mail-read-item-head">
                  <strong>{item.email || '(không rõ email)'}</strong>
                  <span className={`mail-status-badge ${item.ok ? 'ok' : 'error'}`}>{item.ok ? 'Thành công' : 'Thất bại'}</span>
                </div>
                <p><b>API:</b> {item.apiType}</p>
                <p><b>Thông báo:</b> {item.message || '-'}</p>
                <p><b>Links:</b> {item.links.length}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="read-mail-right">
          <div className="hub-card-head"><h3>Links ({data.allLinks.length})</h3></div>
          <div className="read-mail-links">
            {data.allLinks.length === 0 ? <div className="empty-state">Chưa có link.</div> : null}
            {data.allLinks.map((link) => (
              <a key={link} href={link} target="_blank" rel="noreferrer" className={openedLinks.includes(link) ? 'is-opened' : ''}>
                {link}
              </a>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}
