/* Klien server Apps Script.
 * Semua permintaan dikirim sebagai POST text/plain (tanpa preflight CORS) berisi JSON { action, token, ... }.
 */
(function () {
  const API = {
    token: null,
    onAuthLost: () => {},
    configured() {
      const u = (window.CERMAT_CONFIG || {}).API_URL || '';
      return /^https?:\/\//.test(u);
    },
    async call(action, payload = {}) {
      const body = JSON.stringify(Object.assign({ action, token: API.token }, payload));
      let res;
      try {
        res = await fetch(window.CERMAT_CONFIG.API_URL, { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
      } catch (e) {
        const er = new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.');
        er.offline = true; throw er;
      }
      let j;
      try { j = await res.json(); } catch (e) {
        const er = new Error('Jawaban server tidak terbaca (' + res.status + '). Pastikan URL Web App benar dan aksesnya "Anyone".');
        er.offline = !res.ok && res.status >= 500; throw er;
      }
      if (!j.ok) {
        const er = new Error(j.error || 'Terjadi kesalahan di server.');
        er.code = j.code; er.extra = j;
        if (j.code === 'AUTH') API.onAuthLost();
        throw er;
      }
      return j.data;
    }
  };
  window.API = API;
})();
