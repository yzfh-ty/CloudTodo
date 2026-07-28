import { AdminPanelService } from '../src/modules/admin-panel/admin-panel.service';
import type { AuthenticatedAdmin } from '../src/modules/admin/admin-session.service';

const FORCED_ADMIN: AuthenticatedAdmin = {
  id: 'admin-1',
  email: 'admin@example.com',
  username: 'admin',
  nickname: 'Admin',
  role: 'admin' as never,
  status: 'active' as never,
  forcePasswordChange: true,
};

describe('built-in admin forced password change', () => {
  it('renders a dedicated password change flow for a restricted session', () => {
    const html = new AdminPanelService().renderIndex(FORCED_ADMIN);

    expect(html).toContain('id="forcePasswordChangeForm"');
    expect(html).toContain('name="currentPassword"');
    expect(html).toContain('name="newPassword"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).toContain("fetch('/api/admin/auth/change-password'");
    expect(html).toContain("location.href = '/admin/login'");
    expect(html).not.toContain('id="usersTableBody"');
  });

  it('keeps the normal dashboard for an unrestricted session', () => {
    const html = new AdminPanelService().renderIndex({
      ...FORCED_ADMIN,
      forcePasswordChange: false,
    });

    expect(html).toContain('id="usersTableBody"');
    expect(html).not.toContain('id="forcePasswordChangeForm"');
  });
});
