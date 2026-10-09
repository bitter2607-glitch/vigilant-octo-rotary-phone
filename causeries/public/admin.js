/* Écran animateur : préparer, diffuser et suivre les causeries. */
(function () {
  'use strict';
  var h = CS.h;
  var app = document.getElementById('app');
  var nav = document.getElementById('nav');
  var minuterie = null;

  function lireLocal(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function ecrireLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }

  function afficher() {
    CS.vider(app);
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) app.appendChild(arguments[i]);
  }
  function alerte(type, texte) { return h('div', { class: 'alerte ' + type, role: type === 'err' ? 'alert' : 'status' }, texte); }
  function erreurPage(e) {
    if (e.status === 401) return connexion();
    afficher(alerte('err', e.message), h('p', null, h('a', { href: '#/' }, 'Retour à la liste')));
  }
  function pluriel(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }

  /* ---------------------------------------------------------------- */
  /* Connexion                                                         */
  /* ---------------------------------------------------------------- */

  function connexion() {
    nav.hidden = true;
    var mdp = h('input', { type: 'password', id: 'mdp', autocomplete: 'current-password', required: true });
    var err = h('div', { class: 'alerte err', hidden: true, role: 'alert' });
    afficher(h('form', { class: 'carte ombre', style: 'max-width:420px;margin:40px auto;width:100%',
      onsubmit: function (ev) {
        ev.preventDefault();
        CS.api('POST', '/api/connexion', { motDePasse: mdp.value }).then(router, function (e) {
          err.textContent = e.message; err.hidden = false; mdp.select();
        });
      } },
      h('h1', null, 'Espace animateur'),
      h('p', { class: 'muted' }, 'Préparez vos causeries et suivez les émargements. Les agents, eux, signent depuis le lien reçu, sans mot de passe.'),
      h('label', { class: 'champ' }, h('span', null, 'Mot de passe'), mdp),
      err,
      h('button', { class: 'btn sombre', type: 'submit' }, 'Se connecter')));
    mdp.focus();
  }

  document.getElementById('deconnexion').addEventListener('click', function () {
    CS.api('POST', '/api/deconnexion', {}).then(connexion, connexion);
  });

  /* ---------------------------------------------------------------- */
  /* Liste                                                             */
  /* ---------------------------------------------------------------- */

  function liste() {
    CS.api('GET', '/api/causeries').then(function (items) {
      if (!items.length) {
        return afficher(h('div', { class: 'carte vide' },
          h('h2', null, 'Aucune causerie pour l’instant'),
          h('p', { class: 'muted', style: 'max-width:46ch' }, 'Créez votre première causerie à partir d’un modèle (produits chimiques, consignation, glissades…), envoyez le lien aux agents et suivez les signatures en direct.'),
          h('a', { class: 'btn primaire', href: '#/nouvelle' }, 'Créer une causerie')));
      }
      var ouvertes = items.filter(function (c) { return c.statut === 'ouverte'; }).length;
      var signes = items.reduce(function (s, c) { return s + c.signatures; }, 0);
      afficher(
        h('div', { class: 'chiffres' },
          h('div', { class: 'chiffre' }, h('b', null, items.length), h('span', { class: 'muted small' }, pluriel(items.length, 'causerie'))),
          h('div', { class: 'chiffre' }, h('b', null, ouvertes), h('span', { class: 'muted small' }, 'ouvertes à la signature')),
          h('div', { class: 'chiffre' }, h('b', null, signes), h('span', { class: 'muted small' }, pluriel(signes, 'émargement')))),
        h('div', { class: 'liste' }, items.map(function (c) {
          var d = CS.jourCourt(c.contenu.date);
          var pct = c.prevus ? Math.min(100, Math.round(100 * c.signatures / c.prevus)) : 0;
          return h('a', { class: 'item', href: '#/c/' + c.id },
            h('div', { class: 'date' }, h('b', null, d.j), h('span', null, d.m + ' ' + d.a.slice(2))),
            h('div', { style: 'min-width:0' },
              h('div', { class: 'titre' }, c.contenu.theme),
              h('div', { class: 'meta' }, [c.contenu.site, c.contenu.animateur].filter(Boolean).join(' · '))),
            h('div', { class: 'jauge' },
              h('span', { class: 'pastille ' + c.statut }, c.statut === 'ouverte' ? 'Ouverte' : 'Clôturée'),
              h('span', { class: 'small tab' }, c.prevus ? c.signatures + ' / ' + c.prevus + ' signés' : pluriel(c.signatures, 'signature')),
              c.prevus ? h('div', { class: 'barre' }, h('i', { style: 'width:' + pct + '%' })) : null));
        })));
    }, erreurPage);
  }

  /* ---------------------------------------------------------------- */
  /* Éditeur                                                           */
  /* ---------------------------------------------------------------- */

  function editeur(id) {
    var charge = id ? CS.api('GET', '/api/causeries/' + id) : Promise.resolve(null);
    Promise.all([charge, CS.api('GET', '/api/modeles')]).then(function (r) {
      var existante = r[0], modeles = r[1];
      var fige = !!(existante && existante.emargements.length);
      var v = existante ? existante.contenu : {
        theme: '', date: CS.aujourdhui(), site: lireLocal('cs-site'), animateur: lireLocal('cs-animateur'),
        duree: 10, objectif: '', sections: [{ titre: '', texte: '' }], pointsCles: [], quiz: [], lienSupport: ''
      };

      function champ(lib, el) { return h('label', { class: 'champ' }, h('span', null, lib), el); }
      var f = {
        theme: h('input', { type: 'text', id: 'theme', required: true, value: v.theme, placeholder: 'Ex. Consignation des machines avant nettoyage' }),
        date: h('input', { type: 'date', id: 'date', required: true, value: v.date }),
        site: h('input', { type: 'text', id: 'site', value: v.site, placeholder: 'Site client / chantier' }),
        animateur: h('input', { type: 'text', id: 'animateur', required: true, value: v.animateur }),
        duree: h('input', { type: 'number', id: 'duree', min: '0', max: '240', value: String(v.duree || '') }),
        objectif: h('textarea', { id: 'objectif', rows: 2 }, v.objectif),
        pointsCles: h('textarea', { id: 'points', rows: 4, placeholder: 'Un point par ligne' }, v.pointsCles.join('\n')),
        lienSupport: h('input', { type: 'url', id: 'lien', value: v.lienSupport, placeholder: 'https://… (vidéo, PDF, facultatif)' }),
        prevus: h('textarea', { id: 'prevus', rows: 6, placeholder: 'Un nom par ligne — sert à suivre qui n’a pas encore signé' },
                  existante ? existante.participantsPrevus.join('\n') : '')
      };
      var sections = h('div', { class: 'pile' });
      var quiz = h('div', { class: 'pile' });

      function blocSection(s) {
        var b = h('div', { class: 'bloc-edit' },
          champ('Titre', h('input', { type: 'text', class: 's-titre', value: s.titre || '' })),
          champ('Texte', h('textarea', { class: 's-texte', rows: 5 }, s.texte || '')),
          h('div', null, h('button', { type: 'button', class: 'btn ghost danger', onclick: function () { b.remove(); } }, 'Retirer cette section')));
        sections.appendChild(b);
      }
      function blocQuestion(q) {
        var choix = h('textarea', { class: 'q-choix', rows: 3, placeholder: 'Une réponse par ligne (2 à 6)' }, (q.choix || []).join('\n'));
        var bonne = h('select', { class: 'q-bonne' });
        function majBonne() {
          var lignes = choix.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          var sel = bonne.value === '' ? String(q.bonne || 0) : bonne.value;
          CS.vider(bonne);
          lignes.forEach(function (l, i) { bonne.appendChild(h('option', { value: String(i) }, (i + 1) + '. ' + l)); });
          bonne.value = +sel < lignes.length ? sel : '0';
        }
        choix.addEventListener('input', majBonne);
        var b = h('div', { class: 'bloc-edit' },
          champ('Question', h('input', { type: 'text', class: 'q-question', value: q.question || '' })),
          champ('Réponses proposées', choix),
          champ('Bonne réponse', bonne),
          h('div', null, h('button', { type: 'button', class: 'btn ghost danger', onclick: function () { b.remove(); } }, 'Retirer cette question')));
        quiz.appendChild(b);
        majBonne();
      }
      function remplir(m) {
        f.theme.value = m.theme; f.duree.value = String(m.duree || ''); f.objectif.value = m.objectif || '';
        f.pointsCles.value = (m.pointsCles || []).join('\n');
        CS.vider(sections); (m.sections.length ? m.sections : [{}]).forEach(blocSection);
        CS.vider(quiz); (m.quiz || []).forEach(blocQuestion);
      }
      remplir(v);

      function lire() {
        return {
          theme: f.theme.value, date: f.date.value, site: f.site.value, animateur: f.animateur.value,
          duree: f.duree.value, objectif: f.objectif.value, lienSupport: f.lienSupport.value,
          pointsCles: f.pointsCles.value.split('\n'),
          participantsPrevus: f.prevus.value.split('\n'),
          sections: Array.prototype.map.call(sections.children, function (b) {
            return { titre: b.querySelector('.s-titre').value, texte: b.querySelector('.s-texte').value };
          }),
          quiz: Array.prototype.map.call(quiz.children, function (b) {
            return { question: b.querySelector('.q-question').value,
                     choix: b.querySelector('.q-choix').value.split('\n'),
                     bonne: +b.querySelector('.q-bonne').value };
          })
        };
      }

      var err = h('div', { class: 'alerte err', hidden: true, role: 'alert' });
      var enregistrer = h('button', { type: 'submit', class: 'btn primaire' }, existante ? 'Enregistrer' : 'Créer et obtenir le lien');

      var choixModele = !existante ? h('div', { class: 'carte' },
        h('h2', null, 'Partir d’un modèle'),
        h('p', { class: 'muted small' }, 'Modèles rédigés pour le nettoyage en agroalimentaire. Relisez-les et adaptez-les au site : votre document unique et les fiches de données de sécurité font foi.'),
        h('div', { class: 'modeles' }, modeles.map(function (m) {
          return h('button', { type: 'button', class: 'modele', onclick: function () { remplir(m); f.theme.focus(); } },
            h('b', null, m.theme), h('span', { class: 'muted small' }, (m.duree ? m.duree + ' min · ' : '') + pluriel(m.quiz.length, 'question')));
        }))) : null;

      var verrou = fige ? alerte('info', 'Cette causerie a déjà ' + pluriel(existante.emargements.length, 'signature') +
        ' : son contenu est figé pour garder la preuve de ce qui a été signé. Vous pouvez encore compléter la liste des participants attendus.') : null;

      var form = h('form', { class: 'pile', style: 'gap:20px', novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        err.hidden = true;
        enregistrer.disabled = true;
        var d = lire();
        ecrireLocal('cs-animateur', d.animateur); ecrireLocal('cs-site', d.site);
        (existante ? CS.api('PUT', '/api/causeries/' + id, d) : CS.api('POST', '/api/causeries', d)).then(function (c) {
          location.hash = '#/c/' + c.id;
        }, function (e) {
          if (e.status === 401) return connexion();
          err.textContent = e.message; err.hidden = false; enregistrer.disabled = false;
          err.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      } },
        h('fieldset', { class: 'carte', disabled: fige, style: 'margin:0' },
          h('h2', null, 'La causerie'),
          champ('Thème', f.theme),
          h('div', { class: 'grille' }, champ('Date', f.date), champ('Site / chantier', f.site),
            champ('Animateur', f.animateur), champ('Durée (min)', f.duree)),
          champ('Objectif', f.objectif)),
        h('fieldset', { class: 'carte', disabled: fige, style: 'margin:0' },
          h('h2', null, 'Contenu lu par les agents'),
          sections,
          h('div', null, h('button', { type: 'button', class: 'btn', onclick: function () { blocSection({}); } }, 'Ajouter une section')),
          champ('Points clés à retenir', f.pointsCles),
          champ('Support complémentaire', f.lienSupport)),
        h('fieldset', { class: 'carte', disabled: fige, style: 'margin:0' },
          h('h2', null, 'Quiz de compréhension'),
          h('p', { class: 'muted small' }, 'Facultatif. Les agents répondent avant de signer ; le score figure sur la feuille d’émargement.'),
          quiz,
          h('div', null, h('button', { type: 'button', class: 'btn', onclick: function () { blocQuestion({ choix: [] }); } }, 'Ajouter une question'))),
        h('div', { class: 'carte' },
          h('h2', null, 'Participants attendus'),
          champ('Liste nominative', f.prevus)),
        err,
        h('div', { class: 'ligne' }, enregistrer,
          h('a', { class: 'btn ghost', href: existante ? '#/c/' + id : '#/' }, 'Annuler')));

      afficher(h('h1', null, existante ? 'Modifier la causerie' : 'Nouvelle causerie'), verrou, choixModele, form);
    }, erreurPage);
  }

  /* ---------------------------------------------------------------- */
  /* Fiche d'une causerie                                              */
  /* ---------------------------------------------------------------- */

  function qr(lien) {
    if (typeof window.qrcode !== 'function') return null;
    try {
      var q = window.qrcode(0, 'M');
      q.addData(lien);
      q.make();
      return h('img', { src: q.createDataURL(6, 0), alt: 'QR code du lien de signature' });
    } catch (e) { return null; }
  }

  function copier(texte, bouton) {
    var fini = function () { bouton.textContent = 'Copié'; setTimeout(function () { bouton.textContent = 'Copier'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(texte).then(fini, function () {});
  }

  function fiche(id) {
    CS.api('GET', '/api/causeries/' + id).then(function (c) {
      var ct = c.contenu;
      var signes = new Set(c.emargements.map(function (e) { return cle(e.nom); }));
      var restants = c.participantsPrevus.filter(function (n) { return !signes.has(cle(n)); });
      var ouverte = c.statut === 'ouverte';
      var msg = 'Causerie sécurité « ' + ct.theme + ' » : merci de la lire et de la signer ici : ' + c.lien;

      var lien = h('input', { type: 'text', id: 'lien-signature', readonly: true, value: c.lien, onfocus: function () { lien.select(); } });
      var btnCopier = h('button', { type: 'button', class: 'btn', onclick: function () { copier(c.lien, btnCopier); } }, 'Copier');
      var code = qr(c.lien);

      var partage = ouverte ? h('div', { class: 'carte ombre partage' },
        h('div', { class: 'pile', style: 'gap:12px;min-width:0' },
          h('h2', null, 'Faire signer à distance'),
          h('p', { class: 'muted' }, 'Envoyez ce lien aux agents (SMS, WhatsApp, e-mail) ou affichez le QR code en salle de pause. Ils lisent, répondent au quiz et signent sur leur téléphone, sans compte.'),
          h('div', { class: 'lien' }, lien, btnCopier),
          h('div', { class: 'ligne' },
            h('a', { class: 'btn', href: 'https://wa.me/?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
            h('a', { class: 'btn', href: 'sms:?&body=' + encodeURIComponent(msg) }, 'SMS'),
            h('a', { class: 'btn', href: 'mailto:?subject=' + encodeURIComponent('Causerie sécurité : ' + ct.theme) + '&body=' + encodeURIComponent(msg) }, 'E-mail'))),
        code ? h('div', { class: 'qr' }, code) : null) : null;

      var integ = c.integrite.ok
        ? h('span', { class: 'pastille ouverte', title: 'Chaîne de scellement recalculée à l’instant' }, 'Intégrité vérifiée')
        : h('span', { class: 'pastille ko' }, 'Altération détectée à la ligne ' + (c.integrite.rompuA + 1));

      var entete = h('div', { class: 'pile' },
        h('div', { class: 'ligne' }, h('span', { class: 'pastille ' + c.statut }, ouverte ? 'Ouverte à la signature' : 'Clôturée'), integ),
        h('h1', null, ct.theme),
        h('p', { class: 'muted' }, CS.jourLong(ct.date) + (ct.site ? ' · ' + ct.site : '') + ' · animée par ' + ct.animateur));

      var stats = h('div', { class: 'chiffres' },
        h('div', { class: 'chiffre' }, h('b', null, c.emargements.length), h('span', { class: 'muted small' }, pluriel(c.emargements.length, 'signature'))),
        c.participantsPrevus.length ? h('div', { class: 'chiffre' }, h('b', null, restants.length), h('span', { class: 'muted small' }, 'en attente sur ' + c.participantsPrevus.length + ' attendus')) : null,
        ct.quiz.length && c.emargements.length ? h('div', { class: 'chiffre' },
          h('b', null, Math.round(100 * c.emargements.reduce(function (s, e) { return s + e.quiz.score; }, 0) /
                                 (c.emargements.length * ct.quiz.length)) + ' %'),
          h('span', { class: 'muted small' }, 'de bonnes réponses au quiz')) : null);

      var tableau = c.emargements.length ? h('div', { class: 'tableau' }, h('table', null,
        h('thead', null, h('tr', null, ['Nom', 'Entreprise', 'Signé le', 'Quiz', 'Signature'].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, c.emargements.map(function (e) {
          return h('tr', null, h('td', null, h('b', null, e.nom)), h('td', null, e.entreprise || '—'),
            h('td', { class: 'tab' }, CS.horodatage(e.signeLe)),
            h('td', { class: 'tab' }, e.quiz.total ? e.quiz.score + ' / ' + e.quiz.total : '—'),
            h('td', null, h('img', { class: 'sig', src: e.signature, alt: 'Signature de ' + e.nom })));
        })))) : h('p', { class: 'muted' }, 'Aucune signature pour l’instant. Cette page se met à jour toute seule.');

      var attente = restants.length ? h('div', { class: 'pile' },
        h('h3', null, 'Pas encore signé'),
        h('p', null, restants.join(' · '))) : null;

      var confirmerSuppr = h('div', { class: 'alerte err ligne entre', hidden: true },
        h('span', null, 'Supprimer définitivement cette causerie ?'),
        h('span', { class: 'ligne' },
          h('button', { type: 'button', class: 'btn danger', onclick: function () {
            CS.api('DELETE', '/api/causeries/' + id).then(function () { location.hash = '#/'; }, erreurPage);
          } }, 'Supprimer'),
          h('button', { type: 'button', class: 'btn', onclick: function () { confirmerSuppr.hidden = true; } }, 'Annuler')));

      var actions = h('div', { class: 'ligne' },
        h('a', { class: 'btn sombre', href: '#/feuille/' + id }, 'Feuille d’émargement'),
        h('a', { class: 'btn', href: '/api/causeries/' + id + '/emargement.csv' }, 'Export CSV (Excel)'),
        h('button', { type: 'button', class: 'btn', onclick: function () {
          CS.api('POST', '/api/causeries/' + id + '/statut', { statut: ouverte ? 'cloturee' : 'ouverte' }).then(function () { fiche(id); }, erreurPage);
        } }, ouverte ? 'Clôturer les signatures' : 'Rouvrir les signatures'),
        h('a', { class: 'btn ghost', href: '#/modifier/' + id }, c.emargements.length ? 'Participants attendus' : 'Modifier'),
        !c.emargements.length ? h('button', { type: 'button', class: 'btn ghost danger', onclick: function () { confirmerSuppr.hidden = false; } }, 'Supprimer') : null);

      afficher(entete, partage,
        h('div', { class: 'carte' }, h('h2', null, 'Émargements'), stats, tableau, attente),
        actions, confirmerSuppr,
        h('p', { class: 'muted small' }, 'Empreinte SHA-256 du contenu signé : ', h('span', { class: 'mono' }, c.empreinte)));

      // Suivi en direct tant que la causerie est ouverte.
      if (ouverte) {
        minuterie = setTimeout(function rafraichir() {
          if (location.hash !== '#/c/' + id) return;
          if (document.hidden || !confirmerSuppr.hidden) minuterie = setTimeout(rafraichir, 15000);
          else fiche(id);
        }, 15000);
      }
    }, erreurPage);
  }

  function cle(nom) {
    return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* ---------------------------------------------------------------- */
  /* Feuille d'émargement imprimable                                   */
  /* ---------------------------------------------------------------- */

  function feuille(id) {
    CS.api('GET', '/api/causeries/' + id).then(function (c) {
      var ct = c.contenu;
      var signes = new Set(c.emargements.map(function (e) { return cle(e.nom); }));
      var restants = c.participantsPrevus.filter(function (n) { return !signes.has(cle(n)); });
      afficher(
        h('div', { class: 'ligne noprint' },
          h('button', { type: 'button', class: 'btn primaire', onclick: function () { window.print(); } }, 'Imprimer ou enregistrer en PDF'),
          h('a', { class: 'btn ghost', href: '#/c/' + id }, 'Retour')),
        h('article', { class: 'feuille' },
          h('div', { class: 'entete' },
            h('div', { class: 'pile' },
              h('span', { class: 'label' }, 'Feuille d’émargement — causerie sécurité'),
              h('h1', null, ct.theme),
              h('p', null, CS.jourLong(ct.date) + (ct.site ? ' · ' + ct.site : '') + ' · animée par ' + ct.animateur +
                           (ct.duree ? ' · ' + ct.duree + ' min' : ''))),
            h('img', { src: '/static/icone.svg', alt: '', style: 'width:52px' })),
          ct.objectif ? h('p', null, h('b', null, 'Objectif : '), ct.objectif) : null,
          ct.pointsCles.length ? h('div', null, h('b', null, 'Points clés transmis'),
            h('ul', null, ct.pointsCles.map(function (p) { return h('li', null, p); }))) : null,
          h('table', null,
            h('thead', null, h('tr', null, ['Nom', 'Entreprise', 'Signé le', 'Quiz', 'Signature', 'Sceau'].map(function (t) { return h('th', null, t); }))),
            h('tbody', null,
              c.emargements.map(function (e) {
                return h('tr', null, h('td', null, e.nom), h('td', null, e.entreprise),
                  h('td', { class: 'tab' }, CS.horodatage(e.signeLe)),
                  h('td', { class: 'tab' }, e.quiz.total ? e.quiz.score + '/' + e.quiz.total : ''),
                  h('td', null, h('img', { class: 'sig', src: e.signature, alt: 'Signature' })),
                  h('td', { class: 'mono' }, e.hash.slice(0, 12)));
              }),
              restants.map(function (n) {
                return h('tr', null, h('td', null, n), h('td'), h('td', { class: 'muted' }, 'Non signé'), h('td'), h('td', { style: 'height:56px' }), h('td'));
              }))),
          h('p', { class: 'small' }, c.emargements.length + ' signature(s) électronique(s) recueillie(s) à distance. ' +
            'Chaque émargement est horodaté par le serveur et scellé (SHA-256) avec l’empreinte du contenu présenté et le sceau de l’émargement précédent. ' +
            'État de la chaîne au ' + CS.horodatage(new Date().toISOString()) + ' : ' + (c.integrite.ok ? 'intègre.' : 'ALTÉRÉE à la ligne ' + (c.integrite.rompuA + 1) + '.')),
          h('p', { class: 'mono' }, 'Empreinte du contenu : ' + c.empreinte)));
    }, erreurPage);
  }

  /* ---------------------------------------------------------------- */
  /* Routeur                                                           */
  /* ---------------------------------------------------------------- */

  function router() {
    clearTimeout(minuterie);
    CS.api('GET', '/api/session').then(function (s) {
      if (!s.connecte) return connexion();
      nav.hidden = false;
      var r = (location.hash || '#/').slice(2).split('/');
      if (r[0] === 'nouvelle') return editeur(null);
      if (r[0] === 'modifier' && r[1]) return editeur(r[1]);
      if (r[0] === 'c' && r[1]) return fiche(r[1]);
      if (r[0] === 'feuille' && r[1]) return feuille(r[1]);
      liste();
    }, erreurPage);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', router);
  router();
})();
