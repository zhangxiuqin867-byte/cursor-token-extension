// background.js - Service Worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    getAndParseToken().then(sendResponse);
    return true;
  }
});

/**
 * 从 cursor.com 读取 Cookie 并直接解析出 userId + accessToken
 * Cookie 格式：{user_id}::{jwt_token}  (:: 在 URL 编码后为 %3A%3A)
 */
async function getAndParseToken() {
  try {
    const domains = [
      'https://cursor.com',
      'https://www.cursor.com',
      'https://authenticator.cursor.sh'
    ];

    let rawValue = null;
    for (const domain of domains) {
      const cookie = await chrome.cookies.get({
        url: domain,
        name: 'WorkosCursorSessionToken'
      });
      if (cookie && cookie.value) {
        rawValue = cookie.value;
        break;
      }
    }

    if (!rawValue) {
      // 列出所有 cursor.com cookies 供调试
      const all = await chrome.cookies.getAll({ domain: 'cursor.com' });
      return {
        success: false,
        error: '未找到登录 Cookie，请先在浏览器访问 cursor.com 并登录账号。',
        availableCookies: all.map(c => c.name)
      };
    }

    // URL 解码（%3A%3A → ::）
    const decoded = decodeURIComponent(rawValue);

    // 格式：user_xxxxxxx::eyJhbGci...
    const separatorIndex = decoded.indexOf('::');
    if (separatorIndex === -1) {
      // 如果没有 ::，整个值就是 token
      return {
        success: true,
        userId: '（包含在 Token 中）',
        accessToken: decoded,
        sessionToken: decoded,
        note: 'Cookie 为纯 Token 格式（无用户 ID 前缀）'
      };
    }

    const userId      = decoded.substring(0, separatorIndex);
    const accessToken = decoded.substring(separatorIndex + 2);

    // 尝试解析 JWT payload 获取过期时间
    let expireInfo = { expireTime: '—', daysLeft: '—' };
    try {
      expireInfo = parseJwtExpiry(accessToken);
    } catch (_) {}

    return {
      success: true,
      userId,
      accessToken,
      sessionToken: decoded,   // 完整原始值，某些工具需要
      expireTime: expireInfo.expireTime,
      daysLeft: expireInfo.daysLeft
    };

  } catch (err) {
    return { success: false, error: '插件错误：' + err.message };
  }
}

/**
 * 解析 JWT 的 exp 字段，返回过期时间和剩余天数
 */
function parseJwtExpiry(jwt) {
  const parts = jwt.split('.');
  if (parts.length < 2) return { expireTime: '—', daysLeft: '—' };

  // Base64url → Base64 → JSON
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded  = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const payload = JSON.parse(atob(padded));

  if (!payload.exp) return { expireTime: '—', daysLeft: '—' };

  const expDate  = new Date(payload.exp * 1000);
  const now      = new Date();
  const daysLeft = Math.max(0, Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)));
  const expireTime = expDate.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  return { expireTime, daysLeft };
}
