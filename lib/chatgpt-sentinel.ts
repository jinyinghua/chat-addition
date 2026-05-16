import crypto from 'node:crypto';

const SCREEN_SIZES = [3000, 4000, 3120, 4160];
const CORE_COUNTS = [8, 16, 24, 32];

const NAVIGATOR_KEY = [
  'registerProtocolHandler−function registerProtocolHandler() { [native code] }',
  'storage−[object StorageManager]',
  'locks−[object LockManager]',
  'appCodeName−Mozilla',
  'permissions−[object Permissions]',
  'share−function share() { [native code] }',
  'webdriver−false',
  'managed−[object NavigatorManagedData]',
  'canShare−function canShare() { [native code] }',
  'vendor−Google Inc.',
  'vendor−Google Inc.',
  'mediaDevices−[object MediaDevices]',
  'vibrate−function vibrate() { [native code] }',
  'storageBuckets−[object StorageBucketManager]',
  'mediaCapabilities−[object MediaCapabilities]',
  'getGamepads−function getGamepads() { [native code] }',
  'bluetooth−[object Bluetooth]',
  'share−function share() { [native code] }',
  'cookieEnabled−true',
  'virtualKeyboard−[object VirtualKeyboard]',
  'product−Gecko',
  'mediaDevices−[object MediaDevices]',
  'canShare−function canShare() { [native code] }',
  'getGamepads−function getGamepads() { [native code] }',
  'product−Gecko',
  'xr−[object XRSystem]',
  'clipboard−[object Clipboard]',
  'storageBuckets−[object StorageBucketManager]',
  'unregisterProtocolHandler−function unregisterProtocolHandler() { [native code] }',
  'productSub−20030107',
  'login−[object NavigatorLogin]',
  'vendorSub−',
  'login−[object NavigatorLogin]',
  'getInstalledRelatedApps−function getInstalledRelatedApps() { [native code] }',
  'mediaDevices−[object MediaDevices]',
  'locks−[object LockManager]',
  'webkitGetUserMedia−function webkitGetUserMedia() { [native code] }',
  'vendor−Google Inc.',
  'xr−[object XRSystem]',
  'mediaDevices−[object MediaDevices]',
  'virtualKeyboard−[object VirtualKeyboard]',
  'virtualKeyboard−[object VirtualKeyboard]',
  'appName−Netscape',
  'storageBuckets−[object StorageBucketManager]',
  'presentation−[object Presentation]',
  'onLine−true',
  'mimeTypes−[object MimeTypeArray]',
  'credentials−[object CredentialsContainer]',
  'presentation−[object Presentation]',
  'getGamepads−function getGamepads() { [native code] }',
  'vendorSub−',
  'virtualKeyboard−[object VirtualKeyboard]',
  'serviceWorker−[object ServiceWorkerContainer]',
  'xr−[object XRSystem]',
  'product−Gecko',
  'keyboard−[object Keyboard]',
  'gpu−[object GPU]',
  'getInstalledRelatedApps−function getInstalledRelatedApps() { [native code] }',
  'webkitPersistentStorage−[object DeprecatedStorageQuota]',
  'doNotTrack',
  'clearAppBadge−function clearAppBadge() { [native code] }',
  'presentation−[object Presentation]',
  'serial−[object Serial]',
  'locks−[object LockManager]',
  'requestMIDIAccess−function requestMIDIAccess() { [native code] }',
  'locks−[object LockManager]',
  'requestMediaKeySystemAccess−function requestMediaKeySystemAccess() { [native code] }',
  'vendor−Google Inc.',
  'pdfViewerEnabled−true',
  'language−zh-CN',
  'setAppBadge−function setAppBadge() { [native code] }',
  'geolocation−[object Geolocation]',
  'userAgentData−[object NavigatorUAData]',
  'mediaCapabilities−[object MediaCapabilities]',
  'requestMIDIAccess−function requestMIDIAccess() { [native code] }',
  'getUserMedia−function getUserMedia() { [native code] }',
  'mediaDevices−[object MediaDevices]',
  'webkitPersistentStorage−[object DeprecatedStorageQuota]',
  'sendBeacon−function sendBeacon() { [native code] }',
  'hardwareConcurrency−32',
  'credentials−[object CredentialsContainer]',
  'storage−[object StorageManager]',
  'cookieEnabled−true',
  'pdfViewerEnabled−true',
  'windowControlsOverlay−[object WindowControlsOverlay]',
  'scheduling−[object Scheduling]',
  'pdfViewerEnabled−true',
  'hardwareConcurrency−32',
  'xr−[object XRSystem]',
  'webdriver−false',
  'getInstalledRelatedApps−function getInstalledRelatedApps() { [native code] }',
  'getInstalledRelatedApps−function getInstalledRelatedApps() { [native code] }',
  'bluetooth−[object Bluetooth]',
];

