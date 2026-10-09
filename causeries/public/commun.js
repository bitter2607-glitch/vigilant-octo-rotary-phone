/* Utilitaires partagés par l'écran animateur et la page de signature. */
(function () {
  'use strict';

  /** Crée un élément : h('p', {class: 'x', onclick: fn}, 'texte', enfant…).
   *  Le texte passe toujours par textContent : aucune saisie n'est interprétée en HTML. */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      // Via le CSSOM : la CSP interdit les attributs style, pas cette affectation.
      else if (k === 'style') el.style.cssText = v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { ajouter(el, x); });
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  function api(methode, url, corps) {
    var o = { method: methode, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (corps !== undefined) {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(corps);
    }
    return fetch(url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error(d.erreur || ('Erreur ' + r.status));
          e.status = r.status;
          throw e;
        }
        return d;
      });
    }, function () {
      throw new Error('Pas de connexion au serveur. Vérifiez votre réseau puis réessayez.');
    });
  }

  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var fmtHorodatage = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Europe/Paris'
  });

  window.CS = {
    h: h,
    api: api,
    vider: function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; },
    jourLong: function (iso) { return fmtJour.format(new Date(iso + 'T00:00:00Z')); },
    jourCourt: function (iso) { return { j: +iso.slice(8, 10), m: MOIS[+iso.slice(5, 7) - 1], a: iso.slice(0, 4) }; },
    horodatage: function (iso) { return fmtHorodatage.format(new Date(iso)); },
    aujourdhui: function () {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  };
})();
