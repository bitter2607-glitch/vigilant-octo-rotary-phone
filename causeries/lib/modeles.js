/*
 * Modèles de causeries pour la propreté en agroalimentaire.
 * Point de départ à relire et adapter : le document unique, les fiches de
 * données de sécurité des produits et les modes opératoires du site font foi.
 */
'use strict';

module.exports = [
  {
    cle: 'chimique',
    theme: 'Produits de nettoyage : ne jamais mélanger chlore et acide',
    duree: 10,
    objectif: 'Savoir lire une étiquette, doser correctement et éviter les dégagements toxiques lors des phases alcaline, acide et désinfection.',
    sections: [
      { titre: 'Ce qui peut arriver',
        texte: 'Un produit chloré (javel, mousse chlorée) mis en contact avec un acide (détartrant, phase acide du plan de nettoyage) dégage du chlore gazeux. Quelques inspirations suffisent à brûler les voies respiratoires. Le risque est le plus fort au moment d’enchaîner deux phases sans rinçage ou en réutilisant le même bidon, la même centrale ou le même canon à mousse.' },
      { titre: 'Les bons gestes',
        texte: 'Rincer abondamment entre chaque phase. Un bidon, un produit : jamais de transvasement dans un contenant non étiqueté. Respecter la concentration affichée sur la centrale de dilution, jamais « un peu plus pour que ça nettoie mieux ». Porter lunettes ou visière, gants nitrile longs et tablier pendant la préparation et la projection.' },
      { titre: 'En cas d’incident',
        texte: 'Odeur piquante ou picotements : quitter immédiatement la zone, ventiler si possible sans y retourner, prévenir le chef d’équipe. Projection dans les yeux : rincer 15 minutes à la douche oculaire. Garder la fiche de données de sécurité à portée pour les secours.' }
    ],
    pointsCles: [
      'Chlore + acide = gaz toxique : rinçage obligatoire entre les phases',
      'Un produit, un contenant étiqueté, aucun transvasement sauvage',
      'Dosage de la centrale, jamais à l’œil',
      'Lunettes + gants nitrile longs dès la préparation'
    ],
    quiz: [
      { question: 'Que faut-il faire entre la phase alcaline chlorée et la phase acide ?',
        choix: ['Rien, on enchaîne directement', 'Un rinçage abondant à l’eau', 'Ajouter de la javel pour neutraliser'], bonne: 1 },
      { question: 'Vous sentez une odeur piquante en projetant la mousse. Votre premier réflexe ?',
        choix: ['Finir la zone rapidement', 'Quitter la zone et prévenir le chef d’équipe', 'Mettre un masque papier et continuer'], bonne: 1 }
    ]
  },
  {
    cle: 'consignation',
    theme: 'Consignation des machines avant nettoyage',
    duree: 10,
    objectif: 'Ne jamais intervenir sur un équipement de production (trancheuse, convoyeur, mélangeur) sans qu’il soit consigné et vérifié à l’arrêt.',
    sections: [
      { titre: 'Pourquoi c’est vital',
        texte: 'La majorité des accidents graves en nettoyage industriel se produisent au contact d’une machine remise en marche par quelqu’un qui ne savait pas qu’on intervenait dessus, ou d’un organe resté en mouvement par inertie. Un arrêt d’urgence n’est pas une consignation.' },
      { titre: 'Les cinq étapes',
        texte: '1. Séparer : couper l’énergie au sectionneur (électrique, pneumatique, hydraulique).\n2. Condamner : poser son propre cadenas, une personne = un cadenas.\n3. Signaler : pancarte « Ne pas manœuvrer, intervention en cours » avec son nom.\n4. Vérifier : tenter un démarrage, attendre l’arrêt complet des organes.\n5. Dissiper les énergies résiduelles : purger l’air, attendre l’arrêt des volants.' },
      { titre: 'À la fin',
        texte: 'Chacun retire uniquement son propre cadenas, après avoir remis les carters et vérifié que personne n’est dans la zone. On ne retire jamais le cadenas d’un collègue.' }
    ],
    pointsCles: [
      'Arrêt d’urgence ≠ consignation',
      'Une personne, un cadenas, une pancarte à son nom',
      'Toujours vérifier l’absence d’énergie avant d’approcher les mains',
      'Carters remis avant de retirer son cadenas'
    ],
    quiz: [
      { question: 'L’arrêt d’urgence est enclenché. Pouvez-vous démonter le carter pour nettoyer ?',
        choix: ['Oui, la machine est arrêtée', 'Non, il faut consigner avec son cadenas et vérifier', 'Oui si le chef de ligne est prévenu'], bonne: 1 },
      { question: 'Vous êtes trois à nettoyer la même ligne. Combien de cadenas sur le sectionneur ?',
        choix: ['Un seul, celui du chef d’équipe', 'Trois, un par personne', 'Aucun si on se surveille mutuellement'], bonne: 1 }
    ]
  },
  {
    cle: 'glissade',
    theme: 'Sols mouillés et gras : prévenir les glissades',
    duree: 8,
    objectif: 'Réduire les chutes de plain-pied, première cause d’accident en nettoyage agroalimentaire.',
    sections: [
      { titre: 'Les situations à risque',
        texte: 'Sols couverts de mousse, de graisse ou de résidus de production, flexibles qui traînent, caniveaux ouverts, passage entre zone froide et zone humide, marche en reculant pendant le raclage.' },
      { titre: 'Les bons gestes',
        texte: 'Chaussures de sécurité antidérapantes en bon état (semelle non lisse). Racler les déchets avant de mouiller. Ranger les flexibles le long des murs et les enrouler après usage. Avancer face à la zone à traiter, jamais à reculons. Refermer les grilles de caniveau. Baliser les zones mouillées accessibles au personnel de production.' }
    ],
    pointsCles: [
      'Chaussures antidérapantes contrôlées chaque semaine',
      'Flexibles rangés, caniveaux refermés',
      'On ne recule pas en raclant',
      'Zone mouillée accessible = zone balisée'
    ],
    quiz: [
      { question: 'Quelle est la première cause d’accident dans notre métier ?',
        choix: ['Les coupures', 'Les chutes de plain-pied', 'Les brûlures'], bonne: 1 }
    ]
  },
  {
    cle: 'haute-pression',
    theme: 'Nettoyeur haute pression : jet et projections',
    duree: 8,
    objectif: 'Utiliser la haute pression sans se blesser ni blesser un collègue, et sans projeter de produit dans les yeux.',
    sections: [
      { titre: 'Les dangers',
        texte: 'Un jet haute pression perce la peau et injecte de l’eau souillée sous les tissus : une plaie qui paraît petite peut nécessiter une opération. Le recul de la lance fait perdre l’équilibre sur sol glissant. Les projections et le brouillard chargent l’air en produit.' },
      { titre: 'Les bons gestes',
        texte: 'Tenir la lance à deux mains, pieds écartés. Ne jamais diriger le jet vers une personne, ni vers soi pour se rincer les bottes. Vérifier flexibles et raccords avant de démarrer. Visière ou lunettes étanches et tenue imperméable. Couper la pression avant de changer de buse ou de déplacer la lance.' }
    ],
    pointsCles: [
      'Jamais le jet vers une personne, ni vers soi',
      'Lance à deux mains, appuis stables',
      'Pression coupée pour changer de buse',
      'Toute blessure par jet = consultation médicale immédiate'
    ],
    quiz: [
      { question: 'Un collègue s’est fait une petite entaille avec le jet. Que faire ?',
        choix: ['Un pansement suffit', 'Consultation médicale immédiate, même si la plaie paraît petite', 'Désinfecter à la javel'], bonne: 1 }
    ]
  },
  {
    cle: 'froid',
    theme: 'Travail au froid et en chambre froide',
    duree: 8,
    objectif: 'Se protéger du froid et ne jamais rester enfermé en chambre froide ou en tunnel de surgélation.',
    sections: [
      { titre: 'Les risques',
        texte: 'Engourdissement des mains qui fait perdre la prise, gelures, fatigue accrue, enfermement accidentel. Le froid humide après une phase de lavage accentue tout cela.' },
      { titre: 'Les bons gestes',
        texte: 'Vêtements secs sous la tenue de protection, gants adaptés au froid. Faire des pauses au chaud selon l’organisation du site. Avant d’entrer : vérifier que la poignée intérieure anti-enfermement fonctionne et prévenir un collègue. Ne jamais caler une porte ouverte avec un objet qui pourrait tomber et bloquer l’ouverture.' }
    ],
    pointsCles: [
      'Prévenir avant d’entrer en chambre froide',
      'Vérifier la poignée anti-enfermement',
      'Vêtements secs, pauses au chaud'
    ],
    quiz: []
  },
  {
    cle: 'isole',
    theme: 'Travailleur isolé la nuit',
    duree: 8,
    objectif: 'Pouvoir donner l’alerte et être secouru quand on nettoie seul un atelier la nuit ou le week-end.',
    sections: [
      { titre: 'Le principe',
        texte: 'Un agent seul qui chute ou fait un malaise peut rester sans secours pendant des heures. Le travail isolé n’est autorisé que pour les tâches prévues par le plan de prévention et avec un moyen d’alerte.' },
      { titre: 'Ce qu’on attend de vous',
        texte: 'Porter le dispositif d’alarme travailleur isolé (DATI) chargé et allumé pendant toute la vacation. Respecter les appels de contrôle prévus. Les tâches à risque (consignation, hauteur, produits concentrés) ne se font jamais seul. Signaler tout DATI défaillant avant de commencer.' }
    ],
    pointsCles: [
      'DATI chargé et porté du début à la fin de la vacation',
      'Pas de tâche à risque en étant seul',
      'DATI en panne = on prévient avant de commencer'
    ],
    quiz: [
      { question: 'Votre DATI ne s’allume pas en début de vacation. Que faites-vous ?',
        choix: ['Je commence et je le signale le lendemain', 'Je préviens mon responsable avant de commencer', 'Je travaille près de la porte'], bonne: 1 }
    ]
  }
];
