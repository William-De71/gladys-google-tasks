# Google Tasks

## Présentation

Cette intégration amène vos listes **Google Tasks** dans Gladys : un appareil par liste avec ses compteurs, des widgets pour voir, ajouter et terminer des tâches depuis le tableau de bord, et des scènes qui réagissent à vos tâches ou les modifient.

- **Un appareil par liste** (« Mes tâches », « Courses »…) avec trois compteurs : tâches **à faire**, **en retard** et **pour aujourd’hui**.
- **Widgets** : les tâches d’une liste (échéance, retard, notes, lien) avec les formulaires **Ajouter** et **Terminer**, et un **récapitulatif** de toutes les listes.
- **Scènes** : tâche ajoutée, terminée, arrivée à échéance ou passée en retard ; ajouter, terminer, lire les tâches, effacer les tâches terminées.
- **Cloud** : vos tâches transitent entre les serveurs de Google et votre Gladys, avec votre propre client Google ; rien ne passe par un serveur tiers. Google Tasks n’envoie aucune notification : l’intégration relit vos listes toutes les **5 minutes** (réglable) et juste après une modification faite depuis Gladys.
- **Échéance = une date** : Google Tasks n’enregistre que le jour (l’heure éventuellement choisie dans l’application n’est pas lisible par l’API). « Aujourd’hui » et « en retard » suivent le fuseau horaire de Gladys.

