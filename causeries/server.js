/*
 * Causeries sécurité — serveur HTTP sans dépendance.
 *
 *   ADMIN_PASSWORD  mot de passe des animateurs (obligatoire en production)
 *   PORT            port d'écoute (3000)
 *   DATA_DIR        dossier des données (./data)
 *   PUBLIC_URL      adresse publique, ex. https://causeries.mon-entreprise.fr
 *   TRUST_PROXY=1   lire l'IP et le protocole dans X-Forwarded-* (derrière un proxy)
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var S = require('./lib/store');
var A = require('./lib/auth');
var MODELES = require('./lib/modeles');

var PUBLIC = path.join(__dirname, 'public');
var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};
var CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'"
].join('; ');

function creerApp(opts) {
  opts = opts || {};
  var dossier = opts.dossier || path.join(__dirname, 'data');
  fs.mkdirSync(dossier, { recursive: true });
  var store = S.creerStore(dossier);
  var auth = A.creerAuth({ motDePasse: opts.motDePasse, secret: opts.secret || A.secretPersistant(dossier) });
  var trustProxy = !!opts.trustProxy;
  var securise = !!opts.cookieSecure;

  /* ---------------------------------------------------------------- */
  /* Utilitaires de réponse                                            */
  /* ---------------------------------------------------------------- */

  function entetes(res, extra) {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    Object.keys(extra || {}).forEach(function (k) { res.setHeader(k, extra[k]); });
  }

  function json(res, code, obj, extra) {
    entetes(res, Object.assign({ 'Content-Type': 'application/json; charset=utf-8',
                                 'Cache-Control': 'no-store' }, extra));
    res.writeHead(code);
    res.end(JSON.stringify(obj));
  }

  function erreur(res, r) {
    json(res, r.code || 400, { erreur: r.erreur });
  }

  function fichier(res, nom) {
    var p = path.join(PUBLIC, nom);
    if (p.indexOf(PUBLIC + path.sep) !== 0) return introuvable(res);
    fs.readFile(p, function (err, buf) {
      if (err) return introuvable(res);
      entetes(res, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream',
                     'Cache-Control': nom.slice(-5) === '.html' ? 'no-cache' : 'public, max-age=300' });
      res.writeHead(200);
      res.end(buf);
    });
  }

  function introuvable(res) {
    json(res, 404, { erreur: 'Page introuvable.' });
  }

  function ipDe(req) {
    if (trustProxy && req.headers['x-forwarded-for']) {
      return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '';
  }

  function baseUrl(req) {
    if (opts.publicUrl) return opts.publicUrl.replace(/\/+$/, '');
    var proto = trustProxy && req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0] : 'http';
    return proto + '://' + req.headers.host;
  }

  function cookie(req, nom) {
    var m = new RegExp('(?:^|;\\s*)' + nom + '=([^;]*)').exec(req.headers.cookie || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function connecte(req) { return auth.valide(cookie(req, 'anim')); }

  /** Corps JSON, 512 Kio max. Exiger application/json bloque les formulaires
   *  inter-sites (CSRF) : ils ne peuvent pas poser ce type sans pré-vol CORS. */
  function lireJson(req, cb) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      return cb({ erreur: 'Requête refusée (type de contenu).', code: 415 });
    }
    var morceaux = [], taille = 0, fini = false;
    req.on('data', function (c) {
      taille += c.length;
      if (taille > 512 * 1024 && !fini) { fini = true; cb({ erreur: 'Requête trop volumineuse.', code: 413 }); req.destroy(); }
      else morceaux.push(c);
    });
    req.on('end', function () {
      if (fini) return;
      try { cb(null, JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')); }
      catch (e) { cb({ erreur: 'JSON invalide.' }); }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Vues                                                              */
  /* ---------------------------------------------------------------- */

  function vueAdmin(c, req) {
    return {
      id: c.id, contenu: c.contenu, empreinte: c.empreinte, statut: c.statut,
      creeLe: c.creeLe, clotureLe: c.clotureLe, participantsPrevus: c.participantsPrevus,
      lien: baseUrl(req) + '/s/' + c.token,
      integrite: S.verifier(c),
      emargements: c.emargements
    };
  }

  function vuePublique(c) {
    var signes = new Set(c.emargements.map(function (e) { return S.cleNom(e.nom); }));
    var contenu = Object.assign({}, c.contenu, {
      quiz: c.contenu.quiz.map(function (q) { return { question: q.question, choix: q.choix }; })
    });
    return {
      contenu: contenu, empreinte: c.empreinte, statut: c.statut,
      restants: c.participantsPrevus.filter(function (n) { return !signes.has(S.cleNom(n)); }),
      nbSignatures: c.emargements.length
    };
  }

  function csv(c) {
    function cell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var lignes = [['Thème', 'Site', 'Date', 'Animateur', 'Nom', 'Entreprise', 'Signé le (UTC)',
                   'Quiz', 'Adresse IP', 'Empreinte contenu (SHA-256)', 'Sceau émargement (SHA-256)']];
    c.emargements.forEach(function (e) {
      lignes.push([c.contenu.theme, c.contenu.site, c.contenu.date, c.contenu.animateur,
                   e.nom, e.entreprise, e.signeLe,
                   e.quiz.total ? e.quiz.score + '/' + e.quiz.total : '',
                   e.ip, e.empreinteContenu, e.hash]);
    });
    var signes = new Set(c.emargements.map(function (e) { return S.cleNom(e.nom); }));
    c.participantsPrevus.forEach(function (n) {
      if (!signes.has(S.cleNom(n))) {
        lignes.push([c.contenu.theme, c.contenu.site, c.contenu.date, c.contenu.animateur,
                     n, '', 'NON SIGNÉ', '', '', '', '']);
      }
    });
    // BOM : Excel ouvre ainsi le fichier en UTF-8 ; « ; » pour Excel en français.
    return '﻿' + lignes.map(function (l) { return l.map(cell).join(';'); }).join('\r\n') + '\r\n';
  }

  /* ---------------------------------------------------------------- */
  /* Routage                                                           */
  /* ---------------------------------------------------------------- */

  function routeAdmin(req, res, parts) {
    var m = req.method;
    if (parts[1] === 'modeles' && m === 'GET') return json(res, 200, MODELES);
    if (parts[1] !== 'causeries') return introuvable(res);
    var id = parts[2];

    if (!id && m === 'GET') return json(res, 200, store.lister());
    if (!id && m === 'POST') {
      return lireJson(req, function (err, corps) {
        if (err) return erreur(res, err);
        var r = store.creer(corps);
        if (r.erreur) return erreur(res, r);
        json(res, 201, vueAdmin(r.causerie, req));
      });
    }
    var c = id && store.lire(id);
    if (!c) return introuvable(res);

    if (!parts[3] && m === 'GET') return json(res, 200, vueAdmin(c, req));
    if (!parts[3] && m === 'PUT') {
      return lireJson(req, function (err, corps) {
        if (err) return erreur(res, err);
        var r = store.modifier(id, corps);
        if (r.erreur) return erreur(res, r);
        json(res, 200, Object.assign(vueAdmin(r.causerie, req), { contenuFige: !!r.contenuFige }));
      });
    }
    if (!parts[3] && m === 'DELETE') {
      if (c.emargements.length) {
        return erreur(res, { erreur: 'Une causerie déjà signée ne peut pas être supprimée : elle sert de preuve. Clôturez-la.', code: 409 });
      }
      store.supprimer(id);
      return json(res, 200, { ok: true });
    }
    if (parts[3] === 'statut' && m === 'POST') {
      return lireJson(req, function (err, corps) {
        if (err) return erreur(res, err);
        var r = store.changerStatut(id, corps.statut);
        if (r.erreur) return erreur(res, r);
        json(res, 200, vueAdmin(r.causerie, req));
      });
    }
    if (parts[3] === 'emargement.csv' && m === 'GET') {
      var nomFichier = 'emargement-' + c.contenu.date + '-' + c.id + '.csv';
      entetes(res, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
                     'Content-Disposition': 'attachment; filename="' + nomFichier + '"' });
      res.writeHead(200);
      return res.end(csv(c));
    }
    introuvable(res);
  }

  function routePublique(req, res, parts) {
    var c = store.parToken(parts[2]);
    if (!c) return json(res, 404, { erreur: 'Ce lien de signature n’existe pas ou a été supprimé.' });
    if (!parts[3] && req.method === 'GET') return json(res, 200, vuePublique(c));
    if (parts[3] === 'signer' && req.method === 'POST') {
      return lireJson(req, function (err, corps) {
        if (err) return erreur(res, err);
        var r = store.signer(parts[2], corps, { ip: ipDe(req), ua: req.headers['user-agent'] });
        if (r.erreur) return erreur(res, r);
        var e = r.emargement;
        json(res, 201, { nom: e.nom, signeLe: e.signeLe, hash: e.hash, quiz: e.quiz,
                         corrige: c.contenu.quiz.map(function (q) { return q.bonne; }) });
      });
    }
    introuvable(res);
  }

  function gerer(req, res) {
    var url;
    try { url = new URL(req.url, 'http://x'); } catch (e) { return introuvable(res); }
    var p = url.pathname;
    var parts = p.split('/').slice(1).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return ''; }
    });

    if (p === '/' ) { res.writeHead(302, { Location: '/admin' }); return res.end(); }
    if (p === '/admin' || p === '/admin/') return fichier(res, 'admin.html');
    if (parts[0] === 's' && parts[1] && parts.length === 2) return fichier(res, 'signer.html');
    if (parts[0] === 'static' && /^[a-z0-9-]+\.(js|css|svg|png|webmanifest)$/.test(parts[1] || '')) {
      return fichier(res, parts[1]);
    }
    if (p === '/sante') return json(res, 200, { ok: true });

    if (parts[0] !== 'api') return introuvable(res);
    if (parts[1] === 's' && parts[2]) return routePublique(req, res, parts);

    if (parts[1] === 'session' && req.method === 'GET') return json(res, 200, { connecte: connecte(req) });
    if (parts[1] === 'connexion' && req.method === 'POST') {
      return lireJson(req, function (err, corps) {
        if (err) return erreur(res, err);
        var r = auth.connecter(corps.motDePasse, ipDe(req));
        if (r.erreur) return erreur(res, r);
        json(res, 200, { connecte: true }, {
          'Set-Cookie': 'anim=' + r.cookie + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
                        auth.dureeSecondes + (securise ? '; Secure' : '')
        });
      });
    }
    if (parts[1] === 'deconnexion' && req.method === 'POST') {
      return json(res, 200, { connecte: false }, { 'Set-Cookie': 'anim=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    }
    if (!connecte(req)) return json(res, 401, { erreur: 'Connexion requise.' });
    routeAdmin(req, res, parts);
  }

  var serveur = http.createServer(function (req, res) {
    try { gerer(req, res); }
    catch (e) {
      console.error(e);
      if (!res.headersSent) json(res, 500, { erreur: 'Erreur interne du serveur.' });
    }
  });
  serveur.store = store;
  return serveur;
}

module.exports = { creerApp: creerApp };

if (require.main === module) {
  var mdp = process.env.ADMIN_PASSWORD;
  if (!mdp) {
    mdp = crypto.randomBytes(9).toString('base64url');
    console.warn('ADMIN_PASSWORD non défini : mot de passe provisoire pour ce démarrage : ' + mdp);
  }
  var port = +process.env.PORT || 3000;
  var publicUrl = process.env.PUBLIC_URL || '';
  creerApp({
    dossier: process.env.DATA_DIR || path.join(__dirname, 'data'),
    motDePasse: mdp,
    trustProxy: process.env.TRUST_PROXY === '1',
    publicUrl: publicUrl,
    cookieSecure: /^https:/i.test(publicUrl)
  }).listen(port, function () {
    console.log('Causeries sécurité : http://localhost:' + port + '/admin');
  });
}
