/**
 * Markup and behaviour for the admin panel security-audit-log section.
 * Kept separate from admin-panel.service.ts to respect the file size budget.
 */

export const ADMIN_AUDIT_MENU_BUTTON = `
            <button class="menu-btn" data-menu-target="audit">
              <strong>安全审计</strong>
              <span>查看认证、MFA 与 Webhook 安全事件</span>
            </button>`;

export const ADMIN_AUDIT_SECTION_HTML = `
          <section class="section" id="section-audit">
            <section class="panel">
              <h2>安全审计日志</h2>
              <div class="filter-row">
                <input id="auditActorInput" placeholder="操作者用户 ID" />
                <input id="auditTargetInput" placeholder="目标用户 ID" />
                <input id="auditActionInput" list="auditActionList" placeholder="事件类型（可留空）" />
                <datalist id="auditActionList">
                  <option value="user_login_failure"></option>
                  <option value="admin_login_failure"></option>
                  <option value="admin_login_success"></option>
                  <option value="refresh_token_reuse"></option>
                  <option value="password_change"></option>
                  <option value="password_reset_confirmed"></option>
                  <option value="admin_mfa_failure"></option>
                  <option value="admin_mfa_enrolled"></option>
                  <option value="admin_user_disabled"></option>
                  <option value="admin_password_reset_issued"></option>
                  <option value="webhook_delivery_blocked"></option>
                </datalist>
                <select id="auditResultSelect">
                  <option value="">全部结果</option>
                  <option value="success">success</option>
                  <option value="failure">failure</option>
                  <option value="blocked">blocked</option>
                </select>
                <button id="auditSearchBtn">筛选</button>
                <button class="secondary" id="auditClearBtn" type="button">清空筛选</button>
              </div>
              <div class="error hidden" id="auditError"></div>
              <div class="log-item">
                <div class="log-title">审计链完整性</div>
                <div class="log-meta" id="auditChainStatus">未校验</div>
                <div class="action-row">
                  <button class="secondary" id="auditChainVerifyBtn" type="button">校验审计链</button>
                </div>
              </div>
              <div id="auditContainer" class="muted">切换到本页后自动加载...</div>
              <div class="pagination">
                <button class="secondary" id="auditPrevBtn">上一页</button>
                <span id="auditPageInfo">第 1 页</span>
                <button class="secondary" id="auditNextBtn">下一页</button>
              </div>
            </section>
          </section>`;

export const ADMIN_AUDIT_SCRIPT = `
      const auditError = document.getElementById('auditError');
      const auditContainer = document.getElementById('auditContainer');
      const auditPageInfo = document.getElementById('auditPageInfo');
      const auditPrevBtn = document.getElementById('auditPrevBtn');
      const auditNextBtn = document.getElementById('auditNextBtn');
      let auditPage = 1;
      let auditHasMore = false;
      let auditLoadedOnce = false;

      async function loadAuditLogs(page = auditPage) {
        auditError.classList.add('hidden');
        auditPage = page;
        const params = new URLSearchParams({ page: String(auditPage), page_size: '8' });
        const actor = document.getElementById('auditActorInput').value.trim();
        const target = document.getElementById('auditTargetInput').value.trim();
        const action = document.getElementById('auditActionInput').value.trim();
        const result = document.getElementById('auditResultSelect').value;
        if (actor) params.set('actor_user_id', actor);
        if (target) params.set('target_user_id', target);
        if (action) params.set('action', action);
        if (result) params.set('result', result);

        const json = await fetchJson('/api/admin/security-audit-logs?' + params.toString());
        const items = json.data.items ?? [];
        auditHasMore = Boolean(json.data.has_more);
        auditPageInfo.textContent = '第 ' + auditPage + ' 页';
        auditPrevBtn.disabled = auditPage <= 1;
        auditNextBtn.disabled = !auditHasMore;
        auditLoadedOnce = true;

        if (items.length === 0) {
          auditContainer.innerHTML = '<div class="muted">暂无安全审计事件</div>';
          return;
        }

        auditContainer.innerHTML = items.map(item => (
          '<div class="log-item">' +
            '<div class="log-title">' + escapeHtml(item.action) + ' · ' + escapeHtml(item.result) + '</div>' +
            '<div class="log-meta">操作者：' + escapeHtml(item.actor_user_id || '-') +
              ' · 目标：' + escapeHtml(item.target_user_id || '-') + '</div>' +
            '<div class="log-meta">来源 IP：' + escapeHtml(item.ip_address || '-') +
              ' · 时间：' + escapeHtml(formatDate(item.created_at)) + '</div>' +
            (item.metadata ? '<div class="log-meta">详情：' +
              escapeHtml(JSON.stringify(item.metadata)) + '</div>' : '') +
          '</div>'
        )).join('');
      }

      function auditShowError(error) {
        auditError.textContent = error?.message || '加载失败';
        auditError.classList.remove('hidden');
      }

      document.getElementById('auditChainVerifyBtn').addEventListener('click', async () => {
        const status = document.getElementById('auditChainStatus');
        status.textContent = '校验中...';
        try {
          const json = await fetchJson('/api/admin/security-audit-logs/chain-verification');
          const data = json.data || {};
          const head = data.head ? ('链头 #' + data.head.chain_index) : '链尚未开始';
          status.textContent = data.valid
            ? ('完整 · 已校验 ' + data.checked_entries + ' 条 · ' + head)
            : ('校验失败（' + (data.reason || 'unknown') + '）· 断点 chain_seq ' +
               (data.broken_at_chain_seq || '-') + ' · ' + head);
        } catch (error) {
          status.textContent = '校验请求失败：' + (error?.message || '未知错误');
        }
      });

      document.getElementById('auditSearchBtn').addEventListener('click', () => {
        loadAuditLogs(1).catch(auditShowError);
      });
      document.getElementById('auditClearBtn').addEventListener('click', () => {
        for (const id of ['auditActorInput', 'auditTargetInput', 'auditActionInput']) {
          document.getElementById(id).value = '';
        }
        document.getElementById('auditResultSelect').value = '';
        loadAuditLogs(1).catch(auditShowError);
      });
      auditPrevBtn.addEventListener('click', () => {
        if (auditPage > 1) loadAuditLogs(auditPage - 1).catch(auditShowError);
      });
      auditNextBtn.addEventListener('click', () => {
        if (auditHasMore) loadAuditLogs(auditPage + 1).catch(auditShowError);
      });
      for (const button of menuButtons) {
        button.addEventListener('click', () => {
          if (button.getAttribute('data-menu-target') === 'audit' && !auditLoadedOnce) {
            loadAuditLogs(1).catch(auditShowError);
          }
        });
      }`;
