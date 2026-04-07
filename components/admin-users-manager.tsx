'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { imageFileToDataUrl } from '@/lib/client-image';
import { showToast } from '@/lib/client-toast';

type UserRow = {
  username: string;
  role: 'admin' | 'customer' | 'ctv';
  createdAt: string;
  passwordPlain?: string;
  unreadCount?: number;
};

type Profile = {
  username: string;
  phone: string;
  email: string;
  zaloNumber: string;
  bankAccount: string;
  bankName: string;
  bio: string;
  avatarImage: string;
};

type Message = {
  id: string;
  from: string;
  to: string;
  content: string;
  imageData: string;
  createdAt: string;
};

type DetailPayload = {
  user: UserRow;
  profile: Profile;
  messages: Message[];
};

type Props = {
  initialUsers: UserRow[];
};

function isValidUsername(value: string) {
  return /^[a-z0-9_]{5,}$/.test(String(value || '').trim());
}

export function AdminUsersManager({ initialUsers }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [selectedUsername, setSelectedUsername] = useState(initialUsers.find((item) => item.role === 'customer')?.username || initialUsers[0]?.username || '');

  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatImage, setChatImage] = useState('');

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'customer' | 'ctv'>('customer');
  const selectedUsernameRef = useRef(selectedUsername);

  const total = useMemo(() => users.length, [users.length]);

  useEffect(() => {
    selectedUsernameRef.current = selectedUsername;
  }, [selectedUsername]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    refreshUsers().catch(() => {});
    const timer = window.setInterval(() => {
      refreshUsers().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedUsername) {
      setDetail(null);
      return;
    }

    let stopped = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/admin/users?username=${encodeURIComponent(selectedUsername)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không tải được hồ sơ tài khoản.');
        if (!stopped) setDetail({ user: data.user, profile: data.profile, messages: Array.isArray(data.messages) ? data.messages : [] });

        await fetch('/api/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: selectedUsername }),
        });
        refreshUsers(selectedUsername).catch(() => {});
      } catch (loadError) {
        if (!stopped) setError(loadError instanceof Error ? loadError.message : 'Không tải được hồ sơ tài khoản.');
        if (!stopped) showToast(loadError instanceof Error ? loadError.message : 'Không tải được hồ sơ tài khoản.', 'error');
      }
    };

    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [selectedUsername]);

  async function refreshUsers(nextSelected?: string) {
    const response = await fetch('/api/admin/users', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không tải được danh sách tài khoản.');
    const list = Array.isArray(data.users) ? data.users : [];
    setUsers(list);

    const target = nextSelected || selectedUsernameRef.current;
    if (target && list.some((item: UserRow) => item.username === target)) {
      setSelectedUsername(target);
      return;
    }

    const fallback = list.find((item: UserRow) => item.role === 'customer')?.username || list[0]?.username || '';
    setSelectedUsername(fallback);
  }

  async function addUser() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      if (!isValidUsername(newUsername)) throw new Error('Username phải từ 5 ký tự, chỉ gồm chữ thường không dấu, số hoặc gạch dưới.');
      if (newPassword.length < 6) throw new Error('Mật khẩu phải từ 6 ký tự.');

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tạo được tài khoản.');
      setMessage('Đã tạo tài khoản thành công.');
      showToast('Đã tạo tài khoản thành công.', 'success');
      setNewUsername('');
      setNewPassword('');
      setNewRole('customer');
      await refreshUsers(data?.user?.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được tài khoản.');
      showToast(err instanceof Error ? err.message : 'Không tạo được tài khoản.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function saveDetail() {
    if (!detail) return;
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: selectedUsername,
          role: detail.user.role,
          phone: detail.profile.phone,
          email: detail.profile.email,
          zaloNumber: detail.profile.zaloNumber,
          bankAccount: detail.profile.bankAccount,
          bankName: detail.profile.bankName,
          bio: detail.profile.bio,
          avatarImage: detail.profile.avatarImage,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không cập nhật được tài khoản.');

      setMessage('Đã cập nhật hồ sơ tài khoản.');
      showToast('Đã cập nhật hồ sơ tài khoản.', 'success');
      await refreshUsers(data?.user?.username || detail.user.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không cập nhật được tài khoản.');
      showToast(err instanceof Error ? err.message : 'Không cập nhật được tài khoản.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function setPasswordForDetail() {
    if (!detail) return;
    const pass = prompt('Nhập mật khẩu mới (>= 6 ký tự):', '');
    if (pass === null) return;

    setLoading(true);
    setMessage('');
    setError('');
    try {
      if (pass.trim().length < 6) throw new Error('Mật khẩu phải từ 6 ký tự.');

      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: selectedUsername,
          password: pass.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không cập nhật được mật khẩu.');
      setMessage('Đã đổi mật khẩu.');
      showToast('Đã đổi mật khẩu.', 'success');
      setDetail((prev) => (prev ? { ...prev, user: { ...prev.user, passwordPlain: pass.trim() } } : prev));
      setUsers((prev) => prev.map((u) => (u.username === selectedUsername ? { ...u, passwordPlain: pass.trim() } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không cập nhật được mật khẩu.');
      showToast(err instanceof Error ? err.message : 'Không cập nhật được mật khẩu.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(username: string) {
    if (!confirm(`Xóa tài khoản @${username}?`)) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/admin/users?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không xóa được tài khoản.');
      setMessage('Đã xóa tài khoản thành công.');
      showToast('Đã xóa tài khoản thành công.', 'success');
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được tài khoản.');
      showToast(err instanceof Error ? err.message : 'Không xóa được tài khoản.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function sendMessageToUser() {
    if (!detail || (!chatInput.trim() && !chatImage)) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: detail.user.username, content: chatInput.trim(), imageData: chatImage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không gửi được tin nhắn.');
      setChatInput('');
      setChatImage('');
      setMessage('Đã gửi tin nhắn cho khách hàng.');
      showToast('Đã gửi tin nhắn cho khách hàng.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được tin nhắn.');
      showToast(err instanceof Error ? err.message : 'Không gửi được tin nhắn.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !detail) return;
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh hợp lệ.');
      return;
    }

    imageFileToDataUrl(file, 1600, 0.84)
      .then((dataUrl) => {
        setDetail({ ...detail, profile: { ...detail.profile, avatarImage: dataUrl } });
        showToast('Đã chọn ảnh đại diện mới.', 'info');
      })
      .catch(() => showToast('Không xử lí được ảnh đại diện.', 'error'));
  }

  function uploadChatImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Vui lòng chọn ảnh hợp lệ để gửi chat.', 'error');
      return;
    }

    imageFileToDataUrl(file, 1700, 0.85)
      .then((dataUrl) => {
        setChatImage(dataUrl);
        showToast('Đã thêm ảnh vào tin nhắn.', 'info');
      })
      .catch(() => showToast('Không xử lí được ảnh chat.', 'error'));
  }

  return (
    <section className="phone-card users-manager-wrap">
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Quản lí tài khoản</h2>
        </div>
        <span className="chip">{total} tài khoản</span>
      </div>

      <div className="users-manager-grid">
        <aside className="users-sidebar">
          <div className="hub-card">
            <h3>Tạo tài khoản mới</h3>
            <div className="form-grid">
              <label><span>Username</span><input value={newUsername} onChange={(e) => setNewUsername(e.target.value.toLowerCase())} placeholder="vd: khach_hang1" /></label>
              <label><span>Mật khẩu</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="tối thiểu 6 ký tự" /></label>
              <label>
                <span>Vai trò</span>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value === 'admin' ? 'admin' : (e.target.value === 'ctv' ? 'ctv' : 'customer'))}>
                  <option value="customer">customer</option>
                  <option value="ctv">ctv</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button className="primary-button" disabled={loading} onClick={addUser} type="button">Thêm tài khoản</button>
            </div>
          </div>

          <div className="hub-card">
            <h3>Danh sách tài khoản</h3>
            <div className="account-list">
              {users.map((user) => (
                <button
                  key={user.username}
                  className={`account-item ${selectedUsername === user.username ? 'active' : ''}`}
                  type="button"
                  onClick={() => setSelectedUsername(user.username)}
                >
                  <strong className="account-name-row">
                    <span>@{user.username}</span>
                    {Number(user.unreadCount || 0) > 0 ? (
                      <span className="account-unread-badge">{user.unreadCount! > 99 ? '99+' : user.unreadCount}</span>
                    ) : null}
                  </strong>
                  <span>{user.role} · {new Date(user.createdAt).toLocaleDateString('vi-VN')}</span>
                  <span className="account-password-line">MK: {user.passwordPlain || 'Chưa lưu'}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="users-detail">
          {!detail ? (
            <div className="empty-state">Chọn một tài khoản để xem hồ sơ.</div>
          ) : (
            <>
              <article className="hub-card">
                <div className="hub-card-head">
                  <h3>Hồ sơ tài khoản @{selectedUsername}</h3>
                  <div className="modal-actions">
                    <button className="mini-action" type="button" onClick={setPasswordForDetail} disabled={loading}>Đổi mật khẩu</button>
                    <button className="mini-action" type="button" onClick={() => removeUser(selectedUsername)} disabled={loading || detail.user.role === 'admin'}>Xóa tài khoản</button>
                  </div>
                </div>

                <div className="profile-editor-head">
                  <div className="profile-avatar profile-avatar-lg">
                    {detail.profile.avatarImage ? <img src={detail.profile.avatarImage} alt="avatar" className="profile-avatar-image" /> : (detail.user.username[0] || 'U').toUpperCase()}
                  </div>
                  <div className="profile-meta">
                    <p className="eyebrow">Tài khoản đang chọn</p>
                    <strong>@{detail.user.username}</strong>
                  </div>
                </div>

                <div className="form-grid compact">
                  <label>
                    <span>Mật khẩu hiện tại</span>
                    <input type="text" value={detail.user.passwordPlain || 'Chưa lưu'} readOnly className="readonly-input" />
                  </label>
                  <label>
                    <span>Tên đăng ký</span>
                    <input value={detail.user.username} disabled className="readonly-input" />
                  </label>
                  <label>
                    <span>Vai trò</span>
                    <select value={detail.user.role} onChange={(e) => setDetail({ ...detail, user: { ...detail.user, role: e.target.value === 'admin' ? 'admin' : (e.target.value === 'ctv' ? 'ctv' : 'customer') } })}>
                      <option value="customer">customer</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  <label><span>Số điện thoại</span><input value={detail.profile.phone} onChange={(e) => setDetail({ ...detail, profile: { ...detail.profile, phone: e.target.value.replace(/\D/g, '').slice(0, 10) } })} /></label>
                  <label><span>Email</span><input value={detail.profile.email} onChange={(e) => setDetail({ ...detail, profile: { ...detail.profile, email: e.target.value } })} /></label>
                  <label><span>Số Zalo</span><input value={detail.profile.zaloNumber} onChange={(e) => setDetail({ ...detail, profile: { ...detail.profile, zaloNumber: e.target.value.replace(/\D/g, '').slice(0, 15) } })} /></label>
                  <label><span>Số tài khoản</span><input value={detail.profile.bankAccount} onChange={(e) => setDetail({ ...detail, profile: { ...detail.profile, bankAccount: e.target.value } })} /></label>
                  <label><span>Tên ngân hàng</span><input value={detail.profile.bankName} onChange={(e) => setDetail({ ...detail, profile: { ...detail.profile, bankName: e.target.value } })} /></label>
                  <label className="full-span"><span>Giới thiệu ngắn</span><input value={detail.profile.bio} onChange={(e) => setDetail({ ...detail, profile: { ...detail.profile, bio: e.target.value } })} /></label>
                  <label className="full-span"><span>Ảnh đại diện</span><input type="file" accept="image/*" onChange={uploadAvatar} /></label>
                </div>

                <button className="primary-button" type="button" disabled={loading} onClick={saveDetail}>Lưu hồ sơ tài khoản</button>
              </article>

              <article className="hub-card">
                <div className="hub-card-head">
                  <h3>Chat với @{detail.user.username}</h3>
                </div>
                <div className="chat-list account-chat-list">
                  {detail.messages.length === 0 ? <div className="empty-state">Chưa có cuộc trò chuyện nào.</div> : null}
                  {detail.messages.map((item) => {
                    const own = item.from !== detail.user.username;
                    return (
                      <div className={`chat-item ${own ? 'chat-own' : 'chat-other'}`} key={item.id}>
                        {item.content ? <p>{item.content}</p> : null}
                        {item.imageData ? <img className="chat-image" src={item.imageData} alt="chat" /> : null}
                        <span>{new Date(item.createdAt).toLocaleString('vi-VN')} · @{item.from}</span>
                      </div>
                    );
                  })}
                </div>
                {chatImage ? <img className="chat-image-preview" src={chatImage} alt="preview" /> : null}
                <div className="chat-compose">
                  <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Nhập tin nhắn cho khách hàng..." />
                  <label className="mini-action chat-upload-btn" htmlFor="admin-chat-image-input">Ảnh</label>
                  <input id="admin-chat-image-input" type="file" accept="image/*" onChange={uploadChatImage} className="chat-file-input" />
                  <button className="primary-button" type="button" disabled={loading || (!chatInput.trim() && !chatImage)} onClick={sendMessageToUser}>Gửi</button>
                </div>
              </article>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
