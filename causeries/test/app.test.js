/* Tests du stockage, du scellement et de l'API. Lancer : node test/app.test.js */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var S = require('../lib/store');
var MODELES = require('../lib/modeles');
var creerApp = require('../server').creerApp;

var ok = 0, ko = 0;
function eq(reel, attendu, titre) {
  var a = JSON.stringify(reel), b = JSON.stringify(attendu);
  if (a === b) ok++;
  else { ko++; console.error('✗ ' + titre + '\n    attendu ' + b + '\n    obtenu  ' + a); }
}
function vrai(c, titre) { eq(!!c, true, titre); }

function dossierTemp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'causeries-')); }

// Plus petit PNG valide (1×1) — suffit pour le format attendu par le serveur.
var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
var BASE = {
  theme: 'Consignation', date: '2026-10-12', site: 'Abattoir Nord', animateur: 'C. Martin', duree: '10',
  sections: [{ titre: 'Pourquoi', texte: 'Parce que.' }], pointsCles: 'Un cadenas\nUne pancarte\n\n',
  quiz: [{ question: 'Combien de cadenas ?', choix: ['Un', 'Un par personne'], bonne: 1 }],
  participantsPrevus: 'Léa Durand\nPaul Ngo'
};

/* ---- Utilitaires ---------------------------------------------------- */

