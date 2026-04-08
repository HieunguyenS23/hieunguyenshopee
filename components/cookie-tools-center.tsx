'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/lib/client-toast';

function normalizeSpcSt(raw: string) {
  const value = String(raw || '').trim().replace(/^"+|"+$/g, '');
  if (!value) return '';
  if (/^SPC_ST=/i.test(value)) return value;
  const matched = value.match(/SPC_ST=([^|;\s]+)/i);
  if (matched?.[1]) return `SPC_ST=${matched[1]}`;
  return `SPC_ST=${value}`;
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

function parseLines(input: string) {
  return String(input || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function replaceSpcStInRow(originalRow: string, newSpcSt: string) {
  const row = String(originalRow || '');
  const cookie = normalizeSpcSt(newSpcSt);
  if (!row || !cookie) return row;

  if (/SPC_ST=/i.test(row)) {
    return row.replace(/SPC_ST=[^|]*/i, cookie);
  }

  return `${row}|${cookie}`;
}

export function CookieToolsCenter() {
  const [loading, setLoading] = useState(false);
  const [sourceLinesText, setSourceLinesText] = useState('');
  const [newSpcStText, setNewSpcStText] = useState('');

  const [qrSessionId, setQrSessionId] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrStatusText, setQrStatusText] = useState('Chưa tạo QR.');
  const pollTimer = useRef<number | null>(null);

  const sourceLines = useMemo(() => parseLines(sourceLinesText), [sourceLinesText]);
  const newSpcStLines = useMemo(() => parseLines(newSpcStText), [newSpcStText]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, []);

  async function callLookup(payload: Record<string, unknown>) {
    const response = await fetch('/api/admin/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(data.error || 'Gọi API thất bại.'));
    }

    return data;
  }

  async function getNewSpcStBatch() {
    if (sourceLines.length === 0) {
      showToast('Bạn chưa nhập user|pass để xử lý.', 'error');
      return;
    }

    setLoading(true);
    try {
      const out: string[] = [];
      let success = 0;
      let failed = 0;

      for (const line of sourceLines) {
        try {
          const response = await fetch('/api/admin/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', input: line }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            failed += 1;
            out.push('');
            continue;
          }

          const cookieRaw = String(data?.data?.cookie || '').trim();
          const spcSt = normalizeSpcSt(cookieRaw);
          if (spcSt) {
            out.push(spcSt);
            success += 1;
          } else {
            out.push('');
            failed += 1;
          }
        } catch {
          out.push('');
          failed += 1;
        }
      }

      setNewSpcStText(out.filter(Boolean).join('\n'));
      if (success > 0) {
        showToast(`Đã lấy ${success}/${sourceLines.length} SPC_ST mới.`, failed > 0 ? 'info' : 'success');
      } else {
        showToast('Không lấy được SPC_ST nào.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyWithReplace() {
    if (sourceLines.length === 0) {
      showToast('Bạn chưa nhập chuỗi nguồn.', 'error');
      return;
    }
    if (newSpcStLines.length === 0) {
      showToast('Bạn chưa có danh sách SPC_ST mới.', 'error');
      return;
    }

    const replaced = sourceLines.map((row, index) => replaceSpcStInRow(row, newSpcStLines[index] || ''));
    const text = replaced.join('\n').trim();
    if (!text) {
      showToast('Không có dữ liệu để copy.', 'error');
      return;
    }

    await navigator.clipboard.writeText(text);

    if (newSpcStLines.length < sourceLines.length) {
      showToast('Đã thay thế một phần và copy kết quả.', 'info');
    } else {
      showToast('Đã thay thế SPC_ST và copy kết quả.', 'success');
    }
  }

  async function copyQrCookie() {
    const value = String(newSpcStText || '').trim();
    if (!value) {
      showToast('Chưa có SPC_ST để copy.', 'error');
      return;
    }
    await navigator.clipboard.writeText(value);
    showToast('Đã copy SPC_ST từ QR.', 'success');
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

      pollTimer.current = window.setInterval(async () => {
        try {
          const statusResult = await callLookup({ action: 'qr_status', sessionId });
          const statusPayload = statusResult.data || {};
          const statusData = statusPayload?.data && typeof statusPayload.data === 'object' ? statusPayload.data : statusPayload;
          const status = String(statusData?.status || statusData?.state || '').trim().toLowerCase();
          const cookieFromStatus = normalizeSpcSt(String(statusData?.cookie || statusPayload?.cookie || ''));

          if (cookieFromStatus) {
            if (pollTimer.current) {
              window.clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            setNewSpcStText(cookieFromStatus);
            setQrStatusText('Đăng nhập QR thành công.');
            setQrSessionId('');
            setQrImage('');
            showToast('Quét QR thành công, đã lấy SPC_ST.', 'success');
            return;
          }

          if (!status || status === 'waiting') {
            setQrStatusText('Đang chờ quét QR...');
            return;
          }
          if (status === 'scanned') {
            setQrStatusText('Đã quét QR, chờ xác nhận trên app Shopee...');
            return;
          }

          if (status === 'failed') {
            if (pollTimer.current) {
              window.clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            setQrStatusText('Phiên QR thất bại hoặc đã hết hạn.');
            showToast('QR thất bại hoặc hết hạn.', 'error');
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
    setQrStatusText('Đã hủy phiên QR.');
    showToast('Đã hủy phiên QR.', 'success');
  }

  return (
    <section className="phone-card users-manager-wrap cookie-tools-shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Thao tác cookie</h2>
        </div>
        <span className="chip">{sourceLines.length} dòng</span>
      </div>

      <article className="hub-card cookie-tools-qr-wrap">
        <div className="hub-card-head">
          <h3>Quét QR lấy SPC_ST</h3>
          <span className="muted">Quét xong sẽ tự tắt QR và trả cookie vào ô kết quả.</span>
        </div>
        <div className="lookup-qr-actions">
          <button className="primary-button" type="button" disabled={loading} onClick={startQrLogin}>Tạo QR</button>
          <button className="ghost-button" type="button" disabled={!qrSessionId} onClick={cancelQr}>Hủy QR</button>
          <button className="ghost-button" type="button" onClick={copyQrCookie}>Copy SPC_ST</button>
        </div>
        <p className="lookup-qr-status">{qrStatusText}</p>
        {qrImage ? <img className="lookup-qr-image" src={qrImage} alt="QR Login" /> : null}
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Nguồn user|pass (hàng loạt)</h3>
          <span className="muted">Mỗi dòng 1 chuỗi user|pass|... có thể chứa SPC_ST cũ.</span>
        </div>

        <textarea
          className="cookie-tools-textarea"
          value={sourceLinesText}
          onChange={(e) => setSourceLinesText(e.target.value)}
          placeholder={'user|pass|sdt|SPC_F=...|SPC_ST=...|time\nuser|pass|...'}
        />

        <div className="cookie-tools-actions">
          <button className="primary-button" type="button" disabled={loading} onClick={getNewSpcStBatch}>
            {loading ? 'Đang lấy...' : 'Lấy SPC_ST mới'}
          </button>
          <button className="ghost-button" type="button" disabled={loading} onClick={copyWithReplace}>
            Copy (Thay thế + Copy)
          </button>
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Kết quả SPC_ST mới</h3>
          <span className="muted">Mỗi dòng là 1 SPC_ST mới.</span>
        </div>
        <textarea
          className="cookie-tools-textarea"
          value={newSpcStText}
          onChange={(e) => setNewSpcStText(e.target.value)}
          placeholder={'SPC_ST=...\nSPC_ST=...'}
        />
      </article>
    </section>
  );
}
