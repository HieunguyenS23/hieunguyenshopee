'use client';

import Link from 'next/link';

export function MmoChatgptCenter() {
  return (
    <section className="mmox-shell">
      <header className="mmox-header mmox-header-chatgpt">
        <div>
          <p className="mmox-kicker">DỊCH VỤ CHATGPT</p>
          <h1>Truy cập ChatGPT Team miễn phí</h1>
          <p className="mmox-sub">Trang thao tác nhanh theo module ChatGPT, đồng bộ phong cách premium với hệ MMO.</p>
        </div>
        <div className="mmox-active-actions">
          <a className="mmox-btn mmox-btn-primary" href="https://friendshouse.io.vn/services/chatgpt" target="_blank" rel="noreferrer">Mở dịch vụ gốc</a>
          <Link className="mmox-btn mmox-btn-secondary" href="/mmo-services">Về Netflix</Link>
        </div>
      </header>

      <section className="mmox-section">
        <div className="mmox-section-head">
          <h2>Lối tắt thao tác</h2>
          <span>ChatGPT service</span>
        </div>

        <div className="mmox-chatgpt-grid">
          <a className="mmox-chatgpt-card" href="https://chatgpt.com" target="_blank" rel="noreferrer">
            <strong>chatgpt.com</strong>
            <p>Mở trực tiếp giao diện ChatGPT để dùng tài khoản đã cấu hình.</p>
          </a>

          <a className="mmox-chatgpt-card" href="https://friendshouse.io.vn/services/chatgpt" target="_blank" rel="noreferrer">
            <strong>Trang dịch vụ ChatGPT</strong>
            <p>Mở module ChatGPT trên Friendshouse để thao tác theo luồng gốc.</p>
          </a>

          <div className="mmox-chatgpt-card">
            <strong>Gợi ý dùng ổn định</strong>
            <p>Dùng trình duyệt ẩn danh khi gặp xung đột session. Nếu bị out phiên, quay lại module gốc để cấp lại quyền.</p>
          </div>
        </div>
      </section>
    </section>
  );
}
