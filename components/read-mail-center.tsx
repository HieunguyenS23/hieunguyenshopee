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

const DLINK_REGEX = /^https:\/\/vn\.shp\.ee\/dlink\/[a-zA-Z0-9]+$/i;

function uniqueLinks(input: string[]) {
  return Array.from(new Set((input || []).map((item) => String(item || '').trim()).filter(Boolean)));
}

export function ReadMailCenter() {
  const [rowsInput, setRowsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [data, setData] = useState<ReadMailResponse>({
    results: [],
    allLinks: [],
    summary: { total: 0, ok: 0, failed: 0 },
  });

  const groupedLinks = useMemo(() => {
    return data.results.map((item, index) => {
      const links = uniqueLinks(item.links || []).filter((link) => DLINK_REGEX.test(link));
      return {
        index,
        email: item.email || '(khong ro email)',
        ok: item.ok,
        message: item.message,
        links,
      };
    });
  }, [data.results]);

  const allGroupedLinks = useMemo(() => groupedLinks.flatMap((item) => item.links), [groupedLinks]);
  const selectedMail = data.results[selectedIndex] || null;

  async function fetchMails() {
    const rows = rowsInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (rows.length === 0) {
      showToast('Ban chua nhap danh sach mail.', 'error');
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
      if (!response.ok) throw new Error(String(payload.error || 'Khong doc duoc mail.'));

      const results = Array.isArray(payload.results) ? payload.results : [];
      setData({
        results,
        allLinks: Array.isArray(payload.allLinks) ? payload.allLinks : [],
        summary: payload.summary || { total: rows.length, ok: 0, failed: rows.length },
      });
      setSelectedIndex(0);
      showToast(`Da doc ${rows.length} mail.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Khong doc duoc mail.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openAllLinks() {
    if (allGroupedLinks.length === 0) {
      showToast('Khong co link dlink de mo.', 'error');
      return;
    }

    for (const link of allGroupedLinks) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
    showToast(`Da mo ${allGroupedLinks.length} link.`, 'success');
  }

  async function copyAllLinks() {
    if (allGroupedLinks.length === 0) {
      showToast('Khong co link dlink de copy.', 'error');
      return;
    }

    await navigator.clipboard.writeText(allGroupedLinks.join('\n'));
    showToast('Da copy toan bo link dlink.', 'success');
  }

  return (
    <section className="phone-card users-manager-wrap read-mail-shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Doc mail</h2>
        </div>
        <span className="chip">{data.summary.ok}/{data.summary.total || 0} OK</span>
      </div>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Danh sach mail</h3>
          <span className="muted">Moi dong: email|pass|refresh_token|client_id</span>
        </div>

        <textarea
          className="voucher-cookie-input"
          value={rowsInput}
          onChange={(e) => setRowsInput(e.target.value)}
          placeholder={'mail1@hotmail.com|pass|refresh_token|client_id\nmail2@hotmail.com|pass|refresh_token|client_id'}
        />

        <div className="voucher-top-actions add-mail-actions">
          <button className="ghost-button" type="button" onClick={() => setRowsInput('')} disabled={loading}>Xoa o nhap</button>
          <button className="primary-button" type="button" onClick={fetchMails} disabled={loading}>{loading ? 'Dang doc...' : 'Doc mail'}</button>
        </div>
      </article>

      <article className="hub-card read-mail-layout">
        <div className="read-mail-col left">
          <div className="hub-card-head">
            <h3>Danh sach mail</h3>
            <span className="muted">Thanh cong: {data.summary.ok} • Loi: {data.summary.failed}</span>
          </div>

          <div className="read-mail-list">
            {data.results.length === 0 ? <div className="empty-state">Chua co ket qua.</div> : null}
            {data.results.map((item, index) => (
              <button
                key={`${item.email}-${index}`}
                type="button"
                className={`mail-read-item ${item.ok ? 'ok' : 'error'} ${selectedIndex === index ? 'is-active' : ''}`}
                onClick={() => setSelectedIndex(index)}
              >
                <div className="mail-read-item-head">
                  <strong>{item.email || '(khong ro email)'}</strong>
                  <span className={`mail-status-badge ${item.ok ? 'ok' : 'error'}`}>{item.ok ? 'Thanh cong' : 'That bai'}</span>
                </div>
                <p><b>API:</b> {item.apiType}</p>
                <p><b>Thong bao:</b> {item.message || '-'}</p>
                <p><b>Dlink:</b> {uniqueLinks(item.links || []).filter((link) => DLINK_REGEX.test(link)).length}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="read-mail-col right">
          <div className="hub-card-head">
            <h3>Links theo tung mail</h3>
            <span className="muted">Regex co dinh: https://vn.shp.ee/dlink/[a-zA-Z0-9]+</span>
          </div>

          <div className="voucher-top-actions read-mail-link-actions">
            <button className="primary-button" type="button" onClick={openAllLinks}>Mo tat ca link</button>
            <button className="ghost-button" type="button" onClick={copyAllLinks}>Copy links</button>
          </div>

          <div className="read-mail-links grouped">
            {!selectedMail && groupedLinks.length === 0 ? <div className="empty-state">Chua co link.</div> : null}
            {groupedLinks.map((group) => (
              <div key={`${group.email}-${group.index}`} className={`read-mail-group ${selectedIndex === group.index ? 'is-active' : ''}`}>
                <div className="read-mail-group-head">
                  <strong>{group.email}</strong>
                  <span>{group.links.length} link</span>
                </div>
                {group.links.length === 0 ? <p className="read-mail-group-empty">Khong co link dlink.</p> : null}
                {group.links.length > 0 ? (
                  <div className="read-mail-group-links">
                    {group.links.map((link) => (
                      <a key={`${group.email}-${link}`} href={link} target="_blank" rel="noreferrer">
                        {link}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}
