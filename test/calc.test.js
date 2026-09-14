/* Tests du moteur de calcul. Lancer : node test/calc.test.js */
var C = require('../src/calc.js');

var ok = 0, ko = 0;
function eq(reel, attendu, titre) {
  var a = JSON.stringify(reel), b = JSON.stringify(attendu);
  if (a === b) { ok++; }
  else { ko++; console.error('✗ ' + titre + '\n    attendu ' + b + '\n    obtenu  ' + a); }
}
function vrai(cond, titre) { eq(!!cond, true, titre); }

/* ---- Calendrier ------------------------------------------------------ */

eq(C.paques(2026).toISOString().slice(0, 10), '2026-04-05', 'Pâques 2026');
eq(C.paques(2024).toISOString().slice(0, 10), '2024-03-31', 'Pâques 2024');
eq(C.paques(2027).toISOString().slice(0, 10), '2027-03-28', 'Pâques 2027');

var f26 = C.feriesFrance(2026);
eq(Object.keys(f26).length, 11, '11 fériés légaux');
eq(f26['2026-04-06'], 'Lundi de Pâques', 'Lundi de Pâques 2026');
eq(f26['2026-05-14'], 'Ascension', 'Ascension 2026 (Pâques + 39)');
eq(f26['2026-05-25'], 'Lundi de Pentecôte', 'Pentecôte 2026 (Pâques + 50)');
vrai(!f26['2026-05-13'], 'la veille de l’Ascension n’est pas fériée');

eq(C.indexJour('2026-09-14'), 0, '14/09/2026 est un lundi');
eq(C.indexJour('2026-09-20'), 6, '20/09/2026 est un dimanche');

// Bascule d'année : le 31/12/2025 (mercredi) appartient à la semaine 1 de 2026.
eq(C.semaineISO('2025-12-31'), '2026-W01', 'semaine ISO à cheval sur l’année');
eq(C.semaineISO('2026-01-04'), '2026-W01', 'dimanche rattaché à la semaine précédente');
eq(C.semaineISO('2026-01-05'), '2026-W02', 'lundi ouvre la semaine suivante');

eq(C.joursDuMois('2026-02').length, 28, 'février 2026 : 28 jours');
eq(C.joursDuMois('2028-02').length, 29, 'février 2028 : année bissextile');
eq(C.joursExploitation('2026-09', [1, 1, 1, 1, 1, 1, 0]).length, 26,
   'septembre 2026 hors dimanches');

/* ---- Arithmétique entière ------------------------------------------- */

eq(C.coutHeures(700, 1250), 8750, '7 h à 12,50 € = 87,50 €');
eq(C.coutHeures(733, 1247), 9141, 'arrondi au centime, une seule fois (91,4051 \u20ac)');
eq(C.pct(10500, 2000), 2100, '20 % de 105,00 €');

// Répartition : la somme des parts doit être RIGOUREUSEMENT égale au total.
// C'est ce qui empêche un centime de se perdre entre deux sites.
[[500, [2500, 1500]], [1, [1, 1, 1]], [997, [13, 71, 5, 900]], [0, [3, 4]]]
  .forEach(function (cas) {
    var parts = C.repartir(cas[0], cas[1]);
    eq(parts.reduce(function (a, b) { return a + b; }, 0), cas[0],
       'répartition exacte de ' + cas[0]);
  });
eq(C.repartir(500, [2500, 1500]), [313, 187], 'plus forts restes, départé par rang');
eq(C.repartir(10, [0, 0]), [0, 0], 'poids nuls : aucune part');

/* ---- Coût d'un bloc : vérification à la main ------------------------- */

var P = Object.assign({}, C.PARAMS_DEFAUT, {
  tauxCharges: 4200, majNuit: 2000, precariteCDD: 1000, iccpCDD: 1000,
  iccpSurPrecarite: true, primePanier: 0, primeHabillage: 0, primeTransport: 0
});
var bloc = Object.assign(C.blocVide(), { hNuit: 700, vacations: 1 });
var c = C.coutBloc(bloc, 1250, P, 'CDD');

//  base 87,50 | +20 % nuit 17,50 | brut 105,00
//  précarité 10 % = 10,50 | ICCP 10 % de 115,50 = 11,55 | soumis 127,05
//  charges 42 % = 53,36 (53,361 arrondi) | total 180,41
eq(c.base, 8750, 'base horaire');
eq(c.majNuit, 1750, 'majoration de nuit');
eq(c.brutSoumis, 10500, 'brut soumis');
eq(c.precarite, 1050, 'indemnité de précarité CDD');
eq(c.iccp, 1155, 'ICCP assise sur brut + précarité');
eq(c.charges, 5336, 'charges patronales');
eq(c.total, 18041, 'coût total employeur du poste');

