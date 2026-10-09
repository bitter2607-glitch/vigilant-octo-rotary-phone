/*
 * Session animateur : un mot de passe partagé (ADMIN_PASSWORD) et un cookie
 * signé HMAC qui expire. Pas de stockage de session côté serveur.
 */
'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var DUREE_MS = 12 * 3600 * 1000;

function egal(a, b) {
  var ha = crypto.createHash('sha256').update(String(a)).digest();
  var hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Secret de signature des cookies, conservé dans le dossier de données. */
function secretPersistant(dossier) {
  var f = path.join(dossier, 'secret-session');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { /* premier démarrage */ }
  var s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

function creerAuth(opts) {
  var secret = opts.secret;
  var motDePasse = opts.motDePasse;
  var essais = new Map(); // ip -> { n, depuis }

  function signer(exp) {
    return crypto.createHmac('sha256', secret).update('anim.' + exp).digest('base64url');
  }

  return {
    /** Renvoie la valeur du cookie, ou null (mauvais mot de passe / trop d'essais). */
    connecter: function (mdp, ip) {
      var now = Date.now();
      var e = essais.get(ip);
      if (e && now - e.depuis > 15 * 60 * 1000) e = null;
      if (e && e.n >= 10) return { erreur: 'Trop de tentatives. Réessayez dans 15 minutes.', code: 429 };
      if (!egal(mdp || '', motDePasse)) {
        essais.set(ip, { n: (e ? e.n : 0) + 1, depuis: e ? e.depuis : now });
        return { erreur: 'Mot de passe incorrect.', code: 401 };
      }
      essais.delete(ip);
      var exp = now + DUREE_MS;
      return { cookie: exp + '.' + signer(exp) };
    },

    valide: function (cookie) {
      var m = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(cookie || '');
      if (!m || +m[1] < Date.now()) return false;
      return egal(m[2], signer(m[1]));
    },

    dureeSecondes: DUREE_MS / 1000
  };
}

module.exports = { creerAuth: creerAuth, secretPersistant: secretPersistant };
