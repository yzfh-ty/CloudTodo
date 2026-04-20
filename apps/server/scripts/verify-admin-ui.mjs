import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.ADMIN_UI_BASE_URL ?? 'http://127.0.0.1:3000';
const adminAccount = process.env.ADMIN_SEED_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'admin123456';
const demoEmail = process.env.DEMO_USER_EMAIL ?? 'demo@example.com';
const headless = process.env.ADMIN_UI_HEADLESS !== 'false';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function withPrompt(page, expectedMessagePart, response, action) {
  const handler = async (dialog) => {
    try {
      if (expectedMessagePart && !dialog.message().includes(expectedMessagePart)) {
        throw new Error(`Unexpected dialog message: ${dialog.message()}`);
      }

      if (dialog.type() === 'confirm') {
        if (response) {
          await dialog.accept();
        } else {
          await dialog.dismiss();
        }
      } else {
        await dialog.accept(response ?? '');
      }
    } catch (error) {
      await dialog.dismiss().catch(() => {});
      throw error;
    }
  };

  page.once('dialog', handler);
  await action();
}

async function withDialogSequence(page, handlers, action) {
  let index = 0;
  const completion = new Promise((resolve, reject) => {
    const listener = async (dialog) => {
      const handler = handlers[index];
      if (!handler) {
        page.off('dialog', listener);
        await dialog.dismiss().catch(() => {});
        reject(new Error(`Unexpected extra dialog: ${dialog.type()}`));
        return;
      }

      try {
        await handler(dialog);
        index += 1;
        if (index === handlers.length) {
          page.off('dialog', listener);
          resolve();
        }
      } catch (error) {
        page.off('dialog', listener);
        reject(error);
      }
    };

    page.on('dialog', listener);
  });

  await action();
  await completion;
}

