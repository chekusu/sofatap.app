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
      'There’s no confirmed public install link yet. Developers can build and install it from source with Xcode.'),
    testflight: state('Join the TestFlight Beta', 'TestFlight beta',
      'Install Apple’s TestFlight app from the App Store first. Then, on your iPhone, tap “Join the TestFlight Beta” and install Sofatap from TestFlight.'),
    appstore: state('View on the App Store', 'On the App Store', 'Install the iPhone app from the App Store.'),
    meta: 'iPhone app · iOS 17 or later',
  },
  'zh-CN': {
    unavailable: state('iPhone 测试版尚未开放', '测试版尚未开放', '暂无已确认的公开安装入口。开发者可以用 Xcode 从源码构建并安装。'),
    testflight: state('加入 TestFlight 公测', 'TestFlight 公测中',
      '请先从 App Store 安装 Apple 的 TestFlight App，然后在 iPhone 上点「加入 TestFlight 公测」，通过 TestFlight 安装 Sofatap。'),
    appstore: state('前往 App Store', '可在 App Store 获取', '从 App Store 安装 iPhone App。'),
    meta: 'iPhone App · 需要 iOS 17 或更高版本',
  },
  es: {
    unavailable: state('La beta para iPhone aún no está abierta', 'Beta aún no abierta',
      'Todavía no hay un enlace público de instalación confirmado. Los desarrolladores pueden compilarla e instalarla desde el código fuente con Xcode.'),
    testflight: state('Únete a la beta en TestFlight', 'Beta en TestFlight',
      'Primero instala la app TestFlight de Apple desde la App Store. Después, en tu iPhone, toca «Únete a la beta en TestFlight» e instala Sofatap desde TestFlight.'),
    appstore: state('Ver en la App Store', 'En la App Store', 'Instala la app para iPhone desde la App Store.'),
    meta: 'App para iPhone · iOS 17 o posterior',
  },
  fr: {
    unavailable: state('La bêta iPhone n’est pas encore ouverte', 'Bêta pas encore ouverte',
      'Aucun lien d’installation public n’est encore confirmé. Les développeurs peuvent la compiler et l’installer depuis le code source avec Xcode.'),
    testflight: state('Rejoindre la bêta TestFlight', 'Bêta TestFlight',
      'Installez d’abord l’app TestFlight d’Apple depuis l’App Store. Ensuite, sur votre iPhone, touchez « Rejoindre la bêta TestFlight » et installez Sofatap depuis TestFlight.'),
    appstore: state('Voir sur l’App Store', 'Sur l’App Store', 'Installez l’app iPhone depuis l’App Store.'),
    meta: 'App iPhone · iOS 17 ou version ultérieure',
  },
  de: {
    unavailable: state('iPhone-Beta noch nicht geöffnet', 'Beta noch nicht geöffnet',
      'Es gibt noch keinen bestätigten öffentlichen Installationslink. Entwickler können die App mit Xcode aus dem Quellcode bauen und installieren.'),
    testflight: state('Der TestFlight-Beta beitreten', 'TestFlight-Beta',
      'Installiere zuerst Apples TestFlight-App aus dem App Store. Tippe dann auf deinem iPhone auf „Der TestFlight-Beta beitreten“ und installiere Sofatap über TestFlight.'),
    appstore: state('Im App Store ansehen', 'Im App Store', 'Installiere die iPhone-App aus dem App Store.'),
    meta: 'iPhone-App · iOS 17 oder neuer',
  },
  'pt-BR': {
    unavailable: state('Beta para iPhone ainda não aberto', 'Beta ainda não aberto',
      'Ainda não há um link público de instalação confirmado. Desenvolvedores podem compilar e instalar o app a partir do código-fonte com o Xcode.'),
    testflight: state('Participe do beta no TestFlight', 'Beta no TestFlight',
      'Primeiro instale o app TestFlight da Apple pela App Store. Depois, no seu iPhone, toque em “Participe do beta no TestFlight” e instale o Sofatap pelo TestFlight.'),
    appstore: state('Ver na App Store', 'Na App Store', 'Instale o app para iPhone pela App Store.'),
    meta: 'App para iPhone · iOS 17 ou posterior',
  },
  ja: {
    unavailable: state('iPhone ベータ版はまだ公開されていません', 'ベータ版は未公開',
      '確認済みの公開インストールリンクはまだありません。開発者は Xcode でソースコードからビルドしてインストールできます。'),
    testflight: state('TestFlight ベータ版に参加', 'TestFlight ベータ版',
      'まず App Store から Apple の TestFlight アプリをインストールしてください。次に iPhone で「TestFlight ベータ版に参加」をタップし、TestFlight から Sofatap をインストールします。'),
    appstore: state('App Store で見る', 'App Store で配信中', 'App Store から iPhone アプリをインストールしてください。'),
    meta: 'iPhone アプリ · iOS 17 以降',
  },
  ko: {
    unavailable: state('iPhone 베타는 아직 열리지 않았습니다', '베타 미공개',
      '확인된 공개 설치 링크가 아직 없습니다. 개발자는 Xcode로 소스 코드에서 빌드해 설치할 수 있습니다.'),
    testflight: state('TestFlight 베타 참여하기', 'TestFlight 베타',
      '먼저 App Store에서 Apple의 TestFlight 앱을 설치하세요. 그런 다음 iPhone에서 ‘TestFlight 베타 참여하기’를 탭하고 TestFlight로 Sofatap을 설치하세요.'),
    appstore: state('App Store에서 보기', 'App Store에서 제공', 'App Store에서 iPhone 앱을 설치하세요.'),
    meta: 'iPhone 앱 · iOS 17 이상',
  },
  ar: {
    unavailable: state('النسخة التجريبية لتطبيق iPhone غير متاحة بعد', 'النسخة التجريبية غير متاحة بعد',
      'لا يوجد بعد رابط تثبيت عام مؤكد. يمكن للمطورين بناء التطبيق وتثبيته من الشيفرة المصدرية باستخدام Xcode.'),
    testflight: state('انضم إلى النسخة التجريبية عبر TestFlight', 'نسخة تجريبية عبر TestFlight',
      'ثبّت أولًا تطبيق TestFlight من Apple عبر App Store. ثم اضغط على iPhone على «انضم إلى النسخة التجريبية عبر TestFlight» وثبّت Sofatap من TestFlight.'),
    appstore: state('عرض في App Store', 'متوفر في App Store', 'ثبّت تطبيق iPhone من App Store.'),
    meta: 'تطبيق iPhone · iOS 17 أو أحدث',
  },
  hi: {
    unavailable: state('iPhone बीटा अभी शुरू नहीं हुआ है', 'बीटा अभी शुरू नहीं हुआ',
      'अभी तक कोई पुष्ट सार्वजनिक इंस्टॉल लिंक नहीं है। डेवलपर Xcode से सोर्स कोड बिल्ड करके इसे इंस्टॉल कर सकते हैं।'),
    testflight: state('TestFlight बीटा से जुड़ें', 'TestFlight बीटा',
      'पहले App Store से Apple का TestFlight ऐप इंस्टॉल करें। फिर अपने iPhone पर “TestFlight बीटा से जुड़ें” पर टैप करें और TestFlight से Sofatap इंस्टॉल करें।'),
    appstore: state('App Store पर देखें', 'App Store पर उपलब्ध', 'App Store से iPhone ऐप इंस्टॉल करें।'),
    meta: 'iPhone ऐप · iOS 17 या उसके बाद का वर्शन',
  },
  ru: {
    unavailable: state('Бета для iPhone ещё не открыта', 'Бета ещё не открыта',
      'Подтверждённой публичной ссылки для установки пока нет. Разработчики могут собрать и установить приложение из исходного кода в Xcode.'),
    testflight: state('Присоединиться к бете в TestFlight', 'Бета в TestFlight',
      'Сначала установите приложение Apple TestFlight из App Store. Затем на iPhone нажмите «Присоединиться к бете в TestFlight» и установите Sofatap через TestFlight.'),
    appstore: state('Открыть в App Store', 'В App Store', 'Установите приложение для iPhone из App Store.'),
    meta: 'Приложение для iPhone · iOS 17 или новее',
  },
  id: {
    unavailable: state('Beta iPhone belum dibuka', 'Beta belum dibuka',
      'Belum ada tautan instalasi publik yang terkonfirmasi. Pengembang dapat membangun dan memasangnya dari kode sumber dengan Xcode.'),
    testflight: state('Ikut beta TestFlight', 'Beta TestFlight',
      'Pasang dulu aplikasi TestFlight dari Apple lewat App Store. Lalu di iPhone, ketuk “Ikut beta TestFlight” dan pasang Sofatap dari TestFlight.'),
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
