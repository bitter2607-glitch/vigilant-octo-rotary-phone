/*
 * Moteur de calcul de masse salariale — propreté agroalimentaire.
 *
 * PRÉCISION : aucune opération n'est faite en euros flottants.
 *   - montants          : entiers, en CENTIMES
 *   - heures            : entiers, en CENTIÈMES d'heure (7h30 => 750)
 *   - taux horaires     : entiers, en CENTIMES par heure (12,47 €/h => 1247)
 *   - pourcentages      : entiers, en POINTS DE BASE (42 % => 4200)
 * Chaque composant de coût est arrondi une seule fois, au centime, puis
 * additionné en entier. Les répartitions (heures sup. réparties entre sites)
 * utilisent la méthode des plus forts restes : la somme des parts est
 * rigoureusement égale au total réparti, au centime près.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MSCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Arithmétique entière                                                */
  /* ------------------------------------------------------------------ */

  /** Coût de h centièmes d'heure au taux t centimes/heure, en centimes. */
  function coutHeures(hCent, tauxCent) {
    return Math.round((hCent * tauxCent) / 100);
  }

  /** Applique un pourcentage exprimé en points de base à un montant. */
  function pct(montantCent, bp) {
    return Math.round((montantCent * bp) / 10000);
  }

  /**
   * Répartit `total` (entier) proportionnellement à `poids`.
   * Plus forts restes : sum(resultat) === total exactement.
   */
  function repartir(total, poids) {
    var somme = poids.reduce(function (a, b) { return a + b; }, 0);
    if (somme <= 0) return poids.map(function () { return 0; });
    var brut = poids.map(function (p) { return (total * p) / somme; });
    var base = brut.map(Math.floor);
    var reste = total - base.reduce(function (a, b) { return a + b; }, 0);
    var ordre = brut
      .map(function (v, i) { return { i: i, frac: v - Math.floor(v) }; })
      .sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    for (var k = 0; k < reste; k++) base[ordre[k % ordre.length].i] += 1;
    return base;
  }

  /* ------------------------------------------------------------------ */
  /* Calendrier                                                          */
  /* ------------------------------------------------------------------ */

  function iso(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function parseISO(s) {
    var p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  function fmtDate(dt) {
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function addDays(dt, n) {
    return new Date(dt.getTime() + n * 86400000);
  }

  /** Dimanche de Pâques (algorithme grégorien anonyme). */
  function paques(Y) {
    var a = Y % 19,
      b = Math.floor(Y / 100),
      c = Y % 100,
      d = Math.floor(b / 4),
      e = b % 4,
      f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4),
      k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451),
      mois = Math.floor((h + l - 7 * m + 114) / 31),
      jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(Y, mois - 1, jour));
  }

  /** Jours fériés légaux français d'une année => { 'YYYY-MM-DD': 'libellé' }. */
  function feriesFrance(Y) {
    var p = paques(Y);
    var f = {};
    f[iso(Y, 1, 1)] = 'Jour de l’An';
    f[fmtDate(addDays(p, 1))] = 'Lundi de Pâques';
    f[iso(Y, 5, 1)] = 'Fête du Travail';
    f[iso(Y, 5, 8)] = 'Victoire 1945';
    f[fmtDate(addDays(p, 39))] = 'Ascension';
    f[fmtDate(addDays(p, 50))] = 'Lundi de Pentecôte';
    f[iso(Y, 7, 14)] = 'Fête nationale';
    f[iso(Y, 8, 15)] = 'Assomption';
    f[iso(Y, 11, 1)] = 'Toussaint';
    f[iso(Y, 11, 11)] = 'Armistice 1918';
    f[iso(Y, 12, 25)] = 'Noël';
    return f;
  }

  /** Index 0 = lundi … 6 = dimanche. */
  function indexJour(dateStr) {
    return (parseISO(dateStr).getUTCDay() + 6) % 7;
  }

  /** Clé de semaine ISO 8601, ex. '2026-W38'. Sert à borner les heures sup. */
  function semaineISO(dateStr) {
    var d = parseISO(dateStr);
    var jour = (d.getUTCDay() + 6) % 7;
    d = addDays(d, 3 - jour); // jeudi de la semaine
    var an = d.getUTCFullYear();
    var jan4 = new Date(Date.UTC(an, 0, 4));
    var jourJan4 = (jan4.getUTCDay() + 6) % 7;
    var lundiS1 = addDays(jan4, -jourJan4);
    var num = Math.round((d - lundiS1) / (7 * 86400000)) + 1;
    return an + '-W' + String(num).padStart(2, '0');
  }

  function joursDuMois(mois) {
    var p = mois.split('-');
    var y = +p[0], m = +p[1];
    var n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var out = [];
    for (var d = 1; d <= n; d++) out.push(iso(y, m, d));
    return out;
  }

  /**
   * Jours d'exploitation du mois : jours de la semaine ouverts sur le site.
   * `pattern` = 7 booléens, index 0 = lundi.
   */
  function joursExploitation(mois, pattern) {
    return joursDuMois(mois).filter(function (j) { return !!pattern[indexJour(j)]; });
  }

  /* ------------------------------------------------------------------ */
  /* Paramètres                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Valeurs de départ, toutes modifiables site par site dans l'écran
   * Paramètres. Ce ne sont PAS des taux de convention collective certifiés :
   * la CCN propreté (IDCC 3043) et les accords d'entreprise font foi, il faut
   * les saisir. Ils sont ici pour que le calcul démarre, pas pour trancher.
   */
  var PARAMS_DEFAUT = {
    tauxCharges: 4200,      // charges patronales sur brut soumis
    majNuit: 2000,
    majDimanche: 2000,
    majFerie: 10000,
    seuilHSsem: 3500,       // centièmes d'heure / semaine avant HS
    seuilHS50sem: 4300,     // au-delà : majoration 50 %
    majHS25: 2500,
    majHS50: 5000,
    precariteCDD: 1000,     // indemnité de fin de contrat
    iccpCDD: 1000,          // indemnité compensatrice de congés payés
    iccpSurPrecarite: true, // ICCP calculée sur (brut + précarité)
    provisionCPCDI: 0,      // provision congés payés CDI (0 = déjà en charges)
    primePanier: 0,         // centimes par vacation
    primeHabillage: 0,
    primeTransport: 0,
    primesSoumises: false   // primes intégrées à l'assiette de charges ?
  };

  function paramsSite(site, global) {
    var out = {};
    Object.keys(PARAMS_DEFAUT).forEach(function (k) {
      var v = site && site.params && site.params[k] != null ? site.params[k]
        : global && global[k] != null ? global[k]
        : PARAMS_DEFAUT[k];
      out[k] = v;
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Coût du travail                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Coût d'un agent sur un périmètre (un site, une nature) pour le mois.
   * `bloc` : { hJour, hNuit, hDim, hFerie, hMajHS25, hMajHS50, vacations }
   * en centièmes d'heure, `taux` en centimes/heure.
   */
  function coutBloc(bloc, taux, P, contrat) {
    var hTotal = bloc.hJour + bloc.hNuit + bloc.hDim + bloc.hFerie;
    var base = coutHeures(hTotal, taux);

    var majNuit = pct(coutHeures(bloc.hNuit, taux), P.majNuit);
    var majDim = pct(coutHeures(bloc.hDim, taux), P.majDimanche);
    var majFerie = pct(coutHeures(bloc.hFerie, taux), P.majFerie);
    var majHS = pct(coutHeures(bloc.hMajHS25, taux), P.majHS25)
      + pct(coutHeures(bloc.hMajHS50, taux), P.majHS50);

    var brutSoumis = base + majNuit + majDim + majFerie + majHS;

    var precarite = 0, iccp = 0;
    if (contrat === 'CDD') {
      precarite = pct(brutSoumis, P.precariteCDD);
      iccp = pct(P.iccpSurPrecarite ? brutSoumis + precarite : brutSoumis, P.iccpCDD);
    } else {
      iccp = pct(brutSoumis, P.provisionCPCDI);
    }

    var totalSoumis = brutSoumis + precarite + iccp;
    var primes = bloc.vacations * (P.primePanier + P.primeHabillage + P.primeTransport);
    var assiette = totalSoumis + (P.primesSoumises ? primes : 0);
    var charges = pct(assiette, P.tauxCharges);

    return {
      heures: hTotal,
      heuresMajHS: bloc.hMajHS25 + bloc.hMajHS50,
      vacations: bloc.vacations,
      base: base,
      majorations: majNuit + majDim + majFerie,
      majNuit: majNuit, majDim: majDim, majFerie: majFerie,
      majHS: majHS,
      brutSoumis: brutSoumis,
      precarite: precarite,
      iccp: iccp,
      charges: charges,
      primes: primes,
      total: totalSoumis + charges + primes
    };
  }

  function blocVide() {
    return { hJour: 0, hNuit: 0, hDim: 0, hFerie: 0, hMajHS25: 0, hMajHS50: 0, vacations: 0 };
  }

  function cumuler(a, b) {
    Object.keys(a).forEach(function (k) { a[k] += b[k] || 0; });
    return a;
  }

  /* ------------------------------------------------------------------ */
  /* Heures supplémentaires : bornage hebdomadaire, tous sites confondus  */
  /* ------------------------------------------------------------------ */

  /**
   * Les seuils d'heures sup. s'apprécient par SALARIÉ et par SEMAINE, pas par
   * site. Un agent qui tourne sur deux sites déclenche ses HS sur le cumul.
   * On calcule donc les heures majorées par agent/semaine, puis on les
   * réaffecte aux couples (site, nature) au prorata des heures qui les ont
   * produites — sans perdre un centième au passage.
   */
  function ventilerHS(lignes, seuil25, seuil50) {
    // lignes : [{ agentId, date, siteId, nature, hTotal }]
    var parAgentSemaine = {};
    lignes.forEach(function (l) {
      var cle = l.agentId + '|' + semaineISO(l.date);
      (parAgentSemaine[cle] = parAgentSemaine[cle] || []).push(l);
    });

    var resultat = {}; // 'siteId|nature' => { h25, h50 }
    Object.keys(parAgentSemaine).forEach(function (cle) {
      var groupe = parAgentSemaine[cle];
      var total = groupe.reduce(function (s, l) { return s + l.hTotal; }, 0);
      var h25 = Math.max(0, Math.min(total, seuil50) - seuil25);
      var h50 = Math.max(0, total - seuil50);
      if (h25 === 0 && h50 === 0) return;

      var poids = groupe.map(function (l) { return l.hTotal; });
      var part25 = repartir(h25, poids);
      var part50 = repartir(h50, poids);
      groupe.forEach(function (l, i) {
        var k = l.siteId + '|' + l.nature;
        var r = (resultat[k] = resultat[k] || { h25: 0, h50: 0 });
        r.h25 += part25[i];
        r.h50 += part50[i];
      });
    });
    return resultat;
  }

  /* ------------------------------------------------------------------ */
  /* Calcul d'un mois                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * @param {object} d
   *   sites      [{ id, nom, caForfait, objectifRatio, pattern[7], params{} }]
   *   agents     [{ id, siteId, nom, contrat, taux }]
   *   pointages  [{ siteId, date, lignes:[{ agentId, hJour, hNuit, hDim, hFerie, nature }] }]
   *   travaux    [{ siteId, date, libelle, montant }]
   *   mois       'YYYY-MM'
   *   aujourdhui 'YYYY-MM-DD'
   *   global     paramètres par défaut de l'entreprise
   */
  function calculerMois(d) {
    var mois = d.mois;
    var agents = {};
    (d.agents || []).forEach(function (a) { agents[a.id] = a; });

    var pointages = (d.pointages || []).filter(function (p) {
      return p.date.slice(0, 7) === mois;
    });

    // 1. Aplatir en lignes exploitables, en ignorant ce qui ne porte pas d'heures.
    var lignes = [];
    var vacationsVues = {}; // 'agent|date' => index de la ligne portant la vacation
    pointages.forEach(function (p) {
      (p.lignes || []).forEach(function (l) {
        var hTotal = (l.hJour || 0) + (l.hNuit || 0) + (l.hDim || 0) + (l.hFerie || 0);
        if (hTotal <= 0) return;
        lignes.push({
          agentId: l.agentId, date: p.date, siteId: p.siteId,
          nature: l.nature === 'exceptionnel' ? 'exceptionnel' : 'contrat',
          hJour: l.hJour || 0, hNuit: l.hNuit || 0,
          hDim: l.hDim || 0, hFerie: l.hFerie || 0,
          hTotal: hTotal, vacation: 0
        });
      });
    });

    // Une vacation par agent et par jour, portée par la ligne la plus longue :
    // un agent qui enchaîne contrat + travaux exceptionnels le même soir ne
    // touche pas deux paniers.
    lignes.forEach(function (l, i) {
      var k = l.agentId + '|' + l.date;
      var prec = vacationsVues[k];
      if (prec == null || l.hTotal > lignes[prec].hTotal) {
        if (prec != null) lignes[prec].vacation = 0;
        vacationsVues[k] = i;
        l.vacation = 1;
      }
    });

    // 2. Heures sup. bornées à la semaine, par agent, tous sites confondus.
    //    Seuils pris sur le site principal de l'agent (ce sont des seuils
    //    légaux, identiques en pratique d'un site à l'autre).
    var sitesIdx = {};
    (d.sites || []).forEach(function (s) { sitesIdx[s.id] = s; });
    var Pref = paramsSite((d.sites || [])[0], d.global);
    var hs = ventilerHS(lignes, Pref.seuilHSsem, Pref.seuilHS50sem);

    // 3. Agréger par site / nature / agent.
    var blocs = {}; // siteId|nature|agentId => bloc
    lignes.forEach(function (l) {
      var k = l.siteId + '|' + l.nature + '|' + l.agentId;
      var b = (blocs[k] = blocs[k] || blocVide());
      b.hJour += l.hJour; b.hNuit += l.hNuit;
      b.hDim += l.hDim; b.hFerie += l.hFerie;
      b.vacations += l.vacation;
    });

    // Réinjecter les heures majorées au niveau (site, nature), puis les
    // redescendre sur les agents au prorata de leurs heures.
    Object.keys(hs).forEach(function (kSiteNature) {
      var cles = Object.keys(blocs).filter(function (k) {
        return k.indexOf(kSiteNature + '|') === 0;
      });
      if (!cles.length) return;
      var poids = cles.map(function (k) {
        var b = blocs[k];
        return b.hJour + b.hNuit + b.hDim + b.hFerie;
      });
      var p25 = repartir(hs[kSiteNature].h25, poids);
      var p50 = repartir(hs[kSiteNature].h50, poids);
      cles.forEach(function (k, i) {
        blocs[k].hMajHS25 += p25[i];
        blocs[k].hMajHS50 += p50[i];
      });
    });

    // 4. Coût, site par site.
    var parSite = {};
    (d.sites || []).forEach(function (s) {
      parSite[s.id] = {
        site: s,
        contrat: coutZero(), exceptionnel: coutZero(), total: coutZero(),
        agents: [], dernierPointage: null
      };
    });

    Object.keys(blocs).forEach(function (k) {
      var parts = k.split('|');
      var siteId = parts[0], nature = parts[1], agentId = parts[2];
      var site = sitesIdx[siteId];
      var agent = agents[agentId];
      if (!site || !agent) return;
      var P = paramsSite(site, d.global);
      var c = coutBloc(blocs[k], agent.taux, P, agent.contrat);
      var cible = parSite[siteId];
      cumulerCout(cible[nature], c);
      cumulerCout(cible.total, c);
      cible.agents.push({ agent: agent, nature: nature, cout: c });
    });

    // 5. Chiffre d'affaires et ratios.
    var travaux = (d.travaux || []).filter(function (t) {
      return t.date.slice(0, 7) === mois;
    });
    var auj = d.aujourdhui && d.aujourdhui.slice(0, 7) === mois ? d.aujourdhui : null;

    var dernierPointage = null;
    lignes.forEach(function (l) {
      if (!dernierPointage || l.date > dernierPointage) dernierPointage = l.date;
      var cible = parSite[l.siteId];
      if (cible && (!cible.dernierPointage || l.date > cible.dernierPointage)) {
        cible.dernierPointage = l.date;
      }
    });

    var resultats = (d.sites || []).map(function (s) {
      var r = parSite[s.id];
      var pattern = s.pattern || [1, 1, 1, 1, 1, 1, 0];
      var jours = joursExploitation(mois, pattern);
      var joursTotal = jours.length || 1;

      // Jours d'exploitation déjà couverts : jusqu'à la dernière date pointée
      // sur ce site, sinon jusqu'à aujourd'hui. Extrapoler sur des jours non
      // encore saisis diluerait le ratio et le rendrait faussement bon.
      var borne = r.dernierPointage || dernierPointage || auj;
      var joursEcoules = borne ? jours.filter(function (j) { return j <= borne; }).length : 0;
      var joursAuj = auj ? jours.filter(function (j) { return j <= auj; }).length : joursTotal;

      var caForfait = s.caForfait || 0;
      var caForfaitAcquis = Math.round((caForfait * joursAuj) / joursTotal);
      var travauxSite = travaux.filter(function (t) { return t.siteId === s.id; });
      var caExcMois = travauxSite.reduce(function (a, t) { return a + (t.montant || 0); }, 0);
      var caExcRealise = travauxSite
        .filter(function (t) { return !auj || t.date <= auj; })
        .reduce(function (a, t) { return a + (t.montant || 0); }, 0);

      var msContrat = r.contrat.total;
      var msExc = r.exceptionnel.total;
      var msTotal = r.total.total;

      // Projection fin de mois : on extrapole le réalisé sur les jours
      // d'exploitation couverts par la saisie.
      var couverture = joursEcoules > 0 ? joursEcoules / joursTotal : 0;
      var msProjetee = couverture > 0 ? Math.round(msTotal / couverture) : 0;
      var caMois = caForfait + caExcMois;

      return {
        site: s,
        jours: { total: joursTotal, ecoules: joursEcoules, aujourdhui: joursAuj, couverture: couverture },
        ca: { forfait: caForfait, forfaitAcquis: caForfaitAcquis, exceptionnel: caExcMois, exceptionnelRealise: caExcRealise, mois: caMois },
        ms: { contrat: msContrat, exceptionnel: msExc, total: msTotal, projetee: msProjetee },
        detail: r,
        ratioSocle: ratio(msContrat, caForfaitAcquis),
        ratioGlobal: ratio(msTotal, caForfaitAcquis + caExcRealise),
        ratioProjete: ratio(msProjetee, caMois),
        objectif: s.objectifRatio || 0,
        ecartEuros: caMois > 0
          ? Math.round(msProjetee - (caMois * (s.objectifRatio || 0)) / 10000)
          : 0,
        heures: r.total.heures
      };
    });

    var cons = resultats.reduce(function (acc, r) {
      acc.msTotal += r.ms.total;
      acc.msProjetee += r.ms.projetee;
      acc.caAcquis += r.ca.forfaitAcquis + r.ca.exceptionnelRealise;
      acc.caMois += r.ca.mois;
      acc.heures += r.heures;
      acc.ecartEuros += r.ecartEuros;
      acc.objectifPondere += ((r.site.objectifRatio || 0) * r.ca.mois) / 10000;
      return acc;
    }, { msTotal: 0, msProjetee: 0, caAcquis: 0, caMois: 0, heures: 0, ecartEuros: 0, objectifPondere: 0 });

    return {
      mois: mois,
      sites: resultats,
      consolide: {
        msTotal: cons.msTotal,
        msProjetee: cons.msProjetee,
        caAcquis: cons.caAcquis,
        caMois: cons.caMois,
        heures: cons.heures,
        ecartEuros: cons.ecartEuros,
        ratio: ratio(cons.msTotal, cons.caAcquis),
        ratioProjete: ratio(cons.msProjetee, cons.caMois),
        objectif: cons.caMois > 0 ? Math.round((cons.objectifPondere * 10000) / cons.caMois) : 0
      },
      feries: feriesFrance(+mois.slice(0, 4))
    };
  }

  /** Ratio en points de base (55,00 % => 5500). 0 si pas de CA. */
  function ratio(ms, ca) {
    if (!ca) return null;
    return Math.round((ms * 10000) / ca);
  }

  function coutZero() {
    return {
      heures: 0, heuresMajHS: 0, vacations: 0, base: 0, majorations: 0,
      majNuit: 0, majDim: 0, majFerie: 0, majHS: 0, brutSoumis: 0,
      precarite: 0, iccp: 0, charges: 0, primes: 0, total: 0
    };
  }

  function cumulerCout(acc, c) {
    Object.keys(acc).forEach(function (k) { acc[k] += c[k] || 0; });
    return acc;
  }

  /**
   * Courbe de ratio cumulé jour après jour : c'est elle qui montre si le
   * mois dérape, bien avant la clôture.
   */
  function courbeCumulee(d, siteId) {
    var jours = joursDuMois(d.mois);
    var pts = [];
    var acc = null;
    jours.forEach(function (j) {
      var sousEnsemble = {
        sites: siteId ? d.sites.filter(function (s) { return s.id === siteId; }) : d.sites,
        agents: d.agents,
        pointages: (d.pointages || []).filter(function (p) { return p.date <= j; }),
        travaux: d.travaux,
        mois: d.mois,
        aujourdhui: j,
        global: d.global
      };
      var r = calculerMois(sousEnsemble);
      var c = r.consolide;
      if (c.msTotal > 0) {
        acc = c.ratio;
        pts.push({ date: j, ratio: c.ratio, ms: c.msTotal, ca: c.caAcquis });
      } else if (acc != null) {
        pts.push({ date: j, ratio: acc, ms: c.msTotal, ca: c.caAcquis });
      }
    });
    return pts;
  }

  return {
    coutHeures: coutHeures,
    pct: pct,
    repartir: repartir,
    paques: paques,
    feriesFrance: feriesFrance,
    semaineISO: semaineISO,
    indexJour: indexJour,
    joursDuMois: joursDuMois,
    joursExploitation: joursExploitation,
    ventilerHS: ventilerHS,
    coutBloc: coutBloc,
    blocVide: blocVide,
    paramsSite: paramsSite,
    calculerMois: calculerMois,
    courbeCumulee: courbeCumulee,
    ratio: ratio,
    PARAMS_DEFAUT: PARAMS_DEFAUT
  };
});