eq(S.canonique({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}', 'sérialisation canonique triée');
eq(S.cleNom('  Léa   DURAND '), 'lea durand', 'nom comparé sans accents ni casse');
eq(S.corrigerQuiz(BASE.quiz, [1]), { reponses: [1], score: 1, total: 1 }, 'quiz : bonne réponse');
eq(S.corrigerQuiz(BASE.quiz, [7]), { reponses: [-1], score: 0, total: 1 }, 'quiz : réponse hors bornes ignorée');

/* ---- Validation ----------------------------------------------------- */

vrai(S.normaliserContenu(Object.assign({}, BASE, { theme: ' ' })).erreur, 'thème obligatoire');
vrai(S.normaliserContenu(Object.assign({}, BASE, { date: '2026-13-45' })).erreur, 'date invalide refusée');
vrai(S.normaliserContenu(Object.assign({}, BASE, { sections: [], pointsCles: '' })).erreur, 'contenu vide refusé');
var n = S.normaliserContenu(Object.assign({}, BASE, { lienSupport: 'javascript:alert(1)' })).contenu;
eq(n.lienSupport, '', 'lien non http refusé');
eq(n.pointsCles, ['Un cadenas', 'Une pancarte'], 'lignes vides retirées');
eq(n.duree, 10, 'durée convertie en nombre');
var q = S.normaliserContenu(Object.assign({}, BASE, { quiz: [{ question: 'Q', choix: ['seul'] }] })).contenu;
eq(q.quiz.length, 0, 'question à un seul choix écartée');

MODELES.forEach(function (m) {
  var r = S.normaliserContenu(Object.assign({ date: '2026-10-12', animateur: 'X' }, m));
  vrai(r.contenu && r.contenu.quiz.length === m.quiz.length, 'modèle « ' + m.cle + ' » valide et complet');
});

/* ---- Magasin et scellement ------------------------------------------ */

var dir = dossierTemp();
var store = S.creerStore(dir);
var c = store.creer(BASE).causerie;
vrai(c.token.length >= 24, 'jeton de signature long et aléatoire');
eq(c.participantsPrevus, ['Léa Durand', 'Paul Ngo'], 'participants attendus');

function signe(nom, extra) {
  return store.signer(c.token, Object.assign({ nom: nom, lu: true, signature: PNG, reponses: [1], empreinte: c.empreinte }, extra), { ip: '10.0.0.1', ua: 'test' });
}
vrai(signe('Léa Durand', { lu: false }).erreur, 'attestation de lecture obligatoire');
vrai(signe('Léa Durand', { signature: 'data:image/svg+xml;base64,AAAA' }).erreur, 'signature non PNG refusée');
vrai(signe('Léa Durand', { reponses: [] }).erreur, 'quiz incomplet refusé');
eq(signe('Léa Durand', { empreinte: 'autre' }).code, 409, 'contenu modifié entre-temps : signature refusée');
var r1 = signe('Léa Durand');
vrai(r1.emargement, 'premier émargement');
eq(r1.emargement.precedent, S.GENESE, 'premier maillon rattaché à la genèse');
eq(signe('lea  durand').code, 409, 'double signature refusée (accents, casse)');
var r2 = signe('Paul Ngo', { reponses: [0] });
eq(r2.emargement.precedent, r1.emargement.hash, 'chaînage des émargements');
eq(r2.emargement.quiz.score, 0, 'score enregistré');
eq(S.verifier(store.lire(c.id)), { ok: true, rompuA: -1 }, 'chaîne intègre');

var mod = store.modifier(c.id, Object.assign({}, BASE, { theme: 'Autre thème', participantsPrevus: 'Léa Durand\nPaul Ngo\nAli Ben' }));
vrai(mod.contenuFige, 'contenu figé après signature');
eq(store.lire(c.id).contenu.theme, 'Consignation', 'le thème signé est conservé');
eq(store.lire(c.id).participantsPrevus.length, 3, 'liste des participants modifiable');

// Persistance : un nouveau magasin relit les fichiers.
var store2 = S.creerStore(dir);
eq(store2.lire(c.id).emargements.length, 2, 'émargements relus après redémarrage');

// Falsification a posteriori : modifier l'heure d'une signature casse la chaîne.
var fichier = path.join(dir, 'causeries', c.id + '.json');
var brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
brut.emargements[0].signeLe = '2026-10-11T08:00:00.000Z';
eq(S.verifier(brut), { ok: false, rompuA: 0 }, 'heure modifiée détectée');
brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
brut.emargements.shift();
eq(S.verifier(brut), { ok: false, rompuA: 0 }, 'ligne supprimée détectée');
brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
brut.contenu.pointsCles.push('ajout');
eq(S.verifier(brut).ok, false, 'contenu retouché détecté');

store.changerStatut(c.id, 'cloturee');
eq(signe('Ali Ben').code, 409, 'causerie clôturée : signature refusée');

/* ---- API HTTP -------------------------------------------------------- */

function requete(port, methode, chemin, corps, cookie, type) {
  var o = { method: methode, headers: {} };
  if (cookie) o.headers.Cookie = cookie;
  if (corps !== undefined) { o.headers['Content-Type'] = type || 'application/json'; o.body = typeof corps === 'string' ? corps : JSON.stringify(corps); }
  return fetch('http://127.0.0.1:' + port + chemin, o).then(function (r) {
    return r.arrayBuffer().then(function (buf) {
      // Décodage manuel : r.text() retirerait le BOM qu'on veut vérifier.
      var t = Buffer.from(buf).toString('utf8');
      var d; try { d = JSON.parse(t); } catch (e) { d = t; }
      return { status: r.status, data: d, headers: r.headers };
    });
  });
}

var app = creerApp({ dossier: dossierTemp(), motDePasse: 'secret-test' });
app.listen(0, '127.0.0.1', function () {
  var port = app.address().port;
  var R = requete.bind(null, port);
  var cookie, causerie, token;

  R('GET', '/api/causeries').then(function (r) {
    eq(r.status, 401, 'API animateur protégée');
    return R('POST', '/api/connexion', { motDePasse: 'faux' });
  }).then(function (r) {
    eq(r.status, 401, 'mauvais mot de passe refusé');
    return R('POST', '/api/connexion', 'motDePasse=secret-test', null, 'application/x-www-form-urlencoded');
  }).then(function (r) {
    eq(r.status, 415, 'formulaire inter-site (CSRF) refusé');
    return R('POST', '/api/connexion', { motDePasse: 'secret-test' });
  }).then(function (r) {
    eq(r.status, 200, 'connexion');
    var sc = r.headers.get('set-cookie') || '';
    vrai(/HttpOnly/.test(sc) && /SameSite=Strict/.test(sc), 'cookie HttpOnly SameSite=Strict');
    cookie = sc.split(';')[0];
    return R('POST', '/api/causeries', BASE, cookie);
  }).then(function (r) {
    eq(r.status, 201, 'création');
    causerie = r.data;
    token = causerie.lien.split('/s/')[1];
    vrai(/^http:\/\/127\.0\.0\.1:\d+\/s\//.test(causerie.lien), 'lien de signature complet');
    return R('GET', '/api/s/' + token);
  }).then(function (r) {
    eq(r.status, 200, 'page publique lisible sans connexion');
    eq(r.data.contenu.quiz[0].bonne, undefined, 'les bonnes réponses ne sont pas envoyées à l’agent');
    eq(r.data.restants, ['Léa Durand', 'Paul Ngo'], 'noms attendus proposés');
    return R('POST', '/api/s/' + token + '/signer', { nom: 'Léa Durand', lu: true, signature: PNG, reponses: [1], empreinte: r.data.empreinte });
  }).then(function (r) {
    eq(r.status, 201, 'signature à distance');
    eq(r.data.corrige, [1], 'correction renvoyée après signature');
    return R('GET', '/api/s/' + token);
  }).then(function (r) {
    eq(r.data.restants, ['Paul Ngo'], 'signataire retiré des noms proposés');
    return R('GET', '/api/causeries/' + causerie.id, undefined, cookie);
  }).then(function (r) {
    eq(r.data.emargements.length, 1, 'émargement visible côté animateur');
    eq(r.data.emargements[0].ip, '127.0.0.1', 'adresse IP relevée');
    eq(r.data.integrite.ok, true, 'intégrité vérifiée par l’API');
    return R('GET', '/api/causeries/' + causerie.id + '/emargement.csv', undefined, cookie);
  }).then(function (r) {
    vrai(/^﻿/.test(r.data), 'CSV avec BOM pour Excel');
    vrai(/"Léa Durand"/.test(r.data) && /"Paul Ngo";"";"NON SIGNÉ"/.test(r.data), 'CSV : signés et non signés');
    return R('DELETE', '/api/causeries/' + causerie.id, undefined, cookie);
  }).then(function (r) {
    eq(r.status, 409, 'une causerie signée ne se supprime pas');
    return R('GET', '/api/s/inexistant');
  }).then(function (r) {
    eq(r.status, 404, 'jeton inconnu');
    return R('GET', '/static/../server.js');
  }).then(function (r) {
    vrai(r.status === 404 || !/creerApp/.test(String(r.data)), 'pas de lecture hors du dossier public');
    return R('GET', '/s/' + token);
  }).then(function (r) {
    eq(r.status, 200, 'page de signature servie');
    vrai(/default-src 'self'/.test(r.headers.get('content-security-policy')), 'CSP posée');
    eq(r.headers.get('referrer-policy'), 'no-referrer', 'le jeton ne fuit pas par le Referer');
  }).catch(function (e) {
    ko++; console.error('✗ exception', e);
  }).then(function () {
    app.close();
    console.log(ok + ' tests réussis' + (ko ? ', ' + ko + ' en échec' : ''));
    process.exitCode = ko ? 1 : 0;
  });
});
