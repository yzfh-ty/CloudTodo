/**
 * Markup and behaviour for the admin panel MFA (TOTP) settings section.
 * Kept separate from admin-panel.service.ts to respect the file size budget.
 */

export const ADMIN_MFA_MENU_BUTTON = `
            <button class="menu-btn" data-menu-target="security">
              <strong>安全设置</strong>
              <span>管理动态口令（TOTP）与恢复码</span>
            </button>`;

export const ADMIN_MFA_SECTION_HTML = `
          <section class="section" id="section-security">
            <section class="panel">
              <h2>动态口令（TOTP）</h2>
              <p class="muted">启用后，登录后台除密码外还需输入认证器应用生成的 6 位动态口令。</p>
              <div class="error hidden" id="mfaError"></div>
              <div id="mfaStatusBox" class="log-item">
                <div class="log-title">当前状态</div>
                <div class="log-meta" id="mfaStatusText">正在加载...</div>
              </div>
              <div class="action-row">
                <button class="accent hidden" id="mfaStartBtn" type="button">启用动态口令</button>
                <button class="danger hidden" id="mfaDisableBtn" type="button">停用动态口令</button>
                <button class="secondary" id="mfaRefreshBtn" type="button">刷新状态</button>
              </div>
              <div id="mfaEnrollBox" class="hidden">
                <div class="detail-section-title">1. 在认证器应用中添加</div>
                <div class="log-item">
                  <div class="log-meta">在 Google Authenticator / 1Password 等应用中手动输入以下密钥（或粘贴 otpauth 链接）：</div>
                  <div class="log-title" id="mfaSecretText" style="word-break: break-all;"></div>
                  <div class="log-meta" id="mfaOtpauthText" style="word-break: break-all;"></div>
                </div>
                <div class="detail-section-title">2. 输入应用生成的 6 位口令完成启用</div>
                <div class="action-row">
                  <input id="mfaConfirmInput" placeholder="6 位动态口令" maxlength="6" inputmode="numeric" style="max-width: 200px;" />
                  <button class="accent" id="mfaConfirmBtn" type="button">确认启用</button>
                </div>
              </div>
              <div id="mfaRecoveryBox" class="hidden">
                <div class="detail-section-title">恢复码（仅显示一次，请立即保存）</div>
                <div class="log-item">
                  <div class="log-meta">每个恢复码只能使用一次，可在丢失认证器时代替动态口令登录。</div>
                  <pre id="mfaRecoveryCodes" style="user-select: all;"></pre>
                </div>
              </div>
              <div id="mfaDisableBox" class="hidden">
                <div class="detail-section-title">停用需要验证</div>
                <div class="action-row">
                  <input id="mfaDisableInput" placeholder="动态口令或恢复码" maxlength="32" style="max-width: 240px;" />
                  <button class="danger" id="mfaDisableConfirmBtn" type="button">确认停用</button>
                </div>
              </div>
            </section>
          </section>`;

export const ADMIN_MFA_SCRIPT = `
      const mfaError = document.getElementById('mfaError');
      const mfaStatusText = document.getElementById('mfaStatusText');
      const mfaStartBtn = document.getElementById('mfaStartBtn');
      const mfaDisableBtn = document.getElementById('mfaDisableBtn');
      const mfaEnrollBox = document.getElementById('mfaEnrollBox');
      const mfaRecoveryBox = document.getElementById('mfaRecoveryBox');
      const mfaDisableBox = document.getElementById('mfaDisableBox');

      function mfaShowError(message) {
        mfaError.textContent = message || '';
        mfaError.classList.toggle('hidden', !message);
      }

      function mfaRequest(url, body) {
        return fetchJson(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {})
        });
      }

      async function refreshMfaStatus() {
        mfaShowError('');
        try {
          const json = await fetchJson('/api/admin/mfa/status');
          const data = json.data || {};
          mfaStatusText.textContent = data.totp_enabled
            ? ('已启用 · 剩余恢复码 ' + data.recovery_codes_remaining + ' 个')
            : (data.enrollment_pending ? '未启用 · 有一次未完成的启用流程' : '未启用');
          mfaStartBtn.classList.toggle('hidden', data.totp_enabled);
          mfaDisableBtn.classList.toggle('hidden', !data.totp_enabled);
          if (data.totp_enabled) {
            mfaEnrollBox.classList.add('hidden');
          } else {
            mfaDisableBox.classList.add('hidden');
          }
        } catch (error) {
          mfaShowError(error.message);
        }
      }

      mfaStartBtn.addEventListener('click', async () => {
        mfaShowError('');
        try {
          const json = await mfaRequest('/api/admin/mfa/totp/start');
          document.getElementById('mfaSecretText').textContent = json.data.secret;
          document.getElementById('mfaOtpauthText').textContent = json.data.otpauth_uri;
          mfaRecoveryBox.classList.add('hidden');
          mfaEnrollBox.classList.remove('hidden');
        } catch (error) {
          mfaShowError(error.message);
        }
      });

      document.getElementById('mfaConfirmBtn').addEventListener('click', async () => {
        mfaShowError('');
        try {
          const code = document.getElementById('mfaConfirmInput').value.trim();
          const json = await mfaRequest('/api/admin/mfa/totp/confirm', { code });
          document.getElementById('mfaRecoveryCodes').textContent =
            (json.data.recovery_codes || []).join('\\n');
          mfaEnrollBox.classList.add('hidden');
          mfaRecoveryBox.classList.remove('hidden');
          await refreshMfaStatus();
          mfaRecoveryBox.classList.remove('hidden');
        } catch (error) {
          mfaShowError(error.message);
        }
      });

      mfaDisableBtn.addEventListener('click', () => {
        mfaDisableBox.classList.toggle('hidden');
      });

      document.getElementById('mfaDisableConfirmBtn').addEventListener('click', async () => {
        mfaShowError('');
        try {
          const code = document.getElementById('mfaDisableInput').value.trim();
          await mfaRequest('/api/admin/mfa/totp/disable', { code });
          document.getElementById('mfaDisableInput').value = '';
          mfaRecoveryBox.classList.add('hidden');
          await refreshMfaStatus();
        } catch (error) {
          mfaShowError(error.message);
        }
      });

      document.getElementById('mfaRefreshBtn').addEventListener('click', refreshMfaStatus);
      refreshMfaStatus();`;