const DOCUMENT_KEY = ['_reactListeningo743lnnpvdg', 'location'];

const WINDOW_KEY = [
  '0', 'window', 'self', 'document', 'name', 'location', 'customElements',
  'history', 'navigation', 'locationbar', 'menubar', 'personalbar', 'scrollbars', 'statusbar', 'toolbar', 'status', 'closed', 'frames',
  'length', 'top', 'opener', 'parent', 'frameElement', 'navigator', 'origin', 'external', 'screen', 'innerWidth', 'innerHeight', 'scrollX',
  'pageXOffset', 'scrollY', 'pageYOffset', 'visualViewport', 'screenX', 'screenY', 'outerWidth', 'outerHeight', 'devicePixelRatio',
  'clientInformation', 'screenLeft', 'screenTop', 'styleMedia', 'onsearch', 'isSecureContext', 'trustedTypes', 'performance', 'onappinstalled',
  'onbeforeinstallprompt', 'crypto', 'indexedDB', 'sessionStorage', 'localStorage', 'onbeforexrselect', 'onabort', 'onbeforeinput',
  'onbeforematch', 'onbeforetoggle', 'onblur', 'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'onclose',
  'oncontentvisibilityautostatechange', 'oncontextlost', 'oncontextmenu', 'oncontextrestored', 'oncuechange', 'ondblclick', 'ondrag', 'ondragend',
  'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus',
  'onformdata', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart',
  'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel', 'onpause',
  'onplay', 'onplaying', 'onprogress', 'onratechange', 'onreset', 'onresize', 'onscroll', 'onsecuritypolicyviolation', 'onseeked',
  'onseeking', 'onselect', 'onslotchange', 'onstalled', 'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'onvolumechange', 'onwaiting',
  'onwebkitanimationend', 'onwebkitanimationiteration', 'onwebkitanimationstart', 'onwebkittransitionend', 'onwheel', 'onauxclick',
  'ongotpointercapture', 'onlostpointercapture', 'onpointerdown', 'onpointermove', 'onpointerrawupdate', 'onpointerup', 'onpointercancel',
  'onpointerover', 'onpointerout', 'onpointerenter', 'onpointerleave', 'onselectstart', 'onselectionchange', 'onanimationend',
  'onanimationiteration', 'onanimationstart', 'ontransitionrun', 'ontransitionstart', 'ontransitionend', 'ontransitioncancel', 'onafterprint',
  'onbeforeprint', 'onbeforeunload', 'onhashchange', 'onlanguagechange', 'onmessage', 'onmessageerror', 'onoffline', 'ononline', 'onpagehide',
  'onpageshow', 'onpopstate', 'onrejectionhandled', 'onstorage', 'onunhandledrejection', 'onunload', 'crossOriginIsolated', 'scheduler', 'alert',
  'atob', 'blur', 'btoa', 'cancelAnimationFrame', 'cancelIdleCallback', 'captureEvents', 'clearInterval', 'clearTimeout', 'close', 'confirm',
  'createImageBitmap', 'fetch', 'find', 'focus', 'getComputedStyle', 'getSelection', 'matchMedia', 'moveBy', 'moveTo', 'open', 'postMessage',
  'print', 'prompt', 'queueMicrotask', 'releaseEvents', 'reportError', 'requestAnimationFrame', 'requestIdleCallback', 'resizeBy', 'resizeTo',
  'scroll', 'scrollBy', 'scrollTo', 'setInterval', 'setTimeout', 'stop', 'structuredClone', 'webkitCancelAnimationFrame',
  'webkitRequestAnimationFrame', 'chrome', 'caches', 'cookieStore', 'ondevicemotion', 'ondeviceorientation', 'ondeviceorientationabsolute',
  'launchQueue', 'documentPictureInPicture', 'getScreenDetails', 'queryLocalFonts', 'showDirectoryPicker', 'showOpenFilePicker',
  'showSaveFilePicker', 'originAgentCluster', 'onpageswap', 'onpagereveal', 'credentialless', 'speechSynthesis', 'onscrollend',
  'webkitRequestFileSystem', 'webkitResolveLocalFileSystemURL', 'sendMsgToSolverCS', 'webpackChunk_N_E', '__next_set_public_path__', 'next',
  '__NEXT_DATA__', '__SSG_MANIFEST_CB', '__NEXT_P', '_N_E', 'regeneratorRuntime', '__REACT_INTL_CONTEXT__', 'DD_RUM', '_', 'filterCSS', 'filterXSS',
  '__SEGMENT_INSPECTOR__', '__NEXT_PRELOADREADY', 'Intercom', '__MIDDLEWARE_MATCHERS', '__STATSIG_SDK__', '__STATSIG_JS_SDK__',
  '__STATSIG_RERENDER_OVERRIDE__', '_oaiHandleSessionExpired', '__BUILD_MANIFEST', '__SSG_MANIFEST', '__intercomAssignLocation', '__intercomReloadLocation',
];

