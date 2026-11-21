import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './server/store.mjs';
import { PaymentError, providers } from './server/providers.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const MAX_WON = 9999999999;
const ORDER_AGE = 30 * 60 * 1000;
const brandIds = new Set(['care16', 'whang', 'hans']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const tokenPattern = /^[a-f0-9]{48}$/;
const productName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const integer = (value, min = 0, max = MAX_WON) => Number.isSafeInteger(value) && value >= min && value <= max;
const safeEqual = (a, b) => timingSafeEqual(
  createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest()
);

function configFromEnv(env) {
  const origin = new URL(env.PUBLIC_ORIGIN || 'http://localhost:8080');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.href !== origin.origin + '/' || !(origin.protocol === 'https:' || (local && origin.protocol === 'http:'))) {
    throw Error('PUBLIC_ORIGIN에는 HTTPS 쇼핑몰 주소를 경로 없이 입력하세요.');
  }
  const payple = {
    id: env.PAYPLE_CST_ID, secret: env.PAYPLE_CUST_KEY, client: env.PAYPLE_CLIENT_KEY,
    live: env.PAYPLE_MODE === 'live', fee: env.DOMESTIC_SHIPPING_KRW ? Number(env.DOMESTIC_SHIPPING_KRW) : NaN,
    tax: env.PAYPLE_TAXABLE
  };
  const paypal = {
    id: env.PAYPAL_CLIENT_ID, secret: env.PAYPAL_CLIENT_SECRET,
    live: env.PAYPAL_MODE === 'live', fee: env.INTERNATIONAL_SHIPPING_KRW ? Number(env.INTERNATIONAL_SHIPPING_KRW) : NaN,
    exchange: Number(env.PAYPAL_KRW_PER_USD),
    countries: new Set((env.PAYPAL_SHIP_COUNTRIES || '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean))
  };
  const adminPassword = env.SHOP_ADMIN_PASSWORD || '';
  if (adminPassword && adminPassword.length < 16) throw Error('SHOP_ADMIN_PASSWORD에는 16자 이상의 비밀번호를 입력하세요.');
  for (const mode of [env.PAYPLE_MODE, env.PAYPAL_MODE]) {
    if (mode && !['sandbox', 'live'].includes(mode)) throw Error('결제 환경은 sandbox 또는 live로 선택하세요.');
  }
  payple.enabled = Boolean(payple.id && payple.secret && payple.client && integer(payple.fee) && ['Y', 'N'].includes(payple.tax));
  paypal.enabled = Boolean(paypal.id && paypal.secret && integer(paypal.fee) &&
    integer(paypal.exchange, 1, 100000) && paypal.countries.size &&
    [...paypal.countries].every(code => code !== 'KR' && /^[A-Z]{2}$/.test(code)));
  if ((payple.enabled || paypal.enabled) && !adminPassword) throw Error('결제를 활성화하려면 SHOP_ADMIN_PASSWORD를 설정하세요.');
  if ((payple.live || paypal.live) && origin.protocol !== 'https:') throw Error('운영 결제에는 HTTPS PUBLIC_ORIGIN이 필요합니다.');
  if ((payple.live && !payple.enabled) || (paypal.live && !paypal.enabled)) throw Error('운영 결제에 필요한 환경변수를 확인하세요.');
  return { origin: origin.origin, secure: origin.protocol === 'https:', adminPassword, payple, paypal };
}

function checkedProducts(items) {
  if (!Array.isArray(items) || items.length > 2000) throw new PaymentError('상품 목록 형식을 확인해 주세요.');
  const ids = new Set();
  return items.map(item => {
    if (!item || !idPattern.test(item.id) || typeof item.id !== 'string' || ids.has(item.id) ||
        !brandIds.has(item.brand) || !productName(item.name) || !integer(item.price) ||
        !integer(item.originalPrice) || !integer(item.stock, 0, 1000000000) ||
        !integer(item.createdAt, 1, Number.MAX_SAFE_INTEGER) || typeof item.visible !== 'boolean' ||
        !Array.isArray(item.images) || item.images.length > 4 ||
        item.images.some(image => typeof image !== 'string' || image.length > 2500000 ||
          !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(image))) {
      throw new PaymentError('상품 정보나 사진 형식을 확인해 주세요.');
    }
    ids.add(item.id);
    return {
      id: item.id, brand: item.brand, name: item.name.trim(),
      category: String(item.category ?? '').slice(0, 120), desc: String(item.desc ?? '').slice(0, 30000),
      price: item.price, originalPrice: item.originalPrice, stock: item.stock, images: item.images,
      visible: item.visible, featured: item.featured === true, sample: item.sample === true, createdAt: item.createdAt
    };
  });
}

function checkedBasket(items, products) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new PaymentError('장바구니의 상품을 확인해 주세요.');
  const used = new Set();
  return items.map(item => {
    if (!item || typeof item.id !== 'string' || used.has(item.id) || !integer(item.quantity, 1, 10000)) {
      throw new PaymentError('장바구니의 상품과 수량을 확인해 주세요.');
    }
    used.add(item.id);
    const product = products.find(product => product.id === item.id);
    if (!product?.visible || product.sample || product.price < 1 || product.stock < item.quantity) {
      throw new PaymentError('품절·비공개·시연용 상품 또는 금액이 0원인 상품을 장바구니에서 확인해 주세요.', 409);
    }
    return { id: product.id, name: product.name, price: product.price, quantity: item.quantity };
  });
}

function quote(items, config) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!integer(subtotal, 1)) throw new PaymentError('주문 금액이 허용 범위를 벗어났습니다.');
  return Object.fromEntries(['payple', 'paypal'].flatMap(method => {
    const provider = config[method];
    if (!provider.enabled) return [];
    const total = subtotal + provider.fee;
    if (!integer(total, 1)) throw new PaymentError('배송비를 포함한 금액이 허용 범위를 벗어났습니다.');
    const toAmount = method === 'payple' ? won => won : won => Math.round(won * 100 / provider.exchange);
    const amount = toAmount(total);
    if (amount < 1 || toAmount(subtotal) < 1) return [];
    return [[method, {
      subtotal, shippingFee: provider.fee, amount, subtotalAmount: toAmount(subtotal),
      currency: method === 'payple' ? 'KRW' : 'USD', sandbox: !provider.live
    }]];
  }));
}

