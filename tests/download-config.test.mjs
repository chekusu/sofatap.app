import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDownloadConfig } from '../scripts/download-config.mjs';

const ok = (kind, url) => validateDownloadConfig({ mobileDownloadKind: kind, mobileDownloadUrl: url });
const bad = (kind, url) => assert.throws(() => ok(kind, url), undefined, `${kind} ${url} should be rejected`);

test('accepts the default unavailable state', () => {
  assert.deepEqual(ok('unavailable', ''), { kind: 'unavailable', url: '' });
  assert.deepEqual(validateDownloadConfig({ mobileDownloadKind: 'unavailable' }), { kind: 'unavailable', url: '' });
});

test('accepts real TestFlight and App Store link shapes', () => {
  assert.equal(ok('testflight', 'https://testflight.apple.com/join/AbCd1234').url, 'https://testflight.apple.com/join/AbCd1234');
  for (const url of [
    'https://apps.apple.com/app/id1234567890',
    'https://apps.apple.com/cn/app/id1234567890',
    'https://apps.apple.com/cn/app/sofa-tap/id1234567890',
    'https://apps.apple.com/us/app/sofa-tap/id1234567890?l=zh',
  ]) assert.equal(ok('appstore', url).url, url);
});

test('rejects unknown kinds and malformed config', () => {
  for (const kind of ['beta', '', undefined, null, 'TestFlight', 'app-store']) bad(kind, '');
  assert.throws(() => validateDownloadConfig(null));
  assert.throws(() => validateDownloadConfig([]));
  bad('testflight', 42);
});

test('rejects a URL that does not match its state', () => {
  bad('unavailable', 'https://testflight.apple.com/join/AbCd1234');
  bad('testflight', '');
  bad('appstore', '');
  bad('testflight', 'https://apps.apple.com/cn/app/sofa-tap/id1234567890');
  bad('appstore', 'https://testflight.apple.com/join/AbCd1234');
});

test('rejects unsafe schemes', () => {
  for (const url of [
    'http://testflight.apple.com/join/AbCd1234',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'itms-services://?action=download-manifest&url=https://example.com/a.plist',
    'itms-apps://apps.apple.com/app/id1234567890',
    '//testflight.apple.com/join/AbCd1234',
    'ftp://testflight.apple.com/join/AbCd1234',
  ]) bad('testflight', url);
});

test('rejects lookalike and mismatched domains', () => {
  for (const url of [
    'https://testflight.apple.com.example.com/join/AbCd1234',
    'https://eviltestflight.apple.com/join/AbCd1234',
    'https://example.com/join/AbCd1234',
    'https://example.com/?u=https://testflight.apple.com/join/AbCd1234',
    'https://testfIight.apple.com/join/AbCd1234',
    'https://tеstflight.apple.com/join/AbCd1234',
    'https://apple.com/join/AbCd1234',
  ]) bad('testflight', url);
  bad('appstore', 'https://itunes.apple.com/cn/app/id1234567890');
  bad('appstore', 'https://apps.apple.com.example.com/app/id1234567890');
});

test('rejects credentials, ports, fragments, odd paths and non-normalized input', () => {
  for (const url of [
    'https://user:pass@testflight.apple.com/join/AbCd1234',
    'https://testflight.apple.com@example.com/join/AbCd1234',
    'https://testflight.apple.com:8443/join/AbCd1234',
    'https://testflight.apple.com/join/AbCd1234#x',
    'https://testflight.apple.com/join/',
    'https://testflight.apple.com/join/AbCd1234/extra',
    'https://testflight.apple.com/join/../evil',
    'https://testflight.apple.com/join/AbCd1234?next=https://example.com',
    'https://testflight.apple.com\\@example.com/join/AbCd1234',
    ' https://testflight.apple.com/join/AbCd1234',
    'https://testflight.apple.com/join/AbCd1234\n',
    'HTTPS://TESTFLIGHT.APPLE.COM/join/AbCd1234',
  ]) bad('testflight', url);
  bad('appstore', 'https://apps.apple.com/cn/app/sofa-tap/id123?redirect=https://example.com');
  bad('appstore', 'https://apps.apple.com/cn/app/sofa-tap');
});