![Le widget Google Tasks avec son formulaire Ajouter ouvert, et le récapitulatif des listes (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-google-tasks/main/docs/assets/widgets.fr.png)

## Prérequis

- Gladys **5.2.0** ou plus récent (formulaires des widgets).
- Un compte Google (personnel ou Workspace) qui utilise Google Tasks.
- Un **projet Google Cloud** gratuit dans lequel vous créez **votre propre client OAuth** : Google ne permet pas de partager une clé, et l’intégration n’en embarque aucune. Comptez une dizaine de minutes, une seule fois.

## Configuration

### 1. Projet Google Cloud et API

1. Ouvrez la [console Google Cloud](https://console.cloud.google.com/) et créez un projet (par exemple « Gladys »).
2. Dans **API et services → Bibliothèque**, cherchez **Google Tasks API** et cliquez sur **Activer** ([lien direct](https://console.cloud.google.com/apis/library/tasks.googleapis.com)).

### 2. Écran de consentement (Google Auth Platform)

1. Ouvrez **Google Auth Platform** ([lien](https://console.cloud.google.com/auth/overview)) et cliquez sur **Commencer** : nom de l’application (« Gladys »), adresse e-mail d’assistance, audience **Externe**, adresse de contact, acceptez les conditions, puis **Créer**.
2. Dans **Audience**, cliquez sur **Publier l’application** pour la passer **En production**. C’est important : une application laissée **En test** reçoit des autorisations qui **expirent au bout de 7 jours** (il faudrait se reconnecter chaque semaine), et seuls les comptes ajoutés comme utilisateurs test peuvent se connecter.
3. Inutile de demander la validation de Google : l’application reste « non validée », ce qui est normal pour un usage personnel. Google affichera simplement un avertissement lors de la connexion (voir l’étape 4). Une application non validée est limitée à 100 utilisateurs, largement assez pour un foyer.

### 3. Client OAuth

1. Dans **Google Auth Platform → Clients**, cliquez sur **Créer un client**.
2. Type d’application : **Application Web**, nom : « Gladys ».
3. Dans **URI de redirection autorisés**, ajoutez exactement :

   ```
   https://my.gladysassistant.com/redirect/oauth
   ```

   C’est la page HTTPS de Gladys qui renvoie votre navigateur vers votre instance, quelle que soit son adresse (Google refuse les adresses en `http://` et les adresses IP comme `http://192.168.1.50`). Elle est la même pour tout le monde ; l’écran de configuration de Gladys l’affiche aussi, avec un bouton pour la copier. Si vous accédez à Gladys en HTTPS et activez l’option avancée « adresse de l’instance » de cet écran, déclarez plutôt l’adresse qu’il affiche.

4. Cliquez sur **Créer**, puis copiez le **Client ID** et le **Code secret du client** (il commence par `GOCSPX-`). Copiez le secret tout de suite : Google ne le réaffiche pas toujours ensuite.
5. Si la console demande d’ajouter `gladysassistant.com` aux **Domaines autorisés** (Google Auth Platform → Branding), acceptez.

### 4. Dans Gladys

1. Ouvrez l’intégration **Google Tasks**, collez le **Client ID** et le **Client secret**, puis **enregistrez**.
2. Cliquez sur **Se connecter avec Google** et choisissez votre compte.
3. Google prévient qu’il **n’a pas validé cette application** : c’est la vôtre. Cliquez sur **Paramètres avancés**, puis sur **Accéder à Gladys (non sécurisé)**.
4. **Cochez** l’autorisation Google Tasks (« Créer, modifier, organiser et supprimer toutes vos tâches ») puis **Continuer**. Vous revenez dans Gladys, connecté.
5. Allez dans **Découverte** et ajoutez les listes qui vous intéressent, puis ajoutez les widgets à un tableau de bord.

| Champ                                     | Par défaut  | Rôle                                                                                                                                  |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Client ID                                 | —           | Le Client ID de votre client OAuth (se termine par `.apps.googleusercontent.com`).                                                    |
| Client secret                             | —           | Son code secret (`GOCSPX-…`), jamais affiché ni écrit dans les journaux.                                                              |
| Se connecter avec Google                  | —           | Le bouton de connexion. Seule l’autorisation Google Tasks est demandée.                                                               |
| Lire Google Tasks toutes les (minutes)    | 5           | De 1 à 60. Chaque lecture coûte 1 requête + 1 par liste ; Google en autorise 50 000 par jour et par projet.                           |
| Heure du déclencheur « tâche à échéance » | 8           | Google enregistre une date sans heure : une tâche due aujourd’hui déclenche ses scènes à cette heure (0 à 23), à la lecture suivante. |
| Langue des textes                         | Automatique | Noms des fonctionnalités et résumés des scènes. Automatique : la langue de votre tableau de bord dès qu’un widget a été affiché.      |

Les jetons sont renouvelés automatiquement. Si Google révoque l’accès (application laissée en test, accès retiré dans votre compte Google, secret régénéré, six mois sans utilisation), l’intégration s’arrête de solliciter Google, le signale dans l’état de connexion, et il suffit de cliquer à nouveau sur **Se connecter avec Google**. Vos appareils et vos scènes sont conservés.

## Utilisation

### Appareils

Un appareil par liste, nommé « Google Tasks: <nom de la liste> ». Son identifiant suit celui de la liste chez Google : renommer la liste ne casse rien.

| Fonctionnalité          | Type Gladys       | Valeur                                                   |
| ----------------------- | ----------------- | -------------------------------------------------------- |
| Tâches à faire          | Compteur (entier) | Tâches non terminées de la liste, sous-tâches comprises. |
| Tâches en retard        | Compteur (entier) | Tâches à faire dont l’échéance est passée.               |
| Tâches pour aujourd’hui | Compteur (entier) | Tâches à faire dont l’échéance est aujourd’hui.          |

Ces compteurs sont en lecture seule ; ils servent aux tuiles, à l’historique et aux conditions de scène (« s’il y a plus de 3 tâches en retard… »).

### Widgets

- **Google Tasks** : les tâches d’une liste (réglage **Liste de tâches** ; vide = la première liste, « Mes tâches »), triées par échéance puis dans l’ordre de la liste, avec les badges **En retard**, **Aujourd’hui** et **Demain** ; une sous-tâche est précédée de « ↳ ». Touchez une tâche pour voir ses notes et l’ouvrir dans Google Tasks. Le réglage **Afficher** limite la carte aux tâches **pour aujourd’hui ou en retard**. Boutons :
  - **Ajouter** : titre, échéance (sans date, aujourd’hui, demain, dans une semaine ou autre date) et notes ;
  - **Terminer** : choisissez la tâche dans la liste ;
  - **Actualiser** : relit Google Tasks tout de suite.
- **Listes de tâches** : le total à faire, en retard et pour aujourd’hui, et une ligne par liste.

Les formulaires des widgets demandent Gladys 5.2.0 ou plus récent.

### Déclencheurs de scène

Chaque déclencheur peut être limité à une liste. Variables disponibles : nom de la liste, titre, notes, échéance (`AAAA-MM-JJ`), sous-tâche, lien et identifiant de la tâche.

| Déclencheur                     | Quand                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Google Tasks : tâche ajoutée    | Une tâche apparaît dans une liste (téléphone, Gmail, Agenda…). Pas pour celles ajoutées par Gladys. |
| Google Tasks : tâche terminée   | Une tâche est marquée terminée en dehors de Gladys.                                                 |
| Google Tasks : tâche à échéance | Une tâche à faire est due aujourd’hui : à l’heure réglée dans la configuration.                     |
| Google Tasks : tâche en retard  | Une tâche à faire dépasse son échéance (juste après minuit).                                        |

Chaque événement correspond à un changement constaté entre deux lectures, jamais à un état répété. Au démarrage, la première lecture sert de référence : elle ne déclenche rien.

### Actions de scène

| Action                                      | Paramètres                                                                         | Résultats                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Google Tasks : ajouter une tâche            | Liste, titre (variables acceptées), notes, échéance                                | Identifiant, titre, échéance, lien                                              |
| Google Tasks : terminer une tâche           | Liste (vide = toutes), titre (casse et accents ignorés)                            | Tâche terminée (oui/non), titre, liste                                          |
| Google Tasks : lire les tâches              | Liste (vide = toutes), toutes / aujourd’hui ou en retard / aujourd’hui / en retard | Nombre, en retard, aujourd’hui, titres, résumé, prochaine tâche et son échéance |
| Google Tasks : effacer les tâches terminées | Liste (vide = toutes)                                                              | —                                                                               |

L’échéance accepte `AAAA-MM-JJ`, `JJ/MM/AAAA`, `+3` (dans 3 jours), aujourd’hui et demain. « Terminer » cherche d’abord un titre identique, puis un titre qui le contient, et ne fait rien (résultat « non ») si aucune tâche ne correspond. Une action de scène ne déclenche jamais de scène en retour.

### Exemples de scènes

- **Rappel du matin** : tous les jours à 7 h 30 → « Google Tasks : lire les tâches » (aujourd’hui ou en retard) → si le nombre est supérieur à 0, envoyer `{{0.0.summary}}` par message.
- **Poubelles** : le mardi à 19 h → « Google Tasks : ajouter une tâche » « Sortir les poubelles » pour aujourd’hui dans la liste « Maison » ; et quand elle est **terminée**, éteindre la lumière du garage.
- **Courses** : quand une tâche est **ajoutée** à la liste « Courses » → notifier le foyer avec `{{triggerEvent.data.title}}`.
- **Retards** : quand une tâche passe **en retard** → allumer la LED du bureau en rouge.

## Dépannage

- **« Erreur 400 : redirect_uri_mismatch »** : l’URI de redirection déclarée dans le client OAuth n’est pas identique à celle de Gladys. Vérifiez `https://my.gladysassistant.com/redirect/oauth`, sans barre finale, dans **URI de redirection autorisés** du client **Application Web** (pas dans « Origines JavaScript »), enregistrez et patientez quelques minutes.
- **« Erreur 403 : access_denied » / l’application n’a pas terminé la procédure de validation** : l’application est encore **En test** et votre compte n’est pas utilisateur test. Publiez-la (**Audience → Publier l’application**) ou ajoutez votre compte comme utilisateur test.
- **« Google n’a pas validé cette application »** : normal, c’est votre propre application ; **Paramètres avancés → Accéder à Gladys (non sécurisé)**.
- **« L’autorisation Google Tasks n’a pas été accordée »** : sur l’écran de consentement, la case Google Tasks n’était pas cochée. Reconnectez-vous et cochez-la.
- **« Google a révoqué l’accès » toutes les semaines** : l’application est restée **En test** (autorisations de 7 jours). Publiez-la, puis reconnectez-vous.
- **« L’API Google Tasks n’est pas activée »** : activez **Google Tasks API** dans le projet du client OAuth, attendez quelques minutes, puis **Tester la connexion**.
- **« invalid_client »** : Client ID ou Client secret erroné, ou secret régénéré dans la console. Corrigez-les, enregistrez et reconnectez-vous.
- **Le retour de Google affiche une erreur au lieu de Gladys** : cliquez une seule fois sur « Se connecter », gardez un seul onglet d’autorisation ouvert, et recommencez.
- **« Aujourd’hui » ou « en retard » décalés d’un jour** : vérifiez le fuseau horaire de Gladys (Paramètres → Système) ; l’action **Diagnostic** l’écrit dans les journaux.
- **Une modification faite sur le téléphone met quelques minutes à apparaître** : c’est l’intervalle de lecture (5 minutes par défaut). Le bouton **Actualiser** des widgets relit tout de suite.
- **Pour un rapport de bug** : cliquez sur **Diagnostic** (résumé anonymisé dans les journaux, sans jeton ni titre de tâche), puis joignez les journaux de l’intégration, la version de Gladys et celle de l’intégration.

## Limites

- Pas de notification de Google : un changement apparaît au plus tard après l’intervalle de lecture, et un déclencheur « à échéance » part à la première lecture après l’heure réglée.
- L’heure d’une tâche n’est pas lisible : seule la date d’échéance est connue.
- Si l’intégration est arrêtée au moment d’un changement (redémarrage, mise à jour), l’événement correspondant n’est pas rattrapé : la première lecture après le démarrage sert de référence.
- Une tâche supprimée ne déclenche rien ; une tâche disparue lors d’une relecture complète (toutes les 6 heures) non plus, car l’API ne permet pas alors de savoir si elle a été terminée ou supprimée.
- Pas de création de sous-tâche, de déplacement, de modification ni de suppression de tâche, ni de gestion des listes elles-mêmes.
- Les tâches attribuées depuis Docs ou Chat sont comptées et affichées, mais Google ne permet pas d’en créer par l’API.
- Un seul compte Google par intégration.
