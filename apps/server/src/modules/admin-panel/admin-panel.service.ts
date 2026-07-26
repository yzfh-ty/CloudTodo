import { Injectable } from '@nestjs/common';
import type { AuthenticatedAdmin } from '../admin/admin-session.service';
import { ADMIN_PANEL_STYLES } from './admin-panel.styles';
import {
  ADMIN_MFA_MENU_BUTTON,
  ADMIN_MFA_SCRIPT,
  ADMIN_MFA_SECTION_HTML,
} from './admin-panel.mfa';

@Injectable()
export class AdminPanelService {
  renderIndex(admin: AuthenticatedAdmin) {
    const adminDisplay = this.escapeHtml(admin.nickname || admin.email || admin.username);

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CloudTodo Admin</title>
    <style>${ADMIN_PANEL_STYLES}    </style>
  </head>
  <body>
    <header>
      <div class="brand">
        <strong>CloudTodo Admin</strong>
        <span>后端内置管理后台</span>
      </div>
      <div class="header-right">
        <div class="admin-badge">管理员：${adminDisplay}</div>
        <button class="logout-btn" id="logoutBtn">退出登录</button>
      </div>
    </header>
    <main>
      <div class="admin-shell">
        <aside class="sidebar">
          <div class="sidebar-title">后台菜单</div>
          <div class="menu">
            <button class="menu-btn active" data-menu-target="overview">
              <strong>概览</strong>
              <span>查看系统统计与关键状态</span>
            </button>
            <button class="menu-btn" data-menu-target="users">
              <strong>用户管理</strong>
              <span>创建用户、筛选用户、编辑资料</span>
            </button>
            <button class="menu-btn" data-menu-target="logs">
              <strong>操作日志</strong>
              <span>查看管理员操作记录与筛选分页</span>
            </button>
${ADMIN_MFA_MENU_BUTTON}
          </div>
        </aside>

        <div class="content">
          <section class="section active" id="section-overview">
            <section class="cards">
              <div class="card"><div class="metric-label">总用户数</div><div class="metric-value" id="metricTotal">-</div></div>
              <div class="card"><div class="metric-label">正常用户</div><div class="metric-value" id="metricActive">-</div></div>
              <div class="card"><div class="metric-label">禁用用户</div><div class="metric-value" id="metricDisabled">-</div></div>
              <div class="card"><div class="metric-label">今日新增</div><div class="metric-value" id="metricNewToday">-</div></div>
              <div class="card"><div class="metric-label">近 7 日登录</div><div class="metric-value" id="metricRecentLogin">-</div></div>
              <div class="card"><div class="metric-label">今日重置密码</div><div class="metric-value" id="metricPasswordReset">-</div></div>
            </section>
            <section class="panel">
              <h2>快速说明</h2>
              <div class="log-item">
                <div class="log-title">用户管理</div>
                <div class="log-meta">在“用户管理”菜单里可创建用户、搜索用户、查看详情、编辑资料，以及执行禁用、启用、重置密码。</div>
              </div>
              <div class="log-item">
                <div class="log-title">操作日志</div>
                <div class="log-meta">在“操作日志”菜单里可按目标用户、操作类型、结果筛选日志，并翻页查看历史记录。</div>
              </div>
            </section>
          </section>

          <section class="section" id="section-users">
            <section class="stack">
              <section class="panel">
                <div class="panel-head">
                  <h2>用户列表</h2>
                  <button id="openCreateUserBtn">创建用户</button>
                </div>
                <div class="toolbar">
                  <input id="keywordInput" placeholder="搜索用户名 / 邮箱 / 昵称" />
                  <select id="statusSelect">
                    <option value="">全部状态</option>
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                    <option value="deleted">deleted</option>
                  </select>
                  <select id="roleSelect">
                    <option value="">全部角色</option>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                  <button id="searchBtn">查询</button>
                </div>
                <div class="error hidden" id="usersError"></div>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>账号</th>
                      <th>角色</th>
                      <th>状态</th>
                      <th>时区</th>
                      <th>最近登录</th>
                    </tr>
                  </thead>
                  <tbody id="usersTableBody">
                    <tr><td colspan="6" class="muted">正在加载...</td></tr>
                  </tbody>
                </table>
              </section>
            </section>

            <div class="modal-backdrop hidden" id="createUserModal">
              <div class="modal">
                <div class="modal-head">
                  <div>
                    <h3>创建用户</h3>
                    <p>创建后可使用用户名或邮箱登录。</p>
                  </div>
                  <button class="secondary" id="closeCreateUserBtn" type="button">关闭</button>
                </div>
                <form id="createUserForm" class="editor-grid">
                  <label>
                    用户名
                    <input id="createUsername" name="username" />
                  </label>
                  <label>
                    邮箱
                    <input id="createEmail" name="email" type="email" />
                  </label>
                  <label>
                    密码
                    <input id="createPassword" name="password" type="password" />
                  </label>
                  <label>
                    昵称
                    <input id="createNickname" name="nickname" />
                  </label>
                  <label>
                    时区
                    <input id="createTimezone" name="timezone" value="Asia/Shanghai" />
                  </label>
                  <label>
                    角色
                    <select id="createRole" name="role">
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  <label>
                    状态
                    <select id="createStatus" name="status">
                      <option value="active">active</option>
                      <option value="disabled">disabled</option>
                      <option value="deleted">deleted</option>
                    </select>
                  </label>
                  <label class="detail-full">
                    创建原因
                    <textarea id="createReason" name="reason" placeholder="例如：手动创建测试用户"></textarea>
                  </label>
                  <div class="action-row">
                    <button type="submit" class="accent">创建用户</button>
                    <button type="button" class="secondary" id="resetCreateFormBtn">重置表单</button>
                  </div>
                </form>
              </div>
            </div>

            <div class="modal-backdrop hidden" id="detailUserModal">
              <div class="modal">
                <div class="modal-head">
                  <div>
                    <h3>用户详情</h3>
                    <p>查看资料、编辑信息、执行禁用/启用/重置密码。</p>
                  </div>
                  <button class="secondary" id="closeDetailUserBtn" type="button">关闭</button>
                </div>
                <div class="error hidden" id="detailError"></div>
                <div id="actionBanner" class="banner hidden"></div>
                <div id="detailContainer" class="detail-empty">点击上方用户行查看详情，并执行资料编辑、禁用、启用、重置密码等操作。</div>

                <div class="detail-section-title">资料编辑</div>
                <form id="profileForm" class="editor-grid hidden">
                  <label>
                    用户名
                    <input id="editUsername" name="username" />
                  </label>
                  <label>
                    昵称
                    <input id="editNickname" name="nickname" />
                  </label>
                  <label>
                    邮箱
                    <input id="editEmail" name="email" type="email" />
                  </label>
                  <label>
                    时区
                    <input id="editTimezone" name="timezone" />
                  </label>
                  <label>
                    修改原因
                    <textarea id="editReason" name="reason" placeholder="例如：修正用户资料"></textarea>
                  </label>
                  <div class="action-row">
                    <button type="submit" class="accent">保存资料</button>
                    <button type="button" class="secondary" id="resetProfileFormBtn">重置表单</button>
                  </div>
                </form>

                <div class="detail-section-title">高风险操作</div>
                <div class="action-row hidden" id="detailActions">
                  <button class="danger hidden" id="disableUserBtn">禁用用户</button>
                  <button class="accent hidden" id="enableUserBtn">启用用户</button>
                  <button class="warn" id="resetPasswordBtn">重置密码</button>
                  <button class="secondary" id="refreshDetailBtn">刷新详情</button>
                </div>

                <div class="detail-section-title">设备信息</div>
                <div class="action-row" style="margin-bottom: 12px;">
                  <button class="secondary hidden" id="refreshDevicesBtn" type="button">刷新设备</button>
                </div>
                <div id="devicesContainer" class="detail-empty">选择用户后加载设备列表。</div>
              </div>
            </div>
          </section>

          <section class="section" id="section-logs">
            <section class="panel">
              <h2>操作日志</h2>
              <div class="filter-row">
                <input id="logTargetInput" placeholder="目标用户 ID" />
                <select id="logActionSelect">
                  <option value="">全部操作</option>
                  <option value="update_user_profile">update_user_profile</option>
                  <option value="disable_user">disable_user</option>
                  <option value="enable_user">enable_user</option>
                  <option value="reset_user_password">reset_user_password</option>
                  <option value="change_admin_password">change_admin_password</option>
                  <option value="logout_all_sessions">logout_all_sessions</option>
                </select>
                <select id="logResultSelect">
                  <option value="">全部结果</option>
                  <option value="success">success</option>
                  <option value="failed">failed</option>
                </select>
                <button id="logSearchBtn">筛选日志</button>
                <button class="secondary" id="logCurrentUserBtn" type="button">只看当前用户</button>
                <button class="secondary" id="logClearBtn" type="button">清空筛选</button>
              </div>
              <div class="error hidden" id="logsError"></div>
              <div id="logsContainer" class="muted">正在加载...</div>
              <div class="pagination">
                <button class="secondary" id="logsPrevBtn">上一页</button>
                <span id="logsPageInfo">第 1 页</span>
                <button class="secondary" id="logsNextBtn">下一页</button>
              </div>
            </section>
          </section>
${ADMIN_MFA_SECTION_HTML}

        </div>
      </div>
    </main>
    <script>
      const usersTableBody = document.getElementById('usersTableBody');
      const logsContainer = document.getElementById('logsContainer');
      const usersError = document.getElementById('usersError');
      const logsError = document.getElementById('logsError');
      const detailError = document.getElementById('detailError');
      const detailContainer = document.getElementById('detailContainer');
      const devicesContainer = document.getElementById('devicesContainer');
      const actionBanner = document.getElementById('actionBanner');
      const createUserForm = document.getElementById('createUserForm');
      const createUserModal = document.getElementById('createUserModal');
      const detailUserModal = document.getElementById('detailUserModal');
      const profileForm = document.getElementById('profileForm');
      const detailActions = document.getElementById('detailActions');
      const disableUserBtn = document.getElementById('disableUserBtn');
      const enableUserBtn = document.getElementById('enableUserBtn');
      const resetPasswordBtn = document.getElementById('resetPasswordBtn');
      const refreshDetailBtn = document.getElementById('refreshDetailBtn');
      const resetProfileFormBtn = document.getElementById('resetProfileFormBtn');
      const refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
      const editNickname = document.getElementById('editNickname');
      const editUsername = document.getElementById('editUsername');
      const editEmail = document.getElementById('editEmail');
      const editTimezone = document.getElementById('editTimezone');
      const editReason = document.getElementById('editReason');
      const logsPrevBtn = document.getElementById('logsPrevBtn');
      const logsNextBtn = document.getElementById('logsNextBtn');
      const logsPageInfo = document.getElementById('logsPageInfo');
      const createUsername = document.getElementById('createUsername');
      const createEmail = document.getElementById('createEmail');
      const createPassword = document.getElementById('createPassword');
      const createNickname = document.getElementById('createNickname');
      const createTimezone = document.getElementById('createTimezone');
      const createRole = document.getElementById('createRole');
      const createStatus = document.getElementById('createStatus');
      const createReason = document.getElementById('createReason');
      const resetCreateFormBtn = document.getElementById('resetCreateFormBtn');
      const openCreateUserBtn = document.getElementById('openCreateUserBtn');
      const closeCreateUserBtn = document.getElementById('closeCreateUserBtn');
      const closeDetailUserBtn = document.getElementById('closeDetailUserBtn');
      const menuButtons = Array.from(document.querySelectorAll('[data-menu-target]'));

      let selectedUserId = null;
      let selectedUser = null;
      let logsPage = 1;
      let logsHasMore = false;

      function setActiveSection(section) {
        if (section !== 'users') {
          closeDetailUserModal();
        }
        document.querySelectorAll('.section').forEach((node) => {
          node.classList.toggle('active', node.id === 'section-' + section);
        });
        menuButtons.forEach((button) => {
          button.classList.toggle('active', button.getAttribute('data-menu-target') === section);
        });
      }

      function formatDate(value) {
        if (!value) return '-';
        try {
          return new Date(value).toLocaleString();
        } catch {
          return value;
        }
      }

      function escapeHtml(value) {
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function setBanner(message) {
        actionBanner.textContent = message;
        actionBanner.classList.remove('hidden');
        setTimeout(() => actionBanner.classList.add('hidden'), 5000);
      }

      function clearDetailError() {
        detailError.textContent = '';
        detailError.classList.add('hidden');
      }

      function resetCreateForm() {
        createUsername.value = '';
        createEmail.value = '';
        createPassword.value = '';
        createNickname.value = '';
        createTimezone.value = 'Asia/Shanghai';
        createRole.value = 'user';
        createStatus.value = 'active';
        createReason.value = '';
      }

      function openCreateUserModal() {
        createUserModal.classList.remove('hidden');
        setTimeout(() => createUsername.focus(), 0);
      }

      function closeCreateUserModal() {
        createUserModal.classList.add('hidden');
      }

      function openDetailUserModal() {
        detailUserModal.classList.remove('hidden');
      }

      function closeDetailUserModal() {
        detailUserModal.classList.add('hidden');
      }

      function readCookie(name) {
        const prefix = name + '=';
        for (const part of document.cookie.split(';')) {
          const trimmed = part.trim();
          if (trimmed.startsWith(prefix)) {
            try {
              return decodeURIComponent(trimmed.slice(prefix.length));
            } catch {
              return trimmed.slice(prefix.length);
            }
          }
        }
        return '';
      }

      async function fetchJson(url, options = {}) {
        const headers = {
          ...(options.headers || {})
        };
        const method = (options.method || 'GET').toUpperCase();
        const csrfToken = readCookie('cloudtodo_admin_csrf_token');
        if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          headers['X-CSRF-Token'] = csrfToken;
        }
        const res = await fetch(url, {
          credentials: 'same-origin',
          ...options,
          headers
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const mfaCode = json?.code === 'MFA_CONFIRMATION_REQUIRED' && !options.mfaPrompted
            ? window.prompt('该操作需要动态口令确认，请输入 6 位口令或恢复码：') : null;
          if (mfaCode && mfaCode.trim()) {
            return fetchJson(url, { ...options, mfaPrompted: true,
              headers: { ...headers, 'X-CloudTodo-MFA-Code': mfaCode.trim() } });
          }
          throw new Error(json?.message || '请求失败');
        }
        return json;
      }

      async function loadSummary() {
        const json = await fetchJson('/api/admin/dashboard/summary');
        const data = json.data;
        document.getElementById('metricTotal').textContent = data.totalUsers;
        document.getElementById('metricActive').textContent = data.activeUsers;
        document.getElementById('metricDisabled').textContent = data.disabledUsers;
        document.getElementById('metricNewToday').textContent = data.newUsersToday;
        document.getElementById('metricRecentLogin').textContent = data.recentLoginUsers;
        document.getElementById('metricPasswordReset').textContent = data.passwordResetCountToday;
      }

      async function loadUsers() {
        usersError.classList.add('hidden');
        const keyword = document.getElementById('keywordInput').value.trim();
        const status = document.getElementById('statusSelect').value;
        const role = document.getElementById('roleSelect').value;
        const params = new URLSearchParams({ page: '1', page_size: '20' });
        if (keyword) params.set('keyword', keyword);
        if (status) params.set('status', status);
        if (role) params.set('role', role);

        const json = await fetchJson('/api/admin/users?' + params.toString());
        const items = json.data.items ?? [];

        if (items.length === 0) {
          usersTableBody.innerHTML = '<tr><td colspan="6" class="muted">暂无数据</td></tr>';
          if (!selectedUserId) {
            detailContainer.innerHTML = '<div class="detail-empty">暂无可查看的用户。</div>';
          }
          return;
        }

        if (selectedUserId && !items.some(item => item.id === selectedUserId)) {
          selectedUserId = null;
        }

        usersTableBody.innerHTML = items.map(item => \`
          <tr data-user-id="\${escapeHtml(item.id)}" class="\${selectedUserId === item.id ? 'selected-row' : ''}">
            <td><code>\${escapeHtml(item.id)}</code></td>
            <td>
              <div>\${escapeHtml(item.username)}</div>
              <div class="muted">\${escapeHtml(item.email)}</div>
              <div class="muted">\${escapeHtml(item.nickname)}</div>
            </td>
            <td><span class="status \${escapeHtml(item.role)}">\${escapeHtml(item.role)}</span></td>
            <td><span class="status \${escapeHtml(item.status)}">\${escapeHtml(item.status)}</span></td>
            <td>\${escapeHtml(item.timezone)}</td>
            <td>\${escapeHtml(formatDate(item.lastLoginAt))}</td>
          </tr>
        \`).join('');

        Array.from(usersTableBody.querySelectorAll('tr[data-user-id]')).forEach(row => {
          row.style.cursor = 'pointer';
          row.addEventListener('click', () => {
            const userId = row.getAttribute('data-user-id');
            if (userId) {
              setActiveSection('users');
              void selectUser(userId);
            }
          });
        });

        highlightSelectedRow();
      }

      async function handleCreateUser(event) {
        event.preventDefault();
        const payload = {
          username: createUsername.value.trim(),
          email: createEmail.value.trim(),
          password: createPassword.value,
          nickname: createNickname.value.trim(),
          timezone: createTimezone.value.trim(),
          role: createRole.value,
          status: createStatus.value,
          reason: createReason.value.trim()
        };

        if (!payload.username || !payload.email || !payload.password || !payload.reason) {
          usersError.textContent = '请填写用户名、邮箱、密码和创建原因';
          usersError.classList.remove('hidden');
          return;
        }

        try {
          usersError.classList.add('hidden');
          const json = await fetchJson('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          resetCreateForm();
          closeCreateUserModal();
          setBanner('用户已创建：' + json.data.user.username);
          await Promise.all([loadSummary(), loadUsers(), loadLogs(1)]);
          setActiveSection('users');
        } catch (error) {
          usersError.textContent = error.message || '创建用户失败';
          usersError.classList.remove('hidden');
        }
      }

      async function selectUser(userId) {
        selectedUserId = userId;
        highlightSelectedRow();
        await Promise.all([loadUserDetail(userId), loadUserDevices(userId)]);
        document.getElementById('logTargetInput').value = userId;
        openDetailUserModal();
      }

      function highlightSelectedRow() {
        Array.from(usersTableBody.querySelectorAll('tr[data-user-id]')).forEach(row => {
          row.classList.toggle('selected-row', row.getAttribute('data-user-id') === selectedUserId);
        });
      }

      function fillProfileForm(user) {
        editUsername.value = user.username || '';
        editNickname.value = user.nickname || '';
        editEmail.value = user.email || '';
        editTimezone.value = user.timezone || '';
        editReason.value = '';
      }

      async function loadUserDetail(userId) {
        clearDetailError();
        const json = await fetchJson('/api/admin/users/' + encodeURIComponent(userId));
        const user = json.data;
        selectedUser = user;

        detailContainer.innerHTML = \`
          <div class="detail-grid">
            <div class="detail-item detail-full">
              <strong>用户 ID</strong>
              <code>\${escapeHtml(user.id)}</code>
            </div>
            <div class="detail-item">
              <strong>用户名</strong>
              <span>\${escapeHtml(user.username)}</span>
            </div>
            <div class="detail-item">
              <strong>邮箱</strong>
              <span>\${escapeHtml(user.email)}</span>
            </div>
            <div class="detail-item">
              <strong>昵称</strong>
              <span>\${escapeHtml(user.nickname)}</span>
            </div>
            <div class="detail-item">
              <strong>状态</strong>
              <span class="status \${escapeHtml(user.status)}">\${escapeHtml(user.status)}</span>
            </div>
            <div class="detail-item">
              <strong>角色</strong>
              <span class="status \${escapeHtml(user.role)}">\${escapeHtml(user.role)}</span>
            </div>
            <div class="detail-item">
              <strong>时区</strong>
              <span>\${escapeHtml(user.timezone)}</span>
            </div>
            <div class="detail-item">
              <strong>最近登录</strong>
              <span>\${escapeHtml(formatDate(user.lastLoginAt))}</span>
            </div>
            <div class="detail-item">
              <strong>注册时间</strong>
              <span>\${escapeHtml(formatDate(user.createdAt))}</span>
            </div>
            <div class="detail-item">
              <strong>Todo 摘要</strong>
              <span>总计 \${escapeHtml(user.todo_summary.total)}，待办 \${escapeHtml(user.todo_summary.pending)}，完成 \${escapeHtml(user.todo_summary.completed)}，归档 \${escapeHtml(user.todo_summary.archived)}</span>
            </div>
            <div class="detail-item detail-full">
              <strong>提醒摘要</strong>
              <span>待触发 \${escapeHtml(user.reminder_summary.pending)}，失败 \${escapeHtml(user.reminder_summary.failed)}</span>
            </div>
          </div>
        \`;

        profileForm.classList.remove('hidden');
        detailActions.classList.remove('hidden');
        refreshDevicesBtn.classList.remove('hidden');
        disableUserBtn.classList.toggle('hidden', user.status === 'disabled');
        enableUserBtn.classList.toggle('hidden', user.status !== 'disabled');
        fillProfileForm(user);
      }

      async function loadUserDevices(userId) {
        const json = await fetchJson('/api/admin/users/' + encodeURIComponent(userId) + '/devices');
        const items = json.data.items ?? [];
        if (items.length === 0) {
          devicesContainer.innerHTML = '<div class="detail-empty">该用户暂无设备信息。</div>';
          return;
        }

        devicesContainer.innerHTML = '<div class="device-list">' + items.map(item => \`
          <div class="device-card">
            <strong>\${escapeHtml(item.device_name || item.platform)}</strong>
            <div class="inline-meta">
              <span class="muted">平台：\${escapeHtml(item.platform)}</span>
              <span class="muted">版本：\${escapeHtml(item.app_version || '-')}</span>
            </div>
            <div class="inline-meta">
              <span class="muted">在线：\${escapeHtml(String(item.is_online))}</span>
              <span class="muted">最近活跃：\${escapeHtml(formatDate(item.last_active_at))}</span>
            </div>
          </div>
        \`).join('') + '</div>';
      }

      async function handleProfileSave(event) {
        event.preventDefault();
        if (!selectedUser) return;
        const payload = {
          username: editUsername.value.trim(),
          nickname: editNickname.value.trim(),
          email: editEmail.value.trim(),
          timezone: editTimezone.value.trim(),
          reason: editReason.value.trim()
        };

        if (!payload.reason) {
          detailError.textContent = '请填写资料修改原因';
          detailError.classList.remove('hidden');
          return;
        }

        try {
          clearDetailError();
          await fetchJson('/api/admin/users/' + encodeURIComponent(selectedUser.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          setBanner('用户资料已更新');
          await Promise.all([loadSummary(), loadUsers(), selectUser(selectedUser.id)]);
        } catch (error) {
          detailError.textContent = error.message || '更新资料失败';
          detailError.classList.remove('hidden');
        }
      }

      function resetProfileForm() {
        if (!selectedUser) return;
        fillProfileForm(selectedUser);
      }

      async function handleDisableUser() {
        if (!selectedUser) return;
        const reason = prompt('请输入禁用原因：', 'manual disable');
        if (!reason) return;
        await postAction('/api/admin/users/' + encodeURIComponent(selectedUser.id) + '/disable', { reason }, '用户已禁用');
      }

      async function handleEnableUser() {
        if (!selectedUser) return;
        const reason = prompt('请输入启用原因：', 'manual enable') || 'manual enable';
        await postAction('/api/admin/users/' + encodeURIComponent(selectedUser.id) + '/enable', { reason }, '用户已启用');
      }

      async function handleResetPassword() {
        if (!selectedUser) return;
        const reason = prompt('请输入重置密码原因：', 'manual reset');
        if (!reason) return;
        const mode = confirm('确定使用“临时密码模式”吗？\\n选择“取消”将使用重置令牌模式。') ? 'temporary_password' : 'reset_token';

        const json = await fetchJson('/api/admin/users/' + encodeURIComponent(selectedUser.id) + '/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, reason })
        });

        const payload = json.data;
        await Promise.all([loadSummary(), loadUsers(), selectUser(selectedUser.id), loadLogs(logsPage)]);

        if (payload.mode === 'temporary_password') {
          setBanner('临时密码已生成：' + payload.temporary_password);
        } else {
          setBanner('重置令牌已生成：' + payload.reset_token);
        }
      }

      async function postAction(url, payload, successMessage) {
        try {
          clearDetailError();
          await fetchJson(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          setBanner(successMessage);
          await Promise.all([loadSummary(), loadUsers(), selectUser(selectedUserId), loadLogs(logsPage)]);
        } catch (error) {
          detailError.textContent = error.message || '操作失败';
          detailError.classList.remove('hidden');
        }
      }

      async function loadLogs(page = logsPage) {
        logsError.classList.add('hidden');
        logsPage = page;
        const params = new URLSearchParams({ page: String(logsPage), page_size: '8' });
        const action = document.getElementById('logActionSelect').value;
        const result = document.getElementById('logResultSelect').value;
        const targetUserId = document.getElementById('logTargetInput').value.trim();

        if (action) params.set('action', action);
        if (result) params.set('result', result);
        if (targetUserId) params.set('target_user_id', targetUserId);

        const json = await fetchJson('/api/admin/operation-logs?' + params.toString());
        const items = json.data.items ?? [];
        logsHasMore = Boolean(json.data.has_more);
        logsPageInfo.textContent = '第 ' + logsPage + ' 页';
        logsPrevBtn.disabled = logsPage <= 1;
        logsNextBtn.disabled = !logsHasMore;

        if (items.length === 0) {
          logsContainer.innerHTML = '<div class="muted">暂无管理员操作</div>';
          return;
        }

        logsContainer.innerHTML = items.map(item => \`
          <div class="log-item">
            <div class="log-title">\${escapeHtml(item.action)}</div>
            <div class="log-meta">目标用户：\${escapeHtml(item.targetUserId || '-')}</div>
            <div class="log-meta">原因：\${escapeHtml(item.reason || '-')}</div>
            <div class="log-meta">结果：\${escapeHtml(item.result)} · 时间：\${escapeHtml(formatDate(item.createdAt || item.created_at))}</div>
          </div>
        \`).join('');
      }

      async function loadPage() {
        try {
          await Promise.all([loadSummary(), loadUsers(), loadLogs(1)]);
          setActiveSection('overview');
        } catch (error) {
          const message = error?.message || '加载失败';
          usersError.textContent = message;
          usersError.classList.remove('hidden');
          logsError.textContent = message;
          logsError.classList.remove('hidden');
          detailError.textContent = message;
          detailError.classList.remove('hidden');
        }
      }

      menuButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-menu-target');
          if (target) {
            setActiveSection(target);
          }
        });
      });

      document.getElementById('searchBtn').addEventListener('click', () => {
        loadUsers().catch(error => {
          usersError.textContent = error.message || '加载失败';
          usersError.classList.remove('hidden');
        });
      });

      createUserForm.addEventListener('submit', handleCreateUser);
      resetCreateFormBtn.addEventListener('click', resetCreateForm);
      openCreateUserBtn.addEventListener('click', openCreateUserModal);
      closeCreateUserBtn.addEventListener('click', closeCreateUserModal);
      createUserModal.addEventListener('click', (event) => {
        if (event.target === createUserModal) {
          closeCreateUserModal();
        }
      });
      closeDetailUserBtn.addEventListener('click', closeDetailUserModal);
      detailUserModal.addEventListener('click', (event) => {
        if (event.target === detailUserModal) {
          closeDetailUserModal();
        }
      });

      document.getElementById('logSearchBtn').addEventListener('click', () => {
        setActiveSection('logs');
        loadLogs(1).catch(error => {
          logsError.textContent = error.message || '加载日志失败';
          logsError.classList.remove('hidden');
        });
      });

      logsPrevBtn.addEventListener('click', () => {
        if (logsPage > 1) {
          loadLogs(logsPage - 1).catch(error => {
            logsError.textContent = error.message || '加载日志失败';
            logsError.classList.remove('hidden');
          });
        }
      });

      logsNextBtn.addEventListener('click', () => {
        if (logsHasMore) {
          loadLogs(logsPage + 1).catch(error => {
            logsError.textContent = error.message || '加载日志失败';
            logsError.classList.remove('hidden');
          });
        }
      });

      profileForm.addEventListener('submit', handleProfileSave);
      resetProfileFormBtn.addEventListener('click', resetProfileForm);
      refreshDevicesBtn.addEventListener('click', () => {
        if (selectedUserId) {
          loadUserDevices(selectedUserId).catch(error => {
            detailError.textContent = error.message || '加载设备失败';
            detailError.classList.remove('hidden');
          });
        }
      });
      disableUserBtn.addEventListener('click', handleDisableUser);
      enableUserBtn.addEventListener('click', handleEnableUser);
      resetPasswordBtn.addEventListener('click', handleResetPassword);
      document.getElementById('logCurrentUserBtn').addEventListener('click', () => {
        if (selectedUserId) {
          document.getElementById('logTargetInput').value = selectedUserId;
          setActiveSection('logs');
          loadLogs(1).catch(error => {
            logsError.textContent = error.message || '加载日志失败';
            logsError.classList.remove('hidden');
          });
        }
      });
      document.getElementById('logClearBtn').addEventListener('click', () => {
        document.getElementById('logTargetInput').value = '';
        document.getElementById('logActionSelect').value = '';
        document.getElementById('logResultSelect').value = '';
        loadLogs(1).catch(error => {
          logsError.textContent = error.message || '加载日志失败';
          logsError.classList.remove('hidden');
        });
      });
      refreshDetailBtn.addEventListener('click', () => {
        if (selectedUserId) {
          setActiveSection('users');
          selectUser(selectedUserId).catch(error => {
            detailError.textContent = error.message || '刷新失败';
            detailError.classList.remove('hidden');
          });
        }
      });

      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'X-CSRF-Token': readCookie('cloudtodo_admin_csrf_token')
          }
        });
        location.href = '/admin/login';
      });

      loadPage();
${ADMIN_MFA_SCRIPT}
    </script>
  </body>
</html>`;
  }

  renderLogin() {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CloudTodo Admin Login</title>
    <style>
      :root {
        --bg: #eef2f7;
        --card: #ffffff;
        --line: #d8e0eb;
        --ink: #16202a;
        --muted: #637084;
        --accent: #0f766e;
        --danger: #b91c1c;
      }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top left, #dff5f2 0%, #eef2f7 45%, #f7f8fb 100%); color: var(--ink); font-family: "Segoe UI", "PingFang SC", sans-serif; }
      main { width: min(100%, 460px); background: var(--card); padding: 32px; border-radius: 22px; border: 1px solid var(--line); box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 10px; }
      p { margin: 0 0 20px; color: var(--muted); }
      form { display: grid; gap: 14px; }
      label { display: grid; gap: 8px; font-size: 14px; }
      input { width: 100%; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; font-size: 14px; }
      button { border: 0; background: var(--accent); color: #fff; padding: 12px 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
      .hint { margin-top: 16px; font-size: 13px; color: var(--muted); }
      .error { margin-top: 12px; color: var(--danger); font-size: 13px; min-height: 20px; }
    </style>
  </head>
  <body>
    <main>
      <h1>管理员登录</h1>
      <p>支持用用户名或邮箱登录后台。</p>
      <form id="loginForm">
        <label>
          账号
          <input id="accountInput" name="account" autocomplete="username" placeholder="邮箱或用户名" required />
        </label>
        <label>
          密码
          <input id="passwordInput" name="password" type="password" autocomplete="current-password" placeholder="输入管理员密码" required />
        </label>
        <label id="totpLabel" style="display: none;">
          动态口令
          <input id="totpInput" name="totp_code" autocomplete="one-time-code" inputmode="numeric" maxlength="32" placeholder="6 位动态口令或恢复码" />
        </label>
        <button type="submit">登录后台</button>
      </form>
      <div class="error" id="errorBox"></div>
      <div class="hint">管理员可使用用户名或邮箱登录。</div>
    </main>
    <script>
      const form = document.getElementById('loginForm');
      const errorBox = document.getElementById('errorBox');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.textContent = '';

        const account = document.getElementById('accountInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        const totpCode = document.getElementById('totpInput').value.trim();

        try {
          const payload = { account, password };
          if (totpCode) {
            payload.totp_code = totpCode;
          }
          const res = await fetch('/api/admin/auth/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const json = await res.json();
          if (!res.ok) {
            if (json?.code === 'MFA_REQUIRED') {
              document.getElementById('totpLabel').style.display = '';
              document.getElementById('totpInput').focus();
              throw new Error('该账号已启用动态口令，请输入 6 位口令或恢复码。');
            }
            throw new Error(json?.message || '登录失败');
          }

          location.href = '/admin';
        } catch (error) {
          errorBox.textContent = error.message || '登录失败';
        }
      });
    </script>
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
