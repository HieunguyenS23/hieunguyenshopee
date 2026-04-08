'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { showToast } from '@/lib/client-toast';

type AddMailResult = {
  source: string;
  ok: boolean;
  message: string;
};

const DEFAULT_KEY = 'otis_9lGRopDaIopztPXQ4C8glIj2Xp717AIK';

export function AddMailCenter() {
  const [rowsInput, setRowsInput] = useState('');
  const [apiKey, setApiKey] = useState(DEFAULT_KEY);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AddMailResult[]>([]);
  const [summary, setSummary] = useState({ total: 0, ok: 0, failed: 0 });

  const validRows = useMemo(() => rowsInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [rowsInput]);

  async function onUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRowsInput((prev) => `${prev}\n${text}`.trim());
    event.target.value = '';
  }

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
      const response = await fetch('/api/admin/add-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          rows: validRows.join('\n'),
        }),
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
      showToast('Đã gửi yêu cầu thêm mail thành công.', 'success');
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
          <h3>Cấu hình API Otistx</h3>
          <span className="muted">Luồng bulk-mail, mỗi dòng 1 mail.</span>
        </div>

        <div className="form-grid compact">
          <label className="full-span"><span>API key</span><input value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></label>
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Dữ liệu thêm mail</h3>
          <span className="muted">Mỗi dòng là 1 record mail (giống bulk-mail).</span>
        </div>

        <textarea
          className="voucher-cookie-input"
          value={rowsInput}
          onChange={(e) => setRowsInput(e.target.value)}
          placeholder={'email1|pass1\nemail2|pass2'}
        />

        <div className="voucher-top-actions">
          <label className="mini-action file-btn">
            Tải file
            <input type="file" accept=".txt,.csv" onChange={onUploadFile} hidden />
          </label>
          <button type="button" className="ghost-button" onClick={resetInput} disabled={loading}>Xóa ô nhập</button>
          <button type="button" className="primary-button" onClick={submitAddMail} disabled={loading}>
            {loading ? 'Đang gửi...' : 'Bắt đầu thêm mail'}
          </button>
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Kết quả</h3>
          <span className="muted">Thành công: {summary.ok} • Lỗi: {summary.failed}</span>
        </div>

        <div className="lookup-orders-grid">
          {results.length === 0 ? <div className="empty-state">Chưa có kết quả xử lý.</div> : null}
          {results.map((item, index) => (
            <div key={`${item.source}-${index}`} className={`mail-result-item ${item.ok ? 'ok' : 'error'}`}>
              <strong>{item.ok ? 'OK' : 'Lỗi'}</strong>
              <p>{item.source}</p>
              <small>{item.message}</small>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
