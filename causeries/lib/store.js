/*
 * Stockage des causeries : un fichier JSON par causerie, écrit de façon
 * atomique (fichier temporaire puis renommage). Aucune dépendance.
 *
 * PREUVE. Chaque émargement est scellé :
 *   - `empreinteContenu` = SHA-256 du contenu exact présenté au signataire ;
 *   - `hash` = SHA-256 de l'émargement + `precedent` (hash de l'émargement
 *     précédent). Les émargements forment une chaîne : modifier, supprimer
 *     ou réordonner une ligne après coup casse tous les maillons suivants,
 *     ce que `verifier()` détecte.
 * Le contenu d'une causerie est figé dès la première signature.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var GENESE = '0'.repeat(64);

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function aleatoire(octets) {
  return crypto.randomBytes(octets).toString('base64url');
}

/** Sérialisation canonique : clés triées, pour un hash indépendant de l'ordre. */
function canonique(v) {
  if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + canonique(v[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/* ------------------------------------------------------------------ */
/* Validation du contenu saisi par l'animateur                         */
/* ------------------------------------------------------------------ */

function texte(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function liste(v, max, maxLen) {
  if (!Array.isArray(v)) v = String(v || '').split('\n');
  return v.map(function (x) { return texte(x, maxLen); })
    .filter(Boolean).slice(0, max);
}

function dateISO(v) {
  var s = String(v || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) ? s : '';
}

/** Nettoie et valide la saisie. Renvoie { contenu } ou { erreur }. */
function normaliserContenu(e) {
  e = e || {};
  var c = {
    theme: texte(e.theme, 160),
    site: texte(e.site, 160),
    date: dateISO(e.date),
    animateur: texte(e.animateur, 120),
    duree: Math.max(0, Math.min(240, parseInt(e.duree, 10) || 0)),
    objectif: texte(e.objectif, 600),
    sections: (Array.isArray(e.sections) ? e.sections : []).map(function (s) {
      return { titre: texte(s && s.titre, 160), texte: texte(s && s.texte, 4000) };
    }).filter(function (s) { return s.titre || s.texte; }).slice(0, 20),
    pointsCles: liste(e.pointsCles, 12, 300),
    quiz: (Array.isArray(e.quiz) ? e.quiz : []).map(function (q) {
      var choix = liste(q && q.choix, 6, 200);
      var bonne = parseInt(q && q.bonne, 10);
      return { question: texte(q && q.question, 300), choix: choix,
               bonne: bonne >= 0 && bonne < choix.length ? bonne : 0 };
    }).filter(function (q) { return q.question && q.choix.length >= 2; }).slice(0, 10),
    lienSupport: /^https?:\/\/\S+$/i.test(texte(e.lienSupport, 500)) ? texte(e.lienSupport, 500) : ''
  };
  if (!c.theme) return { erreur: 'Le thème est obligatoire.' };
  if (!c.date) return { erreur: 'La date est obligatoire (AAAA-MM-JJ).' };
  if (!c.animateur) return { erreur: 'Le nom de l’animateur est obligatoire.' };
  if (!c.sections.length && !c.pointsCles.length) {
    return { erreur: 'Ajoutez au moins une section ou un point clé : c’est ce que les agents liront avant de signer.' };
  }
  return { contenu: c };
}

/** Nom comparable : sans accents, casse ni espaces multiples. */
function cleNom(nom) {
  return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Scellement des émargements                                          */
/* ------------------------------------------------------------------ */

function corpsEmargement(e) {
  return {
    id: e.id, nom: e.nom, entreprise: e.entreprise, signeLe: e.signeLe,
    ip: e.ip, ua: e.ua, quiz: e.quiz, signature: sha256(e.signature),
    empreinteContenu: e.empreinteContenu, precedent: e.precedent
  };
}

function scellerEmargement(e) {
  return sha256(canonique(corpsEmargement(e)));
}

/** Recalcule toute la chaîne. Renvoie { ok, rompuA } (index du 1er maillon faux). */
function verifier(causerie) {
  var empreinte = sha256(canonique(causerie.contenu));
  var prec = GENESE;
  var em = causerie.emargements || [];
  for (var i = 0; i < em.length; i++) {
    var e = em[i];
    if (e.precedent !== prec || e.empreinteContenu !== empreinte ||
        scellerEmargement(e) !== e.hash) {
      return { ok: false, rompuA: i };
    }
    prec = e.hash;
  }
  return { ok: true, rompuA: -1 };
}

/* ------------------------------------------------------------------ */
/* Correction du quiz                                                  */
/* ------------------------------------------------------------------ */

function corrigerQuiz(quiz, reponses) {
  reponses = Array.isArray(reponses) ? reponses : [];
  var score = 0;
  var r = quiz.map(function (q, i) {
    var v = parseInt(reponses[i], 10);
    v = v >= 0 && v < q.choix.length ? v : -1;
    if (v === q.bonne) score++;
    return v;
  });
  return { reponses: r, score: score, total: quiz.length };
}

/* ------------------------------------------------------------------ */
/* Magasin                                                             */
/* ------------------------------------------------------------------ */

var PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
var SIGNATURE_MAX = 300 * 1024;

function creerStore(dossier) {
  var rep = path.join(dossier, 'causeries');
  fs.mkdirSync(rep, { recursive: true });
  var cache = new Map();   // id -> causerie
  var parToken = new Map(); // token -> id

  fs.readdirSync(rep).forEach(function (f) {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(f)) return;
    var c = JSON.parse(fs.readFileSync(path.join(rep, f), 'utf8'));
    cache.set(c.id, c);
    parToken.set(c.token, c.id);
  });

  function ecrire(c) {
    var cible = path.join(rep, c.id + '.json');
    var tmp = cible + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(c, null, 1));
    fs.renameSync(tmp, cible);
    cache.set(c.id, c);
    parToken.set(c.token, c.id);
  }

  function resume(c) {
    return {
      id: c.id, contenu: { theme: c.contenu.theme, site: c.contenu.site,
                           date: c.contenu.date, animateur: c.contenu.animateur },
      statut: c.statut, creeLe: c.creeLe, signatures: c.emargements.length,
      prevus: c.participantsPrevus.length
    };
  }

  return {
    lister: function () {
      return Array.from(cache.values()).map(resume).sort(function (a, b) {
        return b.contenu.date.localeCompare(a.contenu.date) || b.creeLe.localeCompare(a.creeLe);
      });
    },

    lire: function (id) { return cache.get(id) || null; },

    parToken: function (token) {
      var id = parToken.get(String(token || ''));
      return id ? cache.get(id) : null;
    },

    creer: function (entree) {
      var n = normaliserContenu(entree);
      if (n.erreur) return n;
      var c = {
        id: aleatoire(9),
        token: aleatoire(18),
        contenu: n.contenu,
        empreinte: sha256(canonique(n.contenu)),
        participantsPrevus: liste(entree.participantsPrevus, 300, 120),
        statut: 'ouverte',
        creeLe: new Date().toISOString(),
        clotureLe: null,
        emargements: []
      };
      ecrire(c);
      return { causerie: c };
    },

    modifier: function (id, entree) {
      var c = cache.get(id);
      if (!c) return { erreur: 'Causerie introuvable.', code: 404 };
      var prevus = liste(entree.participantsPrevus, 300, 120);
      if (c.emargements.length) {
        // Contenu figé : seule la liste des participants attendus peut évoluer.
        c = Object.assign({}, c, { participantsPrevus: prevus });
        ecrire(c);
        return { causerie: c, contenuFige: true };
      }
      var n = normaliserContenu(entree);
      if (n.erreur) return n;
      c = Object.assign({}, c, { contenu: n.contenu, empreinte: sha256(canonique(n.contenu)),
                                 participantsPrevus: prevus });
      ecrire(c);
      return { causerie: c };
    },

    changerStatut: function (id, statut) {
      var c = cache.get(id);
      if (!c) return { erreur: 'Causerie introuvable.', code: 404 };
      if (statut !== 'ouverte' && statut !== 'cloturee') return { erreur: 'Statut inconnu.' };
      c = Object.assign({}, c, { statut: statut,
                                 clotureLe: statut === 'cloturee' ? new Date().toISOString() : null });
      ecrire(c);
      return { causerie: c };
    },

    supprimer: function (id) {
      var c = cache.get(id);
      if (!c) return false;
      fs.rmSync(path.join(rep, id + '.json'), { force: true });
      cache.delete(id);
      parToken.delete(c.token);
      return true;
    },

    /** Enregistre un émargement. `meta` = { ip, ua } relevés par le serveur. */
    signer: function (token, entree, meta) {
      var c = this.parToken(token);
      if (!c) return { erreur: 'Lien de signature inconnu.', code: 404 };
      if (c.statut !== 'ouverte') return { erreur: 'Cette causerie est clôturée : les signatures ne sont plus acceptées.', code: 409 };
      entree = entree || {};
      var nom = texte(entree.nom, 120);
      if (!cleNom(nom)) return { erreur: 'Indiquez vos nom et prénom.' };
      if (entree.lu !== true) return { erreur: 'Cochez la case confirmant que vous avez pris connaissance de la causerie.' };
      if (entree.empreinte !== c.empreinte) {
        return { erreur: 'Le contenu a changé depuis l’ouverture de la page. Rechargez-la et relisez avant de signer.', code: 409 };
      }
      var sig = String(entree.signature || '');
      if (!PNG_DATA_URL.test(sig) || sig.length > SIGNATURE_MAX) {
        return { erreur: 'Signature manquante ou illisible. Signez dans le cadre puis validez.' };
      }
      var cle = cleNom(nom);
      if (c.emargements.some(function (e) { return cleNom(e.nom) === cle; })) {
        return { erreur: nom + ' a déjà signé cette causerie.', code: 409 };
      }
      var quiz = corrigerQuiz(c.contenu.quiz, entree.reponses);
      if (c.contenu.quiz.length && quiz.reponses.indexOf(-1) !== -1) {
        return { erreur: 'Répondez à toutes les questions du quiz avant de signer.' };
      }
      var dernier = c.emargements[c.emargements.length - 1];
      var e = {
        id: aleatoire(6),
        nom: nom,
        entreprise: texte(entree.entreprise, 120),
        signeLe: new Date().toISOString(),
        ip: texte(meta && meta.ip, 64),
        ua: texte(meta && meta.ua, 300),
        quiz: quiz,
        signature: sig,
        empreinteContenu: c.empreinte,
        precedent: dernier ? dernier.hash : GENESE
      };
      e.hash = scellerEmargement(e);
      c = Object.assign({}, c, { emargements: c.emargements.concat([e]) });
      ecrire(c);
      return { emargement: e, causerie: c };
    }
  };
}

module.exports = {
  creerStore: creerStore,
  verifier: verifier,
  normaliserContenu: normaliserContenu,
  corrigerQuiz: corrigerQuiz,
  cleNom: cleNom,
  canonique: canonique,
  sha256: sha256,
  GENESE: GENESE
};
