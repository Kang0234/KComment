'use strict';

// ---------- AI 内容审核 ----------
// 用任意 OpenAI 兼容的 chat completions 接口做评论审核
// （OpenAI / DeepSeek / 智谱 / 通义 / Moonshot 等都兼容同一个协议）。
// 后台初始化时填 base_url + api_key + model 即可开启。
//
// 审核失败/超时时按「待人工审核」处理（fail-safe，不拦死也不放死）。

const PROMPT = [
  '你是论坛评论审核员。判断下面的评论是否允许公开展示。',
  '不允许：色情、赌博、诈骗、广告引流（含微信号/QQ号推广）、辱骂人身攻击、违法违规内容。',
  '只输出一个 JSON 对象：{"decision":"approve|reject","reason":"一句话原因"}',
].join('\n');

/**
 * 审核一条评论。
 * @returns {Promise<{status: 'approved'|'pending'|'rejected', reason?: string}>}
 */
async function moderate(cfg, { content, userName }) {
  if (!cfg || !cfg.enabled || !cfg.base_url || !cfg.api_key) {
    return { status: 'approved' };
  }

  const url = cfg.base_url.replace(/\/+$/, '') + '/chat/completions';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `昵称：${userName || '(匿名)'}\n评论：${content}` },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { status: 'pending', reason: `审核服务返回 ${resp.status}` };
    const data = await resp.json();
    let text = data.choices?.[0]?.message?.content || '';
    // 容错：有些模型会带 markdown 围栏
    text = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const decision = parsed.decision;
    if (decision === 'approve') return { status: 'approved', reason: parsed.reason };
    if (decision === 'reject') return { status: 'rejected', reason: parsed.reason || '内容违规' };
    return { status: 'pending', reason: '审核结论不明确，转人工' };
  } catch (e) {
    return { status: 'pending', reason: '审核超时或异常，转人工' };
  }
}

module.exports = { moderate };
