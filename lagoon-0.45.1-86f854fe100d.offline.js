(() => {
  const build = 'lagoon-0.45.1-86f854fe100d';
  const offline = document.getElementById('offline-status');
  const install = document.getElementById('install-game');
  const feedback = document.getElementById('display-feedback');
  const canvas = document.getElementById('canvas');
  let promptEvent;
  let registering = false;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    install.hidden = false;
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; });
  install.addEventListener('click', async () => {
    const prompt = promptEvent;
    promptEvent = null;
    install.hidden = true;
    try {
      if (prompt) await prompt.prompt();
    } finally {
      canvas.focus();
    }
  });

  function status(label, hint) {
    offline.textContent = label;
    offline.title = hint;
    offline.dataset.hint = hint;
  }

  async function checkCache() {
    const worker = navigator.serviceWorker.controller;
    if (!worker) return false;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); resolve(false); }, 3500);
      channel.port1.onmessage = ({data}) => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(data.build === build && data.ready);
      };
      worker.postMessage('lagoon-offline-status', [channel.port2]);
    });
  }

  async function prepare() {
    if (registering) return;
    registering = true;
    try {
      if (await checkCache()) {
        status('可离线游玩', '资源已缓存。断网后也可从此地址打开并继续本机存档。');
        return;
      }
      status('准备离线资源…', '保持此页打开，等待全部资源缓存完成。');
      const registration = await navigator.serviceWorker.register('service-worker.js', {updateViaCache:'none'});
      const watch = worker => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') status('离线准备失败', '联网后点击重试。');
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      if (await checkCache()) status('可离线游玩', '资源已缓存。断网后也可从此地址打开并继续本机存档。');
      else if (!registration.installing && !registration.waiting) status('离线资源待更新', '联网后点击重试。');
    } catch (error) {
      status('离线准备失败', '联网后点击重试。');
    } finally {
      registering = false;
    }
  }

  offline.addEventListener('click', () => {
    feedback.textContent = offline.dataset.hint;
    if (offline.textContent !== '可离线游玩' && 'serviceWorker' in navigator) prepare();
    canvas.focus();
  });
  if (!('serviceWorker' in navigator)) {
    status('离线不可用', '离线模式需要浏览器支持，并通过 HTTPS 或本机地址打开。');
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (await checkCache()) status('可离线游玩', '资源已缓存。断网后也可从此地址打开并继续本机存档。');
    else status('新版资源已缓存', '保存进度后更新页面即可切换。');
  });
  window.LagoonOffline = {
    prepare,
    checkUpdate() { navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {}); }
  };
})();
