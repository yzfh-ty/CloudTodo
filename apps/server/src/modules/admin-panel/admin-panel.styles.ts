export const ADMIN_PANEL_STYLES = String.raw`
      :root {
        --bg: #eef2f7;
        --card: #ffffff;
        --line: #d8e0eb;
        --ink: #16202a;
        --muted: #637084;
        --accent: #0f766e;
        --accent-weak: #dff5f2;
        --accent-strong: #115e59;
        --danger: #b91c1c;
        --warn: #b45309;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "PingFang SC", sans-serif;
        background: linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%);
        color: var(--ink);
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 28px;
        border-bottom: 1px solid var(--line);
        background: rgba(255,255,255,.92);
        position: sticky;
        top: 0;
        backdrop-filter: blur(10px);
        z-index: 20;
      }
      .brand { display: flex; flex-direction: column; gap: 4px; }
      .brand strong { font-size: 18px; }
      .brand span { color: var(--muted); font-size: 13px; }
      .header-right { display: flex; align-items: center; gap: 12px; }
      .admin-badge {
        padding: 8px 12px;
        background: var(--accent-weak);
        color: var(--accent);
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
      }
      .logout-btn {
        border: 0;
        background: var(--ink);
        color: #fff;
        padding: 10px 14px;
        border-radius: 10px;
        cursor: pointer;
      }
      main {
        max-width: 1460px;
        margin: 24px auto;
        padding: 0 20px 40px;
      }
      .admin-shell {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }
      .sidebar {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 16px;
        box-shadow: 0 10px 30px rgba(15,23,42,0.04);
        position: sticky;
        top: 96px;
      }
      .sidebar-title {
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: .08em;
        margin: 6px 4px 12px;
      }
      .menu {
        display: grid;
        gap: 8px;
      }
      .menu-btn {
        width: 100%;
        border: 1px solid transparent;
        background: transparent;
        color: var(--ink);
        text-align: left;
        border-radius: 14px;
        padding: 12px 14px;
        cursor: pointer;
        display: grid;
        gap: 4px;
      }
      .menu-btn strong { font-size: 14px; }
      .menu-btn span { font-size: 12px; color: var(--muted); }
      .menu-btn.active {
        background: var(--accent-weak);
        border-color: #b7e6df;
      }
      .menu-btn.active strong { color: var(--accent-strong); }
      .menu-btn.active span { color: var(--accent); }
      .content {
        display: grid;
        gap: 20px;
      }
      .section {
        display: none;
        gap: 20px;
      }
      .section.active {
        display: grid;
      }
      .cards {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .stack {
        display: grid;
        gap: 20px;
      }
      .card, .panel {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(15,23,42,0.04);
      }
      .card h2, .panel h2 {
        margin: 0 0 14px;
        font-size: 16px;
      }
      .metric-label {
        color: var(--muted);
        font-size: 13px;
      }
      .metric-value {
        margin-top: 10px;
        font-size: 28px;
        font-weight: 700;
      }
      .split {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(340px, 1fr);
        gap: 20px;
        align-items: start;
      }
      .toolbar, .filter-row, .action-row, .pagination {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .toolbar, .filter-row {
        margin-bottom: 14px;
      }
      input, select, textarea, button {
        font: inherit;
      }
      .toolbar input, .toolbar select, .filter-row input, .filter-row select, .editor-grid input, .editor-grid textarea, .editor-grid select {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
        background: #fff;
        width: 100%;
      }
      .toolbar button, .filter-row button, .action-row button, .pagination button, .panel-head button, .modal-head button {
        border: 0;
        background: var(--accent);
        color: #fff;
        min-height: 42px;
        padding: 10px 16px;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        transition: transform .12s ease, opacity .12s ease, box-shadow .12s ease;
        box-shadow: 0 6px 18px rgba(15, 118, 110, 0.14);
      }
      .toolbar button:hover, .filter-row button:hover, .action-row button:hover, .pagination button:hover, .panel-head button:hover, .modal-head button:hover {
        transform: translateY(-1px);
      }
      button.secondary {
        background: #dbe3ee;
        color: var(--ink);
        box-shadow: none;
      }
      button.danger {
        background: var(--danger);
        color: #fff;
        box-shadow: 0 6px 18px rgba(185, 28, 28, 0.16);
      }
      button.warn {
        background: var(--warn);
        color: #fff;
        box-shadow: 0 6px 18px rgba(180, 83, 9, 0.16);
      }
      button:disabled {
        opacity: .55;
        cursor: not-allowed;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid var(--line);
        font-size: 14px;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }
      .status.active { background: #dcfce7; color: #166534; }
      .status.disabled { background: #fee2e2; color: #991b1b; }
      .status.deleted { background: #ede9fe; color: #6d28d9; }
      .status.admin { background: #dbeafe; color: #1d4ed8; }
      .status.user { background: #ecfeff; color: #155e75; }
      .log-item {
        border-top: 1px solid var(--line);
        padding: 12px 0;
      }
      .log-item:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .log-title {
        font-weight: 600;
        margin-bottom: 4px;
      }
      .log-meta {
        font-size: 13px;
        color: var(--muted);
      }
      .error {
        color: var(--danger);
        font-size: 13px;
        margin-top: 8px;
      }
      .muted { color: var(--muted); }
      .hidden { display: none !important; }
      .selected-row { background: #f0fdfa; }
      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 14px;
      }
      .detail-item {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px;
        background: #fbfcfe;
      }
      .detail-item strong {
        display: block;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .detail-item span, .detail-item code {
        font-size: 14px;
        word-break: break-all;
      }
      .detail-full { grid-column: 1 / -1; }
      .detail-section-title {
        margin: 18px 0 10px;
        font-size: 14px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .detail-empty {
        padding: 18px;
        border: 1px dashed var(--line);
        border-radius: 16px;
        color: var(--muted);
        background: #fafcff;
      }
      .device-list {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      .device-card {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px;
        background: #fbfcfe;
      }
      .device-card strong {
        display: block;
        margin-bottom: 6px;
      }
      .banner {
        margin-top: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        background: #eefbf5;
        color: #166534;
        font-size: 13px;
      }
      .editor-grid {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }
      .panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 14px;
      }
      .panel-head h2 {
        margin: 0;
      }
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        display: grid;
        place-items: center;
        padding: 20px;
        z-index: 40;
      }
      .modal {
        width: min(100%, 720px);
        max-height: min(88vh, 920px);
        overflow: auto;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
        padding: 22px;
      }
      .modal-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .modal-head h3 {
        margin: 0;
        font-size: 18px;
      }
      .modal-head p {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 13px;
      }
      .editor-grid label {
        display: grid;
        gap: 8px;
        font-size: 13px;
        color: var(--muted);
      }
      .editor-grid textarea {
        min-height: 84px;
        resize: vertical;
      }
      .pagination {
        justify-content: flex-end;
        margin-top: 14px;
        align-items: center;
      }
      .pagination span {
        color: var(--muted);
        font-size: 13px;
      }
      .inline-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      @media (max-width: 1120px) {
        .admin-shell { grid-template-columns: 1fr; }
        .sidebar { position: static; }
        .split { grid-template-columns: 1fr; }
      }
      @media (max-width: 760px) {
        .detail-grid { grid-template-columns: 1fr; }
      }
`;

