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

// Languages come from the shared locale registry; every one needs all three states below.
export { LANGS } from './locales.mjs';

const state = (action, status, note) => ({ action, status, note });

// The iPhone entry copy for each language. The unavailable state must never mention
// TestFlight or the App Store; static checks enforce that on every built page.
export const COPY = {
  en: {
    unavailable: state('iPhone beta not open yet', 'Beta not open yet',
      'Public beta testing isn’t open yet, so there’s no install link here. Developers can build and install it from source with Xcode.'),
    testflight: state('Join the iPhone beta on TestFlight', 'TestFlight beta', 'The iPhone app is in beta testing through TestFlight.'),
    appstore: state('View on the App Store', 'On the App Store', 'Install the iPhone app from the App Store.'),
    meta: 'iPhone app · iOS 17 or later',
  },
  'zh-CN': {
    unavailable: state('iPhone 测试版尚未开放', '测试版尚未开放', '公开测试尚未开放，所以这里没有安装链接。开发者可以用 Xcode 从源码构建并安装。'),
    testflight: state('通过 TestFlight 加入 iPhone 测试', 'TestFlight 测试中', 'iPhone App 正在通过 TestFlight 测试。'),
    appstore: state('前往 App Store', '可在 App Store 获取', '从 App Store 安装 iPhone App。'),
    meta: 'iPhone App · 需要 iOS 17 或更高版本',
  },
  es: {
    unavailable: state('La beta para iPhone aún no está abierta', 'Beta aún no abierta',
      'Las pruebas beta públicas aún no están abiertas, así que aquí no hay enlace de instalación. Los desarrolladores pueden compilarla e instalarla desde el código fuente con Xcode.'),
    testflight: state('Únete a la beta para iPhone en TestFlight', 'Beta en TestFlight', 'La app para iPhone está en pruebas beta a través de TestFlight.'),
    appstore: state('Ver en la App Store', 'En la App Store', 'Instala la app para iPhone desde la App Store.'),
    meta: 'App para iPhone · iOS 17 o posterior',
  },
  fr: {
    unavailable: state('La bêta iPhone n’est pas encore ouverte', 'Bêta pas encore ouverte',
      'Le test bêta public n’est pas encore ouvert, il n’y a donc pas de lien d’installation ici. Les développeurs peuvent la compiler et l’installer depuis le code source avec Xcode.'),
    testflight: state('Rejoindre la bêta iPhone sur TestFlight', 'Bêta TestFlight', 'L’app iPhone est en test bêta via TestFlight.'),
    appstore: state('Voir sur l’App Store', 'Sur l’App Store', 'Installez l’app iPhone depuis l’App Store.'),
    meta: 'App iPhone · iOS 17 ou version ultérieure',
  },
  de: {
    unavailable: state('iPhone-Beta noch nicht geöffnet', 'Beta noch nicht geöffnet',
      'Der öffentliche Betatest ist noch nicht geöffnet, deshalb gibt es hier keinen Installationslink. Entwickler können die App mit Xcode aus dem Quellcode bauen und installieren.'),
    testflight: state('Bei der iPhone-Beta über TestFlight mitmachen', 'TestFlight-Beta', 'Die iPhone-App wird über TestFlight als Beta getestet.'),
    appstore: state('Im App Store ansehen', 'Im App Store', 'Installiere die iPhone-App aus dem App Store.'),
    meta: 'iPhone-App · iOS 17 oder neuer',
  },
  'pt-BR': {
    unavailable: state('Beta para iPhone ainda não aberto', 'Beta ainda não aberto',
      'O teste beta público ainda não foi aberto, então não há link de instalação aqui. Desenvolvedores podem compilar e instalar o app a partir do código-fonte com o Xcode.'),
    testflight: state('Participe do beta para iPhone no TestFlight', 'Beta no TestFlight', 'O app para iPhone está em teste beta pelo TestFlight.'),
    appstore: state('Ver na App Store', 'Na App Store', 'Instale o app para iPhone pela App Store.'),
    meta: 'App para iPhone · iOS 17 ou posterior',
  },
  ja: {
    unavailable: state('iPhone ベータ版はまだ公開されていません', 'ベータ版は未公開',
      '公開ベータテストはまだ始まっていないため、ここにはインストールリンクがありません。開発者は Xcode でソースコードからビルドしてインストールできます。'),
    testflight: state('TestFlight で iPhone ベータ版に参加', 'TestFlight ベータ版', 'iPhone アプリは TestFlight でベータテスト中です。'),
    appstore: state('App Store で見る', 'App Store で配信中', 'App Store から iPhone アプリをインストールしてください。'),
    meta: 'iPhone アプリ · iOS 17 以降',
  },
  ko: {
    unavailable: state('iPhone 베타는 아직 열리지 않았습니다', '베타 미공개',
      '공개 베타 테스트가 아직 열리지 않아 여기에는 설치 링크가 없습니다. 개발자는 Xcode로 소스 코드에서 빌드해 설치할 수 있습니다.'),
    testflight: state('TestFlight에서 iPhone 베타 참여하기', 'TestFlight 베타', 'iPhone 앱은 TestFlight를 통해 베타 테스트 중입니다.'),
    appstore: state('App Store에서 보기', 'App Store에서 제공', 'App Store에서 iPhone 앱을 설치하세요.'),
    meta: 'iPhone 앱 · iOS 17 이상',
  },
  ar: {
    unavailable: state('النسخة التجريبية لتطبيق iPhone غير متاحة بعد', 'النسخة التجريبية غير متاحة بعد',
      'لم يُفتح الاختبار التجريبي العام بعد، لذا لا يوجد هنا رابط تثبيت. يمكن للمطورين بناء التطبيق وتثبيته من الشيفرة المصدرية باستخدام Xcode.'),
    testflight: state('انضم إلى النسخة التجريبية لتطبيق iPhone عبر TestFlight', 'نسخة تجريبية عبر TestFlight', 'تطبيق iPhone قيد الاختبار التجريبي عبر TestFlight.'),
    appstore: state('عرض في App Store', 'متوفر في App Store', 'ثبّت تطبيق iPhone من App Store.'),
    meta: 'تطبيق iPhone · iOS 17 أو أحدث',
  },
  hi: {
    unavailable: state('iPhone बीटा अभी शुरू नहीं हुआ है', 'बीटा अभी शुरू नहीं हुआ',
      'सार्वजनिक बीटा टेस्टिंग अभी शुरू नहीं हुई है, इसलिए यहाँ कोई इंस्टॉल लिंक नहीं है। डेवलपर Xcode से सोर्स कोड बिल्ड करके इसे इंस्टॉल कर सकते हैं।'),
    testflight: state('TestFlight पर iPhone बीटा से जुड़ें', 'TestFlight बीटा', 'iPhone ऐप की TestFlight के ज़रिए बीटा टेस्टिंग चल रही है।'),
    appstore: state('App Store पर देखें', 'App Store पर उपलब्ध', 'App Store से iPhone ऐप इंस्टॉल करें।'),
    meta: 'iPhone ऐप · iOS 17 या उसके बाद का वर्शन',
  },
  ru: {
    unavailable: state('Бета для iPhone ещё не открыта', 'Бета ещё не открыта',
      'Публичное бета-тестирование ещё не открыто, поэтому ссылки для установки здесь нет. Разработчики могут собрать и установить приложение из исходного кода в Xcode.'),
    testflight: state('Присоединиться к бете для iPhone в TestFlight', 'Бета в TestFlight', 'Приложение для iPhone проходит бета-тестирование в TestFlight.'),
    appstore: state('Открыть в App Store', 'В App Store', 'Установите приложение для iPhone из App Store.'),
    meta: 'Приложение для iPhone · iOS 17 или новее',
  },
  id: {
    unavailable: state('Beta iPhone belum dibuka', 'Beta belum dibuka',
      'Pengujian beta publik belum dibuka, jadi belum ada tautan instalasi di sini. Pengembang dapat membangun dan memasangnya dari kode sumber dengan Xcode.'),
    testflight: state('Ikut beta iPhone di TestFlight', 'Beta TestFlight', 'Aplikasi iPhone sedang diuji beta melalui TestFlight.'),
    appstore: state('Lihat di App Store', 'Ada di App Store', 'Pasang aplikasi iPhone dari App Store.'),
    meta: 'Aplikasi iPhone · iOS 17 atau lebih baru',
  },
};

/** Text shown for each state, in the page language. */
export function downloadCopy(kind, lang = 'en') {
  const table = COPY[lang];
  if (!table) throw new Error(`未知语言：${lang}`);
  return { ...(table[kind] ?? table.unavailable), meta: table.meta };
}