async function main() {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error?.stack || error?.message || String(error));
  });

  page.on('response', async (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });

  try {
    const uniqueNickname = `Demo User UI ${Date.now()}`;
    const uniqueUsername = `demo_ui_${Date.now()}`;
    const createdUsername = `created_ui_${Date.now()}`;
    const createdEmail = `${createdUsername}@example.com`;
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'networkidle' });
    await page.fill('#accountInput', adminAccount);
    await page.fill('#passwordInput', adminPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${baseUrl}/admin`, { timeout: 15000 });

    await page.click('[data-menu-target="users"]');
    await page.waitForSelector('#usersTableBody tr[data-user-id]', { timeout: 15000 });
    if (await page.locator('#detailUserModal').isVisible().catch(() => false)) {
      await page.click('#closeDetailUserBtn').catch(() => {});
      await page.waitForFunction(() => {
        const modal = document.getElementById('detailUserModal');
        return modal && modal.classList.contains('hidden');
      }).catch(() => {});
    }

    await page.click('#openCreateUserBtn');
    await page.waitForSelector('#createUserModal:not(.hidden)', { timeout: 15000 });
    await page.fill('#createUsername', createdUsername);
    await page.fill('#createEmail', createdEmail);
    await page.fill('#createPassword', 'user123456');
    await page.fill('#createNickname', 'Created In UI');
    await page.fill('#createReason', 'ui create user');
    const createResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/admin/users'),
    );
    await page.click('#createUserForm button[type="submit"]');
    const createResponse = await createResponsePromise;
    const createJson = await createResponse.json();
    assert(createResponse.ok(), `Create user request failed: ${createResponse.status()}`);
    assert(
      createJson?.data?.user?.username === createdUsername,
      `Create user API did not return expected username: ${JSON.stringify(createJson)}`,
    );
    await page.waitForFunction(() => {
      const modal = document.getElementById('createUserModal');
      return modal && modal.classList.contains('hidden');
    });
    await page.waitForFunction(
      ({ createdUsername }) => {
        const usersTable = document.getElementById('usersTableBody');
        const text = usersTable?.textContent || '';
        return text.includes(createdUsername);
      },
      { createdUsername },
    );
    if (await page.locator('#detailUserModal').isVisible().catch(() => false)) {
      await page.evaluate(() => {
        if (typeof window.closeDetailUserModal === 'function') {
          window.closeDetailUserModal();
        } else {
          const modal = document.getElementById('detailUserModal');
          modal?.classList.add('hidden');
        }
      });
      await page.waitForFunction(() => {
        const modal = document.getElementById('detailUserModal');
        return modal && modal.classList.contains('hidden');
      });
    }

    const demoRow = page.locator('#usersTableBody tr', {
      has: page.locator(`text=${demoEmail}`),
    });
    await demoRow.evaluate((node) => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await page.waitForSelector('#detailUserModal:not(.hidden)', { timeout: 15000 });
    await page.waitForSelector('#profileForm:not(.hidden)', { timeout: 15000 });
    await page.waitForFunction(() => {
      const username = document.getElementById('editUsername');
      const nickname = document.getElementById('editNickname');
      return Boolean(username && nickname && username.value && nickname.value);
    });
    await page.evaluate(
      ({ uniqueUsername, uniqueNickname }) => {
        const setValue = (id, value) => {
          const element = document.getElementById(id);
          if (!element) {
            throw new Error(`Missing form field: ${id}`);
          }
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        };

        setValue('editUsername', uniqueUsername);
        setValue('editNickname', uniqueNickname);
        setValue('editTimezone', 'UTC');
        setValue('editReason', 'ui update profile');
      },
      { uniqueUsername, uniqueNickname },
    );
    const updateResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes('/api/admin/users/'),
    );
    await page.evaluate(() => {
      const form = document.getElementById('profileForm');
      if (!form) {
        throw new Error('Missing profileForm');
      }
      form.requestSubmit();
    });
    const updateResponse = await updateResponsePromise;
    const updateJson = await updateResponse.json();
    assert(updateResponse.ok(), `Profile update request failed: ${updateResponse.status()}`);
    assert(
      updateJson?.data?.user?.username === uniqueUsername,
      `Username update API did not return expected username: ${JSON.stringify(updateJson)}`,
    );
    await page.waitForFunction(() => {
      const banner = document.getElementById('actionBanner');
      return banner && !banner.classList.contains('hidden') && banner.textContent?.includes('已更新');
    });
    await page.waitForFunction(
      ({ uniqueUsername }) => {
        const usersTable = document.getElementById('usersTableBody');
        const text = usersTable?.textContent || '';
        return text.includes(uniqueUsername);
      },
      { uniqueUsername },
    );

    await page.click('#refreshDevicesBtn');
    await page.waitForFunction(() => {
      const devices = document.getElementById('devicesContainer');
      return Boolean(devices && devices.textContent !== '');
    });

    await withPrompt(page, '请输入禁用原因', 'ui disable', async () => {
      await page.click('#disableUserBtn');
    });
    await page.waitForFunction(() => {
      const detail = document.getElementById('detailContainer');
      return detail?.textContent?.includes('disabled');
    });

    await withPrompt(page, '请输入启用原因', 'ui enable', async () => {
      await page.click('#enableUserBtn');
    });
    await page.waitForFunction(() => {
      const detail = document.getElementById('detailContainer');
      return detail?.textContent?.includes('active');
    });

    await withDialogSequence(
      page,
      [
        async (dialog) => {
          assert(dialog.type() === 'prompt', `Expected prompt dialog, got ${dialog.type()}`);
          await dialog.accept('ui reset');
        },
        async (dialog) => {
          assert(dialog.type() === 'confirm', `Expected confirm dialog, got ${dialog.type()}`);
          await dialog.accept();
        },
      ],
      async () => {
        await page.click('#resetPasswordBtn');
      },
    );
    await page.waitForFunction(() => {
      const banner = document.getElementById('actionBanner');
      return banner && !banner.classList.contains('hidden') && banner.textContent?.includes('临时密码已生成');
    });

    await page.evaluate(() => {
      if (typeof window.closeDetailUserModal === 'function') {
        window.closeDetailUserModal();
      }
    });
    await page.waitForFunction(() => {
      const modal = document.getElementById('detailUserModal');
      return modal && modal.classList.contains('hidden');
    });
    await page.click('[data-menu-target="logs"]');
    await page.waitForSelector('#section-logs.active', { timeout: 15000 });
    await page.selectOption('#logActionSelect', 'update_user_profile');
    await page.click('#logSearchBtn');
    await page.waitForFunction(() => {
      const logs = document.getElementById('logsContainer');
      return logs?.textContent?.includes('update_user_profile');
    });

    await page.click('#logCurrentUserBtn');
    await page.waitForFunction(() => {
      const input = document.getElementById('logTargetInput');
      return Boolean(input && input.value);
    });

    await page.click('#logClearBtn');
    await page.waitForFunction(() => {
      const input = document.getElementById('logTargetInput');
      const action = document.getElementById('logActionSelect');
      const result = document.getElementById('logResultSelect');
      return input?.value === '' && action?.value === '' && result?.value === '';
    });

    const nextBtn = page.locator('#logsNextBtn');
    const prevBtn = page.locator('#logsPrevBtn');

    const nextDisabled = await nextBtn.isDisabled();
    if (!nextDisabled) {
      await nextBtn.click();
      await page.waitForFunction(() => document.getElementById('logsPageInfo')?.textContent?.includes('2'));
      await prevBtn.click();
      await page.waitForFunction(() => document.getElementById('logsPageInfo')?.textContent?.includes('1'));
    }

    const detailText = await page.locator('#detailContainer').textContent();
    const usersTableText = await page.locator('#usersTableBody').textContent();
    const logsText = await page.locator('#logsContainer').textContent();
    const devicesText = await page.locator('#devicesContainer').textContent();

    assert(detailText?.includes('提醒摘要'), `Detail panel did not remain interactive: ${detailText}`);
    assert(usersTableText?.includes(uniqueUsername), `Username update did not render in users table: ${usersTableText}`);
    assert(logsText?.includes('update_user_profile'), 'Filtered logs did not show expected action');
    assert(typeof devicesText === 'string', 'Devices section did not render');

    await page.click('#closeDetailUserBtn');
    await page.waitForFunction(() => {
      const modal = document.getElementById('detailUserModal');
      return modal && modal.classList.contains('hidden');
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          adminAccount,
          headless,
          verified: [
            'login',
            'open-create-user-modal',
            'create-user',
            'select-user',
            'open-detail-user-modal',
            'update-profile',
            'update-username',
            'refresh-devices',
            'disable-user',
            'enable-user',
            'reset-password',
            'log-filter',
            'log-current-user',
            'log-clear',
            'close-detail-user-modal',
            nextDisabled ? 'log-pagination-skipped' : 'log-pagination',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (consoleErrors.length || pageErrors.length) {
      console.error(
        JSON.stringify(
          {
            consoleErrors,
            pageErrors,
            failedResponses,
          },
          null,
          2,
        ),
      );
    }
    await browser.close();
  }
}

main().catch(async (error) => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await writeFile(
      new URL('./admin-ui-failure.html', import.meta.url),
      await page.content(),
      'utf8',
    );
    await page.screenshot({
      path: new URL('./admin-ui-failure.png', import.meta.url),
      fullPage: true,
    }).catch(() => {});
    await browser.close();
  } catch {
    // ignore secondary diagnostics failure
  }
  console.error(error);
  process.exit(1);
});