// Le même poste en CDI, sans provision CP : pas de précarité ni d'ICCP.
var cCDI = C.coutBloc(bloc, 1250, Object.assign({}, P, { provisionCPCDI: 0 }), 'CDI');
eq(cCDI.precarite, 0, 'pas de précarité en CDI');
eq(cCDI.iccp, 0, 'pas d’ICCP en CDI sans provision');
eq(cCDI.total, 10500 + C.pct(10500, 4200), 'coût CDI = brut + charges');
vrai(c.total > cCDI.total, 'le CDD coûte plus cher que le CDI à taux égal');

// Les primes non soumises n'entrent pas dans l'assiette de charges.
var cPrime = C.coutBloc(bloc, 1250, Object.assign({}, P, { primePanier: 750 }), 'CDD');
eq(cPrime.charges, c.charges, 'prime panier non soumise : charges inchangées');
eq(cPrime.total, c.total + 750, 'la prime s’ajoute au coût brut');
var cPrimeS = C.coutBloc(bloc, 1250,
  Object.assign({}, P, { primePanier: 750, primesSoumises: true }), 'CDD');
eq(cPrimeS.charges, C.pct(12705 + 750, 4200), 'prime soumise : assiette élargie');

/* ---- Heures sup. : seuil hebdomadaire, tous sites confondus ---------- */

// 25 h sur le site A + 15 h sur le site B la même semaine = 40 h.
// Le seuil de 35 h se déclenche sur le CUMUL, pas site par site.
var hs = C.ventilerHS([
  { agentId: 'a1', date: '2026-09-14', siteId: 'A', nature: 'contrat', hTotal: 2500 },
  { agentId: 'a1', date: '2026-09-16', siteId: 'B', nature: 'contrat', hTotal: 1500 }
], 3500, 4300);
eq(hs['A|contrat'].h25 + hs['B|contrat'].h25, 500, '5 h majorées à 25 %');
eq(hs['A|contrat'].h50 + hs['B|contrat'].h50, 0, 'aucune heure à 50 %');
eq(hs['A|contrat'].h25, 313, 'part du site A au prorata des heures');

// 46 h : 8 h à 25 % (de 35 à 43) puis 3 h à 50 %.
var hs2 = C.ventilerHS([
  { agentId: 'a1', date: '2026-09-14', siteId: 'A', nature: 'contrat', hTotal: 4600 }
], 3500, 4300);
eq(hs2['A|contrat'], { h25: 800, h50: 300 }, 'deux tranches d’heures sup.');

// Deux semaines de 34 h ne déclenchent rien, même si le total fait 68 h.
var hs3 = C.ventilerHS([
  { agentId: 'a1', date: '2026-09-14', siteId: 'A', nature: 'contrat', hTotal: 3400 },
  { agentId: 'a1', date: '2026-09-21', siteId: 'A', nature: 'contrat', hTotal: 3400 }
], 3500, 4300);
eq(hs3['A|contrat'], undefined, 'le seuil s’apprécie semaine par semaine');

/* ---- Calcul d'un mois complet --------------------------------------- */

var jeu = {
  mois: '2026-09',
  aujourdhui: '2026-09-15',
  global: Object.assign({}, C.PARAMS_DEFAUT, { primePanier: 750 }),
  sites: [
    { id: 'S1', nom: 'Abattoir Nord', caForfait: 4200000, objectifRatio: 5500,
      pattern: [1, 1, 1, 1, 1, 1, 0], params: {} },
    { id: 'S2', nom: 'Fromagerie Sud', caForfait: 1800000, objectifRatio: 6000,
      pattern: [1, 1, 1, 1, 1, 0, 0], params: {} }
  ],
  agents: [
    { id: 'a1', siteId: 'S1', nom: 'Agent 1', contrat: 'CDI', taux: 1280 },
    { id: 'a2', siteId: 'S1', nom: 'Agent 2', contrat: 'CDD', taux: 1250 },
    { id: 'a3', siteId: 'S2', nom: 'Agent 3', contrat: 'CDI', taux: 1310 }
  ],
  pointages: [
    { siteId: 'S1', date: '2026-09-14', lignes: [
      { agentId: 'a1', hJour: 0, hNuit: 700, hDim: 0, hFerie: 0, nature: 'contrat' },
      { agentId: 'a2', hJour: 0, hNuit: 600, hDim: 0, hFerie: 0, nature: 'contrat' }
    ] },
    { siteId: 'S1', date: '2026-09-15', lignes: [
      { agentId: 'a1', hJour: 0, hNuit: 700, hDim: 0, hFerie: 0, nature: 'contrat' },
      // Même soir, même agent : chantier exceptionnel après la vacation.
      { agentId: 'a1', hJour: 200, hNuit: 0, hDim: 0, hFerie: 0, nature: 'exceptionnel' }
    ] },
    { siteId: 'S2', date: '2026-09-15', lignes: [
      { agentId: 'a3', hJour: 500, hNuit: 0, hDim: 0, hFerie: 0, nature: 'contrat' }
    ] }
  ],
  travaux: [
    { id: 't1', siteId: 'S1', date: '2026-09-15', libelle: 'Remise en état', montant: 320000 }
  ]
};

