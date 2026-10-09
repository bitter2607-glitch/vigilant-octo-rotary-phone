# Causeries sécurité à distance

Préparer une causerie (quart d'heure sécurité), l'envoyer aux agents par lien
ou QR code, et recueillir leur **émargement avec signature électronique**
sur leur téléphone, sans qu'ils aient besoin d'un compte.

## Le déroulé

1. **L'animateur** se connecte à `/admin`, crée la causerie à partir d'un modèle
   (produits chimiques, consignation, glissades, haute pression, froid,
   travailleur isolé) ou d'une page blanche. Il peut y ajouter un quiz et la
   liste des participants attendus.
2. Il **diffuse le lien** par WhatsApp, SMS ou e-mail, ou affiche le QR code
   en salle de pause.
3. **L'agent** ouvre le lien, lit la causerie, répond au quiz, coche
   l'attestation et signe avec le doigt. Il voit ensuite la correction.
4. L'animateur **suit les signatures en direct** : qui a signé, qui manque,
   score au quiz. Il clôture la causerie, imprime ou enregistre en PDF la
   **feuille d'émargement**, ou l'exporte en CSV pour Excel.

## Valeur de preuve

La signature recueillie est une **signature électronique simple** au sens du
règlement eIDAS (art. 25) : elle est recevable en justice et sa force
probante dépend de la fiabilité du procédé. L'application enregistre pour
chaque émargement :

- le nom saisi, la signature manuscrite tracée, l'attestation de lecture ;
- la date et l'heure **du serveur** (l'horloge du téléphone n'est pas utilisée),
  l'adresse IP et le navigateur ;
- l'**empreinte SHA-256 du contenu exact** présenté à l'agent : le contenu est
  figé dès la première signature ;
- un **sceau chaîné** : chaque émargement inclut le sceau du précédent.
  Modifier une heure, supprimer une ligne ou retoucher le texte après coup
  rompt la chaîne, et la fiche affiche « Altération détectée ».

Une causerie signée ne peut pas être supprimée depuis l'application.

Limite à connaître : l'identité repose sur le nom saisi par l'agent, comme sur
une feuille papier. Si vous avez besoin d'une identification forte (code reçu
par SMS, signature avancée), il faut brancher un prestataire (envoi de SMS ou
service de signature qualifié) ; ce n'est pas inclus.

## Lancer en local

Node.js 18 ou plus récent, aucune dépendance à installer.

```
cd causeries
ADMIN_PASSWORD=choisissez-un-mot-de-passe npm start
```

Puis ouvrir http://localhost:3000/admin.

## Mettre en ligne

Les agents signent depuis leur téléphone : l'application doit être joignable
depuis Internet, **en HTTPS**.

| Variable | Rôle |
|---|---|
| `ADMIN_PASSWORD` | mot de passe des animateurs (obligatoire) |
| `PUBLIC_URL` | adresse publique, ex. `https://causeries.mon-entreprise.fr` ; active le cookie `Secure` |
| `DATA_DIR` | dossier des données, à sauvegarder (`./data` par défaut) |
| `TRUST_PROXY=1` | derrière un proxy ou un hébergeur (Render, Railway, Nginx…) pour relever la vraie IP |
| `PORT` | port d'écoute (3000) |

**Avec Docker** (serveur de l'entreprise, VPS, NAS) :

```
docker build -t causeries causeries/
docker run -d --name causeries -p 3000:3000 \
  -e ADMIN_PASSWORD=... -e PUBLIC_URL=https://causeries.mon-entreprise.fr -e TRUST_PROXY=1 \
  -v causeries-data:/data causeries
```

**Avec un hébergeur Node** (Render, Railway, Scalingo, Clever Cloud…) :
répertoire racine `causeries`, commande `npm start`, et un **disque persistant**
monté sur `DATA_DIR`. Sans disque persistant, les émargements disparaissent
au redémarrage.

Les données sont un fichier JSON par causerie dans `DATA_DIR/causeries/`.
Sauvegardez ce dossier comme n'importe quel registre légal.

## Sécurité

- Lien de signature : jeton aléatoire de 144 bits, non devinable. Toute
  personne qui a le lien peut signer, comme une feuille qui circule : ne le
  diffusez qu'aux équipes concernées et clôturez la causerie ensuite.
- Espace animateur : mot de passe, cookie `HttpOnly` `SameSite=Strict`,
  10 essais par quart d'heure et par IP.
- Les bonnes réponses du quiz ne sont envoyées au téléphone qu'après la signature.
- En-têtes CSP stricts, aucun HTML interprété depuis une saisie.

## Fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | serveur HTTP et API |
| `lib/store.js` | stockage, validation, scellement et vérification de la chaîne |
| `lib/auth.js` | session animateur |
| `lib/modeles.js` | modèles de causeries propreté / agroalimentaire |
| `public/admin.*` | écran animateur |
| `public/signer.*` | page de signature des agents |
| `test/app.test.js` | 61 tests (stockage, falsifications, API) |

```
npm test
```
