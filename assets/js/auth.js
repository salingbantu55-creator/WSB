'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — AUTENTIKASI & RBAC
   8 peran: Super Admin, Admin Website, Admin Program, Admin Donasi,
   Admin Keuangan, Admin Penyaluran, Auditor, Viewer/Pimpinan.
   Pada produksi: gunakan Supabase Auth (email+password) & tabel roles.
   ============================================================ */

/* ---------- SESI ADMIN ---------- */
const Auth = (() => {
  const SKEY = 'FLMS_ADMIN_SESSION';
  const EXP_HOURS = 8;

  const adminLogin = (email, password) => {
    /* Tahap 2: bila Supabase aktif → Supabase Auth (async) */
    if (window.SUPA && SUPA.active()) return SUPA.adminLogin(email, password);
    email = String(email || '').trim().toLowerCase();
    const u = DB.one('profiles', p => p.email.toLowerCase() === email);
    if (!u) return { ok: false, message: 'Email tidak terdaftar.' };
    if (u.status !== 'aktif') return { ok: false, message: 'Akun dinonaktifkan. Hubungi Super Admin.' };
    if (u.password_hash !== window.__hash(password)) return { ok: false, message: 'Password salah.' };
    const sess = { user_id: u.id, name: u.name, role_key: u.role_key, role_label: u.role_label, login_at: new Date().toISOString(), exp: Date.now() + EXP_HOURS * 3600000 };
    localStorage.setItem(SKEY, JSON.stringify(sess));
    DB.update('profiles', u.id, { last_login: new Date().toISOString() });
    DB.audit('auth.login', 'profiles', u.id, null, null, 'Login admin berhasil');
    return { ok: true, user: u };
  };

  const currentAdmin = () => {
    try {
      const raw = localStorage.getItem(SKEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s.exp || Date.now() > s.exp) { localStorage.removeItem(SKEY); return null; }
      const u = DB.get('profiles', s.user_id);
      if (!u || u.status !== 'aktif') { localStorage.removeItem(SKEY); return null; }
      return u;
    } catch (e) { return null; }
  };

  const adminLogout = () => {
    const u = currentAdmin();
    if (u) DB.audit('auth.logout', 'profiles', u.id, null, null, 'Logout admin');
    localStorage.removeItem(SKEY);
    if (window.SUPA && SUPA.active()) SUPA.adminLogout();
  };

  /* ---------- CEK IZIN (mendukung '*' dan 'modul.*') ---------- */
  const roleOf = key => DB.one('roles', r => r.key === key);
  const can = (perm, user) => {
    const u = user || currentAdmin();
    if (!u) return false;
    const role = roleOf(u.role_key);
    if (!role) return false;
    return role.permissions.some(p => p === '*' || p === perm || p === perm.split('.')[0] + '.*');
  };
  const canAny = (perms, user) => perms.some(p => can(p, user));

  /* ---------- MANAJEMEN PENGGUNA ---------- */
  const createUser = (data) => {
    if (!data.email || !data.name) return { ok: false, message: 'Nama & email wajib diisi.' };
    if (DB.one('profiles', p => p.email.toLowerCase() === data.email.toLowerCase())) return { ok: false, message: 'Email sudah digunakan.' };
    if (!data.role_key || !roleOf(data.role_key)) return { ok: false, message: 'Peran tidak valid.' };
    const row = DB.insert('profiles', {
      name: data.name, email: data.email.toLowerCase(), role_key: data.role_key,
      role_label: (roleOf(data.role_key) || {}).name || '', status: data.status || 'aktif',
      password_hash: window.__hash(data.password || 'Filantropi@123'), last_login: null
    });
    DB.insert('user_roles', { user_id: row.id, role_key: row.role_key, assigned_at: new Date().toISOString() });
    DB.audit('user.create', 'profiles', row.id, null, { name: row.name, email: row.email, role_key: row.role_key }, 'Membuat pengguna baru');
    return { ok: true, user: row };
  };
  const updateUser = (id, patch) => {
    const old = DB.get('profiles', id);
    if (!old) return { ok: false, message: 'Pengguna tidak ditemukan.' };
    if (patch.email && DB.one('profiles', p => p.email.toLowerCase() === patch.email.toLowerCase() && p.id !== id)) return { ok: false, message: 'Email sudah digunakan pengguna lain.' };
    if (patch.role_key) patch.role_label = (roleOf(patch.role_key) || {}).name || '';
    const clean = { ...patch };
    delete clean.password; // password ditangani resetPassword
    DB.update('profiles', id, clean);
    DB.audit('user.update', 'profiles', id, { name: old.name, email: old.email, role_key: old.role_key, status: old.status }, { name: patch.name || old.name, email: patch.email || old.email, role_key: patch.role_key || old.role_key, status: patch.status || old.status }, 'Memperbarui data pengguna');
    return { ok: true };
  };
  const resetPassword = (id, newPass) => {
    if (!newPass || newPass.length < 6) return { ok: false, message: 'Password minimal 6 karakter.' };
    DB.update('profiles', id, { password_hash: window.__hash(newPass) });
    DB.audit('user.reset_password', 'profiles', id, null, null, 'Reset password pengguna');
    return { ok: true };
  };
  const toggleUser = (id) => {
    const u = DB.get('profiles', id);
    if (!u) return { ok: false };
    const ns = u.status === 'aktif' ? 'nonaktif' : 'aktif';
    DB.update('profiles', id, { status: ns });
    DB.audit('user.toggle_status', 'profiles', id, { status: u.status }, { status: ns }, '');
    return { ok: true };
  };
  const deleteUser = (id) => {
    const u = DB.get('profiles', id);
    if (!u) return { ok: false };
    DB.remove('profiles', id);
    DB.audit('user.delete', 'profiles', id, { name: u.name, email: u.email }, null, 'Menghapus pengguna');
    return { ok: true };
  };

  /* ---------- MATRIKS IZIN (dapat diubah Super Admin) ---------- */
  const saveRolePermissions = (roleKey, permissions) => {
    const role = roleOf(roleKey);
    if (!role) return { ok: false, message: 'Peran tidak ditemukan.' };
    const old = role.permissions.slice();
    DB.update('roles', role.id, { permissions });
    DB.audit('rbac.update_permissions', 'roles', role.id, { permissions: old }, { permissions }, 'Perubahan matriks izin peran ' + role.name);
    return { ok: true };
  };

  return { adminLogin, adminLogout, currentAdmin, can, canAny, roleOf, createUser, updateUser, resetPassword, toggleUser, deleteUser, saveRolePermissions };
})();

