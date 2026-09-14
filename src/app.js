/* Ratio Masse Salariale — interface de pilotage. Le calcul vit dans calc.js. */
(function () {
  'use strict';
  var C = MSCalc;

  /* =================================================================== */
  /* Formats                                                             */
  /* =================================================================== */

  var nfEur = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nfEur0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var nfH = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                   'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JOURS_COURT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function eur(cent) { return nfEur.format((cent || 0) / 100) + ' €'; }
  function eur0(cent) { return nfEur0.format(Math.round((cent || 0) / 100)) + ' €'; }
  function eurSigne(cent) { return (cent > 0 ? '+' : '') + eur0(cent); }
  function pct(bp) { return bp == null ? '—' : nfEur.format(bp / 100) + ' %'; }
  function pts(bp) { return (bp > 0 ? '+' : '') + nfEur.format(bp / 100) + ' pt'; }
  function heures(cent) { return nfH.format((cent || 0) / 100) + ' h'; }
  function libMois(m) { return MOIS_LONG[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }
  function libJour(d) {
    return JOURS_COURT[C.indexJour(d)] + ' ' + d.slice(8, 10);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Accepte 7,5 — 7.5 — 7:30 — 7h30 — 7h. Renvoie des centièmes d'heure. */
  function parseHeures(v) {
    if (v == null) return 0;
    var s = String(v).trim().replace(',', '.').toLowerCase();
    if (!s) return 0;
    var m = s.match(/^(\d+)\s*[:h]\s*(\d{1,2})?$/);
    if (m) return Math.round((+m[1] + (m[2] ? +m[2] / 60 : 0)) * 100);
    var f = parseFloat(s);
    return isFinite(f) && f >= 0 ? Math.round(f * 100) : 0;
  }
  /** Euros saisis -> centimes. */
  function parseEuros(v) {
    var f = parseFloat(String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.'));
    return isFinite(f) ? Math.round(f * 100) : 0;
  }
  /** Pourcentage saisi -> points de base. */
  function parsePct(v) {
    var f = parseFloat(String(v == null ? '' : v).trim().replace(',', '.'));
    return isFinite(f) ? Math.round(f * 100) : 0;
  }
  function uid(p) {
    return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* =================================================================== */
  /* État                                                                */
  /* =================================================================== */

  var AUJ = new Date().toISOString().slice(0, 10);
  var S = {
    mois: AUJ.slice(0, 7),
    vue: 'pilotage',
    sites: [], agents: [], reglages: {},
    pointages: {}, travaux: {},
    siteActif: null, dateActive: AUJ, siteParam: null,
    demo: false, dispo: 'local'
  };

  /* =================================================================== */
  /* Stockage — db partagé si disponible, sinon navigateur                */
  /* =================================================================== */

  var Store = {
    db: null,
    CLE: 'msra.v1',

    async init() {
      try { this.db = await claude.use('db'); } catch (e) { this.db = null; }
      S.dispo = this.db ? 'partage' : 'local';
    },
    _local() {
      try { return JSON.parse(localStorage.getItem(this.CLE) || '{}'); }
      catch (e) { return {}; }
    },
    _ecrireLocal(d) {
      try { localStorage.setItem(this.CLE, JSON.stringify(d)); } catch (e) { /* quota / mode privé */ }
    },
    async liste(coll) {
      if (this.db) {
        var snap = await this.db.collection(coll).get();
        return snap.docs.map(function (d) {
          return Object.assign({ id: d.id }, d.data());
        });
      }
      var d = this._local();
      return Object.values(d[coll] || {});
    },
    async lire(coll, id) {
      if (this.db) {
        var s = await this.db.doc(coll + '/' + id).get();
        return s.exists ? Object.assign({ id: id }, s.data()) : null;
      }
      return (this._local()[coll] || {})[id] || null;
    },
    async ecrire(coll, id, doc) {
      var corps = Object.assign({}, doc);
      delete corps.id;
      if (this.db) { await this.db.doc(coll + '/' + id).set(corps); return; }
      var d = this._local();
      (d[coll] = d[coll] || {})[id] = Object.assign({ id: id }, corps);
      this._ecrireLocal(d);
    },
    async supprimer(coll, id) {
      if (this.db) { await this.db.doc(coll + '/' + id).delete(); return; }
      var d = this._local();
      if (d[coll]) delete d[coll][id];
      this._ecrireLocal(d);
    },
    async vider() {
      if (this.db) {
        for (var coll of ['sites', 'agents', 'pointages', 'travaux', 'reglages']) {
          var docs = await this.db.collection(coll).get();
          for (var doc of docs.docs) await this.db.doc(coll + '/' + doc.id).delete();
        }
        return;
      }
      this._ecrireLocal({});
    }
  };

  /* =================================================================== */
  /* Chargement                                                          */
  /* =================================================================== */

  function cleMois(siteId, mois) { return siteId + '__' + mois; }

  async function charger() {
    var res = await Promise.all([Store.liste('sites'), Store.liste('agents'),
                                 Store.lire('reglages', 'global')]);
    S.sites = res[0].sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
    S.agents = res[1].sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
    S.reglages = res[2] || Object.assign({}, C.PARAMS_DEFAUT);
    S.demo = !!(S.reglages && S.reglages.demo);
    await chargerMois();
  }

  async function chargerMois() {
    S.pointages = {}; S.travaux = {};
    await Promise.all(S.sites.map(async function (s) {
      var k = cleMois(s.id, S.mois);
      var res = await Promise.all([Store.lire('pointages', k), Store.lire('travaux', k)]);
      if (res[0]) S.pointages[k] = res[0];
      if (res[1]) S.travaux[k] = res[1];
    }));
  }

  /** Mise à plat pour le moteur de calcul. */
  function jeu() {
    var pointages = [];
    Object.keys(S.pointages).forEach(function (k) {
      var d = S.pointages[k];
      Object.keys(d.jours || {}).forEach(function (date) {
        pointages.push({ siteId: d.siteId, date: date, lignes: d.jours[date] });
      });
    });
    var travaux = [];
    Object.keys(S.travaux).forEach(function (k) {
      var d = S.travaux[k];
      (d.items || []).forEach(function (t) {
        travaux.push({ id: t.id, siteId: d.siteId, date: t.date, libelle: t.libelle, montant: t.montant });
      });
    });
    return {
      sites: S.sites, agents: S.agents, pointages: pointages, travaux: travaux,
      mois: S.mois, aujourdhui: AUJ, global: S.reglages
    };
  }

  function agentsDuSite(siteId) {
    return S.agents.filter(function (a) { return a.siteId === siteId && a.actif !== false; });
  }
  function siteParId(id) {
    return S.sites.filter(function (s) { return s.id === id; })[0] || null;
  }

  /** Vert / ambre / rouge selon l'écart au ratio cible. */
  function severite(ratio, objectif) {
    if (ratio == null || !objectif) return 'none';
    var d = ratio - objectif;
    if (d <= 0) return 'good';
    if (d <= 200) return 'warn';
    return 'crit';
  }
  function couleurSev(sev) {
    return sev === 'good' ? 'var(--good)' : sev === 'warn' ? 'var(--warn)'
      : sev === 'crit' ? 'var(--crit)' : 'var(--line-strong)';
  }

  /* =================================================================== */
  /* Vue : Pilotage                                                      */
  /* =================================================================== */

  function vuePilotage() {
    var j = jeu();
    var R = C.calculerMois(j);
    var k = R.consolide;
    var sev = severite(k.ratioProjete, k.objectif);
    var saisi = j.pointages.length > 0;

    var h = '';

    /* --- Bandeau consolidé --- */
    h += '<section class="hero">';
    h += '<div class="hero-main">';
    h += '<div class="lbl">Ratio projeté fin de mois — consolidé</div>';
    h += '<div class="hero-ratio"><div class="v">' +
      (k.ratioProjete == null ? '—' : nfEur.format(k.ratioProjete / 100)) + '</div>' +
      '<div class="u">%</div>';
    if (k.ratioProjete != null && k.objectif) {
      h += '<div class="delta ' + sev + '">' + pts(k.ratioProjete - k.objectif) +
        ' / objectif ' + pct(k.objectif) + '</div>';
    }
    h += '</div>';

    if (k.objectif && k.ratioProjete != null) {
      var ech = Math.max(k.objectif, k.ratioProjete) * 1.25 || 10000;
      h += '<div class="gauge"><div class="gauge-track">' +
        '<div class="gauge-fill" style="width:' + Math.min(100, (k.ratioProjete / ech) * 100).toFixed(1) +
        '%;background:' + couleurSev(sev) + '"></div>' +
        '<div class="gauge-mark" style="left:' + Math.min(100, (k.objectif / ech) * 100).toFixed(1) + '%"></div>' +
        '</div><div class="gauge-legend"><span>0 %</span>' +
        '<span>cible ' + pct(k.objectif) + '</span><span>' + pct(Math.round(ech)) + '</span></div></div>';
    }
    h += '<div class="hint" style="margin-top:14px">Projection = réalisé extrapolé sur les jours ' +
      'd\'exploitation restants. Elle ne bouge que si la saisie avance.</div>';
    h += '</div>';

    h += '<div class="hero-side">' +
      stat('Masse salariale réalisée', eur0(k.msTotal), 'chargée, primes comprises') +
      stat('CA acquis à date', eur0(k.caAcquis), 'forfait au prorata + travaux') +
      stat('Heures pointées', nfEur0.format(k.heures / 100) + ' h', 'tous sites') +
      stat('Écart projeté / cible', eurSigne(k.ecartEuros),
           k.ecartEuros > 0 ? 'à rattraper' : 'de marge') +
      '</div></section>';

    if (!saisi) {
      h += '<div class="panel"><div class="empty">Aucune heure pointée sur ' + libMois(S.mois) +
        '. Va dans <strong>Pointage</strong> pour saisir une vacation — le ratio se met à jour à la volée.</div></div>';
    }

    /* --- Sites --- */
    h += '<section class="panel"><header><h2>Sites</h2>' +
      '<span class="hint">Ratio socle = MS contrat / forfait acquis. Global = tout compris.</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn mini" data-act="export">Exporter en CSV</button></header>';
    if (!S.sites.length) {
      h += '<div class="empty">Aucun site. Ajoute-les dans <strong>Effectif</strong>.</div>';
    } else {
      h += '<div class="scroll"><table><thead><tr>' +
        '<th class="stripe"></th><th>Site</th><th class="r">Ratio socle</th>' +
        '<th class="r">Ratio global</th><th class="r">Projeté</th><th class="r">Objectif</th>' +
        '<th class="r">Écart €</th><th class="r">MS réalisée</th><th class="r">Heures</th>' +
        '</tr></thead><tbody>';
      R.sites.forEach(function (r) {
        var sv = severite(r.ratioProjete, r.objectif);
        h += '<tr><td class="stripe ' + sv + '"><div></div></td>' +
          '<td><div class="site-nom">' + esc(r.site.nom) + '</div>' +
          '<div class="site-meta">' + r.jours.ecoules + ' / ' + r.jours.total +
          ' jours d\'exploitation saisis</div></td>' +
          '<td class="r num">' + pct(r.ratioSocle) + '</td>' +
          '<td class="r num">' + pct(r.ratioGlobal) + '</td>' +
          '<td class="r num"><span class="pill ' + sv + '">' + pct(r.ratioProjete) + '</span></td>' +
          '<td class="r num">' + pct(r.objectif) + '</td>' +
          '<td class="r num">' + (r.ca.mois ? eurSigne(r.ecartEuros) : '—') + '</td>' +
          '<td class="r num">' + eur0(r.ms.total) + '</td>' +
          '<td class="r num">' + nfEur0.format(r.heures / 100) + ' h</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</section>';

    /* --- Courbe --- */
    if (saisi) {
      h += '<section class="panel"><header><h2>Ratio cumulé, jour après jour</h2>' +
        '<span class="hint">Un mois se perd en début de mois : c\'est la pente qui alerte, pas le chiffre final.</span>' +
        '</header><div class="panel-body"><div class="chart-wrap" id="chart"></div></div></section>';
    }

    /* --- Décomposition --- */
    if (saisi) {
      var t = R.sites.reduce(function (a, r) {
        Object.keys(r.detail.total).forEach(function (kk) { a[kk] = (a[kk] || 0) + r.detail.total[kk]; });
        return a;
      }, {});
      var postes = [
        ['Salaire de base', t.base],
        ['Majorations nuit / dimanche / férié', t.majorations],
        ['Majorations heures supplémentaires', t.majHS],
        ['Indemnité de précarité (CDD)', t.precarite],
        ['Congés payés / ICCP', t.iccp],
        ['Charges patronales', t.charges],
        ['Primes (panier, habillage, transport)', t.primes]
      ];
      h += '<section class="panel"><header><h2>Où part l\'euro de masse salariale</h2>' +
        '<span class="hint">' + nfEur0.format(t.vacations) + ' vacations sur le mois</span></header>' +
        '<div class="scroll"><table><thead><tr><th>Poste</th><th class="r">Montant</th>' +
        '<th class="r">Part</th><th class="r">Points de ratio</th></tr></thead><tbody>';
      postes.forEach(function (p) {
        if (!p[1]) return;
        h += '<tr><td>' + p[0] + '</td><td class="r num">' + eur(p[1]) + '</td>' +
          '<td class="r num">' + (t.total ? nfEur.format((p[1] / t.total) * 100) + ' %' : '—') + '</td>' +
          '<td class="r num">' + (k.caAcquis ? nfEur.format((p[1] / k.caAcquis) * 100) + ' pt' : '—') + '</td></tr>';
      });
      h += '<tr><td style="font-weight:600">Coût employeur total</td>' +
        '<td class="r num" style="font-weight:600">' + eur(t.total) + '</td>' +
        '<td class="r num">100,00 %</td><td class="r num">' +
        (k.caAcquis ? nfEur.format((t.total / k.caAcquis) * 100) + ' pt' : '—') + '</td></tr>';
      h += '</tbody></table></div></section>';
    }

    return { html: h, apres: function () { if (saisi) dessinerCourbe(j, R); } };
  }

  function stat(nom, valeur, note) {
    return '<div class="stat"><div class="lbl">' + nom + '</div>' +
      '<div class="v">' + valeur + '</div><div class="n">' + note + '</div></div>';
  }

  /* =================================================================== */
  /* Graphique : ratio cumulé                                            */
  /* =================================================================== */

  var SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];

  /** Un seul passage par jour : on recalcule le mois tronqué, pas site par site. */
  function construireCourbes(j) {
    var jours = C.joursDuMois(j.mois).filter(function (d) { return d <= AUJ; });
    var parSite = {}, cons = [];
    j.sites.forEach(function (s) { parSite[s.id] = []; });
    jours.forEach(function (d) {
      var sous = Object.assign({}, j, {
        pointages: j.pointages.filter(function (p) { return p.date <= d; }),
        aujourdhui: d
      });
      var r = C.calculerMois(sous);
      r.sites.forEach(function (rs) {
        if (rs.ms.total > 0 && rs.ratioGlobal != null) parSite[rs.site.id].push({ date: d, ratio: rs.ratioGlobal });
      });
      if (r.consolide.msTotal > 0 && r.consolide.ratio != null) cons.push({ date: d, ratio: r.consolide.ratio });
    });
    return { parSite: parSite, cons: cons, jours: jours };
  }

  function dessinerCourbe(j, R) {
    var hote = document.getElementById('chart');
    if (!hote) return;
    var cb = construireCourbes(j);
    var jours = C.joursDuMois(j.mois);
    var nb = jours.length;

    // Séries tracées : les sites qui ont des points, dans l'ordre du tableau.
    var series = j.sites
      .filter(function (s) { return cb.parSite[s.id].length > 0; })
      .slice(0, SERIES.length)
      .map(function (s, i) {
        return { id: s.id, nom: s.nom, couleur: 'var(' + SERIES[i] + ')', pts: cb.parSite[s.id] };
      });
    if (!series.length) { hote.innerHTML = '<div class="empty">Pas encore assez de points.</div>'; return; }

    var objectif = R.consolide.objectif;
    var toutes = series.reduce(function (a, s) {
      return a.concat(s.pts.map(function (p) { return p.ratio; }));
    }, objectif ? [objectif] : []);
    var lo = Math.min.apply(null, toutes), hi = Math.max.apply(null, toutes);
    var marge = Math.max(300, (hi - lo) * 0.18);
    lo = Math.max(0, lo - marge); hi = hi + marge;
    var ticks = jolisTicks(lo, hi, 4);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);

    var W = 860, H = 300, PL = 52, PR = 118, PT = 14, PB = 30;
    var iw = W - PL - PR, ih = H - PT - PB;
    var X = function (d) { return PL + (iw * (+d.slice(8, 10) - 1)) / Math.max(1, nb - 1); };
    var Y = function (bp) { return PT + ih - (ih * (bp - lo)) / (hi - lo || 1); };

    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Évolution du ratio de masse salariale cumulé, par site">';

    ticks.forEach(function (bp) {
      var y = Y(bp).toFixed(1);
      svg += '<line x1="' + PL + '" y1="' + y + '" x2="' + (PL + iw) + '" y2="' + y +
        '" stroke="var(--line)" stroke-width="1" fill="none"/>' +
        '<text x="' + (PL - 9) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle" ' +
        'fill="var(--ink-3)" font-size="11" font-family="IBM Plex Mono, monospace">' +
        nfEur0.format(bp / 100) + ' %</text>';
    });

    // Axe des jours : un repère par semaine, plus le dernier jour.
    jours.forEach(function (d, i) {
      if (C.indexJour(d) !== 0 && i !== nb - 1) return;
      svg += '<text x="' + X(d).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" ' +
        'fill="var(--ink-3)" font-size="11" font-family="IBM Plex Mono, monospace">' +
        d.slice(8, 10) + '</text>';
    });

    if (objectif) {
      svg += '<line x1="' + PL + '" y1="' + Y(objectif).toFixed(1) + '" x2="' + (PL + iw) +
        '" y2="' + Y(objectif).toFixed(1) + '" stroke="var(--ink-2)" stroke-width="1.5" ' +
        'stroke-dasharray="5 4" fill="none"/>' +
        '<text x="' + (PL + iw + 8) + '" y="' + Y(objectif).toFixed(1) + '" dominant-baseline="middle" ' +
        'fill="var(--ink-2)" font-size="11" font-weight="600">Objectif ' + pct(objectif) + '</text>';
    }

    series.forEach(function (s) {
      var d = s.pts.map(function (p, i) {
        return (i ? 'L' : 'M') + X(p.date).toFixed(1) + ' ' + Y(p.ratio).toFixed(1);
      }).join(' ');
      svg += '<path d="' + d + '" fill="none" stroke="' + s.couleur + '" stroke-width="2" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>';
      var fin = s.pts[s.pts.length - 1];
      svg += '<circle cx="' + X(fin.date).toFixed(1) + '" cy="' + Y(fin.ratio).toFixed(1) +
        '" r="4" fill="' + s.couleur + '" stroke="var(--surface)" stroke-width="2"/>';
    });

    // Étiquettes directes en bout de ligne, désempilées pour ne pas se chevaucher.
    var fins = series.map(function (s) {
      var f = s.pts[s.pts.length - 1];
      return { s: s, x: X(f.date), y: Y(f.ratio), ratio: f.ratio };
    }).sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < fins.length; i++) {
      if (fins[i].y - fins[i - 1].y < 15) fins[i].y = fins[i - 1].y + 15;
    }
    fins.forEach(function (f) {
      var lx = Math.min(f.x + 10, PL + iw + 8);
      svg += '<text x="' + lx.toFixed(1) + '" y="' + f.y.toFixed(1) + '" dominant-baseline="middle" ' +
        'fill="var(--ink)" font-size="11" font-weight="600">' + esc(tronquer(f.s.nom, 13)) +
        ' <tspan fill="var(--ink-2)" font-family="IBM Plex Mono, monospace">' +
        nfEur.format(f.ratio / 100) + ' %</tspan></text>';
    });

    svg += '<line id="crosshair" y1="' + PT + '" y2="' + (PT + ih) + '" stroke="var(--line-strong)" ' +
      'stroke-width="1" style="display:none" fill="none"/>';
    svg += '<rect id="hit" x="' + PL + '" y="' + PT + '" width="' + iw + '" height="' + ih +
      '" fill="transparent" style="cursor:crosshair"/>';
    svg += '</svg>';

    var legende = '<div class="legend">' + series.map(function (s) {
      return '<span><i class="dot" style="background:' + s.couleur + '"></i>' + esc(s.nom) + '</span>';
    }).join('') + (objectif ? '<span><i class="dot" style="background:var(--ink-2)"></i>Objectif pondéré</span>' : '') +
      '</div>';

    hote.innerHTML = svg + legende + '<div class="tip" id="tip" hidden></div>';
    brancherSurvol(hote, series, jours, X, Y, PL, iw, PT, ih);
  }

  function tronquer(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /** Graduations sur des valeurs rondes : un axe se lit, il ne se déchiffre pas. */
  function jolisTicks(lo, hi, n) {
    var brut = (hi - lo) / Math.max(1, n);
    var mag = Math.pow(10, Math.floor(Math.log10(brut || 1)));
    var pas = mag;
    [1, 2, 2.5, 5, 10].some(function (m) {
      if (m * mag >= brut) { pas = m * mag; return true; }
      return false;
    });
    var out = [];
    for (var v = Math.floor(lo / pas) * pas; v <= hi + pas / 2; v += pas) out.push(Math.round(v));
    return out.length > 1 ? out : [Math.round(lo), Math.round(hi)];
  }

  function brancherSurvol(hote, series, jours, X, Y, PL, iw, PT, ih) {
    var svg = hote.querySelector('svg');
    var hit = hote.querySelector('#hit');
    var cross = hote.querySelector('#crosshair');
    var tip = hote.querySelector('#tip');
    if (!hit) return;

    function quitter() { cross.style.display = 'none'; tip.hidden = true; }

    hit.addEventListener('mouseleave', quitter);
    hit.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var ech = box.width / svg.viewBox.baseVal.width;
      var xv = (ev.clientX - box.left) / ech;
      var idx = Math.round(((xv - PL) / iw) * (jours.length - 1));
      idx = Math.max(0, Math.min(jours.length - 1, idx));
      var date = jours[idx];

      var lignes = series.map(function (s) {
        var p = null;
        for (var i = 0; i < s.pts.length; i++) { if (s.pts[i].date <= date) p = s.pts[i]; }
        return p ? { nom: s.nom, couleur: s.couleur, ratio: p.ratio } : null;
      }).filter(Boolean);
      if (!lignes.length) { quitter(); return; }

      cross.setAttribute('x1', X(date).toFixed(1));
      cross.setAttribute('x2', X(date).toFixed(1));
      cross.style.display = '';

      tip.innerHTML = '<div class="d">' + libJour(date) + ' ' + libMois(date.slice(0, 7)) + '</div>' +
        lignes.map(function (l) {
          return '<div class="l"><span><i class="dot" style="background:' + l.couleur + '"></i>' +
            esc(tronquer(l.nom, 18)) + '</span><span class="num">' + pct(l.ratio) + '</span></div>';
        }).join('');
      tip.hidden = false;
      var tw = tip.offsetWidth;
      var px = X(date) * ech;
      tip.style.left = Math.max(0, Math.min(box.width - tw, px - tw / 2)) + 'px';
      tip.style.top = '6px';
    });
  }

  /* =================================================================== */
  /* Vue : Pointage                                                      */
  /* =================================================================== */

  function vuePointage() {
    if (!S.sites.length) {
      return { html: '<div class="panel"><div class="empty">Crée d\'abord un site dans <strong>Effectif</strong>.</div></div>' };
    }
    if (!S.siteActif || !siteParId(S.siteActif)) S.siteActif = S.sites[0].id;
    var site = siteParId(S.siteActif);
    var jours = C.joursDuMois(S.mois);
    if (S.dateActive.slice(0, 7) !== S.mois) {
      S.dateActive = AUJ.slice(0, 7) === S.mois ? AUJ : jours[0];
    }
    var feries = C.feriesFrance(+S.mois.slice(0, 4));
    var doc = S.pointages[cleMois(site.id, S.mois)];
    var jrs = (doc && doc.jours) || {};
    var lignes = jrs[S.dateActive] || [];
    var parAgent = {};
    lignes.forEach(function (l) { (parAgent[l.agentId] = parAgent[l.agentId] || []).push(l); });

    var h = '';
    h += '<section class="panel"><header><h2>Pointage</h2>' +
      '<select id="sel-site">' + S.sites.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === site.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>';
      }).join('') + '</select>' +
      '<span class="spacer"></span>' +
      '<span class="hint">Heures acceptées en 7,5 — 7:30 — 7h30</span></header>';

    /* Bandeau des jours du mois */
    h += '<div class="panel-body" style="padding-bottom:0"><div class="scroll">' +
      '<div class="row" style="gap:3px;flex-wrap:nowrap;padding-bottom:10px">';
    jours.forEach(function (d) {
      var actif = jrs[d] && jrs[d].length;
      var sel = d === S.dateActive;
      var ferie = feries[d];
      var dim = C.indexJour(d) === 6;
      var pattern = site.pattern || [1, 1, 1, 1, 1, 1, 0];
      var ouvre = pattern[C.indexJour(d)];
      h += '<button type="button" class="btn mini" data-act="jour" data-date="' + d + '" ' +
        'title="' + (ferie ? esc(ferie) : '') + '" style="min-width:38px;flex:none;' +
        (sel ? 'background:var(--accent);border-color:var(--accent);color:#fff;' :
          actif ? 'background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,var(--line));' : '') +
        (!ouvre && !sel ? 'opacity:.45;' : '') + '">' +
        '<span style="display:block;font-size:9.5px;' +
        (sel ? '' : ferie ? 'color:var(--crit);font-weight:700;' : dim ? 'color:var(--accent);' : 'color:var(--ink-3);') +
        '">' + JOURS_COURT[C.indexJour(d)] + '</span>' +
        '<span class="num" style="font-size:12px">' + d.slice(8, 10) + '</span></button>';
    });
    h += '</div></div></div>';

    var ferieDuJour = feries[S.dateActive];
    h += '<div class="panel-body" style="padding-top:4px">';
    h += '<div class="row" style="margin-bottom:12px">' +
      '<strong class="display" style="font-size:15px">' + libJour(S.dateActive) + ' ' + libMois(S.mois) + '</strong>' +
      (ferieDuJour ? '<span class="pill crit">Férié — ' + esc(ferieDuJour) + '</span>' : '') +
      (C.indexJour(S.dateActive) === 6 ? '<span class="pill cdd">Dimanche</span>' : '') +
      '</div>';

    var eq = agentsDuSite(site.id);
    if (!eq.length) {
      h += '<div class="empty">Aucun agent affecté à ce site. Ajoute l\'effectif dans <strong>Effectif</strong>.</div>';
    } else {
      h += '<div class="scroll"><table><thead><tr><th>Agent</th><th>Contrat</th>' +
        '<th class="r">Taux</th><th class="r">Jour</th><th class="r">Nuit</th>' +
        '<th class="r">Dimanche</th><th class="r">Férié</th><th>Nature</th><th class="r">Coût</th>' +
        '</tr></thead><tbody>';
      var P = C.paramsSite(site, S.reglages);
      eq.forEach(function (a) {
        var l = (parAgent[a.id] || [])[0] || { hJour: 0, hNuit: 0, hDim: 0, hFerie: 0, nature: 'contrat' };
        var bloc = Object.assign(C.blocVide(), {
          hJour: l.hJour || 0, hNuit: l.hNuit || 0, hDim: l.hDim || 0, hFerie: l.hFerie || 0,
          vacations: (l.hJour || l.hNuit || l.hDim || l.hFerie) ? 1 : 0
        });
        var cout = C.coutBloc(bloc, a.taux, P, a.contrat);
        h += '<tr><td class="site-nom">' + esc(a.nom) + '</td>' +
          '<td><span class="pill ' + (a.contrat === 'CDD' ? 'cdd' : 'cdi') + '">' + a.contrat + '</span></td>' +
          '<td class="r num">' + nfEur.format(a.taux / 100) + '</td>' +
          champH(a.id, 'hJour', l.hJour) + champH(a.id, 'hNuit', l.hNuit) +
          champH(a.id, 'hDim', l.hDim) + champH(a.id, 'hFerie', l.hFerie) +
          '<td><select data-pt-nature="' + a.id + '">' +
          '<option value="contrat"' + (l.nature !== 'exceptionnel' ? ' selected' : '') + '>Contrat</option>' +
          '<option value="exceptionnel"' + (l.nature === 'exceptionnel' ? ' selected' : '') + '>Exceptionnel</option>' +
          '</select></td>' +
          '<td class="r num">' + (cout.total ? eur(cout.total) : '—') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      h += '<div class="row" style="margin-top:14px">' +
        '<button class="btn" data-act="copier-veille">Reprendre le dernier jour saisi</button>' +
        '<button class="btn" data-act="vider-jour">Effacer la journée</button>' +
        '<span class="hint">Le coût affiché est hors heures supplémentaires : elles se déclenchent au cumul de la semaine.</span>' +
        '</div>';
    }
    h += '</div></section>';

    /* Travaux exceptionnels */
    var tdoc = S.travaux[cleMois(site.id, S.mois)];
    var items = (tdoc && tdoc.items) || [];
    h += '<section class="panel"><header><h2>Travaux exceptionnels facturés — ' + esc(site.nom) + '</h2>' +
      '<span class="hint">Remises en état, nettoyages de crise, chantiers hors contrat</span></header>';
    h += '<div class="panel-body">';
    if (items.length) {
      h += '<div class="scroll"><table><thead><tr><th>Date</th><th>Libellé</th>' +
        '<th class="r">Montant facturé</th><th></th></tr></thead><tbody>';
      items.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (t) {
        h += '<tr><td class="num">' + libJour(t.date) + '</td><td>' + esc(t.libelle) + '</td>' +
          '<td class="r num">' + eur(t.montant) + '</td>' +
          '<td class="r"><button class="btn mini danger" data-act="del-travaux" data-id="' + t.id + '">Retirer</button></td></tr>';
      });
      h += '</tbody></table></div>';
    } else {
      h += '<div class="hint" style="margin-bottom:12px">Aucun travail exceptionnel ce mois-ci.</div>';
    }
    h += '<div class="row" style="margin-top:12px">' +
      '<label class="field"><span>Date</span><input type="date" id="tx-date" value="' + S.dateActive +
      '" min="' + S.mois + '-01" max="' + jours[jours.length - 1] + '"></label>' +
      '<label class="field" style="flex:1;min-width:180px"><span>Libellé</span>' +
      '<input type="text" id="tx-lib" placeholder="Remise en état ligne 3"></label>' +
      '<label class="field"><span>Montant facturé (€)</span><input type="text" id="tx-montant" class="num-in" placeholder="3 200,00"></label>' +
      '<button class="btn primary" data-act="add-travaux">Ajouter</button></div>';
    h += '</div></section>';

    return { html: h };
  }

  function champH(agentId, champ, val) {
    return '<td class="r"><input class="num-in' + (val ? ' filled' : '') + '" type="text" ' +
      'data-pt-agent="' + agentId + '" data-pt-champ="' + champ + '" ' +
      'value="' + (val ? nfH.format(val / 100) : '') + '" placeholder="—" ' +
      'aria-label="Heures" id="pt-' + agentId + '-' + champ + '"></td>';
  }

  /* =================================================================== */
  /* Vue : Effectif                                                      */
  /* =================================================================== */

  function vueEffectif() {
    var h = '';
    h += '<section class="panel"><header><h2>Sites</h2>' +
      '<span class="hint">Le forfait est acquis au prorata des jours d\'exploitation cochés</span></header>';
    h += '<div class="scroll"><table><thead><tr><th>Site</th><th class="r">Forfait mensuel</th>' +
      '<th class="r">Objectif de ratio</th><th>Jours d\'exploitation</th><th></th></tr></thead><tbody>';
    S.sites.forEach(function (s) {
      var pattern = s.pattern || [1, 1, 1, 1, 1, 1, 0];
      h += '<tr><td><input type="text" data-site="' + s.id + '" data-champ="nom" value="' + esc(s.nom) + '" style="min-width:150px"></td>' +
        '<td class="r"><input class="num-in" style="width:96px" type="text" data-site="' + s.id +
        '" data-champ="caForfait" value="' + nfEur.format(s.caForfait / 100) + '"></td>' +
        '<td class="r"><input class="num-in" style="width:64px" type="text" data-site="' + s.id +
        '" data-champ="objectifRatio" value="' + nfEur.format((s.objectifRatio || 0) / 100) + '"> %</td>' +
        '<td><div class="row" style="gap:2px">' + pattern.map(function (v, i) {
          return '<button type="button" class="btn mini" data-act="jour-expl" data-site="' + s.id +
            '" data-idx="' + i + '" style="width:26px;padding:3px 0;' +
            (v ? 'background:var(--accent);border-color:var(--accent);color:#fff' : 'color:var(--ink-3)') +
            '">' + JOURS_COURT[i] + '</button>';
        }).join('') + '</div></td>' +
        '<td class="r"><button class="btn mini danger" data-act="del-site" data-id="' + s.id + '">Supprimer</button></td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="panel-body"><div class="row">' +
      '<input type="text" id="ns-nom" placeholder="Nom du site" style="min-width:190px">' +
      '<input type="text" id="ns-ca" class="num-in" style="width:110px" placeholder="Forfait €">' +
      '<input type="text" id="ns-obj" class="num-in" style="width:72px" placeholder="Objectif %">' +
      '<button class="btn primary" data-act="add-site">Ajouter le site</button></div></div>';
    h += '</section>';

    h += '<section class="panel"><header><h2>Effectif</h2>' +
      '<span class="hint">Taux horaire brut. Les charges et majorations s\'appliquent par-dessus.</span></header>';
    if (!S.agents.length) {
      h += '<div class="empty">Aucun agent enregistré.</div>';
    } else {
      h += '<div class="scroll"><table><thead><tr><th>Agent</th><th>Site</th><th>Contrat</th>' +
        '<th class="r">Taux horaire brut</th><th></th></tr></thead><tbody>';
      S.agents.forEach(function (a) {
        h += '<tr><td><input type="text" data-agent="' + a.id + '" data-champ="nom" value="' + esc(a.nom) + '" style="min-width:140px"></td>' +
          '<td><select data-agent="' + a.id + '" data-champ="siteId">' + S.sites.map(function (s) {
            return '<option value="' + s.id + '"' + (s.id === a.siteId ? ' selected' : '') + '>' + esc(s.nom) + '</option>';
          }).join('') + '</select></td>' +
          '<td><select data-agent="' + a.id + '" data-champ="contrat">' +
          '<option value="CDI"' + (a.contrat === 'CDI' ? ' selected' : '') + '>CDI</option>' +
          '<option value="CDD"' + (a.contrat === 'CDD' ? ' selected' : '') + '>CDD</option></select></td>' +
          '<td class="r"><input class="num-in" type="text" data-agent="' + a.id + '" data-champ="taux" value="' +
          nfEur.format(a.taux / 100) + '"> €</td>' +
          '<td class="r"><button class="btn mini danger" data-act="del-agent" data-id="' + a.id + '">Supprimer</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '<div class="panel-body"><div class="row">' +
      '<input type="text" id="na-nom" placeholder="Nom de l\'agent" style="min-width:170px">' +
      '<select id="na-site">' + S.sites.map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.nom) + '</option>';
      }).join('') + '</select>' +
      '<select id="na-contrat"><option value="CDI">CDI</option><option value="CDD">CDD</option></select>' +
      '<input type="text" id="na-taux" class="num-in" placeholder="Taux €/h">' +
      '<button class="btn primary" data-act="add-agent">Ajouter l\'agent</button></div></div>';
    h += '</section>';
    return { html: h };
  }

  /* =================================================================== */
  /* Vue : Paramètres                                                    */
  /* =================================================================== */

  var CHAMPS_PARAMS = [
    ['tauxCharges', 'Charges patronales', '%', 'Taux moyen constaté sur le bulletin, allègements déduits.'],
    ['majNuit', 'Majoration de nuit', '%', ''],
    ['majDimanche', 'Majoration du dimanche', '%', ''],
    ['majFerie', 'Majoration jour férié', '%', ''],
    ['seuilHSsem', 'Seuil heures sup.', 'h/sem', 'Au-delà : majoration 25 %.'],
    ['seuilHS50sem', 'Seuil majoration 50 %', 'h/sem', ''],
    ['majHS25', 'Majoration 1re tranche', '%', ''],
    ['majHS50', 'Majoration 2e tranche', '%', ''],
    ['precariteCDD', 'Indemnité de précarité CDD', '%', 'Fin de contrat.'],
    ['iccpCDD', 'ICCP — congés payés CDD', '%', 'Calculée sur brut + précarité.'],
    ['provisionCPCDI', 'Provision congés payés CDI', '%', 'À 0 si déjà dans le taux de charges.'],
    ['primePanier', 'Prime de panier', '€/vacation', ''],
    ['primeHabillage', 'Prime d\'habillage', '€/vacation', ''],
    ['primeTransport', 'Indemnité de transport', '€/vacation', '']
  ];

  function champParam(cle, lib, unite, aide, valeur, placeholder) {
    var v = valeur == null ? '' :
      unite === '%' ? nfEur.format(valeur / 100) :
      unite === 'h/sem' ? nfH.format(valeur / 100) : nfEur.format(valeur / 100);
    return '<label class="field"><span>' + lib + ' (' + unite + ')</span>' +
      '<input type="text" class="num-in" style="width:100%;text-align:left" ' +
      'data-param="' + cle + '" value="' + v + '"' +
      (placeholder ? ' placeholder="' + placeholder + '"' : '') + '>' +
      (aide ? '<span class="hint">' + aide + '</span>' : '') + '</label>';
  }

  function vueParametres() {
    var h = '';
    h += '<section class="panel"><header><h2>Paramètres par défaut de l\'entreprise</h2></header>';
    h += '<div class="panel-body">';
    h += '<div class="banner" style="margin:0 0 18px">Ces taux ne sortent pas d\'une convention : ' +
      'ils servent d\'amorce. Remplace-les par ceux de ta CCN et de tes accords — c\'est eux qui font la précision du ratio.</div>';
    h += '<div class="grid-form">' + CHAMPS_PARAMS.map(function (c) {
      return champParam(c[0], c[1], c[2], c[3], S.reglages[c[0]] != null ? S.reglages[c[0]] : C.PARAMS_DEFAUT[c[0]]);
    }).join('') + '</div>';
    h += '<div class="row" style="margin-top:16px">' +
      '<label class="row" style="gap:7px"><input type="checkbox" id="p-iccpsur"' +
      (S.reglages.iccpSurPrecarite !== false ? ' checked' : '') + '> ICCP assise sur brut + précarité</label>' +
      '<label class="row" style="gap:7px"><input type="checkbox" id="p-primesoumis"' +
      (S.reglages.primesSoumises ? ' checked' : '') + '> Primes intégrées à l\'assiette de charges</label>' +
      '</div>';
    h += '</div></section>';

    if (S.sites.length) {
      if (!S.siteParam || !siteParId(S.siteParam)) S.siteParam = S.sites[0].id;
      var site = siteParId(S.siteParam);
      var p = site.params || {};
      h += '<section class="panel"><header><h2>Réglages propres à un site</h2>' +
        '<select id="sel-site-param">' + S.sites.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === site.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>';
        }).join('') + '</select>' +
        '<span class="hint">Laisse vide pour suivre la valeur d\'entreprise</span></header>';
      h += '<div class="panel-body"><div class="grid-form">' + CHAMPS_PARAMS.map(function (c) {
        var glob = S.reglages[c[0]] != null ? S.reglages[c[0]] : C.PARAMS_DEFAUT[c[0]];
        var ph = c[2] === '%' ? nfEur.format(glob / 100) : nfEur.format(glob / 100);
        return '<label class="field"><span>' + c[1] + ' (' + c[2] + ')</span>' +
          '<input type="text" class="num-in" style="width:100%;text-align:left" ' +
          'data-param-site="' + c[0] + '" value="' + (p[c[0]] != null ? nfEur.format(p[c[0]] / 100) : '') +
          '" placeholder="' + ph + '"></label>';
      }).join('') + '</div></div></section>';
    }

    h += '<section class="panel"><header><h2>Données</h2></header><div class="panel-body">' +
      '<div class="hint" style="margin-bottom:12px">' +
      (S.dispo === 'partage'
        ? 'Les données sont enregistrées côté serveur : tes chefs de secteur voient les mêmes chiffres, en direct.'
        : 'Les données sont enregistrées dans ce navigateur uniquement. Elles ne suivent pas sur un autre poste.') +
      '</div><div class="row">' +
      '<button class="btn" data-act="export">Exporter le mois en CSV</button>' +
      '<button class="btn danger" data-act="reset">Tout effacer</button></div></div></section>';

    return { html: h };
  }

  /* =================================================================== */
  /* Export CSV                                                          */
  /* =================================================================== */

  function csvMois() {
    var R = C.calculerMois(jeu());
    var sep = ';';
    var l = [];
    function ligne(cols) {
      l.push(cols.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(sep));
    }
    function n(cent) { return nfEur.format((cent || 0) / 100).replace(/ | |\s/g, ''); }

    ligne(['Ratio de masse salariale', libMois(S.mois)]);
    ligne(['Édité le', AUJ]);
    ligne([]);
    ligne(['Site', 'Heures', 'MS contrat', 'MS exceptionnel', 'MS totale', 'MS projetée',
           'CA forfait acquis', 'CA travaux', 'Ratio socle %', 'Ratio global %',
           'Ratio projeté %', 'Objectif %', 'Écart € projeté']);
    R.sites.forEach(function (r) {
      ligne([r.site.nom, nfH.format(r.heures / 100), n(r.ms.contrat), n(r.ms.exceptionnel),
             n(r.ms.total), n(r.ms.projetee), n(r.ca.forfaitAcquis), n(r.ca.exceptionnel),
             r.ratioSocle == null ? '' : n(r.ratioSocle), r.ratioGlobal == null ? '' : n(r.ratioGlobal),
             r.ratioProjete == null ? '' : n(r.ratioProjete), n(r.objectif), n(r.ecartEuros)]);
    });
    ligne([]);
    ligne(['CONSOLIDÉ', nfH.format(R.consolide.heures / 100), '', '', n(R.consolide.msTotal),
           n(R.consolide.msProjetee), n(R.consolide.caAcquis), '',
           '', R.consolide.ratio == null ? '' : n(R.consolide.ratio),
           R.consolide.ratioProjete == null ? '' : n(R.consolide.ratioProjete),
           n(R.consolide.objectif), n(R.consolide.ecartEuros)]);
    ligne([]);
    ligne(['Décomposition du coût — tous sites']);
    ligne(['Poste', 'Montant']);
    var t = R.sites.reduce(function (a, r) {
      Object.keys(r.detail.total).forEach(function (kk) { a[kk] = (a[kk] || 0) + r.detail.total[kk]; });
      return a;
    }, {});
    [['Salaire de base', t.base], ['Majorations nuit/dimanche/férié', t.majorations],
     ['Majorations heures supplémentaires', t.majHS], ['Précarité CDD', t.precarite],
     ['Congés payés / ICCP', t.iccp], ['Charges patronales', t.charges], ['Primes', t.primes],
     ['Coût employeur total', t.total]].forEach(function (p) { ligne([p[0], n(p[1])]); });

    // BOM : sans lui Excel en français casse les accents.
    return '﻿' + l.join('\r\n');
  }

  async function exporter() {
    var csv = csvMois();
    var nom = 'ratio-masse-salariale-' + S.mois + '.csv';
    var dl = null;
    try { dl = await claude.use('downloads'); } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: nom, data: csv }); toast('Export enregistré.'); return; }
      catch (e) {
        if (e && e.code === 'declined') return;
        // on retombe sur le presse-papier
      }
    }
    try {
      await navigator.clipboard.writeText(csv);
      toast('Export copié dans le presse-papier — colle-le dans un tableur.');
    } catch (e) {
      toast('Export impossible depuis cette vue.');
    }
  }

  var minuteur = null;
  function toast(msg) {
    var b = document.getElementById('banner');
    b.className = 'banner';
    b.style.background = 'var(--accent-soft)';
    b.style.color = 'var(--accent)';
    b.style.borderLeftColor = 'var(--accent)';
    b.textContent = msg;
    b.hidden = false;
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { rendreBanner(); }, 4000);
  }

  function rendreBanner() {
    var b = document.getElementById('banner');
    clearTimeout(minuteur);
    if (!S.demo) { b.hidden = true; return; }
    b.className = 'banner';
    b.style.background = ''; b.style.color = ''; b.style.borderLeftColor = '';
    b.innerHTML = '<span><strong>Données d\'exemple.</strong> Trois sites fictifs pour que tu voies ' +
      'l\'outil tourner. Rien ici ne vient de ton exploitation.</span>' +
      '<button class="btn" data-act="reset">Partir d\'une base vide</button>';
    b.hidden = false;
  }

  /* =================================================================== */
  /* Écritures                                                           */
  /* =================================================================== */

  async function majSite(id, patch) {
    var s = siteParId(id); if (!s) return;
    Object.assign(s, patch);
    await Store.ecrire('sites', id, s);
  }
  async function majAgent(id, patch) {
    var a = S.agents.filter(function (x) { return x.id === id; })[0]; if (!a) return;
    Object.assign(a, patch);
    await Store.ecrire('agents', id, a);
  }
  async function majReglages(patch) {
    Object.assign(S.reglages, patch);
    await Store.ecrire('reglages', 'global', S.reglages);
  }
  async function majPointage(siteId, date, agentId, patch) {
    var k = cleMois(siteId, S.mois);
    var doc = S.pointages[k] || { id: k, siteId: siteId, mois: S.mois, jours: {} };
    doc.jours = doc.jours || {};
    var lignes = doc.jours[date] || [];
    var l = lignes.filter(function (x) { return x.agentId === agentId; })[0];
    if (!l) { l = { agentId: agentId, hJour: 0, hNuit: 0, hDim: 0, hFerie: 0, nature: 'contrat' }; lignes.push(l); }
    Object.assign(l, patch);
    // On ne conserve que les lignes qui portent des heures : le document reste léger.
    lignes = lignes.filter(function (x) { return (x.hJour || 0) + (x.hNuit || 0) + (x.hDim || 0) + (x.hFerie || 0) > 0; });
    if (lignes.length) doc.jours[date] = lignes; else delete doc.jours[date];
    S.pointages[k] = doc;
    await Store.ecrire('pointages', k, doc);
  }

  /* =================================================================== */
  /* Rendu et événements                                                 */
  /* =================================================================== */

  var apresRendu = null;

  function rendre() {
    document.getElementById('mois-cur').textContent = libMois(S.mois);
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.vue === S.vue ? 'true' : 'false');
    });
    var v = S.vue === 'pointage' ? vuePointage()
      : S.vue === 'effectif' ? vueEffectif()
      : S.vue === 'parametres' ? vueParametres()
      : vuePilotage();
    document.getElementById('vues').innerHTML = v.html;
    rendreBanner();
    apresRendu = v.apres || null;
    if (apresRendu) apresRendu();
  }

  function brancher() {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { S.vue = b.dataset.vue; rendre(); });
    });
    document.getElementById('mois-prec').addEventListener('click', function () { glisserMois(-1); });
    document.getElementById('mois-suiv').addEventListener('click', function () { glisserMois(1); });

    document.body.addEventListener('click', async function (ev) {
      var el = ev.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act;

      if (act === 'export') return exporter();

      if (act === 'reset') {
        if (!confirm('Effacer toutes les données : sites, effectif, pointages, paramètres ?')) return;
        await Store.vider();
        S.sites = []; S.agents = []; S.pointages = {}; S.travaux = {};
        S.reglages = Object.assign({}, C.PARAMS_DEFAUT, { demo: false });
        S.demo = false;
        await Store.ecrire('reglages', 'global', S.reglages);
        return rendre();
      }

      if (act === 'jour') { S.dateActive = el.dataset.date; return rendre(); }

      if (act === 'jour-expl') {
        var s = siteParId(el.dataset.site);
        var pat = (s.pattern || [1, 1, 1, 1, 1, 1, 0]).slice();
        pat[+el.dataset.idx] = pat[+el.dataset.idx] ? 0 : 1;
        await majSite(s.id, { pattern: pat });
        return rendre();
      }

      if (act === 'add-site') {
        var nom = (document.getElementById('ns-nom').value || '').trim();
        if (!nom) return;
        var id = uid('s');
        var site = {
          id: id, nom: nom,
          caForfait: parseEuros(document.getElementById('ns-ca').value),
          objectifRatio: parsePct(document.getElementById('ns-obj').value) || 5500,
          pattern: [1, 1, 1, 1, 1, 1, 0], params: {}
        };
        S.sites.push(site);
        S.sites.sort(function (a, b) { return a.nom.localeCompare(b.nom); });
        await Store.ecrire('sites', id, site);
        return rendre();
      }

      if (act === 'del-site') {
        var sid = el.dataset.id;
        if (!confirm('Supprimer ce site, son effectif et ses pointages ?')) return;
        for (var a of S.agents.filter(function (x) { return x.siteId === sid; })) {
          await Store.supprimer('agents', a.id);
        }
        S.agents = S.agents.filter(function (x) { return x.siteId !== sid; });
        await Store.supprimer('sites', sid);
        S.sites = S.sites.filter(function (x) { return x.id !== sid; });
        await chargerMois();
        return rendre();
      }

      if (act === 'add-agent') {
        var an = (document.getElementById('na-nom').value || '').trim();
        var asite = document.getElementById('na-site').value;
        if (!an || !asite) return;
        var aid = uid('a');
        var ag = {
          id: aid, nom: an, siteId: asite,
          contrat: document.getElementById('na-contrat').value,
          taux: parseEuros(document.getElementById('na-taux').value), actif: true
        };
        S.agents.push(ag);
        S.agents.sort(function (x, y) { return x.nom.localeCompare(y.nom); });
        await Store.ecrire('agents', aid, ag);
        return rendre();
      }

      if (act === 'del-agent') {
        await Store.supprimer('agents', el.dataset.id);
        S.agents = S.agents.filter(function (x) { return x.id !== el.dataset.id; });
        return rendre();
      }

      if (act === 'add-travaux') {
        var m = parseEuros(document.getElementById('tx-montant').value);
        var lib = (document.getElementById('tx-lib').value || '').trim() || 'Travaux exceptionnels';
        var dt = document.getElementById('tx-date').value || S.dateActive;
        if (!m) { toast('Indique le montant facturé.'); return; }
        var kt = cleMois(S.siteActif, S.mois);
        var td = S.travaux[kt] || { id: kt, siteId: S.siteActif, mois: S.mois, items: [] };
        td.items = (td.items || []).concat([{ id: uid('t'), date: dt, libelle: lib, montant: m }]);
        S.travaux[kt] = td;
        await Store.ecrire('travaux', kt, td);
        return rendre();
      }

      if (act === 'del-travaux') {
        var kt2 = cleMois(S.siteActif, S.mois);
        var td2 = S.travaux[kt2]; if (!td2) return;
        td2.items = (td2.items || []).filter(function (x) { return x.id !== el.dataset.id; });
        await Store.ecrire('travaux', kt2, td2);
        return rendre();
      }

      if (act === 'vider-jour') {
        var kp = cleMois(S.siteActif, S.mois);
        var dp = S.pointages[kp];
        if (dp && dp.jours) { delete dp.jours[S.dateActive]; await Store.ecrire('pointages', kp, dp); }
        return rendre();
      }

      if (act === 'copier-veille') {
        var kp2 = cleMois(S.siteActif, S.mois);
        var dp2 = S.pointages[kp2];
        var dates = Object.keys((dp2 && dp2.jours) || {})
          .filter(function (d) { return d < S.dateActive; }).sort();
        if (!dates.length) { toast('Aucun jour saisi avant celui-ci sur ce site.'); return; }
        var src = dp2.jours[dates[dates.length - 1]];
        dp2.jours[S.dateActive] = src.map(function (l) { return Object.assign({}, l); });
        await Store.ecrire('pointages', kp2, dp2);
        toast('Journée du ' + libJour(dates[dates.length - 1]) + ' recopiée.');
        return rendre();
      }
    });

    /* Saisies : on écrit à la sortie du champ, pas à chaque frappe. */
    document.body.addEventListener('change', async function (ev) {
      var t = ev.target;

      if (t.id === 'sel-site') { S.siteActif = t.value; return rendre(); }
      if (t.id === 'sel-site-param') { S.siteParam = t.value; return rendre(); }

      if (t.dataset.ptAgent) {
        await majPointage(S.siteActif, S.dateActive, t.dataset.ptAgent,
          objet(t.dataset.ptChamp, parseHeures(t.value)));
        return rendre();
      }
      if (t.dataset.ptNature) {
        await majPointage(S.siteActif, S.dateActive, t.dataset.ptNature, { nature: t.value });
        return rendre();
      }
      if (t.dataset.site) {
        var champ = t.dataset.champ;
        var val = champ === 'nom' ? t.value.trim()
          : champ === 'objectifRatio' ? parsePct(t.value) : parseEuros(t.value);
        await majSite(t.dataset.site, objet(champ, val));
        return rendre();
      }
      if (t.dataset.agent) {
        var ch = t.dataset.champ;
        var v = ch === 'taux' ? parseEuros(t.value) : t.value;
        await majAgent(t.dataset.agent, objet(ch, ch === 'nom' ? String(v).trim() : v));
        return rendre();
      }
      if (t.dataset.param) {
        await majReglages(objet(t.dataset.param, parsePct(t.value)));
        return rendre();
      }
      if (t.dataset.paramSite) {
        var site = siteParId(S.siteParam); if (!site) return;
        var p = Object.assign({}, site.params || {});
        if (String(t.value).trim() === '') delete p[t.dataset.paramSite];
        else p[t.dataset.paramSite] = parsePct(t.value);
        await majSite(site.id, { params: p });
        return rendre();
      }
      if (t.id === 'p-iccpsur') return majReglages({ iccpSurPrecarite: t.checked }).then(rendre);
      if (t.id === 'p-primesoumis') return majReglages({ primesSoumises: t.checked }).then(rendre);
    });
  }

  function objet(k, v) { var o = {}; o[k] = v; return o; }

  async function glisserMois(n) {
    var y = +S.mois.slice(0, 4), m = +S.mois.slice(5, 7) + n;
    y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    S.mois = y + '-' + String(m).padStart(2, '0');
    await chargerMois();
    rendre();
  }

  /* =================================================================== */
  /* Jeu d'exemple — effacé d'un bouton, jamais présenté comme réel       */
  /* =================================================================== */

  async function semerExemple() {
    var mois = S.mois;
    var sites = [
      { id: 'demo-s1', nom: 'Abattoir volailles — Loudéac', caForfait: 4180000, objectifRatio: 5500,
        pattern: [1, 1, 1, 1, 1, 1, 0], params: {} },
      { id: 'demo-s2', nom: 'Plats cuisinés — Vitré', caForfait: 2740000, objectifRatio: 5700,
        pattern: [1, 1, 1, 1, 1, 0, 0], params: {} },
      { id: 'demo-s3', nom: 'Fromagerie — Saint-Pol', caForfait: 1520000, objectifRatio: 5900,
        pattern: [1, 1, 1, 1, 1, 1, 0], params: { primePanier: 780 } }
    ];
    var noms1 = ['Kamel B.', 'Sabrina T.', 'Joao P.', 'Mireille G.', 'Yanis R.', 'Aïcha D.', 'Patrick L.'];
    var noms2 = ['Nadia S.', 'Erwan M.', 'Lucía F.', 'Bakary C.', 'Sylvie H.'];
    var noms3 = ['Ronan Q.', 'Fatou N.', 'Dimitri V.'];
    var agents = [];
    function faireAgents(noms, siteId, prefixe) {
      noms.forEach(function (n, i) {
        agents.push({
          id: prefixe + i, nom: n, siteId: siteId,
          contrat: i % 4 === 3 ? 'CDD' : 'CDI',
          taux: 1215 + ((i * 37) % 130), actif: true
        });
      });
    }
    faireAgents(noms1, 'demo-s1', 'demo-a1-');
    faireAgents(noms2, 'demo-s2', 'demo-a2-');
    faireAgents(noms3, 'demo-s3', 'demo-a3-');

    var reglages = Object.assign({}, C.PARAMS_DEFAUT, {
      tauxCharges: 3800, primePanier: 720, primeTransport: 180, demo: true
    });

    for (var s of sites) await Store.ecrire('sites', s.id, s);
    for (var a of agents) await Store.ecrire('agents', a.id, a);
    await Store.ecrire('reglages', 'global', reglages);

    // Pointages : vacations de nuit, cadence régulière, jusqu'à aujourd'hui.
    var feries = C.feriesFrance(+mois.slice(0, 4));
    for (var site of sites) {
      var jours = C.joursExploitation(mois, site.pattern).filter(function (d) { return d <= AUJ; });
      var doc = { id: cleMois(site.id, mois), siteId: site.id, mois: mois, jours: {} };
      var eq = agents.filter(function (x) { return x.siteId === site.id; });
      jours.forEach(function (d, ji) {
        var idxJ = C.indexJour(d);
        doc.jours[d] = eq.map(function (ag, ai) {
          // Quarts d'heure : un relevé de vacation ne tombe pas sur des centièmes.
          var base = 600 + 25 * ((ai * 7 + ji * 3) % 11); // 6 h à 8 h 30
          var l = { agentId: ag.id, hJour: 0, hNuit: 0, hDim: 0, hFerie: 0, nature: 'contrat' };
          if (feries[d]) l.hFerie = base;
          else if (idxJ === 6) l.hDim = base;
          else if (ai % 3 === 0) l.hJour = base;
          else l.hNuit = base;
          return l;
        });
      });
      await Store.ecrire('pointages', doc.id, doc);
    }

    var jrs = C.joursDuMois(mois).filter(function (d) { return d <= AUJ; });
    if (jrs.length > 3) {
      var kt = cleMois('demo-s1', mois);
      await Store.ecrire('travaux', kt, {
        id: kt, siteId: 'demo-s1', mois: mois,
        items: [{ id: 'demo-t1', date: jrs[Math.floor(jrs.length / 2)],
                  libelle: 'Remise en état ligne d\'abattage', montant: 486000 }]
      });
    }
  }

  /* =================================================================== */
  /* Démarrage                                                           */
  /* =================================================================== */

  async function demarrer(etat) {
    if (etat && etat.mois) S.mois = etat.mois;
    if (etat && etat.vue) S.vue = etat.vue;
    await Store.init();
    await charger();
    if (!S.sites.length && !S.agents.length) {
      await semerExemple();
      await charger();
    }
    brancher();
    rendre();
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
      window.claude.hot.snapshot(function () { return { mois: S.mois, vue: S.vue }; });
    }
  }

  var hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(demarrer);
  else demarrer((hot && hot.data) || {});
})();