function domesticShipping(value) {
  const field = key => typeof value?.[key] === 'string' ? value[key].trim() : '';
  const name = field('name');
  const phone = field('phone');
  const postal = field('postal');
  const address = field('address');
  if (!name || name.length > 80 || !/^[0-9()+ -]{8,24}$/.test(phone) || !/^\d{5}$/.test(postal) ||
      !address || address.length > 240) {
    throw new PaymentError('받는 분, 전화번호, 우편번호, 배송 주소를 확인해 주세요.');
  }
  return { name, phone, postal, address, country: 'KR' };
}

async function body(req, type = 'application/json', limit = 64 * 1024) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== type) {
    throw new PaymentError('요청 형식을 확인해 주세요.', 415);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new PaymentError('요청 크기가 너무 큽니다.', 413);
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return type === 'application/json' ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
  } catch {
    throw new PaymentError('요청 데이터를 확인해 주세요.');
  }
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function orderView(order) {
  return {
    id: order.id, method: order.method, amount: order.amount, currency: order.currency,
    sandbox: order.sandbox, status: order.status === 'created' && Date.now() > order.createdAt + ORDER_AGE
      ? 'expired' : order.status,
    reason: order.reason, items: order.items, createdAt: order.createdAt
  };
}
const resultLocation = order => '/#/payment/' + (order?.receipt || 'unavailable');