export const SENTINEL_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const SENTINEL_SCRIPT_URL = 'https://chatgpt.com/backend-api/sentinel/sdk.js';
const MAX_ITERATIONS = 500000;

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatLaTime(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('month')}/${get('day')}/${get('year')}, ${get('hour')}:${get('minute')}:${get('second')} ${get('dayPeriod')}`;
}

function buildConfig(userAgent = SENTINEL_USER_AGENT): unknown[] {
  const nowMs = Date.now();
  const perfCounter = Number((nowMs % 1_000_000) + Math.random());
  const epochOffset = Number(nowMs) - perfCounter;

  return [
    randomChoice(SCREEN_SIZES),
    formatLaTime(),
    4294705152,
    0,
    userAgent,
    SENTINEL_SCRIPT_URL,
    '',
    'en-US',
    'en-US,es-US,en,es',
    0,
    randomChoice(NAVIGATOR_KEY),
    randomChoice(DOCUMENT_KEY),
    randomChoice(WINDOW_KEY),
    perfCounter,
    crypto.randomUUID(),
    '',
    randomChoice(CORE_COUNTS),
    epochOffset,
  ];
}

function assembleSolve(config: unknown[], i: number, j: number): string {
  const part1Json = JSON.stringify(config.slice(0, 3));
  const part4to8Json = JSON.stringify(config.slice(4, 9));
  const part10Json = JSON.stringify(config.slice(10));

  const staticPart1 = `${part1Json.slice(0, -1)},`;
  const mid = part4to8Json.slice(1, -1);
  const staticPart2 = `,${mid},`;
  const tail = part10Json.slice(1);
  const staticPart3 = `,${tail}`;

  const assembled = `${staticPart1}${i}${staticPart2}${j}${staticPart3}`;
  return Buffer.from(assembled).toString('base64');
}

function bytesLe(a: Buffer, b: Buffer): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return a.length <= b.length;
}

export function solvePow(seed: string, difficulty: string): string {
  const config = buildConfig(SENTINEL_USER_AGENT);
  const diffBytes = Buffer.from(difficulty, 'hex');
  const seedBytes = Buffer.from(seed);

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const j = i >> 1;
    const b64 = assembleSolve(config, i, j);
    const hash = crypto.createHash('sha3-512').update(Buffer.concat([seedBytes, Buffer.from(b64)])).digest();
    if (bytesLe(hash.subarray(0, diffBytes.length), diffBytes)) {
      return `gAAAAAB${b64}`;
    }
  }

  const fallback = Buffer.from(JSON.stringify(seed)).toString('base64');
  return `gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D${fallback}`;
}

export function generateRequirementsToken(): string {
  const config = buildConfig(SENTINEL_USER_AGENT);
  const b64 = assembleSolve(config, 0, 0);
  return `gAAAAAC${b64}`;
}
