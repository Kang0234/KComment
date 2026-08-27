'use strict';

// ---------- 人机验证统一适配层 ----------
// 支持市面主流厂商，后台初始化向导里选择并填入 site key / secret key：
//   hcaptcha      : https://docs.hcaptcha.com/
//   recaptcha_v2  : Google reCAPTCHA v2 (checkbox)
//   recaptcha_v3  : Google reCAPTCHA v3（按分数判定）
//   turnstile     : Cloudflare Turnstile
//
// 厂商侧校验都是「服务端拿 secret + 用户 token 调 verify 接口」同一个套路，
// 差异只在 endpoint 和响应字段。网络失败一律按验证不通过处理（fail-closed）。

const VERIFY_ENDPOINTS = {
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  recaptcha_v2: 'https://www.google.com/recaptcha/api/siteverify',
  recaptcha_v3: 'https://www.google.com/recaptcha/api/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
};

const KNOWN_PROVIDERS = new Set(Object.keys(VERIFY_ENDPOINTS));

// recaptcha_v3 低于该分数视为机器人（可后续做成后台可调）
const RECAPTCHA_V3_MIN_SCORE = 0.5;

/**
 * 校验用户提交的人机验证 token。
 * @returns {Promise<{ok: boolean, msg?: string}>}
 */
async function verify(cfg, token, remoteIp) {
  if (!cfg || !cfg.enabled) return { ok: true };
  if (!KNOWN_PROVIDERS.has(cfg.provider)) return { ok: false, msg: '未知的人机验证类型' };
  if (!token || typeof token !== 'string') return { ok: false, msg: '请先完成人机验证' };

  const body = new URLSearchParams({
    secret: cfg.secret_key || '',
    response: token,
  });
  if (remoteIp) body.append('remoteip', remoteIp);

  let data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const resp = await fetch(VERIFY_ENDPOINTS[cfg.provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, msg: '人机验证服务异常，请稍后再试' };
    data = await resp.json();
  } catch (e) {
    // 网络故障时不放行，宁可错杀不可漏放
    return { ok: false, msg: '人机验证服务暂不可用，请稍后再试' };
  }

  // 各厂商成功标志字段名一致：success
  if (!data.success) {
    return { ok: false, msg: '人机验证未通过，请重试' };
  }
  if (cfg.provider === 'recaptcha_v3' && Number(data.score) < RECAPTCHA_V3_MIN_SCORE) {
    return { ok: false, msg: '疑似机器流量，评论被拒绝' };
  }
  return { ok: true };
}

module.exports = { verify, KNOWN_PROVIDERS, RECAPTCHA_V3_MIN_SCORE };
