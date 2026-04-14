'use client';

import { useEffect, useMemo, useState } from 'react';
import { showToast } from '@/lib/client-toast';

type VipPackage = {
  id: string;
  name: string;
  price_vnd: number;
  duration_days: number;
  credits?: string;
  daily_bonus?: number;
};

type NetflixLink = {
  id: number;
  label?: string;
  plan?: string;
  country?: string;
  active_count?: number;
  max_streams?: number;
  opens_last_60m?: number;
  load_level?: string;
  has_pc?: boolean;
  has_mobile?: boolean;
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
  const [vipPackages, setVipPackages] = useState<VipPackage[]>([]);
  const [links, setLinks] = useState<NetflixLink[]>([]);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [currentToken, setCurrentToken] = useState('');

  const activeLinks = useMemo(() => links.filter((item) => !item.expired), [links]);
  const dashboardItems = useMemo(() => Object.entries(dashboard || {}).slice(0, 8), [dashboard]);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashboardData, packagesData, linksData] = await Promise.all([
        callMmoApi('dashboard').catch(() => null),
        callMmoApi('packages'),
        callMmoApi('links'),
      ]);

      setDashboard(dashboardData && typeof dashboardData === 'object' ? dashboardData : null);
      setVipPackages(Array.isArray(packagesData?.packages) ? packagesData.packages : []);
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

  async function claimLink(linkId: number) {
    try {
      setClaimingId(linkId);
      const data = await callMmoApi('claim', { cookieId: linkId, type: 'pc' });
      const token = String(data?.token || '');
      setCurrentToken(token);

      if (token) {
        const openUrl = `https://friendshouse.io.vn/api/netflix-free/open?token=${encodeURIComponent(token)}`;
        window.open(openUrl, '_blank', 'noopener,noreferrer');
      }

      showToast('Lay link Netflix thanh cong.', 'success');
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Khong claim duoc link.', 'error');
    } finally {
      setClaimingId(null);
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
          <p className="mmo-sub">Trang doc lap FriendsHouse API cho tai khoan admin.</p>
        </div>
        <div className="mmo-header-actions">
          <button type="button" className="mmo-btn mmo-btn-primary" onClick={loadAll} disabled={loading}>
            {loading ? 'Dang dong bo...' : 'Dong bo du lieu'}
          </button>
          <button type="button" className="mmo-btn mmo-btn-secondary" onClick={releaseCurrent} disabled={loading || !currentToken}>
            Tra link dang dung
          </button>
        </div>
      </header>

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
          <h2>Goi VIP</h2>
          <span>{vipPackages.length} goi</span>
        </div>
        <div className="mmo-grid mmo-grid-vip">
          {vipPackages.length === 0 ? <div className="mmo-empty">Chua co goi VIP.</div> : null}
          {vipPackages.map((pkg) => (
            <article className="mmo-vip-card" key={pkg.id}>
              <p className="mmo-vip-id">{pkg.id}</p>
              <h3>{pkg.name}</h3>
              <strong>{Number(pkg.price_vnd || 0).toLocaleString('vi-VN')}d</strong>
              <small>{pkg.duration_days} ngay • {pkg.credits || 'Unlimited'}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="mmo-section">
        <div className="mmo-section-head">
          <h2>Netflix Free Links</h2>
          <span>{activeLinks.length} link kha dung</span>
        </div>
        <div className="mmo-links">
          {activeLinks.length === 0 ? <div className="mmo-empty">Khong co link kha dung.</div> : null}
          {activeLinks.map((link) => (
            <article className="mmo-link-card" key={link.id}>
              <div>
                <strong>{link.label || `Link #${link.id}`}</strong>
                <p>{link.plan || 'Premium'} • {link.country || '--'} • Dang dung {Number(link.active_count || 0)}/{Number(link.max_streams || 0)}</p>
                <small>Load {link.load_level || '--'} • 60p {Number(link.opens_last_60m || 0)} luot</small>
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
