/**
 * scripts/session-manager.js v15.3
 * Session persistence через browser_evaluate — чтение/сохранение cookies + localStorage.
 *
 * v15.3: detectProvider и login selectors делегированы в spec.js (window.__spec)
 * v14.0: Создан как session persistence механизм
 *
 * Вызов:
 * 1. browser_evaluate(filename='session-manager.js') → определить провайдера
 * 2. browser_evaluate('window.__session.save()') → сохранить сессию
 * 3. browser_evaluate('window.__session.restore(data)') → восстановить
 * 4. browser_evaluate('window.__session.status()') → статус сессии
 */
(() => {
  // Идемпотентность
  if (window.__session) {
    return { status: 'already_initialized', provider: window.__session.provider };
  }

  // === Определяем провайдера ===
  const provider = window.__spec.detectProvider();
  const sels = window.__spec.SELECTORS[provider] || {};

  // === API сессии ===
  window.__session = {
    provider,

    /** Сохранить текущее состояние сессии */
    save() {
      const cookies = document.cookie;
      const localStorageData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        localStorageData[key] = localStorage.getItem(key);
      }
      const sessionStorageData = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        sessionStorageData[key] = sessionStorage.getItem(key);
      }

      return {
        provider: this.provider,
        url: location.href,
        cookies,
        localStorage: localStorageData,
        sessionStorage: sessionStorageData,
        timestamp: new Date().toISOString(),
        format: 'v1',
      };
    },

    /** Восстановить состояние сессии из сохранённых данных */
    restore(data) {
      if (!data || data.format !== 'v1') {
        return { error: 'invalid_session_data', hint: 'Expected format v1' };
      }
      if (data.provider !== this.provider) {
        return { error: 'provider_mismatch', expected: this.provider, got: data.provider };
      }

      // Восстановить cookies
      if (data.cookies) {
        const cookiePairs = data.cookies.split(';').map(c => c.trim()).filter(Boolean);
        // Cookies уже установлены если домен совпадает — проверим
        const currentCookies = document.cookie;
        const missingCookies = cookiePairs.filter(c => {
          const name = c.split('=')[0]?.trim();
          return name && !currentCookies.includes(name + '=');
        });
        // Примечание: нельзя установить cookies для другого домена через JS
        // Но можно установить для текущего домена
        for (const pair of missingCookies) {
          try {
            document.cookie = pair + '; path=/; SameSite=Lax';
          } catch (e) {
            // silent fail — некоторые cookies защищены
          }
        }
      }

      // Восстановить localStorage
      if (data.localStorage) {
        for (const [key, value] of Object.entries(data.localStorage)) {
          try {
            localStorage.setItem(key, value);
          } catch (e) {
            // QuotaExceededError или другие ошибки
          }
        }
      }

      // Восстановить sessionStorage
      if (data.sessionStorage) {
        for (const [key, value] of Object.entries(data.sessionStorage)) {
          try {
            sessionStorage.setItem(key, value);
          } catch (e) {}
        }
      }

      return { restored: true, provider: this.provider };
    },

    /** Статус сессии — авторизован ли пользователь? */
    status() {
      const sels = window.__spec.SELECTORS[this.provider] || {};
      const loggedIn = !!document.querySelector(sels.login?.avatar)
                     || location.pathname !== sels.login?.notLogin;
      const chatOpen = location.pathname.startsWith(sels.chatOpen || '/c/');

      return {
        provider: this.provider,
        url: location.href,
        loggedIn,
        chatOpen,
        hasCookies: document.cookie.length > 0,
        localStorageKeys: localStorage.length,
        sessionStorageKeys: sessionStorage.length,
        hint: loggedIn
            ? (chatOpen ? 'Session active, chat open' : 'Logged in, no chat open')
            : 'Not logged in — user action required',
      };
    },

    /** Проверить валидность сохранённой сессии */
    isValid(savedData) {
      if (!savedData) return false;
      if (savedData.provider !== this.provider) return false;
      // Если сессия старше 7 дней — считаем невалидной
      const age = Date.now() - new Date(savedData.timestamp).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) return false;
      // Проверяем что cookies не пустые
      if (!savedData.cookies || savedData.cookies.length < 10) return false;
      return true;
    },
  };

  return {
    status: 'initialized',
    provider,
    hint: 'Use window.__session.save() / .restore(data) / .status()',
  };
})()
