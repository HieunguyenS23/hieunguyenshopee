'use client';

import { useMemo, useState } from 'react';
import { showToast } from '@/lib/client-toast';

function normalizeSpcSt(raw: string) {
  const value = String(raw || '').trim().replace(/^"+|"+$/g, '');
  if (!value) return '';
  if (/^SPC_ST=/i.test(value)) return value;
  const matched = value.match(/SPC_ST=([^|;\s]+)/i);
  if (matched?.[1]) return `SPC_ST=${matched[1]}`;
  return `SPC_ST=${value}`;
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
  const [replacedText, setReplacedText] = useState('');

  const sourceLines = useMemo(() => parseLines(sourceLinesText), [sourceLinesText]);
  const newSpcStLines = useMemo(() => parseLines(newSpcStText), [newSpcStText]);

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

  async function copyNewSpcSt() {
    const text = newSpcStLines.join('\n').trim();
    if (!text) {
      showToast('Chưa có kết quả SPC_ST để copy.', 'error');
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('Đã copy danh sách SPC_ST.', 'success');
  }

  async function copyReplaced() {
    const text = String(replacedText || '').trim();
    if (!text) {
      showToast('Chưa có kết quả thay thế để copy.', 'error');
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('Đã copy kết quả thay thế.', 'success');
  }

  function replaceBatch() {
    if (sourceLines.length === 0) {
      showToast('Bạn chưa nhập chuỗi nguồn.', 'error');
      return;
    }
    if (newSpcStLines.length === 0) {
      showToast('Bạn chưa có danh sách SPC_ST mới.', 'error');
      return;
    }

    const out = sourceLines.map((row, index) => {
      const cookie = newSpcStLines[index] || '';
      return replaceSpcStInRow(row, cookie);
    });

    setReplacedText(out.join('\n'));

    if (newSpcStLines.length < sourceLines.length) {
      showToast('Đã thay thế một phần (số SPC_ST mới ít hơn số dòng nguồn).', 'info');
    } else {
      showToast('Đã thay thế SPC_ST vào chuỗi cũ thành công.', 'success');
    }
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
          <button className="ghost-button" type="button" disabled={loading} onClick={copyNewSpcSt}>Copy SPC_ST mới</button>
          <button className="mini-action" type="button" disabled={loading} onClick={replaceBatch}>Thay thế</button>
          <button className="mini-action" type="button" disabled={loading} onClick={copyReplaced}>Copy kết quả thay thế</button>
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

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Kết quả sau thay thế</h3>
          <span className="muted">Đã thay SPC_ST mới vào chuỗi cũ theo từng dòng.</span>
        </div>
        <textarea
          className="cookie-tools-textarea"
          value={replacedText}
          onChange={(e) => setReplacedText(e.target.value)}
          placeholder={'user|pass|...|SPC_ST=...|time'}
        />
      </article>
    </section>
  );
}
