/* Page de l'agent : lire la causerie, répondre au quiz, signer. */
(function () {
  'use strict';
  var h = CS.h;
  var app = document.getElementById('app');
  var token = decodeURIComponent(location.pathname.split('/')[2] || '');
  var BROUILLON = 'cs-nom-' + token;

  function lireLocal(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function ecrireLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }

  /* ---------------------------------------------------------------- */
  /* Pavé de signature                                                 */
  /* ---------------------------------------------------------------- */

  function padSignature(surChangement) {
    var canvas = h('canvas', { 'aria-label': 'Zone de signature : signez avec le doigt ou la souris' });
    var boite = h('div', { class: 'pad' }, canvas, h('div', { class: 'trait' }),
                  h('div', { class: 'aide' }, 'Signez ici avec le doigt'));
    var ctx, ratio, longueur = 0, dernier = null, actif = null;

    function dimensionner() {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      var ancien = longueur ? canvas.toDataURL('image/png') : null;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * ratio);
      canvas.height = Math.round(r.height * ratio);
      ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#101a3a'; ctx.lineWidth = 2.4;
      if (ancien) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, r.width, r.height); };
        img.src = ancien;
      }
    }
    function point(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    canvas.addEventListener('pointerdown', function (ev) {
      if (actif !== null) return;
      actif = ev.pointerId;
      canvas.setPointerCapture(ev.pointerId);
      dernier = point(ev);
      ctx.beginPath(); ctx.arc(dernier.x, dernier.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== actif) return;
      var evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      evs.forEach(function (e) {
        var p = point(e);
        ctx.beginPath(); ctx.moveTo(dernier.x, dernier.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        longueur += Math.hypot(p.x - dernier.x, p.y - dernier.y);
        dernier = p;
      });
      ev.preventDefault();
    });
    function fin(ev) {
      if (ev.pointerId !== actif) return;
      actif = null;
      surChangement();
    }
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    window.addEventListener('resize', function () {
      // Un changement d'orientation redimensionne le cadre : on garde le tracé.
      if (ctx && Math.round(canvas.getBoundingClientRect().width * ratio) !== canvas.width) dimensionner();
    });

    return {
      el: boite,
      monter: dimensionner,
      // Un trait trop court (un point, un tic) n'est pas une signature.
      valide: function () { return longueur > 60; },
      effacer: function () {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        longueur = 0;
        surChangement();
      },
      image: function () {
        // Fond blanc explicite : la signature reste lisible imprimée ou en mode sombre.
        var c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        var x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(canvas, 0, 0);
        return c.toDataURL('image/png');
      }
    };
  }

  /* ---------------------------------------------------------------- */
  /* Écrans                                                            */
  /* ---------------------------------------------------------------- */

  function message(titre, texte) {
    CS.vider(app).appendChild(h('div', { class: 'carte' }, h('h2', null, titre), h('p', { class: 'muted' }, texte)));
  }

  function rendre(d) {
    var c = d.contenu;
    var reponses = c.quiz.map(function () { return -1; });
    var etat = { lu: false };

    var entete = h('div', { class: 'carte ombre' },
      h('span', { class: 'label' }, CS.jourLong(c.date) + (c.site ? ' · ' + c.site : '')),
      h('h1', null, c.theme),
      h('p', { class: 'muted' }, 'Animée par ' + c.animateur + (c.duree ? ' · ' + c.duree + ' min' : '')),
      c.objectif ? h('p', null, c.objectif) : null);

    var corps = h('div', { class: 'carte' },
      h('span', { class: 'label' }, '1 · Lire'),
      h('div', { class: 'contenu-causerie' },
        c.sections.map(function (s) {
          return h('section', null, s.titre ? h('h3', null, s.titre) : null, h('p', null, s.texte));
        }),
        c.pointsCles.length ? h('section', null, h('h3', null, 'À retenir'),
          h('ul', { class: 'cles' }, c.pointsCles.map(function (p) { return h('li', null, p); }))) : null,
        c.lienSupport ? h('p', null, h('a', { href: c.lienSupport, target: '_blank', rel: 'noopener' }, 'Ouvrir le support complet (vidéo, document)')) : null));

    var quiz = null;
    if (c.quiz.length) {
      quiz = h('div', { class: 'carte' },
        h('span', { class: 'label' }, '2 · Vérifier'),
        h('p', { class: 'muted small' }, 'Quelques questions pour vérifier les messages clés. Les réponses sont corrigées après la signature.'),
        c.quiz.map(function (q, i) {
          return h('fieldset', { class: 'question' },
            h('legend', null, (i + 1) + '. ' + q.question),
            q.choix.map(function (txt, j) {
              return h('label', { class: 'choix', 'data-q': i, 'data-c': j },
                h('input', { type: 'radio', name: 'q' + i, value: String(j),
                             onchange: function () { reponses[i] = j; maj(); } }),
                h('span', null, txt));
            }));
        }));
    }

    var restants = d.restants || [];
    var champNom = h('input', { type: 'text', id: 'nom', autocomplete: 'name', required: true,
                                list: restants.length ? 'prevus' : null, value: lireLocal(BROUILLON),
                                placeholder: 'Prénom NOM', oninput: maj });
    var champEnt = h('input', { type: 'text', id: 'entreprise', autocomplete: 'organization',
                                placeholder: 'Facultatif (intérimaire, sous-traitant…)' });
    var caseLu = h('input', { type: 'checkbox', id: 'lu', onchange: function () { etat.lu = caseLu.checked; maj(); } });
    var pad = padSignature(maj);
    var bouton = h('button', { type: 'submit', class: 'btn primaire grand', disabled: true }, 'Signer la causerie');
    var zoneErreur = h('div', { class: 'alerte err', role: 'alert', hidden: true });
    var manque = h('p', { class: 'muted small', 'aria-live': 'polite' });

    var form = h('form', { class: 'carte ombre', novalidate: true, onsubmit: envoyer },
      h('span', { class: 'label' }, (c.quiz.length ? '3' : '2') + ' · Signer'),
      h('label', { class: 'champ' }, h('span', null, 'Nom et prénom'), champNom),
      restants.length ? h('datalist', { id: 'prevus' }, restants.map(function (n) { return h('option', { value: n }); })) : null,
      h('label', { class: 'champ' }, h('span', null, 'Entreprise'), champEnt),
      h('label', { class: 'coche', for: 'lu' }, caseLu,
        h('span', null, 'J’atteste avoir reçu et compris cette causerie sécurité et m’engage à appliquer les consignes.')),
      h('div', { class: 'pile' },
        h('div', { class: 'ligne entre' }, h('span', { class: 'label' }, 'Signature'),
          h('button', { type: 'button', class: 'btn ghost', onclick: function () { pad.effacer(); } }, 'Effacer')),
        pad.el),
      zoneErreur, manque, bouton,
      h('p', { class: 'muted small' }, 'En signant, la date, l’heure, votre adresse IP et une empreinte du texte ci-dessus sont enregistrées pour prouver votre participation.'));

    CS.vider(app);
    [entete, h('div', { class: 'etapes', 'aria-hidden': 'true' }, h('i'), h('i'), quiz ? h('i') : null),
     corps, quiz, form].forEach(function (x) { if (x) app.appendChild(x); });
    pad.monter();
    maj();

    function manquant() {
      var m = [];
      if (!champNom.value.trim()) m.push('votre nom');
      if (reponses.indexOf(-1) !== -1) m.push('les réponses au quiz');
      if (!etat.lu) m.push('la case d’attestation');
      if (!pad.valide()) m.push('votre signature');
      return m;
    }

    function maj() {
      var m = manquant();
      bouton.disabled = m.length > 0;
      manque.textContent = m.length ? 'Il reste : ' + m.join(', ') + '.' : '';
      var barres = app.querySelectorAll('.etapes i');
      barres[0].className = etat.lu ? 'fait' : '';
      if (quiz) barres[1].className = reponses.indexOf(-1) === -1 ? 'fait' : '';
      barres[barres.length - 1].className = !m.length ? 'fait' : '';
    }

    function envoyer(ev) {
      ev.preventDefault();
      if (manquant().length) return;
      bouton.disabled = true;
      bouton.textContent = 'Envoi…';
      zoneErreur.hidden = true;
      ecrireLocal(BROUILLON, champNom.value.trim());
      CS.api('POST', '/api/s/' + encodeURIComponent(token) + '/signer', {
        nom: champNom.value, entreprise: champEnt.value, lu: true,
        reponses: reponses, signature: pad.image(), empreinte: d.empreinte
      }).then(function (r) {
        recu(c, r);
      }, function (e) {
        zoneErreur.textContent = e.message;
        zoneErreur.hidden = false;
        bouton.textContent = 'Signer la causerie';
        maj();
      });
    }
  }

  function recu(c, r) {
    CS.vider(app);
    app.appendChild(h('div', { class: 'carte ombre recu' },
      h('div', { class: 'tampon' }),
      h('h1', null, 'Merci, c’est signé'),
      h('p', null, r.nom + ' — ' + CS.horodatage(r.signeLe)),
      r.quiz.total ? h('p', { class: 'muted' }, 'Quiz : ' + r.quiz.score + ' bonne' + (r.quiz.score > 1 ? 's' : '') +
                       ' réponse' + (r.quiz.score > 1 ? 's' : '') + ' sur ' + r.quiz.total) : null,
      h('p', { class: 'muted small' }, 'Référence de votre émargement :'),
      h('p', { class: 'mono' }, r.hash.slice(0, 16).replace(/(.{4})/g, '$1 ').trim())));
    // Coche dessinée en SVG (h() ne crée pas d'éléments SVG).
    app.querySelector('.tampon').innerHTML =
      '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    if (c.quiz.length) {
      app.appendChild(h('div', { class: 'carte' },
        h('h2', null, 'Correction'),
        c.quiz.map(function (q, i) {
          return h('div', { class: 'pile' }, h('p', null, h('b', null, (i + 1) + '. ' + q.question)),
            q.choix.map(function (txt, j) {
              var cls = j === r.corrige[i] ? 'choix juste' : (j === r.quiz.reponses[i] ? 'choix faux' : 'choix');
              return h('div', { class: cls }, txt + (j === r.corrige[i] ? ' ✓' : ''));
            }));
        })));
    }
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------- */

  CS.api('GET', '/api/s/' + encodeURIComponent(token)).then(function (d) {
    document.title = d.contenu.theme + ' — causerie sécurité';
    if (d.statut !== 'ouverte') {
      return message('Causerie clôturée', 'Les signatures pour « ' + d.contenu.theme + ' » ne sont plus acceptées. Rapprochez-vous de votre responsable si vous n’avez pas pu signer.');
    }
    rendre(d);
  }, function (e) {
    message('Lien indisponible', e.message);
  });
})();
