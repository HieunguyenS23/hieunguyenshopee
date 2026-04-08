'use client';

import { useMemo, useState } from 'react';
import { showToast } from '@/lib/client-toast';

type AddMailResult = {
  source: string;
  cookie: string;
  email: string;
  proxy: string;
  status: boolean;
  message: string;
};

function shortCookie(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '(trống)';
  const token = raw.replace(/^SPC_ST=/i, '');
  if (token.length <= 12) return raw;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export function AddMailCenter() {
  const [rowsInput, setRowsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AddMailResult[]>([]);
  const [summary, setSummary] = useState({ total: 0, ok: 0, failed: 0 });

  const validRows = useMemo(
    () => rowsInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    [rowsInput]
  );

  function resetInput() {
    setRowsInput('');
    setResults([]);
    setSummary({ total: 0, ok: 0, failed: 0 });
    showToast('Đã xóa dữ liệu nhập.', 'success');
  }

  async function submitAddMail() {
    if (validRows.length === 0) {
      showToast('Bạn chưa có dữ liệu mail để gửi.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/email-additions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows.join('\n') }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error || 'Thêm mail thất bại.'));

      const nextResults = Array.isArray(data.results) ? data.results : [];
      setResults(nextResults);
      setSummary({
        total: Number(data?.summary?.total || validRows.length),
        ok: Number(data?.summary?.ok || 0),
        failed: Number(data?.summary?.failed || 0),
      });
      showToast('Đã xử lí xong danh sách thêm mail.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thêm được mail.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="phone-card users-manager-wrap add-mail-shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Thêm hotmail</h2>
        </div>
        <span className="chip">{summary.ok}/{summary.total || validRows.length} OK</span>
      </div>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Dữ liệu thêm mail</h3>
          <span className="muted">Format mỗi dòng: mail|SPC_ST hoặc mail|SPC_ST|proxy</span>
        </div>

        <textarea
          className="voucher-cookie-input"
          value={rowsInput}
          onChange={(e) => setRowsInput(e.target.value)}
          placeholder={'email@gmail.com|SPC_ST=...\nemail2@gmail.com|SPC_ST=...|ip:port:user:pass'}
        />

        <div className="voucher-top-actions">
          <button type="button" className="ghost-button" onClick={resetInput} disabled={loading}>
            Xóa ô nhập
          </button>
          <button type="button" className="primary-button" onClick={submitAddMail} disabled={loading}>
            {loading ? 'Đang gửi...' : 'Bắt đầu thêm mail'}
          </button>
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Kết quả thêm mail</h3>
          <span className="muted">Thành công: {summary.ok} • Lỗi: {summary.failed}</span>
        </div>

        <div className="mail-result-table-wrap">
          <table className="mail-result-table">
            <thead>
              <tr>
                <th>Cookie</th>
                <th>Email</th>
                <th>Trạng thái</th>
                <th>Thông báo</th>
                <th>Proxy</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={5} className="mail-result-empty">Chưa có kết quả xử lý.</td>
                </tr>
              ) : null}
              {results.map((item, index) => (
                <tr key={`${item.source}-${index}`}>
                  <td title={item.cookie}>{shortCookie(item.cookie)}</td>
                  <td>{item.email || '(trống)'}</td>
                  <td>
                    <span className={`mail-status-badge ${item.status ? 'ok' : 'error'}`}>
                      {item.status ? 'Thành công' : 'Thất bại'}
                    </span>
                  </td>
                  <td>{item.message || '-'}</td>
                  <td>{item.proxy || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
