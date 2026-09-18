import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(
  path.join(process.env.PIGEON_TEST_UI_ROOT, 'package.json'),
);
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const pages = [];
const observations = [];
let stage = 'register';
const names = ['Privacy Alice', 'Privacy Bob'];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setStage = (name) => {
  stage = name;
  console.log('STAGE ' + name);
};
try {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({
      permissions: ['microphone'],
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      localStorage.setItem('pigeon-swarm-language-v2', 'en');
      localStorage.setItem('pigeon-swarm-language-explicit-v3', 'true');
      if (window.PublicKeyCredential?.getClientCapabilities)
        Object.defineProperty(
          window.PublicKeyCredential,
          'getClientCapabilities',
          { configurable: true, value: undefined },
        );
    });
    const page = await context.newPage();
    pages.push(page);
    page.setDefaultTimeout(45000);
    const observation = { gets: [], heartbeats: [], snapshots: [], errors: [] };
    observations.push(observation);
    page.on('response', async (response) => {
      const pathname = new URL(response.url()).pathname;
      if (
        response.request().method() === 'GET' &&
        /^\/calls\/[^/]+\/?$/.test(pathname)
      )
        observation.gets.push({ time: Date.now(), status: response.status() });
      if (pathname.endsWith('/participants/me/heartbeat'))
        observation.heartbeats.push({
          time: Date.now(),
          status: response.status(),
        });
      if (response.status() >= 400 && pathname.startsWith('/calls/'))
        observation.errors.push({ path: pathname, status: response.status() });
    });
    page.on('websocket', (socket) =>
      socket.on('framereceived', ({ payload }) => {
        try {
          const frame = JSON.parse(String(payload));
          if (frame.event?.attributes?.liveCall)
            observation.snapshots.push(frame.event.attributes.liveCall);
        } catch {}
      }),
    );
    await page.goto(`http://127.0.0.1:${19780 + index}`);
    await page
      .getByTestId('auth-mode-control')
      .locator('button')
      .nth(1)
      .click();
    await page.getByTestId('auth-name-input').fill(names[index]);
    await page
      .getByTestId('auth-handle-input')
      .fill(`privacy-browser-${index}`);
    await page
      .getByTestId('auth-password-input')
      .fill('Disposable-browser-password1!');
    await page
      .getByTestId('auth-password-confirmation-input')
      .fill('Disposable-browser-password1!');
    await page.getByTestId('auth-recovery-key-confirm').click();
    const passkey = page.getByTestId('auth-passkey-prf-toggle');
    if (
      (await passkey.isEnabled()) &&
      (await passkey.getAttribute('aria-pressed')) === 'true'
    )
      await passkey.click();
    await page.getByTestId('auth-submit-button').click();
    await page.getByTestId('create-conversation-button').first().waitFor();
    if (await page.getByTestId('push-notification-dismiss-button').isVisible())
      await page.getByTestId('push-notification-dismiss-button').click();
  }
  setStage('create community');
  await pages[0]
    .getByRole('button', { name: 'Add community', exact: true })
    .click();
  await pages[0].getByRole('button', { name: 'Create', exact: true }).click();
  await pages[0]
    .getByRole('textbox', { name: 'Community name', exact: true })
    .fill('Privacy browser community');
  await pages[0].getByRole('button', { name: /^Public community/ }).click();
  await pages[0].getByText('Allow instant join', { exact: true }).click();
  await pages[0]
    .getByPlaceholder('Channel name', { exact: true })
    .fill('privacy-voice');
  await pages[0].getByRole('button', { name: 'Channels', exact: true }).click();
  await pages[0].getByRole('option', { name: 'Voice', exact: true }).click();
  await pages[0]
    .getByRole('button', { name: 'Add channel', exact: true })
    .click();
  await pages[0]
    .getByRole('button', { name: 'Create community', exact: true })
    .click();
  await pages[0]
    .getByRole('textbox', { name: 'Community name', exact: true })
    .waitFor({ state: 'hidden' });
  await pause(2000);
  await pages[1]
    .getByRole('button', { name: 'Add community', exact: true })
    .click();
  await pages[1]
    .getByRole('button', { name: 'Join instantly', exact: true })
    .click();
  const join = (page) =>
    page
      .getByTitle(/Join (voice|voice channel)/i)
      .filter({ hasText: 'privacy-voice' })
      .click();
  const leave = async (page) => {
    await page.getByTestId('compact-call-bar').click();
    await page.getByRole('button', { name: 'Leave call', exact: true }).click();
  };
  const presence = async (count) => {
    for (const page of pages)
      await expect(page.getByTestId('voice-channel-participant')).toHaveCount(
        count,
        { timeout: 30000 },
      );
  };
  setStage('join voice');
  for (const page of pages) {
    await page
      .getByRole('button', { name: 'Privacy browser community', exact: true })
      .click();
    await join(page);
  }
  await presence(2);
  setStage('stable membership');
  await pause(3000);
  const boundaries = observations.map((o) => ({
    gets: o.gets.length,
    heartbeats: o.heartbeats.length,
  }));
  await pause(12000);
  await presence(2);
  for (const [index, o] of observations.entries()) {
    assert.equal(
      o.gets.length,
      boundaries[index].gets,
      'Stable membership must not GET full call snapshots',
    );
    const heartbeats = o.heartbeats.slice(boundaries[index].heartbeats);
    assert.ok(heartbeats.length >= 3, 'Real browser must renew call lease');
    assert.ok(
      heartbeats.every((h) => h.status === 204),
      'Heartbeats must return204',
    );
    assert.ok(o.snapshots.length > 0, 'Browser must receive live snapshots');
    for (const call of o.snapshots) {
      assert.ok(!('creatorIdentityId' in call));
      assert.ok(!('createdAt' in call));
      for (const p of call.participants) {
        assert.ok(!('joinedAt' in p));
        assert.ok(!('lastHeartbeatAt' in p));
      }
    }
  }
  setStage('leave and rejoin');
  await leave(pages[1]);
  await presence(1);
  await join(pages[1]);
  await presence(2);
  await Promise.all(pages.map(leave));
  await presence(0);
  console.log(
    'PASS browser: two visible participants across nodes, leave/rejoin, websocket live snapshots, stable membership zero full-call GETs and heartbeat204',
  );
  console.log(
    JSON.stringify(
      observations.map((o) => ({
        getCount: o.gets.length,
        heartbeatCount: o.heartbeats.length,
        snapshotCount: o.snapshots.length,
        errors: o.errors,
      })),
    ),
  );
} catch (error) {
  console.error('FAIL browser stage ' + stage);
  console.error(error);
  for (const [index, page] of pages.entries()) {
    console.error(
      'PAGE ' +
        index +
        ': ' +
        (await page.locator('body').innerText()).slice(0, 2200),
    );
    await page.screenshot({
      path: `/tmp/pigeon-call-privacy-browser-${index}.png`,
    });
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