/* ---------- SESI DONATUR (Area Donatur) ---------- */
const DonorAuth = (() => {
  const SKEY = 'FLMS_DONOR_SESSION';
  const donorLogin = (email, password) => {
    if (window.SUPA && SUPA.active()) return SUPA.donorLogin(email, password);
    email = String(email || '').trim().toLowerCase();
    const d = DB.one('donors', x => (x.email || '').toLowerCase() === email);
    if (!d) return { ok: false, message: 'Email donatur tidak terdaftar.' };
    if (d.status !== 'aktif') return { ok: false, message: 'Akun donatur dinonaktifkan.' };
    if (!d.password_hash || d.password_hash !== window.__hash(password)) return { ok: false, message: 'Password salah.' };
    localStorage.setItem(SKEY, JSON.stringify({ donor_id: d.id, login_at: new Date().toISOString() }));
    return { ok: true, donor: d };
  };
  const donorRegister = (name, email, phone, password) => {
    if (window.SUPA && SUPA.active()) return SUPA.donorRegister(name, email, phone, password);
    email = String(email || '').trim().toLowerCase();
    if (!name || !email || !password) return { ok: false, message: 'Nama, email, dan password wajib diisi.' };
    if (password.length < 6) return { ok: false, message: 'Password minimal 6 karakter.' };
    if (DB.one('donors', x => (x.email || '').toLowerCase() === email)) return { ok: false, message: 'Email sudah terdaftar. Silakan masuk.' };
    const d = DB.insert('donors', { name, email, phone: phone || '', password_hash: window.__hash(password), verified: true, status: 'aktif', address: '', notes: '' });
    DB.audit('donor.register', 'donors', d.id, null, { email }, 'Registrasi donatur via Area Donatur');
    localStorage.setItem(SKEY, JSON.stringify({ donor_id: d.id, login_at: new Date().toISOString() }));
    return { ok: true, donor: d };
  };
  const currentDonor = () => {
    try {
      const raw = localStorage.getItem(SKEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const d = DB.get('donors', s.donor_id);
      return d && d.status === 'aktif' ? d : null;
    } catch (e) { return null; }
  };
  const donorLogout = () => { localStorage.removeItem(SKEY); if (window.SUPA && SUPA.active()) SUPA.donorLogout(); };
  const updateProfile = (id, patch) => {
    const d = DB.get('donors', id);
    if (!d) return { ok: false, message: 'Donatur tidak ditemukan.' };
    DB.update('donors', id, { name: patch.name || d.name, phone: patch.phone ?? d.phone, address: patch.address ?? d.address });
    DB.audit('donor.update_profile', 'donors', id, null, null, 'Donatur memperbarui profil');
    return { ok: true };
  };
  const changePassword = (id, oldPass, newPass) => {
    const d = DB.get('donors', id);
    if (!d) return { ok: false, message: 'Donatur tidak ditemukan.' };
    if (d.password_hash && d.password_hash !== window.__hash(oldPass)) return { ok: false, message: 'Password lama salah.' };
    if (!newPass || newPass.length < 6) return { ok: false, message: 'Password baru minimal 6 karakter.' };
    DB.update('donors', id, { password_hash: window.__hash(newPass) });
    DB.audit('donor.change_password', 'donors', id, null, null, 'Donatur mengganti password');
    return { ok: true };
  };
  return { donorLogin, donorRegister, currentDonor, donorLogout, updateProfile, changePassword };
})();
