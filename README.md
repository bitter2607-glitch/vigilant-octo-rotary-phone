# Ratio Masse Salariale — propreté agroalimentaire

Pilotage en temps réel du ratio de masse salariale, site par site.

**Application publiée :** https://claude.ai/artifact/91rb6W4eFpq22WM3PwqwLZ

## Le calcul

Tout est fait en **arithmétique entière** : centimes pour l'argent, centièmes
d'heure pour le temps, points de base pour les pourcentages. Aucun euro ne
transite par un flottant, chaque composant est arrondi une seule fois, et les
répartitions (heures supplémentaires réparties entre plusieurs sites) utilisent
la méthode des plus forts restes — la somme des parts est rigoureusement égale
au total réparti.

```
Coût employeur = salaire de base
               + majorations nuit / dimanche / férié
               + majorations heures sup. 25 % puis 50 %
               + indemnité de précarité CDD + ICCP
               + charges patronales
               + primes par vacation (panier, habillage, transport)

Ratio socle  = MS contrat / CA forfait acquis au prorata des jours d'exploitation
Ratio global = MS totale   / (CA forfait acquis + travaux exceptionnels facturés)
```

Deux points qui font la différence sur un vrai périmètre :

- **Les seuils d'heures supplémentaires s'apprécient par salarié et par semaine,
  tous sites confondus.** Un agent qui tourne sur deux sites déclenche ses heures
  sup. sur le cumul ; elles sont ensuite réaffectées à chaque site au prorata des
  heures qui les ont produites.
- **Une vacation par agent et par jour.** Un agent qui enchaîne sa vacation
  contractuelle et un chantier exceptionnel le même soir ne touche pas deux paniers.

Les jours fériés français sont calculés (Pâques par l'algorithme grégorien
anonyme, puis Ascension et Pentecôte), pas saisis à la main.

## Les taux ne sont pas des taux de convention

Les valeurs par défaut servent d'amorce pour que le calcul démarre. La CCN
propreté (IDCC 3043) et les accords d'entreprise font foi : il faut les saisir
dans l'écran Paramètres, globalement ou site par site.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/calc.js` | Moteur de calcul, sans dépendance ni DOM |
| `src/app.js` | Interface, stockage, graphiques, export CSV |
| `src/index.html` | Structure et feuille de style |
| `test/calc.test.js` | 70 tests du moteur |

## Tests

```
node test/calc.test.js
```
