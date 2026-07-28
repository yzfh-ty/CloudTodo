import type { AuthenticatedAdmin } from '../admin/admin-session.service';

export function renderForcedPasswordChange(admin: AuthenticatedAdmin) {
  const adminDisplay = escapeHtml(admin.nickname || admin.email || admin.username);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CloudTodo Admin Password Change</title>
    <style>
      :root { --bg: #eef2f7; --card: #fff; --line: #d8e0eb; --ink: #16202a; --muted: #637084; --accent: #0f766e; --danger: #b91c1c; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--ink); font-family: "Segoe UI", "PingFang SC", sans-serif; }
      main { width: min(100%, 480px); background: var(--card); padding: 32px; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 18px 48px rgba(15, 23, 42, .08); }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 0 0 20px; color: var(--muted); }
      form { display: grid; gap: 14px; }
      label { display: grid; gap: 8px; font-size: 14px; }
      input { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; font-size: 14px; }
      button { border: 0; border-radius: 6px; background: var(--accent); color: #fff; padding: 12px 14px; font-size: 15px; font-weight: 600; cursor: pointer; }
      button:disabled { opacity: .6; cursor: wait; }
      .error { margin-top: 12px; color: var(--danger); font-size: 13px; min-height: 20px; }
    </style>
  </head>
  <body>
    <main>
      <h1>首次登录，请修改密码</h1>
      <p>${adminDisplay} 当前使用临时密码，修改后需重新登录。</p>
      <form id="forcePasswordChangeForm">
        <label>当前密码<input name="currentPassword" type="password" autocomplete="current-password" required /></label>
        <label>新密码<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
        <label>确认新密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
        <button id="submitBtn" type="submit">修改密码</button>
      </form>
      <div class="error" id="errorBox"></div>
    </main>
    <script>
      function readCookie(name) {
        const prefix = encodeURIComponent(name) + '=';
        for (const part of document.cookie.split(';')) {
          const value = part.trim();
          if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
        }
        return '';
      }

      document.getElementById('forcePasswordChangeForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submitBtn = document.getElementById('submitBtn');
        const errorBox = document.getElementById('errorBox');
        const data = new FormData(form);
        const payload = {
          currentPassword: data.get('currentPassword'),
          newPassword: data.get('newPassword'),
          confirmPassword: data.get('confirmPassword')
        };
        errorBox.textContent = '';
        if (payload.newPassword !== payload.confirmPassword) {
          errorBox.textContent = '两次输入的新密码不一致';
          return;
        }
        submitBtn.disabled = true;
        try {
          const res = await fetch('/api/admin/auth/change-password', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': readCookie('cloudtodo_admin_csrf_token')
            },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.message || '修改密码失败');
          location.href = '/admin/login';
        } catch (error) {
          errorBox.textContent = error.message || '修改密码失败';
          submitBtn.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
