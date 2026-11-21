export class PaymentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const minorUnits = value => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''));
  return match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
};
export const usdAmount = cents => (cents / 100).toFixed(2);
const matchesWon = (value, amount) => /^\d+$/.test(String(value ?? '')) && Number(value) === amount;
const string = (value, max = 255) => typeof value === 'string' && value.length > 0 && value.length <= max;
const definitePaypleDeclines = new Set(['PCCFD001', 'PCCF0001', 'PCCF0008', 'PCCF0009', 'PCCF0012', 'PCCF0013']);

export function providers(config, fetcher) {
  const origin = config.origin;
  const paypleHost = config.payple.live ? 'https://cpay.payple.kr' : 'https://democpay.payple.kr';
  const paypleApproval = config.payple.live ? 'https://api-v2.payple.kr' : 'https://demo-api-v2.payple.kr';
  const paypalHost = config.paypal.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const paypalCheckoutHost = config.paypal.live ? 'www.paypal.com' : 'www.sandbox.paypal.com';

  async function request(url, options) {
    let response;
    let data;
    try {
      response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) });
      data = await response.json();
    } catch {
      throw new PaymentError('결제사 응답을 확인하는 데 시간이 걸리고 있습니다.', 502);
    }
    if (!response.ok) {
      const error = new PaymentError('결제사에서 요청을 처리하지 못했습니다.', 502);
      error.providerIssues = data?.details?.map?.(detail => detail.issue) || [];
      throw error;
    }
    if (!data || typeof data !== 'object') throw new PaymentError('결제사 응답 형식을 확인할 수 없습니다.', 502);
    return data;
  }
  const post = (url, body, headers = {}) => request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  const payplePost = (url, body) => post(url, body, { Referer: origin, 'Cache-Control': 'no-cache' });

  function paypleStart(order) {
    return {
      script: paypleHost + '/js/v1/payment.js',
      fields: {
        clientKey: config.payple.client, PCD_PAY_TYPE: 'card', PCD_PAY_WORK: 'CERT', PCD_CARD_VER: '02',
        PCD_PAY_GOODS: 'MODU GLOBAL 상품 주문', PCD_PAY_TOTAL: order.amount, PCD_PAY_OID: order.id,
        PCD_PAY_ISTAX: config.payple.tax, PCD_RST_URL: origin + '/api/checkout/payple/return',
        PCD_USER_DEFINE1: order.receipt
      }
    };
  }

  function validPaypleAuth(order, result) {
    return result.PCD_PAY_RST === 'success' && result.PCD_PAY_CODE === '0000' &&
      result.PCD_PAY_TYPE === 'card' && result.PCD_CARD_VER === '02' && result.PCD_PAY_WORK === 'CERT' &&
      matchesWon(result.PCD_PAY_TOTAL, order.amount) &&
      string(result.PCD_AUTH_KEY, 2048) && string(result.PCD_PAY_REQKEY);
  }

  function paypleResult(order, result, successCode) {
    const transaction = result.PCD_PAY_CARDTRADENUM;
    if (result.PCD_PAY_RST === 'success' && result.PCD_PAY_CODE === successCode &&
        result.PCD_PAY_TYPE === 'card' && result.PCD_PAY_OID === order.id &&
        matchesWon(result.PCD_PAY_TOTAL, order.amount) && string(transaction)) {
      return { status: 'paid', transaction };
    }
    return { status: 'review' };
  }

  async function approvePayple(order, auth) {
    const result = await payplePost(paypleApproval + '/api/v1/payments/cards/approval/confirm', {
      PCD_CST_ID: config.payple.id, PCD_CUST_KEY: config.payple.secret,
      PCD_AUTH_KEY: auth.PCD_AUTH_KEY, PCD_PAY_REQKEY: auth.PCD_PAY_REQKEY
    });
    if (result.PCD_PAY_RST === 'error' && definitePaypleDeclines.has(result.PCD_PAY_CODE)) return { status: 'failed' };
    return paypleResult(order, result, 'PCCF0000');
  }

  async function checkPayple(order) {
    const partner = await payplePost(paypleHost + '/php/auth.php', {
      cst_id: config.payple.id, custKey: config.payple.secret, PCD_PAYCHK_FLAG: 'Y'
    });
    if (partner.result !== 'success' || !partner.cst_id || !partner.custKey || !partner.AuthKey) {
      throw new PaymentError('페이플 거래 조회 인증에 실패했습니다.', 502);
    }
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short' })
      .format(new Date(order.startedAt)).replaceAll('-', '');
    const result = await payplePost(paypleHost + '/php/PayChkAct.php', {
      PCD_CST_ID: partner.cst_id, PCD_CUST_KEY: partner.custKey, PCD_AUTH_KEY: partner.AuthKey,
      PCD_PAYCHK_FLAG: 'Y', PCD_PAY_TYPE: 'card', PCD_PAY_OID: order.id, PCD_PAY_DATE: date
    });
    return paypleResult(order, result, 'PCHK0000');
  }

  let access;
  async function paypalToken() {
    if (access && Date.now() < access.expires) return access.token;
    const credentials = Buffer.from(config.paypal.id + ':' + config.paypal.secret).toString('base64');
    const data = await request(paypalHost + '/v1/oauth2/token', {
      method: 'POST', headers: {
        Authorization: 'Basic ' + credentials, 'Content-Type': 'application/x-www-form-urlencoded'
      }, body: 'grant_type=client_credentials'
    });
    if (!string(data.access_token, 4096)) throw new PaymentError('PayPal 인증 요청을 확인할 수 없습니다.', 502);
    access = { token: data.access_token, expires: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
    return access.token;
  }

  async function startPayPal(order) {
    const data = await post(paypalHost + '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.id, invoice_id: order.id,
        amount: {
          currency_code: 'USD', value: usdAmount(order.amount),
          breakdown: {
            item_total: { currency_code: 'USD', value: usdAmount(order.subtotalAmount) },
            shipping: { currency_code: 'USD', value: usdAmount(order.amount - order.subtotalAmount) }
          }
        }
      }],
      payment_source: { paypal: { experience_context: {
        user_action: 'PAY_NOW', shipping_preference: 'GET_FROM_FILE', brand_name: 'MODU GLOBAL',
        return_url: origin + '/api/checkout/paypal/return?receipt=' + order.receipt,
        cancel_url: origin + '/api/checkout/paypal/cancel?receipt=' + order.receipt
    } } }
    }, { Authorization: 'Bearer ' + await paypalToken(), 'PayPal-Request-Id': order.paypalRequestIds.create });
    const approval = data.links?.find(link => ['payer-action', 'approve'].includes(link.rel) && link.method === 'GET');
    if (!approval || !/^[A-Za-z0-9_-]{1,64}$/.test(data.id || '')) {
      throw new PaymentError('PayPal 결제창 주소를 확인할 수 없습니다.', 502);
    }
    const url = new URL(approval.href);
    if (url.protocol !== 'https:' || url.host !== paypalCheckoutHost || url.username || url.password) {
      throw new PaymentError('PayPal 결제창 주소를 확인할 수 없습니다.', 502);
    }
    return { url: url.href, providerId: data.id };
  }

  function paypalOrderUrl(order) {
    return paypalHost + '/v2/checkout/orders/' + encodeURIComponent(order.providerId);
  }

  async function getPayPal(order) {
    return request(paypalOrderUrl(order), { headers: { Authorization: 'Bearer ' + await paypalToken() } });
  }

  function paypalUnit(order, result) {
    const unit = result.purchase_units?.[0];
    if (result.id !== order.providerId || result.purchase_units?.length !== 1 || unit.reference_id !== order.id) {
      throw new PaymentError('PayPal에서 반환된 주문 번호가 일치하지 않습니다.', 502);
    }
    return unit;
  }

  function paypalShipping(order, result) {
    const unit = paypalUnit(order, result);
    if (result.status !== 'APPROVED') throw new PaymentError('PayPal 결제 승인을 완료해 주세요.');
    if (unit.amount?.currency_code !== 'USD' || minorUnits(unit.amount.value) !== order.amount) {
      throw new PaymentError('PayPal에서 반환된 주문 금액이 일치하지 않습니다.', 502);
    }
    const shipping = unit.shipping;
    const address = shipping?.address;
    if (!config.paypal.countries.has(address?.country_code) || !address?.address_line_1 ||
        !shipping?.name?.full_name) {
      throw new PaymentError('PayPal에 등록된 배송지가 해외 배송 대상 지역에 포함되지 않거나 정보가 비어 있습니다.');
    }
    return {
      name: shipping.name.full_name, country: address.country_code, postal: address.postal_code || '',
      address: [address.address_line_1, address.address_line_2, address.admin_area_2, address.admin_area_1]
        .filter(Boolean).join(', '),
      email: result.payment_source?.paypal?.email_address || result.payer?.email_address || ''
    };
  }

  function paypalResult(order, result) {
    const unit = paypalUnit(order, result);
    const captures = unit.payments?.captures;
    const capture = captures?.[0];
    if (captures?.length === 1 && capture.status === 'COMPLETED' &&
        capture.amount?.currency_code === 'USD' && minorUnits(capture.amount.value) === order.amount &&
        string(capture.id)) {
      return { status: 'paid', transaction: capture.id };
    }
    if (captures?.length === 1 && ['DECLINED', 'FAILED'].includes(capture.status)) return { status: 'failed' };
    return { status: 'review' };
  }

  async function capturePayPal(order) {
    const token = await paypalToken();
    try {
      return paypalResult(order, await post(paypalOrderUrl(order) + '/capture', {}, {
        Authorization: 'Bearer ' + token, Prefer: 'return=representation',
        'PayPal-Request-Id': order.paypalRequestIds.capture
      }));
    } catch (error) {
      if (error.providerIssues?.some(issue => ['INSTRUMENT_DECLINED', 'PAYER_CANNOT_PAY'].includes(issue))) {
        return { status: 'failed' };
      }
      throw error;
    }
  }

  return {
    paypleStart, validPaypleAuth, approvePayple, checkPayple,
    startPayPal, getPayPal, paypalShipping, capturePayPal, paypalResult
  };
}
