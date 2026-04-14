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
  if (!response.ok) throw new Error(data?.error || 'Lỗi gọi API MMO');
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
      setCurrentToken(token);

      if (token) {
        const openUrl = `https://friendshouse.io.vn/api/netflix-free/open?token=${encodeURIComponent(token)}`;
        window.open(openUrl, '_blank', 'noopener,noreferrer');
      }

      showToast('Lấy link Netflix thành công.', 'success');
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không claim được link.', 'error');
    } finally {
      setClaimingId(null);
    }
  }

  async function releaseCurrent() {
    if (!currentToken) {
      showToast('Chưa có token link đang dùng để trả.', 'error');
      return;
    }

    try {
      await callMmoApi('release', { token: currentToken });
      setCurrentToken('');
      showToast('Đã trả link thành công.', 'success');
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không trả được link.', 'error');
    }
  }

  const dashboardItems = Object.entries(dashboard || {}).slice(0, 6);

  return (
    <section className="phone-card users-manager-wrap mmo-shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>DICH VU MMO</h2>
        </div>
        <span className="chip">Premium</span>
      </div>

      <article className="hub-card mmo-hero">
        <div>
          <h3>FriendsHouse Integration</h3>
          <p className="muted">Da ket noi API user tu friendshouse.io.vn bang Bearer token tren server.</p>
        </div>
        <div className="voucher-top-actions">
          <button type="button" className="primary-button" onClick={loadAll} disabled={loading}>
            {loading ? 'Dang tai...' : 'Tai du lieu MMO'}
          </button>
          <button type="button" className="ghost-button" onClick={releaseCurrent} disabled={loading || !currentToken}>
            Tra link dang dung
          </button>
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Thong tin tai khoan</h3>
          <span className="muted">Du lieu dashboard tu API user</span>
        </div>
        <div className="mmo-stats-grid">
          {dashboardItems.length === 0 ? <p className="muted">Chua co du lieu dashboard.</p> : null}
          {dashboardItems.map(([key, value]) => (
            <div className="mmo-stat" key={key}>
              <span>{key}</span>
              <strong>{String(value ?? '-')}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Goi VIP</h3>
          <span className="muted">Danh sach goi VIP tu API payment</span>
        </div>
        <div className="mmo-vip-grid">
          {vipPackages.length === 0 ? <div className="empty-state">Chua co goi VIP.</div> : null}
          {vipPackages.map((pkg) => (
            <div className="mmo-vip-card" key={pkg.id}>
              <p className="eyebrow">{pkg.id}</p>
              <h4>{pkg.name}</h4>
              <strong>{Number(pkg.price_vnd || 0).toLocaleString('vi-VN')}d</strong>
              <small>{pkg.duration_days} ngay • {pkg.credits || 'Unlimited'}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="hub-card">
        <div className="hub-card-head">
          <h3>Netflix Free Links</h3>
          <span className="muted">Chon link va bam "Lay link" de mo tab moi</span>
        </div>

        <div className="mmo-links-list">
          {activeLinks.length === 0 ? <div className="empty-state">Khong co link kha dung.</div> : null}
          {activeLinks.map((link) => (
            <div className="mmo-link-item" key={link.id}>
              <div>
                <strong>{link.label || `Link #${link.id}`}</strong>
                <p>{link.plan || 'Premium'} • {link.country || '--'} • Dang dung {Number(link.active_count || 0)}/{Number(link.max_streams || 0)}</p>
                <small>Load: {link.load_level || '--'} • 60p: {Number(link.opens_last_60m || 0)} luot</small>
              </div>
              <button
                type="button"
                className="mini-action"
                disabled={loading || claimingId === link.id}
                onClick={() => claimLink(link.id)}
              >
                {claimingId === link.id ? 'Dang lay...' : 'Lay link'}
              </button>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}


