// Validation and rendering data for the single iPhone download entry.
// Shared by the build script and the tests; no dependencies.

export const KINDS = ['unavailable', 'testflight', 'appstore'];

const RULES = {
  testflight: {
    host: 'testflight.apple.com',
    path: /^\/join\/[A-Za-z0-9]{4,32}$/,
    query: [],
    example: 'https://testflight.apple.com/join/AbCd1234',
  },
  appstore: {
    host: 'apps.apple.com',
    // /app/id123, /cn/app/id123, /app/sofa-tap/id123, /cn/app/sofa-tap/id123
    path: /^(?:\/[a-z]{2})?\/app(?:\/[A-Za-z0-9%._-]{1,120})?\/id[0-9]{6,12}$/,
    query: ['l', 'platform'],
    example: 'https://apps.apple.com/cn/app/sofa-tap/id1234567890',
  },
};

export class DownloadConfigError extends Error {}

function fail(message) {
  throw new DownloadConfigError(message);
}

/**
 * Validates { mobileDownloadKind, mobileDownloadUrl } and returns the
 * normalized config. Throws DownloadConfigError with a readable message.
 */
export function validateDownloadConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail('配置必须是 JSON 对象。');
  }
  const kind = config.mobileDownloadKind;
  const url = config.mobileDownloadUrl ?? '';

  if (!KINDS.includes(kind)) {
    fail(`mobileDownloadKind 必须是 ${KINDS.join(' / ')} 之一，当前为 ${JSON.stringify(kind)}。`);
  }
  if (typeof url !== 'string') {
    fail('mobileDownloadUrl 必须是字符串。');
  }

  if (kind === 'unavailable') {
    if (url !== '') {
      fail('mobileDownloadKind 为 unavailable 时，mobileDownloadUrl 必须为空字符串。');
    }
    return { kind, url: '' };
  }

  const rule = RULES[kind];
  if (url === '') {
    fail(`mobileDownloadKind 为 ${kind} 时必须提供 mobileDownloadUrl，例如 ${rule.example}`);
  }
  if (/[\s\u0000-\u001f\u007f\\]/.test(url)) {
    fail('mobileDownloadUrl 不能包含空白、控制字符或反斜杠。');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`mobileDownloadUrl 不是有效的绝对 URL：${url}`);
  }

  if (parsed.protocol !== 'https:') {
    fail(`mobileDownloadUrl 必须使用 https，当前为 ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    fail('mobileDownloadUrl 不能包含用户名或密码。');
  }
  if (parsed.port) {
    fail('mobileDownloadUrl 不能指定端口。');
  }
  if (parsed.hostname !== rule.host) {
    const other = Object.entries(RULES).find(([, r]) => r.host === parsed.hostname);
    if (other) {
      fail(`mobileDownloadKind 为 ${kind}，但链接是 ${other[0]} 的地址（${parsed.hostname}）。请让类型和链接一致。`);
    }
    fail(`${kind} 链接的域名必须是 ${rule.host}，当前为 ${parsed.hostname}。`);
  }
  if (parsed.hash) {
    fail('mobileDownloadUrl 不能包含 # 片段。');
  }
  if (!rule.path.test(parsed.pathname)) {
    fail(`${kind} 链接路径不符合格式，示例：${rule.example}`);
  }
  for (const key of parsed.searchParams.keys()) {
    if (!rule.query.includes(key)) {
      fail(`${kind} 链接不允许查询参数 ${JSON.stringify(key)}。`);
    }
  }
  if (parsed.href !== url) {
    fail(`请使用规范化的链接：${parsed.href}`);
  }
  return { kind, url: parsed.href };
}

export const LANGS = ['en', 'zh-CN'];

const COPY = {
  en: {
    unavailable: {
      action: 'iPhone beta not open yet',
      status: 'Beta not open yet',
      note: 'There’s no confirmed public install link yet. Developers can build and install it from source with Xcode.',
    },
    testflight: {
      action: 'Join the iPhone beta on TestFlight',
      status: 'TestFlight beta',
      note: 'The iPhone app is in beta testing through TestFlight.',
    },
    appstore: {
      action: 'View on the App Store',
      status: 'On the App Store',
      note: 'Install the iPhone app from the App Store.',
    },
    meta: 'iPhone app · iOS 17 or later',
  },
  'zh-CN': {
    unavailable: {
      action: 'iPhone 测试版尚未开放',
      status: '测试版尚未开放',
      note: '暂无已确认的公开安装入口。开发者可以用 Xcode 从源码构建并安装。',
    },
    testflight: {
      action: '通过 TestFlight 加入 iPhone 测试',
      status: 'TestFlight 测试中',
      note: 'iPhone App 正在通过 TestFlight 测试。',
    },
    appstore: {
      action: '前往 App Store',
      status: '可在 App Store 获取',
      note: '从 App Store 安装 iPhone App。',
    },
    meta: 'iPhone App · 需要 iOS 17 或更高版本',
  },
};

/** Text shown for each state, in the page language. */
export function downloadCopy(kind, lang = 'en') {
  const table = COPY[lang];
  if (!table) throw new Error(`未知语言：${lang}`);
  return { ...(table[kind] ?? table.unavailable), meta: table.meta };
}
