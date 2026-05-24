// popup.js

const $ = id => document.getElementById(id);

const btnGet        = $('btn-get');
const btnOpenCursor = $('btn-open-cursor');
const btnIcon       = $('btn-icon');
const btnLabel      = $('btn-label');
const statusArea    = $('status-area');
const statusIcon    = $('status-icon');
const statusTitle   = $('status-title');
const statusDetail  = $('status-detail');
const tokenSection  = $('token-section');
const srAnnounce    = $('sr-announce');

const valAccess   = $('val-access');
const valSession  = $('val-session');
const valDays     = $('val-days');
const valExpire   = $('val-expire');
const valUserid   = $('val-userid');

const copyAccess  = $('copy-access');
const copySession = $('copy-session');

// ── 状态管理 ──────────────────────────────────────

function setStatus(type, icon, title, detail) {
  statusArea.className = `status-area ${type}`;
  statusIcon.textContent = icon;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
  announce(`${title}。${detail}`);
}

function setLoading(on) {
  if (on) {
    btnGet.disabled = true;
    btnIcon.innerHTML = '<span class="spin" aria-hidden="true">⏳</span>';
    btnLabel.textContent = '读取中，请稍候…';
    btnGet.setAttribute('aria-busy', 'true');
  } else {
    btnGet.disabled = false;
    btnIcon.textContent = '🚀';
    btnLabel.textContent = '一键获取 Access Token';
    btnGet.removeAttribute('aria-busy');
  }
}

function announce(msg) {
  srAnnounce.textContent = '';
  requestAnimationFrame(() => { srAnnounce.textContent = msg; });
}

// ── 主流程 ────────────────────────────────────────

async function handleGetToken() {
  setLoading(true);
  tokenSection.classList.remove('visible');
  btnOpenCursor.style.display = 'none';

  setStatus('loading', '🔍', '正在读取登录凭证…',
    '正在从 cursor.com 读取 Cookie，无需访问外部服务器。');

  let result;
  try {
    result = await chrome.runtime.sendMessage({ action: 'getToken' });
  } catch (e) {
    setLoading(false);
    setStatus('error', '❌', '插件通信失败', '请关闭弹窗后重新打开，或刷新页面。错误：' + e.message);
    return;
  }

  setLoading(false);

  if (!result.success) {
    setStatus('error', '⚠️', '未检测到登录状态', result.error);
    btnOpenCursor.style.display = 'flex';
    return;
  }

  // 展示结果
  const daysText = (result.daysLeft !== '—' && result.daysLeft !== undefined)
    ? `剩余 ${result.daysLeft} 天` : '';
  setStatus('success', '✅', '获取成功！',
    `已从本地 Cookie 解析出 Token。${daysText ? daysText + '，' : ''}过期：${result.expireTime}`);

  valAccess.textContent  = result.accessToken  || '—';
  valSession.textContent = result.sessionToken  || '—';
  valDays.textContent    = result.daysLeft !== undefined ? `${result.daysLeft} 天` : '—';
  valExpire.textContent  = result.expireTime    || '—';
  valUserid.textContent  = result.userId        || '—';

  tokenSection.classList.add('visible');

  chrome.storage.local.set({
    lastFetch: {
      accessToken:  result.accessToken,
      sessionToken: result.sessionToken,
      userId:       result.userId,
      expireTime:   result.expireTime,
      daysLeft:     result.daysLeft,
      fetchedAt:    new Date().toLocaleString('zh-CN')
    }
  });
}

// ── 复制 ──────────────────────────────────────────

async function copyToClipboard(text, btn, label) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '已复制 ✓';
    btn.classList.add('copied');
    announce(`${label} 已复制到剪贴板`);
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
  } catch (e) {
    announce('复制失败，请手动选中文本后按 Ctrl+C 复制');
  }
}

copyAccess.addEventListener('click',  () => copyToClipboard(valAccess.textContent,  copyAccess,  'Access Token'));
copySession.addEventListener('click', () => copyToClipboard(valSession.textContent, copySession, 'Session Token'));

// ── 其他交互 ──────────────────────────────────────

btnGet.addEventListener('click', handleGetToken);

btnOpenCursor.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://cursor.com' });
  window.close();
});

$('link-cursor').addEventListener('click', e => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://cursor.com' });
  window.close();
});

[copyAccess, copySession, btnOpenCursor].forEach(btn => {
  btn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
  });
});

// ── 初始化：显示上次缓存 ──────────────────────────

chrome.storage.local.get('lastFetch', ({ lastFetch }) => {
  if (lastFetch?.accessToken) {
    setStatus('idle', '📋', '上次获取记录',
      `上次时间：${lastFetch.fetchedAt}，剩余 ${lastFetch.daysLeft} 天。点击按钮重新获取。`);
  }
});
