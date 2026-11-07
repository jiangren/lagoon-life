(() => {
  const project = 'https://yapfznblgttmpgjlkkis.supabase.co';
  const publishableKey = 'sb_publishable_hn9MPMnhdo287QPXWdbdmg_6uvxyZ3C';
  const table = '/rest/v1/lagoon_saves';
  const maxBytes = 8 * 1024 * 1024;
  let signedIn = null;
  let useGardenSession = true;

  function credentials() {
    if (signedIn?.expires_at > Date.now() / 1000 + 30) return signedIn;
    if (useGardenSession) {
      try {
        const garden = JSON.parse(localStorage.getItem('chengbao.sync.session'));
        if (garden?.access_token && garden.expires_at > Date.now() / 1000 + 30) return garden;
      } catch {
        // Sign in explicitly when shared browser storage is unavailable.
      }
    }
    return null;
  }

  async function request(path, {method = 'GET', token, body} = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers = {apikey: publishableKey};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers.Prefer = 'return=representation';
    }
    try {
      const response = await fetch(project + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal, cache: 'no-store'
      });
      if (!response.ok) {
        const error = new Error('请求失败');
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  window.LagoonFiles.openCloud = (slot, summary, localBackup, restoreLocal) => {
    const {dialog, close} = window.LagoonFiles.dialog('家长 · 云存档');
    dialog.classList.add('lagoon-cloud');
    const title = dialog.querySelector('h2');
    title.id = 'lagoon-cloud-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const body = document.createElement('div');
    const note = document.createElement('p');
    note.className = 'cloud-note';
    note.setAttribute('role', 'status');
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '返回存档选择';
    closeButton.onclick = close;
    dialog.append(body, note, closeButton);
    const filter = table + '?slot=eq.' + slot;
    let busy = false;
    let emailAddress = '';

    function element(tag, text, parent = body) {
      const child = document.createElement(tag);
      child.textContent = text;
      parent.append(child);
      return child;
    }

    function button(text, action, parent = body) {
      const control = element('button', text, parent);
      control.type = 'button';
      control.onclick = action;
      return control;
    }

    function disableActions(value) {
      busy = value;
      body.querySelectorAll('button').forEach(control => { control.disabled = value; });
    }

    async function load(token, message = '') {
      if (!dialog.open) return;
      note.textContent = message || '正在读取云端存档…';
      disableActions(true);
      try {
        const rows = await request(filter + '&select=revision,updated_at', {token});
        if (dialog.open) actions(token, rows[0], message);
      } catch (error) {
        if (!dialog.open) return;
        if (error.status === 401) {
          signedIn = null;
          useGardenSession = false;
          login('登录已过期，请重新登录。');
        } else {
          body.replaceChildren();
          note.textContent = '暂时无法读取云存档，请检查网络后重试。';
          button('重试', () => load(token));
        }
      } finally {
        disableActions(false);
      }
    }

    function actions(token, remote, message) {
      body.replaceChildren();
      if (emailAddress) element('p', '当前家长账号 · ' + emailAddress);
      element('p', '存档槽 ' + slot + ' · 本机 ' + (summary || '空槽位'));
      element('p', remote ? '云端备份 · ' + new Date(remote.updated_at).toLocaleString('zh-CN') : '这个槽位还没有云端备份。');
      note.textContent = message;
      const row = element('div', '');
      row.className = 'cloud-actions';
      if (summary) button('上传本机存档', () => {
        body.replaceChildren();
        element('p', (remote ? '覆盖' : '创建') + '云端槽位 ' + slot + ' 的备份？备份含当前人物、进度与游戏内相册。');
        const choice = element('div', '');
        choice.className = 'cloud-actions';
        button('返回', () => actions(token, remote, ''), choice);
        button('确认上传', () => upload(token, remote), choice).focus();
      }, row);
      if (remote) button('从云端恢复', () => restore(token, remote), row);
      button('切换家长账号', () => {
        signedIn = null;
        useGardenSession = false;
        login('');
      }, row);
    }

    async function upload(token, remote) {
      if (busy) return;
      if (!localBackup || new TextEncoder().encode(localBackup).length > maxBytes - 1024) {
        note.textContent = '没有可上传的存档，或备份超过 8 MiB。';
        return;
      }
      disableActions(true);
      note.textContent = '正在上传…';
      try {
        const data = JSON.parse(localBackup);
        const revision = crypto.randomUUID();
        const rows = remote
          ? await request(filter + '&revision=eq.' + remote.revision, {
            method: 'PATCH', token, body: {data, revision, updated_at: 'now'}
          })
          : await request(table, {method: 'POST', token, body: {slot, data, revision}});
        await load(token, rows.length ? '已备份到云端。' : '云端备份已变化，请查看后再操作。');
      } catch (error) {
        if (dialog.open) {
          if (error.status === 409 || error.status === 401) {
            await load(token, error.status === 409 ? '云端备份已变化，请查看后再操作。' : '');
          } else {
            note.textContent = '上传结果未确认，请返回并重新读取云端备份。';
          }
        }
      } finally {
        disableActions(false);
      }
    }

    async function restore(token, remote) {
      if (busy) return;
      disableActions(true);
      note.textContent = '正在读取备份…';
      try {
        const rows = await request(filter + '&revision=eq.' + remote.revision + '&select=data', {token});
        if (!dialog.open) return;
        if (!rows.length) {
          await load(token, '云端备份已变化，请查看后再操作。');
          return;
        }
        close();
        restoreLocal(JSON.stringify(rows[0].data));
      } catch (error) {
        if (dialog.open) {
          if (error.status === 401) await load(token);
          else note.textContent = '读取备份失败，请重试。';
        }
      } finally {
        disableActions(false);
      }
    }

    function login(message) {
      body.replaceChildren();
      element('p', '使用「橙宝的学习乐园」已有的家长账号登录。');
      note.textContent = message;
      const form = element('form', '');
      const emailLabel = element('label', '邮箱', form);
      const email = element('input', '', emailLabel);
      email.type = 'email';
      email.autocomplete = 'username';
      email.required = true;
      const passwordLabel = element('label', '密码', form);
      const password = element('input', '', passwordLabel);
      password.type = 'password';
      password.autocomplete = 'current-password';
      password.required = true;
      const submit = element('button', '登录', form);
      submit.type = 'submit';
      form.onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        disableActions(true);
        note.textContent = '正在登录…';
        try {
          const data = await request('/auth/v1/token?grant_type=password', {
            method: 'POST', body: {email: email.value.trim(), password: password.value}
          });
          if (!dialog.open) return;
          emailAddress = data.user?.email || '';
          signedIn = {access_token: data.access_token, expires_at: Date.now() / 1000 + data.expires_in, email: emailAddress};
          await load(signedIn.access_token);
        } catch (error) {
          if (dialog.open) note.textContent = error.status === 400 || error.status === 401
            ? '登录失败，请检查家长账号和密码。' : '暂时无法登录，请检查网络后重试。';
        } finally {
          password.value = '';
          disableActions(false);
        }
      };
      email.focus();
    }

    const current = credentials();
    if (current) {
      emailAddress = current.user?.email || current.email || '';
      load(current.access_token);
    }
    else login('');
  };
})();