var R = C.calculerMois(jeu);
var s1 = R.sites[0], s2 = R.sites[1];

eq(s1.site.nom, 'Abattoir Nord', 'site restitué');
eq(s1.detail.total.vacations, 3,
   'une vacation par agent et par jour, pas une par ligne');
eq(s1.ms.total, s1.ms.contrat + s1.ms.exceptionnel,
   'MS totale = contrat + exceptionnel, sans recouvrement');
vrai(s1.ms.exceptionnel > 0, 'les travaux exceptionnels portent leur propre MS');

// Prorata : 26 jours d'exploitation, 13 écoulés au 15/09 -> la moitié du forfait.
eq(s1.jours.total, 26, 'jours d’exploitation du site S1');
eq(s1.jours.aujourdhui, 13, 'jours d’exploitation écoulés au 15/09');
eq(s1.ca.forfaitAcquis, 2100000, 'forfait acquis au prorata');
eq(s1.ca.mois, 4200000 + 320000, 'CA du mois = forfait + travaux');

// Ratio socle et ratio global ne partagent ni numérateur ni dénominateur.
eq(s1.ratioSocle, Math.round((s1.ms.contrat * 10000) / s1.ca.forfaitAcquis),
   'ratio socle sur le forfait acquis');
eq(s1.ratioGlobal,
   Math.round((s1.ms.total * 10000) / (s1.ca.forfaitAcquis + s1.ca.exceptionnelRealise)),
   'ratio global sur le CA acquis total');

// Un site sans CA ne doit pas produire un ratio infini ni un NaN.
var sansCA = C.calculerMois(Object.assign({}, jeu, {
  sites: [Object.assign({}, jeu.sites[0], { caForfait: 0 })], travaux: []
}));
eq(sansCA.sites[0].ratioSocle, null, 'pas de CA : pas de ratio inventé');

// Projection : extrapolation du réalisé sur les jours d'exploitation couverts.
vrai(s1.ms.projetee >= s1.ms.total, 'la projection couvre au moins le réalisé');
eq(s1.ms.projetee, Math.round(s1.ms.total / (s1.jours.ecoules / s1.jours.total)),
   'projection au prorata des jours couverts');

// Le consolidé additionne bien les sites, sans double compte.
eq(R.consolide.msTotal, s1.ms.total + s2.ms.total, 'MS consolidée');
eq(R.consolide.caMois, s1.ca.mois + s2.ca.mois, 'CA consolidé');
vrai(R.consolide.objectif > 5500 && R.consolide.objectif < 6000,
     'objectif consolidé pondéré par le CA');

// Décomposition du coût : les composants doivent redonner le total, au centime.
R.sites.forEach(function (r) {
  var t = r.detail.total;
  eq(t.brutSoumis + t.precarite + t.iccp + t.charges + t.primes, t.total,
     'décomposition exacte du coût — ' + r.site.nom);
  eq(t.base + t.majorations + t.majHS, t.brutSoumis,
     'brut = base + majorations — ' + r.site.nom);
});

// Un mois sans aucune saisie ne doit rien casser.
var vide = C.calculerMois({ mois: '2026-10', sites: jeu.sites, agents: jeu.agents,
                            pointages: [], travaux: [], aujourdhui: '2026-10-10' });
eq(vide.consolide.msTotal, 0, 'mois vide : masse salariale nulle');
eq(vide.sites[0].ms.projetee, 0, 'mois vide : aucune projection hasardeuse');
eq(vide.sites[0].ratioSocle, 0, 'mois vide : ratio à zéro, pas NaN');

// Courbe cumulée : croissante en dates, et finit sur le ratio du jour.
var courbe = C.courbeCumulee(jeu, 'S1');
vrai(courbe.length > 0, 'la courbe cumulée produit des points');
vrai(courbe.every(function (p, i, t) { return i === 0 || p.date > t[i - 1].date; }),
     'points de courbe ordonnés');
vrai(courbe[courbe.length - 1].ms >= courbe[0].ms, 'MS cumulée croissante');

/* --------------------------------------------------------------------- */
console.log('\n' + ok + ' tests passés, ' + ko + ' échec(s)');
process.exit(ko ? 1 : 0);
