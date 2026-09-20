(function () {
  'use strict';
  const tokenKey = 'cloudtodo_admin_access';
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem(tokenKey);
  const saveToken = (value) => value ? localStorage.setItem(tokenKey, value) : localStorage.removeItem(tokenKey);
  function applyTheme(theme) {
    const value = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    localStorage.setItem('cloudtodo_admin_theme', value);
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.classList.toggle('active', button.dataset.themeChoice === value);
      button.setAttribute('aria-pressed', button.dataset.themeChoice === value ? 'true' : 'false');
    });
  }

  applyTheme(localStorage.getItem('cloudtodo_admin_theme') || 'light');

  async function api(path, options = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    const access = token();
    if (access) headers.Authorization = 'Bearer ' + access;
    if (options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, Object.assign({}, options, { headers }));
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && location.pathname !== '/admin/login') {
      saveToken(null);
      location.href = '/admin/login';
      throw new Error('登录已失效');
    }
    if (!response.ok || (body.code && body.code !== 'OK')) throw new Error(body.message || body.code || '请求失败');
    return body;
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 720px)').matches;
  }

  function applySidebarState(collapsed) {
    const shell = document.querySelector('.shell');
    const toggle = $('sidebar-toggle');
    if (!shell || !toggle) return;
    shell.classList.remove('mobile-nav-open');
    shell.classList.toggle('sidebar-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed ? '展开侧边栏' : '折叠侧边栏');
    toggle.textContent = collapsed ? '›' : '‹';
    localStorage.setItem('cloudtodo_admin_sidebar_collapsed', collapsed ? 'true' : 'false');
  }

  function applyMobileNav(open) {
    const shell = document.querySelector('.shell');
    const toggle = $('sidebar-toggle');
    if (!shell || !toggle) return;
    shell.classList.remove('sidebar-collapsed');
    shell.classList.toggle('mobile-nav-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    toggle.textContent = open ? '×' : '≡';
  }

  function initSidebar() {
    const toggle = $('sidebar-toggle');
    const shell = document.querySelector('.shell');
    if (!toggle || !shell) return;
    const syncResponsiveMode = () => {
      if (isMobileViewport()) applyMobileNav(false);
      else applySidebarState(localStorage.getItem('cloudtodo_admin_sidebar_collapsed') === 'true');
    };
    syncResponsiveMode();
    toggle.addEventListener('click', () => {
      if (isMobileViewport()) applyMobileNav(!shell.classList.contains('mobile-nav-open'));
      else applySidebarState(!shell.classList.contains('sidebar-collapsed'));
    });
    window.addEventListener('resize', syncResponsiveMode);
    document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
      if (isMobileViewport()) applyMobileNav(false);
    }));
  }

  function showLogin() {
    const form = $('login-form');
    if (!form) return;
    if (token()) location.href = '/admin/';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      $('login-error').textContent = '';
      try {
        const result = await api('/api/admin/auth/login', { method: 'POST', body: { account: $('account').value.trim(), password: $('password').value } });
        saveToken(result.data.session.access_token);
        location.href = '/admin/';
      } catch (error) { $('login-error').textContent = error.message; }
    });
  }

  function showAdmin() {
    if (!$('users-body')) return;
    if (!token()) { location.href = '/admin/login'; return; }
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
    });
    document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.section').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      $('section-' + button.dataset.section).classList.add('active');
      $('page-title').textContent = button.textContent;
      if (button.dataset.section === 'providers') loadProviders();
      if (button.dataset.section === 'user-notifications') loadUserNotifications();
    }));
    $('logout-button').addEventListener('click', async () => { try { await api('/api/admin/auth/logout', { method: 'POST' }); } catch (_) {} saveToken(null); location.href='/admin/login'; });
    const adminMenuButton = $('admin-menu-button');
    const adminMenuPanel = $('admin-menu-panel');
    const closeAdminMenu = () => { if (!adminMenuPanel) return; adminMenuPanel.hidden = true; adminMenuButton.setAttribute('aria-expanded', 'false'); };
    adminMenuButton.addEventListener('click', (event) => { event.stopPropagation(); const open = !adminMenuPanel.hidden; adminMenuPanel.hidden = open; adminMenuButton.setAttribute('aria-expanded', open ? 'false' : 'true'); });
    adminMenuPanel.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', closeAdminMenu);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAdminMenu(); });
    $('refresh-status').addEventListener('click', loadStatus);
    $('create-user').addEventListener('click', () => openUserDialog());
    $('cancel-user').addEventListener('click', () => $('user-dialog').close());
    $('user-form').addEventListener('submit', saveUser);
    $('email-form').addEventListener('submit', (event) => saveProvider(event, 'email'));
    $('telegram-form').addEventListener('submit', (event) => saveProvider(event, 'telegram'));
    $('test-email').addEventListener('click', () => testProvider('email'));
    $('test-telegram').addEventListener('click', () => testProvider('telegram'));
    loadAdmin(); loadStatus(); loadUsers(); loadProviders();
  }

  async function loadAdmin() {
    try { const result = await api('/api/admin/auth/me'); $('admin-name').textContent = result.data.admin.username; } catch (_) {}
  }
  async function loadStatus() {
    try {
      const result = await api('/api/admin/system/status');
      const data = result.data;
      $('service-status').textContent = '正常';
      $('database-status').textContent = data.database.status === 'ok' ? '正常' : '异常';
      $('email-status').textContent = data.providers.email.configured ? '已配置' : '未配置';
      $('telegram-status').textContent = data.providers.telegram.configured ? '已配置' : '未配置';
      $('system-details').textContent = JSON.stringify(data, null, 2);
    } catch (error) { $('system-details').textContent = error.message; $('service-status').textContent = '异常'; }
  }
  async function loadUsers() {
    try {
      const result = await api('/api/admin/users');
      $('users-body').innerHTML = result.data.items.map((user) => '<tr>' +
        '<td>' + esc(user.username) + '</td><td>' + esc(user.email) + '</td><td>' + esc(user.nickname || '-') + '</td>' +
        '<td><span class="badge">' + esc(user.status) + '</span></td><td>' + formatDateTime(user.created_at) + '</td>' +
        '<td><button class="secondary" data-action="edit" data-id="' + esc(user.id) + '">编辑</button>' +
        '<button class="secondary" data-action="' + (user.status === 'active' ? 'disable' : 'enable') + '" data-id="' + esc(user.id) + '">' + (user.status === 'active' ? '禁用' : '启用') + '</button>' +
        '<button class="secondary" data-action="reset" data-id="' + esc(user.id) + '">重置密码</button></td></tr>').join('');
      $('users-body').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => userAction(button.dataset.action, button.dataset.id)));
    } catch (error) { $('users-error').textContent = error.message; }
  }
  function openUserDialog(user) {
    $('user-dialog-title').textContent = user ? '编辑用户' : '新增用户';
    $('editing-user-id').value = user ? user.id : '';
    $('user-username').value = user ? user.username : '';
    $('user-email').value = user ? user.email : '';
    $('user-nickname').value = user ? user.nickname : '';
    $('user-timezone').value = user ? user.timezone : 'Asia/Shanghai';
    $('user-password').value = '';
    $('user-password-label').style.display = user ? 'none' : 'grid';
    $('user-form-error').textContent = '';
    $('user-dialog').showModal();
  }
  async function saveUser(event) {
    event.preventDefault();
    try {
      const id = $('editing-user-id').value;
      const body = { username: $('user-username').value.trim(), email: $('user-email').value.trim(), nickname: $('user-nickname').value.trim(), timezone: $('user-timezone').value.trim() };
      let path = '/api/admin/users';
      let method = 'POST';
      if (id) { path += '/' + encodeURIComponent(id); method = 'PATCH'; } else body.password = $('user-password').value;
      await api(path, { method, body }); $('user-dialog').close(); await loadUsers();
    } catch (error) { $('user-form-error').textContent = error.message; }
  }
  async function userAction(action, id) {
    try {
      if (action === 'edit') { const result = await api('/api/admin/users/' + encodeURIComponent(id)); openUserDialog(result.data); return; }
      if (action === 'reset') { const password = prompt('输入新密码（至少 8 位）'); if (!password) return; await api('/api/admin/users/' + id + '/reset-password', { method: 'POST', body: { password, reason: '管理员后台操作' } }); alert('密码已重置'); }
      if (action === 'disable' || action === 'enable') await api('/api/admin/users/' + id + '/' + action, { method: 'POST', body: { reason: '管理员后台操作' } });
      await loadUsers();
    } catch (error) { alert(error.message); }
  }
  function populateNotificationUsers(users) {
    const select = $('notification-user-select');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = users.map((user) => '<option value="' + esc(user.id) + '">' + esc(user.username) + ' · ' + esc(user.email) + '</option>').join('');
    if (previous && users.some((user) => user.id === previous)) select.value = previous;
    if (select.value) loadUserNotifications();
  }

  async function loadUserNotifications() {
    const select = $('notification-user-select');
    const body = $('user-notifications-body');
    if (!select || !body || !select.value) return;
    try {
      const result = await api('/api/admin/users/' + encodeURIComponent(select.value) + '/notification-subscriptions');
      body.innerHTML = result.data.items.map((item) => '<tr>' +
        '<td>' + esc(item.channel) + '</td>' +
        '<td><span class="badge">' + (item.enabled ? '已启用' : '已停用') + '</span></td>' +
        '<td>' + esc(item.email || item.target_url || item.chat_id || '-') + '</td>' +
        '<td>' + formatDateTime(item.updated_at) + '</td>' +
        '<td><button class="secondary" data-notify-action="edit" data-id="' + esc(item.id) + '" data-channel="' + esc(item.channel) + '">修改</button>' +
        '<button class="secondary" data-notify-action="' + (item.enabled ? 'disable' : 'enable') + '" data-id="' + esc(item.id) + '">' + (item.enabled ? '停用' : '启用') + '</button>' +
        '<button class="secondary" data-notify-action="delete" data-id="' + esc(item.id) + '">删除</button></td></tr>').join('') || '<tr><td colspan="5" class="muted">该用户暂无通知订阅</td></tr>';
      body.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => userNotificationAction(button.dataset.notifyAction, button.dataset.id, button.dataset.channel)));
      $('user-notifications-error').textContent = '';
    } catch (error) { $('user-notifications-error').textContent = error.message; }
  }

  async function userNotificationAction(action, subscriptionId, channel) {
    const userId = $('notification-user-select').value;
    if (!userId) return;
    try {
      const base = '/api/admin/users/' + encodeURIComponent(userId) + '/notification-subscriptions/' + encodeURIComponent(subscriptionId);
      if (action === 'delete') { if (!confirm('确认删除这个用户通知订阅？')) return; await api(base, { method: 'DELETE' }); }
      if (action === 'enable' || action === 'disable') await api(base + '/' + action, { method: 'POST' });
      if (action === 'edit') {
        const label = channel === 'email' ? '邮箱地址' : channel === 'telegram' ? 'Telegram Chat ID' : 'Webhook 地址';
        const value = prompt('输入新的' + label); if (value == null || !value.trim()) return;
        const payload = channel === 'email' ? { email: value.trim() } : channel === 'telegram' ? { chat_id: value.trim() } : { target_url: value.trim() };
        await api(base, { method: 'PATCH', body: payload });
      }
      await loadUserNotifications();
    } catch (error) { alert(error.message); }
  }

  async function loadUserDeliveries() {
    const userId = $('notification-user-select').value;
    if (!userId) return;
    try {
      const result = await api('/api/admin/users/' + encodeURIComponent(userId) + '/notification-deliveries');
      const output = $('user-deliveries'); output.hidden = false; output.textContent = JSON.stringify(result.data.items, null, 2);
    } catch (error) { $('user-notifications-error').textContent = error.message; }
  }
  async function loadProviders() {
    try {
      const email = await api('/api/admin/notification-providers/email');
      $('smtp-host').value = email.data.smtp_host || ''; $('smtp-port').value = email.data.smtp_port || '587'; $('smtp-from').value = email.data.from_address || ''; $('smtp-username').value = ''; $('email-badge').textContent = email.data.configured ? '已配置' : '未配置';
      const telegram = await api('/api/admin/notification-providers/telegram');
      $('telegram-name').value = telegram.data.bot_name || ''; $('telegram-badge').textContent = telegram.data.configured ? '已配置' : '未配置';
    } catch (error) { $('email-message').textContent = error.message; }
  }
  async function saveProvider(event, channel) {
    event.preventDefault();
    const body = channel === 'email' ? { enabled: true, smtp_host: $('smtp-host').value, smtp_port: $('smtp-port').value, smtp_username: $('smtp-username').value, smtp_password: $('smtp-password').value, smtp_from: $('smtp-from').value } : { enabled: true, bot_token: $('telegram-token').value, bot_name: $('telegram-name').value };
    try { await api('/api/admin/notification-providers/' + channel, { method: 'PATCH', body }); $('email-message').textContent = channel === 'email' ? '已保存' : ''; $('telegram-message').textContent = channel === 'telegram' ? '已保存' : ''; await loadStatus(); await loadProviders(); } catch (error) { (channel === 'email' ? $('email-message') : $('telegram-message')).textContent = error.message; }
  }
  async function testProvider(channel) { try { await api('/api/admin/notification-providers/' + channel + '/test', { method: 'POST' }); alert('测试成功'); } catch (error) { alert(error.message); } }
  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date).replaceAll('/', '-');
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }

  initSidebar();
  showLogin(); showAdmin();
})();
