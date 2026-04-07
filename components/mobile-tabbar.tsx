'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { UserRole } from '@/lib/types';

type Props = {
  isAdmin: boolean;
  role: UserRole;
  username: string;
};

type UnreadPayload = {
  unreadMessages: number;
  unreadAnnouncements: number;
  total: number;
};

export function MobileTabbar({ isAdmin, role, username }: Props) {
  const pathname = usePathname();
  const [unread, setUnread] = useState<UnreadPayload>({ unreadMessages: 0, unreadAnnouncements: 0, total: 0 });
  const roleLabel = isAdmin ? 'Admin' : (role === 'ctv' ? 'CTV' : 'Khách hàng');
  const profileInitial = (username[0] || 'U').toUpperCase();

  function toggleDrawer() {
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (typeof w.__toggleAppDrawer === 'function') {
        w.__toggleAppDrawer();
        return;
      }
      window.dispatchEvent(new Event('app-drawer:toggle'));
    }
    if (typeof document !== 'undefined') document.dispatchEvent(new Event('app-drawer:toggle'));
  }

  useEffect(() => {
    let stopped = false;

    const loadUnread = async () => {
      try {
        const response = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) return;
        if (!stopped) {
          setUnread({
            unreadMessages: Number(data.unreadMessages || 0),
            unreadAnnouncements: Number(data.unreadAnnouncements || 0),
            total: Number(data.total || 0),
          });
        }
      } catch {
        if (!stopped) setUnread({ unreadMessages: 0, unreadAnnouncements: 0, total: 0 });
      }
    };

    loadUnread();
    const timer = window.setInterval(loadUnread, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  const tabs = useMemo(() => {
    if (isAdmin) {
      return [
        { href: '/orders/new', label: 'Lên đơn', badge: 0 },
        { href: '/orders/history', label: 'Lịch sử', badge: 0 },
        { href: '/admin/users', label: 'Tài khoản', badge: unread.total },
        { href: '/profile', label: 'Hồ sơ', badge: 0 },
      ];
    }

    if (role === 'ctv') {
      return [
        { href: '/orders/new', label: 'Lên đơn', badge: 0 },
        { href: '/orders/history', label: 'Lịch sử', badge: 0 },
        { href: '/admin/lookup', label: 'Kiểm tra', badge: 0 },
        { href: '/profile', label: 'Hồ sơ', badge: 0 },
        { href: '/announcements', label: 'Thông báo', badge: unread.total },
      ];
    }

    return [
      { href: '/orders/new', label: 'Lên đơn', badge: 0 },
      { href: '/orders/history', label: 'Lịch sử', badge: 0 },
      { href: '/profile', label: 'Hồ sơ', badge: 0 },
      { href: '/announcements', label: 'Thông báo', badge: unread.total },
    ];
  }, [isAdmin, role, unread.total]);

  return (
    <header className="mobile-topbar combined-topbar app-topbar">
      <div className="profile-row app-topbar-row">
        <div className="profile-row-left">
          <button className="app-menu-btn" type="button" onPointerUp={toggleDrawer} aria-label="Mở menu">
            <span />
            <span />
            <span />
          </button>
          <div className="profile-card profile-inline">
            <div className="profile-avatar">{profileInitial}</div>
            <div className="profile-meta">
              <p className="eyebrow">{roleLabel}</p>
              <strong>@{username}</strong>
            </div>
          </div>
        </div>
        <form action="/api/auth/logout" method="post" className="logout-inline-form">
          <button className="logout-inline-btn" type="submit">Đăng xuất</button>
        </form>
      </div>

      <nav className="mobile-tabbar" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <Link key={tab.href} className={`tab-link-with-badge ${pathname.startsWith(tab.href) ? 'is-active' : ''}`} href={tab.href}>
            {tab.label}
            {tab.badge > 0 ? <span className="tab-badge">{tab.badge > 99 ? '99+' : tab.badge}</span> : null}
          </Link>
        ))}
      </nav>
    </header>
  );
}