const assetTypes = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};
function staticResponse(res, pathname) {
  if (pathname === '/' || pathname === '/index.html') {
    const index = readFileSync(resolve(root, 'index.html'), 'utf8')
      .replace('</head>', '<meta name="modu-shop-server" content="enabled">\n</head>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(index);
    return true;
  }
  const asset = /^\/assets\/([A-Za-z0-9_-]+(\.[a-z]+))$/.exec(pathname);
  if (!asset || !assetTypes[asset[2]]) return false;
  try {
    const data = readFileSync(resolve(root, 'assets', asset[1]));
    res.writeHead(200, { 'Content-Type': assetTypes[asset[2]], 'Cache-Control': 'no-cache' });
    res.end(data);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

export function createShopServer({ env = process.env, fetcher = fetch, databaseFile } = {}) {
  const config = configFromEnv(env);
  const filename = databaseFile ?? resolve(env.SHOP_DB_PATH || resolve(root, 'data', 'shop.sqlite'));
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    // Create the database privately before SQLite creates its sidecar files.
    closeSync(openSync(filename, 'a', 0o600));
    chmodSync(filename, 0o600);
  }
  const store = openStore(filename, []);
  const provider = providers(config, fetcher);
  const adminKey = randomBytes(32);
  const attempts = new Map();

  function limited(req, action, max) {
    const key = action + ':' + req.socket.remoteAddress;
    const minute = Math.floor(Date.now() / 60000);
    for (const [oldKey, entry] of attempts) if (entry.minute < minute) attempts.delete(oldKey);
    const entry = attempts.get(key) || { minute, count: 0 };
    if (++entry.count > max) throw new PaymentError('요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    attempts.set(key, entry);
  }
  function requireOrigin(req) {
    if (req.headers.origin !== config.origin) throw new PaymentError('쇼핑몰 주소에서 다시 요청해 주세요.', 403);
  }
  function signature(value) {
    return createHmac('sha256', adminKey).update(value).digest('base64url');
  }
  function requireAdmin(req) {
    const cookie = /(?:^|;\s*)modu_admin=(\d+\.[a-zA-Z0-9_-]+)(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const [expiry, hash] = cookie?.split('.') || [];
    if (!config.adminPassword || Number(expiry) <= Date.now() || !hash || !safeEqual(hash, signature(expiry))) {
      throw new PaymentError('관리자 로그인이 필요합니다.', 401);
    }
  }
  function setAdminCookie(value, maxAge) {
    return 'modu_admin=' + value + '; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=' + maxAge +
      (config.secure ? '; Secure' : '');
  }
  function findReceipt(receipt) {
    return typeof receipt === 'string' && tokenPattern.test(receipt) ? store.byReceipt(receipt) : null;
  }
  function finishCreated(order, status, reason) {
    store.transaction(() => {
      const current = store.get(order.id);
      if (current.status === 'created') store.update({ ...current, status, reason });
    });
  }
  function reserve(order, shipping = order.shipping) {
    return store.transaction(() => {
      const current = store.get(order.id);
      if (current.status !== 'created' || Date.now() > current.createdAt + ORDER_AGE) return null;
      const { products, revision } = store.catalog();
      let available;
      try {
        available = checkedBasket(current.items, products);
      } catch (error) {
        if (!(error instanceof PaymentError)) throw error;
      }
      if (!available || available.some((item, index) => item.price !== current.items[index].price)) {
        store.update({ ...current, status: 'failed', reason: '상품의 가격 또는 재고가 변경되었습니다. 장바구니를 확인해 주세요.' });
        return null;
      }
      for (const item of available) products.find(product => product.id === item.id).stock -= item.quantity;
      store.saveCatalog(products, revision);
      const pending = { ...current, shipping, status: 'processing', startedAt: Date.now() };
      store.update(pending);
      return pending;
    });
  }

  function settle(order, outcome) {
    return store.transaction(() => {
      const current = store.get(order.id);
      if (!['processing', 'review'].includes(current.status)) return;
      if (outcome.status === 'failed') {
        const { products, revision } = store.catalog();
        for (const line of current.items) {
          const product = products.find(product => product.id === line.id);
          if (product) product.stock += line.quantity;
        }
        store.saveCatalog(products, revision);
      }
      store.update({
        ...current, ...outcome,
        reason: outcome.status === 'failed' ? '결제 승인에 실패했습니다. 결제수단을 확인해 주세요.' : undefined
      });
    });
  }

  async function capture(order, request) {
    let outcome;
    try {
      outcome = await request();
    } catch {
      outcome = { status: 'review' };
    }
    settle(order, outcome);
  }

  async function paypleReturn(req, res) {
    const contentType = req.headers['content-type']?.startsWith('application/json')
      ? 'application/json' : 'application/x-www-form-urlencoded';
    const result = await body(req, contentType);
    const order = findReceipt(result?.PCD_USER_DEFINE1);
    if (!order || order.method !== 'payple' || result.PCD_PAY_OID !== order.id) return redirect(res, resultLocation());
    if (order.status !== 'created') return redirect(res, resultLocation(order));
    if (result.PCD_PAY_RST === 'close') finishCreated(order, 'cancelled');
    else if (result.PCD_PAY_RST === 'error') finishCreated(order, 'failed', '페이플에서 카드 인증을 완료하지 못했습니다.');
    else if (config.payple.enabled && order.sandbox === !config.payple.live && provider.validPaypleAuth(order, result)) {
      const pending = reserve(order);
      if (pending) await capture(pending, () => provider.approvePayple(pending, result));
    }
    return redirect(res, resultLocation(order));
  }

  async function paypalReturn(url, res) {
    const order = findReceipt(url.searchParams.get('receipt'));
    if (!order || order.method !== 'paypal') return redirect(res, resultLocation());
    if (order.status !== 'created' || !config.paypal.enabled || order.sandbox !== !config.paypal.live ||
        url.searchParams.get('token') !== order.providerId ||
        Date.now() > order.createdAt + ORDER_AGE) return redirect(res, resultLocation(order));

    let shipping;
    try {
      shipping = provider.paypalShipping(order, await provider.getPayPal(order));
    } catch (error) {
      if (error.status === 400) finishCreated(order, 'failed', error.message);
      return redirect(res, resultLocation(order));
    }
    const pending = reserve(order, shipping);
    if (pending) await capture(pending, () => provider.capturePayPal(pending));
    return redirect(res, resultLocation(order));
  }

  async function handle(req, res) {
    const url = new URL(req.url, config.origin);
    const path = url.pathname;
    const method = req.method;
    if (method === 'GET' && path === '/api/catalog') {
      return json(res, 200, {
        products: store.catalog().products.filter(product => product.visible),
        payments: { payple: config.payple.enabled, paypal: config.paypal.enabled }
      });
    }
    if (method === 'POST' && path === '/api/checkout/payple/return') return paypleReturn(req, res);
    if (method === 'GET' && path === '/api/checkout/paypal/return') return paypalReturn(url, res);
    if (method === 'GET' && path === '/api/checkout/paypal/cancel') {
      const order = findReceipt(url.searchParams.get('receipt'));
      if (order?.method === 'paypal') finishCreated(order, 'cancelled');
      return redirect(res, resultLocation(order?.method === 'paypal' ? order : null));
    }
    if (method === 'GET' && path === '/api/checkout/result') {
      const order = findReceipt(url.searchParams.get('receipt'));
      if (!order) throw new PaymentError('주문 정보를 찾을 수 없습니다.', 404);
      return json(res, 200, orderView(order));
    }
    if (method === 'POST' && (path === '/api/checkout/quote' || path === '/api/checkout/start')) {
      requireOrigin(req);
      if (path.endsWith('/start')) limited(req, 'checkout', 45);
      const input = await body(req);
      const items = checkedBasket(input?.items, store.catalog().products);
      const quotes = quote(items, config);
      if (path.endsWith('/quote')) return json(res, 200, { quotes });
      const selected = input?.method;
      if (!['paypal', 'payple'].includes(selected) || !quotes[selected]) {
        throw new PaymentError('현재 사용할 수 없는 결제수단입니다.', 503);
      }
      const total = quotes[selected];
      if (total.amount !== input.amount) throw new PaymentError('주문 금액이 변경되었습니다. 다시 확인해 주세요.', 409);
      const order = {
        ...total, id: 'MG-' + randomUUID(), receipt: randomBytes(24).toString('hex'), method: selected,
        items, status: 'created', createdAt: Date.now(),
        shipping: selected === 'payple' ? domesticShipping(input.shipping) : null
      };
      if (selected === 'paypal') order.paypalRequestIds = { create: randomUUID(), capture: randomUUID() };
      store.create(order);
      if (selected === 'payple') return json(res, 201, provider.paypleStart(order));
      let session;
      try {
        session = await provider.startPayPal(order);
      } catch (error) {
        finishCreated(order, 'failed', 'PayPal 결제창을 열지 못했습니다.');
        throw error;
      }
      store.update({ ...order, providerId: session.providerId });
      return json(res, 201, { url: session.url });
    }
    if (path.startsWith('/api/admin/')) {
      if (method !== 'GET') requireOrigin(req);
      if (path === '/api/admin/session' && method === 'POST') {
        if (!config.adminPassword) throw new PaymentError('서버에서 관리자 비밀번호를 설정한 뒤 로그인할 수 있습니다.', 503);
        const input = await body(req);
        if (!safeEqual(input?.password ?? '', config.adminPassword)) {
          limited(req, 'login', 10);
          throw new PaymentError('관리자 비밀번호를 확인해 주세요.', 401);
        }
        const lifetime = 8 * 60 * 60;
        const expiry = String(Date.now() + lifetime * 1000);
        return json(res, 200, { ok: true }, { 'Set-Cookie': setAdminCookie(expiry + '.' + signature(expiry), lifetime) });
      }
      if (path === '/api/admin/session' && method === 'DELETE') {
        return json(res, 200, { ok: true }, { 'Set-Cookie': setAdminCookie('', 0) });
      }
      requireAdmin(req);
      if (path === '/api/admin/catalog' && method === 'GET') return json(res, 200, store.catalog());
      if (path === '/api/admin/catalog' && method === 'PUT') {
        const input = await body(req, 'application/json', 20 * 1024 * 1024);
        const products = checkedProducts(input?.products);
        if (!store.saveCatalog(products, input?.revision ?? -1)) {
          throw new PaymentError('다른 곳에서 상품 또는 재고가 변경되었습니다. 새로고침한 뒤 다시 저장해 주세요.', 409);
        }
        return json(res, 200, { products, revision: input.revision + 1 });
      }
      if (path === '/api/admin/orders' && method === 'GET') {
        return json(res, 200, { orders: store.orders().map(order => ({
          ...orderView(order), shipping: order.shipping, transaction: order.transaction
        })) });
      }
      if (path === '/api/admin/orders/reconcile' && method === 'POST') {
        const input = await body(req);
        const order = typeof input?.id === 'string' && idPattern.test(input.id) ? store.get(input.id) : null;
        if (!order) throw new PaymentError('주문 정보를 찾을 수 없습니다.', 404);
        const methodSettings = config[order.method];
        if (!methodSettings.enabled || order.sandbox !== !methodSettings.live) {
          throw new PaymentError('주문에 사용한 결제 환경에서 상태를 확인해 주세요.', 409);
        }
        if (order.status === 'review' || (order.status === 'processing' && Date.now() - order.startedAt > 60000)) {
          const outcome = order.method === 'payple' ? await provider.checkPayple(order)
            : provider.paypalResult(order, await provider.getPayPal(order));
          settle(order, outcome);
        }
        return json(res, 200, orderView(store.get(order.id)));
      }
    }
    if (method === 'GET' && staticResponse(res, path)) return;
    return json(res, 404, { error: '페이지를 찾을 수 없습니다.' });
  }

  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    handle(req, res).catch(error => {
      if (res.headersSent || res.destroyed) return;
      if (!(error instanceof PaymentError)) console.error('Shop request failed:', error.code || error.name);
      json(res, error.status || 500, { error: error instanceof PaymentError ? error.message : '요청을 처리할 수 없습니다.' });
    });
  });
  server.on('close', () => store.close());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 8080);
  createShopServer().listen(port, process.env.HOST || '0.0.0.0', () => console.log('MODU GLOBAL is listening on port ' + port));
}
