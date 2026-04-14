'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { showToast } from '@/lib/client-toast';

type NetflixLink = {
  id: number;
  label?: string;
  plan?: string;
  country?: string;
  active_count?: number;
  max_streams?: number;
  opens_last_60m?: number;
  load_level?: string;
  expired?: boolean;
};

type DashboardPayload = Record<string, unknown>;

const STORAGE_KEY = 'mmo_current_link_state_v1';

async function callMmoApi(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch('/api/admin/mmo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Lỗi gọi API MMO');
  return data?.data;
}

function buildInternalOpenLink(token: string) {
  if (typeof window === 'undefined') return `/api/mmo/open?token=${encodeURIComponent(token)}`;
  return `${window.location.origin}/api/mmo/open?token=${encodeURIComponent(token)}`;
}

function parseTokenFromLink(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('token') || '';
  } catch {
    return '';
  }
}

export function MmoServicesCenter() {
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [links, setLinks] = useState<NetflixLink[]>([]);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [currentToken, setCurrentToken] = useState('');
  const [currentLinkUrl, setCurrentLinkUrl] = useState('');

  const activeLinks = useMemo(() => links.filter((item) => !item.expired), [links]);
  const dashboardItems = useMemo(() => Object.entries(dashboard || {}).slice(0, 6), [dashboard]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { token?: string; url?: string };
      if (parsed?.token) setCurrentToken(String(parsed.token));
      if (parsed?.url) setCurrentLinkUrl(String(parsed.url));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify({ token: currentToken, url: currentLinkUrl });
    localStorage.setItem(STORAGE_KEY, payload);
  }, [currentToken, currentLinkUrl]);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashboardData, linksData] = await Promise.all([
        callMmoApi('dashboard').catch(() => null),
        callMmoApi('links'),
      ]);

      setDashboard(dashboardData && typeof dashboardData === 'object' ? dashboardData : null);
      setLinks(Array.isArray(linksData?.links) ? linksData.links : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không tải được dữ liệu MMO.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function claimLink(linkId: number) {
    try {
      setClaimingId(linkId);
      const data = await callMmoApi('claim', { cookieId: linkId, type: 'pc' });
      const token = String(data?.token || '');

      if (!token) {
        throw new Error('API không trả token đăng nhập.');
      }

      const internalLink = buildInternalOpenLink(token);
      setCurrentToken(token);
      setCurrentLinkUrl(internalLink);

      window.open(internalLink, '_blank', 'noopener,noreferrer');
      showToast('Lấy link Netflix thành công.', 'success');
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không lấy được link.', 'error');
    } finally {
      setClaimingId(null);
    }
  }

  async function copyCurrentLink() {
    if (!currentLinkUrl) {
      showToast('Chưa có link để copy.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(currentLinkUrl);
      showToast('Đã copy link đăng nhập.', 'success');
    } catch {
      showToast('Không copy được link.', 'error');
    }
  }

  async function releaseCurrent() {
    const token = currentToken || parseTokenFromLink(currentLinkUrl);
    if (!token) {
      showToast('Chưa có token đang dùng để trả link.', 'error');
      return;
    }

    try {
      await callMmoApi('release', { token });
      setCurrentToken('');
      setCurrentLinkUrl('');
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      showToast('Đã trả link thành công.', 'success');
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không trả được link.', 'error');
    }
  }

  return (
    <section className="mmox-shell">
      <header className="mmox-header">
        <div>
          <p className="mmox-kicker">DỊCH VỤ MMO</p>
          <h1>Trung tâm lấy link Netflix</h1>
          <p className="mmox-sub">Giao diện mới: rõ ràng, dễ nhìn, thao tác nhanh trên điện thoại và máy tính.</p>
        </div>
        <button type="button" className="mmox-btn mmox-btn-primary" onClick={loadAll} disabled={loading}>
          {loading ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu'}
        </button>
      </header>

      <div className="mmox-metric-grid">
        <article className="mmox-metric-card">
          <span>Link khả dụng</span>
          <strong>{activeLinks.length}</strong>
        </article>
      </div>

      {currentLinkUrl ? (
        <section className="mmox-active-box">
          <div>
            <p className="mmox-kicker">LINK ĐĂNG NHẬP ĐANG DÙNG</p>
            <textarea readOnly value={currentLinkUrl} rows={3} className="mmox-link-textarea" />
          </div>
          <div className="mmox-active-actions">
            <button type="button" className="mmox-btn mmox-btn-primary" onClick={copyCurrentLink}>Copy link đăng nhập</button>
            <button type="button" className="mmox-btn mmox-btn-danger" onClick={releaseCurrent}>Trả link</button>
          </div>
        </section>
      ) : null}

      <section className="mmox-section">
        <div className="mmox-section-head">
          <h2>Thông tin tài khoản</h2>
          <span>{dashboardItems.length} mục dữ liệu</span>
        </div>
        <div className="mmox-stats-grid">
          {dashboardItems.length === 0 ? <div className="mmox-empty">Chưa có dữ liệu dashboard.</div> : null}
          {dashboardItems.map(([key, value]) => (
            <article key={key} className="mmox-stat-item">
              <span>{key}</span>
              <strong>{String(value ?? '-')}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="mmox-section">
        <div className="mmox-section-head">
          <h2>Danh sách link</h2>
          <span>{activeLinks.length} link</span>
        </div>

        <div className="mmox-links-list">
          {activeLinks.length === 0 ? <div className="mmox-empty">Không có link khả dụng.</div> : null}
          {activeLinks.map((link) => (
            <article className="mmox-link-card" key={link.id}>
              <div className="mmox-link-top">
                <strong>{link.label || `Link #${link.id}`}</strong>
                <div className="mmox-pills">
                  <span className="mmox-pill">{link.plan || 'Premium'}</span>
                  <span className="mmox-pill">{link.country || '--'}</span>
                </div>
              </div>

              <div className="mmox-link-meta">
                <span>Đang dùng: <b>{Number(link.active_count || 0)}/{Number(link.max_streams || 0)}</b></span>
                <span>Trong 60p: <b>{Number(link.opens_last_60m || 0)} lượt</b></span>
                <span>Mức tải: <b>{link.load_level || '--'}</b></span>
              </div>

              <button
                type="button"
                className="mmox-btn mmox-btn-small"
                disabled={loading || claimingId === link.id}
                onClick={() => claimLink(link.id)}
              >
                {claimingId === link.id ? 'Đang lấy...' : 'Lấy link'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
