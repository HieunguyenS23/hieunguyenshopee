'use client';

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

async function callMmoApi(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch('/api/admin/mmo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Loi goi API MMO');
  return data?.data;
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
  const totalUsing = useMemo(() => activeLinks.reduce((sum, link) => sum + Number(link.active_count || 0), 0), [activeLinks]);
  const totalSlots = useMemo(() => activeLinks.reduce((sum, link) => sum + Number(link.max_streams || 0), 0), [activeLinks]);

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
      showToast(error instanceof Error ? error.message : 'Khong tai duoc du lieu MMO.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function buildLocalOpenLink(token: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/mmo/open?token=${encodeURIComponent(token)}`;
  }

  async function claimLink(linkId: number) {
    try {
      setClaimingId(linkId);
      const data = await callMmoApi('claim', { cookieId: linkId, type: 'pc' });
      const token = String(data?.token || '');
      setCurrentToken(token);

      if (token) {
        const localLink = buildLocalOpenLink(token);
        setCurrentLinkUrl(localLink);
        window.open(localLink, '_blank', 'noopener,noreferrer');
      }

      showToast('Lay link Netflix thanh cong.', 'success');
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Khong claim duoc link.', 'error');
    } finally {
      setClaimingId(null);
    }
  }

  async function copyCurrentLink() {
    if (!currentLinkUrl) {
      showToast('Chua co link de copy.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(currentLinkUrl);
      showToast('Da copy link dang nhap noi bo.', 'success');
    } catch {
      showToast('Khong copy duoc link.', 'error');
    }
  }

  async function releaseCurrent() {
    if (!currentToken) {
      showToast('Chua co token dang dung de tra link.', 'error');
      return;
    }

    try {
      await callMmoApi('release', { token: currentToken });
      setCurrentToken('');
      setCurrentLinkUrl('');
      showToast('Da tra link thanh cong.', 'success');
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Khong tra duoc link.', 'error');
    }
  }

  return (
    <section className="mmo-premium-shell">
      <header className="mmo-premium-header">
        <div>
          <p className="mmo-kicker">MMO Premium</p>
          <h1>Dich Vu MMO</h1>
          <p className="mmo-sub">Trang doc lap cho thao tac link dang nhap, khong can cau hinh tren giao dien.</p>
        </div>
        <div className="mmo-header-actions">
          <button type="button" className="mmo-btn mmo-btn-primary" onClick={loadAll} disabled={loading}>
            {loading ? 'Dang dong bo...' : 'Dong bo du lieu'}
          </button>
        </div>
      </header>

      <div className="mmo-top-metrics">
        <div className="mmo-metric-box">
          <span>Link kha dung</span>
          <strong>{activeLinks.length}</strong>
        </div>
        <div className="mmo-metric-box">
          <span>Nguoi dang dung</span>
          <strong>{totalUsing}/{totalSlots || 0}</strong>
        </div>
      </div>

      {currentLinkUrl ? (
        <section className="mmo-active-link-box">
          <div>
            <p className="mmo-kicker">Link dang nhap da lay</p>
            <strong>{currentLinkUrl}</strong>
          </div>
          <div className="mmo-header-actions">
            <button type="button" className="mmo-btn mmo-btn-primary" onClick={copyCurrentLink}>Copy link dang nhap</button>
            <button type="button" className="mmo-btn mmo-btn-secondary" onClick={releaseCurrent}>Tra link</button>
          </div>
        </section>
      ) : null}

      <div className="mmo-grid mmo-grid-stats">
        {dashboardItems.length === 0 ? <div className="mmo-empty">Chua co du lieu dashboard.</div> : null}
        {dashboardItems.map(([key, value]) => (
          <article key={key} className="mmo-stat-card">
            <span>{key}</span>
            <strong>{String(value ?? '-')}</strong>
          </article>
        ))}
      </div>

      <section className="mmo-section">
        <div className="mmo-section-head">
          <h2>Danh sach link</h2>
          <span>{activeLinks.length} link</span>
        </div>
        <div className="mmo-links">
          {activeLinks.length === 0 ? <div className="mmo-empty">Khong co link kha dung.</div> : null}
          {activeLinks.map((link) => (
            <article className="mmo-link-card mmo-link-card-premium" key={link.id}>
              <div className="mmo-link-main">
                <strong>{link.label || `Link #${link.id}`}</strong>
                <div className="mmo-link-tags">
                  <span className="mmo-pill">{link.plan || 'Premium'}</span>
                  <span className="mmo-pill">{link.country || '--'}</span>
                </div>
              </div>

              <div className="mmo-link-substats">
                <span>Dang dung: <b>{Number(link.active_count || 0)}/{Number(link.max_streams || 0)}</b></span>
                <span>1h: <b>{Number(link.opens_last_60m || 0)} luot</b></span>
                <span>Load: <b>{link.load_level || '--'}</b></span>
              </div>

              <button
                type="button"
                className="mmo-btn mmo-btn-small"
                disabled={loading || claimingId === link.id}
                onClick={() => claimLink(link.id)}
              >
                {claimingId === link.id ? 'Dang lay...' : 'Lay link'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
