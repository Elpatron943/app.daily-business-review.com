/**
 * Packs MÉTIER — ce que le commercial vend exactement.
 *
 * Quatre couches (décision du fondateur, 18 oct. 2026) :
 * 1. cadre commun (meetingPatterns.ts : moments du rendez-vous + 11 facteurs de blocage) ;
 * 2. secteur du client (sectorModels.ts : à qui il vend) ;
 * 3. métier du vendeur (ce fichier : ce qu'il vend exactement) ;
 * 4. taille et groupe (complexité).
 *
 * Un pack métier ne réécrit pas le cadre :
 * - il REFORMULE certains moments communs avec ses mots (variants, par id de pattern) ;
 * - il AJOUTE ses questions propres, toujours rattachées à un facteur de blocage ;
 * - il précise interlocuteurs, preuves attendues et blocages fréquents.
 * Sans variante, la question commune s'applique. Quelques règles croisées
 * métier × secteur client ajustent le rendez-vous là où ça change vraiment.
 *
 * Contenu : hypothèses de terrain, sauf mention sourcée. Aucun chiffre présenté
 * comme une statistique : les nombres dans les répliques sont des données de jeu.
 */

import type { BlockerFactorId } from "./blockerFactors";
import type { ComplexityLevel, MeetingTypeId } from "./sectorModels";
import type { DiscoveryStageId } from "./meetingPatterns";

export type QuestionVariant = {
  buyerLine?: string;
  question?: string;
  good?: string;
  riskReply?: string;
};

export type MetierQuestion = {
  id: string;
  meeting: MeetingTypeId;
  /** Étape de la trame de découverte ; par défaut, déduite du facteur. */
  stage?: DiscoveryStageId;
  factor: BlockerFactorId;
  minLevel: ComplexityLevel;
  theme: string;
  buyerLine: string;
  question: string;
  good: string;
  /** Réplique quand le facteur bloque le deal, avec le risque associé. */
  risk?: {
    reply: string;
    level: "risque" | "risque_majeur";
    text: string;
    action: string;
  };
  argument: [label: string, reply: string];
  vague: [label: string, reply: string];
};

export type MetierDomain = {
  id: string;
  label: string;
  /** Ce que vend le commercial, en une phrase. */
  offer: string;
  interlocutors: Partial<Record<MeetingTypeId, string>>;
  proofs: string[];
  likelyBlockers: BlockerFactorId[];
  /** Reformulations de moments communs, par id de pattern. */
  variants: Record<string, QuestionVariant>;
  /** Questions propres au métier. */
  questions: MetierQuestion[];
};

export type MetierPack = {
  id: string;
  label: string;
  domains: MetierDomain[];
};

export type CrossRule = {
  domainId: string;
  clientSectorId: string;
  /** Pourquoi la règle existe (affiché dans la doc, pas au commercial). */
  why: string;
  addLikely?: BlockerFactorId[];
  variants?: Record<string, QuestionVariant>;
  source?: string;
};

function x(
  id: string,
  meeting: MeetingTypeId,
  factor: BlockerFactorId,
  minLevel: ComplexityLevel,
  theme: string,
  buyerLine: string,
  question: string,
  good: string,
  argument: [string, string],
  vague: [string, string],
  risk?: MetierQuestion["risk"],
): MetierQuestion {
  return { id, meeting, factor, minLevel, theme, buyerLine, question, good, argument, vague, risk };
}

function r(
  reply: string,
  text: string,
  action: string,
  level: "risque" | "risque_majeur" = "risque",
): MetierQuestion["risk"] {
  return { reply, level, text, action };
}

/* ------------------------------------------------------------------ */
/* Pack Cybersécurité                                                  */
/* ------------------------------------------------------------------ */

const CYBER: MetierPack = {
  id: "cybersecurite",
  label: "Cybersécurité",
  domains: [
    {
      id: "cyber-infra",
      label: "Infrastructure et réseau",
      offer: "la sécurité de l'infrastructure et du réseau (pare-feu, segmentation, postes)",
      interlocutors: { R1: "Responsable infrastructure", R2: "Équipe réseau et sécurité", R3: "RSSI", R4: "Acheteur informatique" },
      proofs: ["Démonstration sur leur architecture", "Résultats d'audit ou de test d'intrusion", "Références d'infrastructures comparables"],
      likelyBlockers: ["capacite", "priorites", "concurrence"],
      variants: {
        "r1-probleme": {
          question: "Quel incident, audit ou projet a mis la sécurité de votre infrastructure à l'ordre du jour ?",
          good: "Le dernier test d'intrusion a montré qu'un poste compromis donnait accès à tout le réseau.",
          riskReply: "Rien de précis, on se dit qu'il faudrait moderniser.",
        },
        "r1-urgence": {
          question: "Que se passe-t-il si le prochain audit relève les mêmes failles ?",
          good: "La direction a été claire : ce sera la dernière fois.",
        },
        "r2-cas": {
          question: "Sur quelle partie de votre architecture voulez-vous voir la solution : sites distants, postes, serveurs ?",
          good: "Les sites distants : c'est là que tout passe sans contrôle.",
        },
      },
      questions: [
        x("infra-existant", "R1", "concurrence", 1, "Les outils en place",
          "Nous avons déjà des pare-feu et un antivirus.",
          "Qu'est-ce que vos outils actuels ne couvrent pas, et qui les a choisis ?",
          "Ils ne voient rien de ce qui circule entre les serveurs.",
          ["« Notre technologie est bien plus récente. »", "Ce n'est pas un critère pour nous."],
          ["« Vous êtes contents de vos outils ? »", "Ça dépend des jours."],
          r("Tout est couvert par notre fournisseur actuel, sous contrat pour encore trois ans.",
            "Concurrence : un fournisseur en place, sous contrat.",
            "Identifier ce que le contrat en place ne couvre pas et sa date de renouvellement.")),
        x("infra-fenetre", "R2", "priorites", 2, "Les fenêtres de changement",
          "Toute modification du réseau demande une fenêtre de maintenance.",
          "Quelles fenêtres de changement avez-vous, et qui doit les valider ?",
          "Un samedi par mois, validé par le responsable infrastructure.",
          ["« Notre solution s'installe sans interruption. »", "On a déjà entendu ça."],
          ["« C'est compliqué de changer quelque chose chez vous ? »", "Un peu."],
          r("Gel des changements jusqu'à la fin de la migration en cours.",
            "Projets en cours : gel des changements réseau.",
            "Dater la fin du gel et réserver la première fenêtre disponible.", "risque_majeur")),
        x("infra-exploitation", "R2", "capacite", 3, "L'exploitation",
          "Qui va surveiller tout ça ensuite ?",
          "Qui exploitera la solution au quotidien, et avec quel temps disponible ?",
          "Deux personnes de l'équipe réseau, une demi-journée par semaine.",
          ["« Elle tourne toute seule. »", "Aucun outil ne tourne tout seul."],
          ["« Vous avez une équipe pour ça ? »", "On verra."],
          r("Personne : l'équipe est déjà en sous-effectif.",
            "Capacité de mise en œuvre : personne pour exploiter.",
            "Proposer l'exploitation par un partenaire ou un périmètre réduit.")),
        x("infra-test", "R3", "conformite", 2, "La validation technique",
          "Avant tout déploiement, on teste.",
          "Quel test de validation exigez-vous avant la mise en production, et qui le mène ?",
          "Un pilote d'un mois sur un site, mené par notre équipe réseau.",
          ["« Nos clients n'ont jamais eu de problème. »", "Nous ne sommes pas vos clients."],
          ["« Les tests, c'est une formalité ? »", "Non."],
          r("Un test d'intrusion par un prestataire qualifié, à vos frais, avant toute décision.",
            "Sécurité et conformité : test d'intrusion exigé avant décision.",
            "Chiffrer et planifier le test, remonter la prise en charge à la direction.")),
        x("infra-renouvellement", "R4", "achats", 3, "Le renouvellement du parc",
          "Côté achats, on regarde l'ensemble du parc.",
          "Ce projet s'inscrit-il dans un renouvellement de matériel ou de contrat déjà prévu ?",
          "Oui, le renouvellement du parc est budgété pour l'an prochain.",
          ["« Notre offre est moins chère que du matériel. »", "Ce n'est pas la question."],
          ["« Les achats suivent ? »", "Ils suivent leurs règles."],
          r("Non, et les achats veulent tout regrouper dans un appel d'offres global.",
            "Achats et procédure : regroupement dans un appel d'offres global.",
            "Obtenir le calendrier de l'appel d'offres et y entrer tôt.", "risque_majeur")),
      ],
    },
    {
      id: "cyber-iam",
      label: "Identités et accès",
      offer: "la gestion des identités et des accès",
      interlocutors: { R1: "Responsable des identités et des accès", R2: "Équipes informatique et RH", R3: "RSSI", R4: "Acheteur informatique" },
      proofs: ["Connecteurs vers leurs annuaires et applications", "Plan de déploiement par vagues", "Références comparables"],
      likelyBlockers: ["consensus", "capacite", "priorites"],
      variants: {
        "r1-probleme": {
          question: "Comment gérez-vous les arrivées, départs et changements de poste, et que vous coûtent les erreurs ?",
          good: "À la main : des comptes de partants restent actifs pendant des semaines.",
          riskReply: "Ça fonctionne avec des tickets, personne ne se plaint.",
        },
        "r2-cas": {
          question: "Quel parcours voulez-vous voir : une arrivée, un départ, une revue des droits ?",
          good: "Un départ : c'est là qu'on a des comptes orphelins.",
        },
      },
      questions: [
        x("iam-perimetre", "R1", "capacite", 1, "Le périmètre",
          "Nous avons beaucoup d'applications.",
          "Combien d'applications et d'annuaires faudrait-il couvrir, et lesquels en premier ?",
          "Une vingtaine ; on commencerait par la messagerie et l'ERP.",
          ["« Nous nous connectons à tout. »", "Encore faut-il savoir à quoi."],
          ["« Vous avez beaucoup d'applications ? »", "Oui."],
          r("Plusieurs centaines, sans inventaire à jour.",
            "Capacité de mise en œuvre : périmètre inconnu, impossible à cadrer.",
            "Proposer un premier lot limité et un inventaire.")),
        x("iam-rh", "R1", "consensus", 2, "Les RH",
          "Les arrivées et départs passent par les RH.",
          "Qui côté RH et métiers doit être associé, et sont-ils demandeurs ?",
          "Les RH poussent le projet : ils en ont assez des relances.",
          ["« Les RH n'ont pas besoin d'être impliqués. »", "Si, chez nous."],
          ["« Les RH sont au courant ? »", "Vaguement."],
          r("Les RH ne sont pas au courant et lancent leur propre projet de logiciel RH.",
            "Désaccord interne : projet RH concurrent.",
            "Rencontrer les RH tôt et articuler les deux projets.")),
        x("iam-adoption", "R2", "influence", 3, "Les métiers",
          "Les métiers n'aiment pas qu'on touche à leurs accès.",
          "Quel responsable métier pourrait freiner, et pourquoi ?",
          "La direction commerciale, si ça ralentit l'accès à ses outils.",
          ["« Les métiers suivront. »", "Vous ne les connaissez pas."],
          ["« Tout le monde est d'accord ? »", "Pas vraiment."],
          r("La direction financière refuse toute validation supplémentaire dans ses processus.",
            "Circuit d'influence : une direction s'oppose.",
            "Rencontrer cette direction avec le sponsor et adapter le circuit de validation.", "risque_majeur")),
        x("iam-revue", "R3", "conformite", 2, "Les revues d'accès",
          "L'auditeur nous demande des revues de droits.",
          "Quelles revues d'accès vos auditeurs exigent-ils, et à quelle fréquence ?",
          "Une revue annuelle des accès sensibles, avec preuve.",
          ["« Notre outil fait tout automatiquement. »", "L'auditeur voudra comprendre comment."],
          ["« Les audits, ça se passe bien ? »", "Plus ou moins."],
          r("Des revues trimestrielles sur tout le périmètre, à outiller dès le départ.",
            "Sécurité et conformité : exigence d'audit lourde dès le démarrage.",
            "Prévoir les revues dans le premier lot et le chiffrer.")),
        x("iam-licences", "R4", "budget", 2, "Le volume",
          "Le coût dépend du nombre de comptes.",
          "Sur combien d'identités le budget est-il calculé, et qui l'a validé ?",
          "Les salariés internes, validé par la DSI.",
          ["« Notre prix par compte est imbattable. »", "Encore faut-il compter les comptes."],
          ["« Le budget est bon ? »", "Je pense."],
          r("Personne n'a compté les prestataires et les comptes techniques : le budget ne tiendra pas.",
            "Budget : volume sous-estimé.",
            "Recompter le périmètre avec eux avant l'offre.", "risque_majeur")),
      ],
    },
    {
      id: "cyber-soc",
      label: "Détection et réponse (SOC)",
      offer: "la détection et la réponse aux incidents",
      interlocutors: { R1: "RSSI", R2: "Équipe sécurité opérationnelle", R3: "Délégué à la protection des données et RSSI", R4: "Acheteur informatique" },
      proofs: ["Délais de détection et de réponse mesurés chez des clients comparables", "Scénario d'incident joué sur leur environnement", "Organisation de l'astreinte"],
      likelyBlockers: ["capacite", "concurrence", "budget"],
      variants: {
        "r1-probleme": {
          question: "Comment détectez-vous un incident aujourd'hui, et en combien de temps réagissez-vous ?",
          good: "Souvent par un utilisateur qui appelle : on réagit le lendemain.",
          riskReply: "On a des outils, et on n'a jamais eu d'incident.",
        },
      },
      questions: [
        x("soc-astreinte", "R1", "capacite", 1, "La nuit et le week-end",
          "On n'a pas d'équipe la nuit.",
          "Qui répond à une alerte un dimanche à trois heures du matin ?",
          "Personne : c'est justement ce qu'on cherche à couvrir.",
          ["« Avec nous, vous serez couverts en permanence. »", "À quel prix ?"],
          ["« Vous êtes couverts la nuit ? »", "Pas vraiment."],
          r("Notre DSI, sur son téléphone, quand il le voit — et la direction trouve que ça suffit.",
            "Capacité : la direction ne voit pas le besoin d'une couverture permanente.",
            "Faire chiffrer par la direction le coût d'un arrêt d'un week-end.")),
        x("soc-incident", "R1", "statu-quo", 2, "Le vécu",
          "On parle de ce sujet depuis l'attaque chez un confrère.",
          "Avez-vous déjà vécu un incident, et qu'a-t-il coûté ?",
          "Un rançongiciel il y a deux ans : trois jours d'arrêt.",
          ["« Les attaques augmentent partout. »", "On le lit dans les journaux."],
          ["« Vous avez peur d'une attaque ? »", "Comme tout le monde."],
          r("Jamais, et la direction pense que ça n'arrive qu'aux autres.",
            "Statu quo : aucun incident vécu, pas d'urgence ressentie.",
            "S'appuyer sur un incident d'un pair ou sur l'exigence d'un client ou d'un assureur.")),
        x("soc-alertes", "R2", "capacite", 2, "Les alertes",
          "On croule déjà sous les alertes.",
          "Combien d'alertes traitez-vous, et combien sont de vrais incidents ?",
          "Des centaines par jour, presque toutes inutiles : c'est ce qu'on veut régler.",
          ["« Notre moteur réduit le bruit. »", "Tout le monde dit ça."],
          ["« Il y a beaucoup d'alertes ? »", "Trop."],
          r("On ne sait pas : personne n'a le temps de les regarder.",
            "Capacité : personne pour traiter les alertes.",
            "Proposer un service géré plutôt qu'un outil à exploiter.")),
        x("soc-journaux", "R3", "conformite", 2, "Les journaux",
          "La question des données va se poser.",
          "Quelles données de vos journaux pourront sortir de chez vous, et où seront-elles analysées ?",
          "Les journaux techniques, hébergés en France.",
          ["« Nos centres sont sécurisés. »", "Ce n'est pas ma question."],
          ["« Les données, ça pose problème ? »", "Ça dépend lesquelles."],
          r("Aucune donnée ne doit sortir : tout doit être analysé sur nos serveurs.",
            "Sécurité et conformité : aucune donnée ne peut sortir.",
            "Vérifier si une analyse sur site est possible, sinon le dire tôt.", "risque_majeur")),
        x("soc-modele", "R4", "concurrence", 3, "Externe ou interne",
          "On hésite entre un prestataire et une équipe interne.",
          "Qu'est-ce qui vous ferait choisir un service externe plutôt que de recruter ?",
          "On n'arrive pas à recruter : l'externe est la seule option réaliste.",
          ["« Recruter coûte bien plus cher. »", "La direction n'est pas de cet avis."],
          ["« Vous avez réfléchi à l'externe ? »", "Un peu."],
          r("La direction veut recruter deux analystes en interne.",
            "Concurrence ou fait-maison : recrutement interne envisagé.",
            "Comparer avec eux délai, coût et couverture d'une équipe interne.")),
      ],
    },
    {
      id: "cyber-tprm",
      label: "Gestion du risque fournisseur",
      offer: "la gestion du risque fournisseur (évaluation et suivi des tiers)",
      interlocutors: { R1: "Responsable conformité ou risques", R2: "Équipes sécurité et achats", R3: "Responsable des risques", R4: "Acheteur" },
      proofs: ["Évaluation complète d'un de leurs fournisseurs", "Exports attendus par leur auditeur ou régulateur", "Références comparables"],
      likelyBlockers: ["decideur", "capacite", "valeur"],
      variants: {
        "r1-probleme": {
          question: "Combien de fournisseurs critiques suivez-vous, et comment savez-vous lequel vous expose aujourd'hui ?",
          good: "Plus d'une centaine, suivis dans un tableur : on ne sait pas qui est à jour.",
          riskReply: "On envoie un questionnaire à la signature, et ça nous suffit.",
        },
        "r2-cas": {
          question: "Sur quel fournisseur réel voulez-vous voir l'évaluation, du questionnaire au plan d'action ?",
          good: "Notre hébergeur : c'est le plus critique.",
        },
      },
      questions: [
        x("tprm-proprietaire", "R1", "decideur", 1, "Le propriétaire du sujet",
          "Le sujet est partagé entre plusieurs équipes.",
          "Qui est propriétaire du risque fournisseur : achats, sécurité ou conformité ?",
          "La conformité, avec la sécurité en appui.",
          ["« Notre outil réunit tout le monde. »", "Encore faut-il que quelqu'un le porte."],
          ["« Plusieurs équipes, c'est bien ? »", "Ça dépend."],
          r("Personne vraiment : chacun pense que c'est l'autre.",
            "Décideur : aucun propriétaire du sujet.",
            "Faire désigner un propriétaire avant d'aller plus loin.", "risque_majeur")),
        x("tprm-obligation", "R1", "statu-quo", 2, "L'obligation",
          "On sait qu'il faudra s'y mettre.",
          "Quelle obligation ou quel client vous impose ce suivi, et pour quand ?",
          "Un grand client exige nos preuves de suivi avant son audit.",
          ["« La réglementation va forcément l'imposer. »", "On verra bien."],
          ["« C'est une priorité ? »", "Une parmi d'autres."],
          r("Aucune pour l'instant : c'est une bonne pratique.",
            "Statu quo : aucune obligation ni échéance.",
            "Chercher l'exigence d'un client, d'un assureur ou d'un auditeur.")),
        x("tprm-questionnaires", "R2", "capacite", 2, "Les questionnaires",
          "Les relances, c'est le cauchemar.",
          "Qui remplit et relance les questionnaires aujourd'hui, et combien de temps ça prend ?",
          "Une personne à temps plein, qui n'en peut plus.",
          ["« Tout est automatisé chez nous. »", "Les fournisseurs, eux, ne le sont pas."],
          ["« C'est beaucoup de travail ? »", "Oui."],
          r("Personne : on n'a pas l'équipe pour relancer.",
            "Capacité : personne pour faire vivre les évaluations.",
            "Proposer la relance des fournisseurs comme service inclus.")),
        x("tprm-preuves", "R3", "conformite", 2, "Les preuves",
          "Il faudra que l'auditeur s'y retrouve.",
          "Quelles preuves votre auditeur ou votre régulateur attend-il sur vos fournisseurs ?",
          "La liste des fournisseurs critiques, leur évaluation et les plans d'action.",
          ["« Notre tableau de bord plaît à tous les auditeurs. »", "Le nôtre est exigeant."],
          ["« L'auditeur sera content ? »", "On verra."],
          r("Un registre complet de tous nos contrats, au format du régulateur, que l'outil devra produire.",
            "Sécurité et conformité : export réglementaire exigé.",
            "Vérifier le format exigé et le montrer avant la décision.")),
        x("tprm-achats", "R4", "concurrence", 3, "L'outil des achats",
          "Les achats ont leur mot à dire.",
          "Les achats utiliseront-ils l'outil, ou seulement la sécurité ?",
          "Les deux : les achats lanceront l'évaluation à chaque nouveau contrat.",
          ["« Notre outil remplacera le leur. »", "Ils n'ont rien demandé."],
          ["« Les achats sont d'accord ? »", "Je crois."],
          r("Les achats ont déjà leur outil fournisseurs et ne veulent pas en changer.",
            "Concurrence : l'outil fournisseurs des achats.",
            "Proposer de se connecter à leur outil plutôt que de le remplacer.")),
      ],
    },
    {
      id: "cyber-grc",
      label: "Gouvernance et conformité (NIS2, ISO 27001)",
      offer: "la gouvernance et la conformité de la sécurité",
      interlocutors: { R1: "RSSI", R2: "RSSI et responsable conformité", R3: "Direction juridique", R4: "Direction financière" },
      proofs: ["Correspondance avec leur référentiel", "Exemple de dossier d'audit", "Références comparables"],
      likelyBlockers: ["statu-quo", "decideur", "priorites"],
      variants: {
        "r1-probleme": {
          question: "Quel référentiel ou quelle échéance vous pousse aujourd'hui : certification, audit client, NIS2 ?",
          good: "Une certification exigée par nos plus gros clients d'ici un an.",
          riskReply: "Aucune échéance : c'est pour être prêts un jour.",
        },
      },
      questions: [
        x("grc-nis2", "R1", "statu-quo", 1, "NIS2",
          "On entend beaucoup parler de NIS2.",
          "Savez-vous si vous serez entité essentielle ou importante, et qui suit le sujet ?",
          "Entité importante a priori ; le RSSI suit avec la direction juridique.",
          ["« NIS2 va vous coûter très cher si vous ne faites rien. »", "On attend de voir le texte."],
          ["« Vous êtes concernés par NIS2 ? »", "Peut-être."],
          r("On attend la loi française pour bouger.",
            "Statu quo : le client attend la loi française (non promulguée à l'été 2026).",
            "Trouver une échéance qui ne dépend pas de la loi : client, assureur, certification.")),
        x("grc-direction", "R1", "decideur", 2, "La direction",
          "La conformité, c'est mon quotidien.",
          "Qui en direction générale porte la conformité, et à quelle fréquence en entend-elle parler ?",
          "Le directeur général, à chaque comité des risques.",
          ["« La direction sera ravie de votre initiative. »", "Vous ne la connaissez pas."],
          ["« La direction est sensible au sujet ? »", "Un peu."],
          r("Personne en direction : c'est un sujet du RSSI.",
            "Décideur : aucun porteur en direction générale.",
            "Faire porter le sujet en direction par le risque d'un client ou d'un audit.", "risque_majeur")),
        x("grc-existant", "R2", "concurrence", 2, "L'existant",
          "On a déjà commencé à documenter.",
          "Où sont aujourd'hui vos politiques, risques et preuves : tableurs, outil, cabinet de conseil ?",
          "Dans des tableurs dispersés.",
          ["« Les tableurs, c'est dépassé. »", "Ils nous servent bien."],
          ["« Vous êtes bien organisés ? »", "On fait au mieux."],
          r("Un cabinet de conseil nous accompagne déjà avec ses propres outils.",
            "Concurrence : un cabinet déjà en place.",
            "Proposer de travailler avec le cabinet plutôt que contre lui.")),
        x("grc-auditeur", "R3", "conformite", 2, "L'auditeur",
          "Tout finira devant un auditeur.",
          "Quel organisme interviendra, et que regardera-t-il en priorité ?",
          "Un organisme de certification, qui veut des preuves tenues à jour.",
          ["« Notre outil est reconnu par tous les auditeurs. »", "Ce sont eux qui le diront."],
          ["« L'audit vous inquiète ? »", "Un peu."]),
        x("grc-equipe", "R4", "capacite", 3, "Après le projet",
          "Je dois justifier la dépense.",
          "Qui fera vivre la démarche au quotidien une fois le projet terminé ?",
          "Une responsable conformité recrutée le mois dernier.",
          ["« L'outil fait l'essentiel du travail. »", "Aucun outil ne le fait."],
          ["« Vous aurez quelqu'un ? »", "Sans doute."],
          r("Personne : on espère que l'outil le fera tout seul.",
            "Capacité : personne pour faire vivre la démarche.",
            "Dimensionner l'accompagnement ou faire désigner un responsable.")),
      ],
    },
    {
      id: "cyber-cloud",
      label: "Sécurité du cloud",
      offer: "la sécurité des environnements cloud",
      interlocutors: { R1: "Responsable cloud ou architecte", R2: "Équipes de développement et sécurité", R3: "RSSI", R4: "Acheteur informatique" },
      proofs: ["Analyse de leurs comptes en lecture seule", "Intégration à leurs chaînes de déploiement", "Références comparables"],
      likelyBlockers: ["influence", "capacite", "conformite"],
      variants: {
        "r1-probleme": {
          question: "Quelle part de vos applications est dans le cloud, et qui en contrôle la configuration ?",
          good: "La moitié, et chaque équipe projet configure à sa façon.",
          riskReply: "Très peu pour l'instant, c'est pour plus tard.",
        },
      },
      questions: [
        x("cloud-perimetre", "R1", "capacite", 1, "Le périmètre cloud",
          "On a des choses un peu partout.",
          "Sur quels clouds, et combien de comptes ou d'abonnements, la solution devra-t-elle fonctionner ?",
          "Deux fournisseurs, une trentaine de comptes.",
          ["« Nous couvrons tous les clouds. »", "Encore faut-il savoir lesquels."],
          ["« Vous êtes bien dans le cloud ? »", "Oui."],
          r("On ne sait pas : chaque projet a ouvert ses comptes.",
            "Capacité : périmètre cloud inconnu.",
            "Commencer par un inventaire des comptes en lecture seule.")),
        x("cloud-devs", "R2", "influence", 2, "Les développeurs",
          "Les équipes de développement tiennent à leur autonomie.",
          "Comment les équipes de développement réagiront-elles à de nouveaux contrôles ?",
          "Elles le demandent, si ça ne ralentit pas leurs mises en production.",
          ["« Elles n'auront pas le choix. »", "Si, elles l'ont toujours."],
          ["« Les développeurs sont d'accord ? »", "On ne leur a pas demandé."],
          r("Elles ont déjà fait abandonner le dernier outil de sécurité.",
            "Circuit d'influence : les développeurs peuvent bloquer.",
            "Associer un responsable des développeurs au pilote.", "risque_majeur")),
        x("cloud-souverainete", "R3", "conformite", 2, "La localisation",
          "La question de l'hébergement va revenir.",
          "Avez-vous des exigences de localisation ou de souveraineté des données ?",
          "Les données doivent rester en Europe.",
          ["« Nos données sont parfaitement protégées. »", "Ce n'est pas la question."],
          ["« L'hébergement, c'est important pour vous ? »", "Oui."],
          r("Certaines données ne doivent quitter qu'un hébergement qualifié, ce qui exclut votre offre actuelle.",
            "Sécurité et conformité : exigence d'hébergement qualifié.",
            "Vérifier ce qui est possible et le dire tôt, sans promesse.", "risque_majeur")),
        x("cloud-marketplace", "R4", "achats", 3, "Le canal d'achat",
          "Il faut que je voie comment on vous achète.",
          "Passerez-vous par la place de marché de votre fournisseur cloud ou par vos achats habituels ?",
          "Par la place de marché : c'est déjà dans notre engagement chez le fournisseur.",
          ["« La place de marché, c'est plus rapide. »", "Pas chez nous."],
          ["« L'achat, ça ira vite ? »", "On verra."],
          r("Par un appel d'offres : les achats n'acceptent pas les places de marché.",
            "Achats et procédure : appel d'offres imposé.",
            "Obtenir le calendrier de l'appel d'offres.")),
      ],
    },
    {
      id: "cyber-sensibilisation",
      label: "Sensibilisation des collaborateurs",
      offer: "la sensibilisation des collaborateurs à la sécurité",
      interlocutors: { R1: "RSSI", R2: "RSSI et communication interne", R3: "Délégué à la protection des données", R4: "Responsable formation ou acheteur" },
      proofs: ["Campagne test sur une équipe", "Contenus adaptés à leurs métiers", "Mesure avant et après"],
      likelyBlockers: ["valeur", "statu-quo", "consensus"],
      variants: {
        "r1-probleme": {
          question: "Quels incidents récents sont partis d'une erreur humaine, et qu'ont-ils coûté ?",
          good: "Un virement frauduleux après un faux courriel du dirigeant.",
          riskReply: "Aucun à notre connaissance : c'est surtout pour cocher la case.",
        },
      },
      questions: [
        x("sensi-cible", "R1", "capacite", 1, "Le public",
          "On aimerait former tout le monde.",
          "Combien de collaborateurs, dans quelles langues, et avec quel temps disponible pour se former ?",
          "Mille personnes, en français, vingt minutes par mois.",
          ["« Nos modules plaisent à tout le monde. »", "Pas aux équipes terrain."],
          ["« Tout le monde pourra suivre ? »", "On espère."],
          r("Les équipes terrain n'ont ni ordinateur ni temps.",
            "Capacité : une partie du public ne peut pas suivre.",
            "Prévoir des formats courts sur téléphone ou en présentiel.")),
        x("sensi-rh", "R2", "consensus", 2, "Les RH",
          "On veut en faire une vraie campagne.",
          "Les RH et la communication interne portent-elles le projet avec vous ?",
          "Oui, la communication interne veut en faire une campagne.",
          ["« Les faux courriels marchent toujours. »", "Les RH n'aiment pas ça."],
          ["« Les RH sont partantes ? »", "À voir."],
          r("Les RH refusent tout ce qui ressemble à un piège envoyé aux salariés.",
            "Désaccord interne : les RH s'opposent aux simulations.",
            "Proposer un dispositif sans piège nominatif, validé avec les RH.")),
        x("sensi-donnees", "R3", "conformite", 2, "Les résultats individuels",
          "La question du suivi individuel va se poser.",
          "Quels résultats individuels pourrez-vous conserver, et qui pourra les voir ?",
          "Des résultats agrégés seulement, validés avec le délégué à la protection des données.",
          ["« Le suivi individuel est indispensable. »", "Pas chez nous."],
          ["« Le suivi pose problème ? »", "Peut-être."],
          r("Les représentants du personnel doivent être consultés avant tout suivi individuel.",
            "Sécurité et conformité : consultation des représentants du personnel.",
            "Prévoir la consultation dans le calendrier, ou un suivi uniquement agrégé.")),
        x("sensi-mesure", "R4", "valeur", 3, "La preuve du résultat",
          "La direction va me demander à quoi ça sert.",
          "Comment prouverez-vous à la direction que la formation a changé les comportements ?",
          "En suivant le taux de clic sur les faux courriels, avant et après.",
          ["« Nos clients réduisent fortement les clics. »", "Chez nous, il faudra le prouver."],
          ["« La direction sera convaincue ? »", "Pas sûr."],
          r("On ne mesurera pas : l'important est de l'avoir fait.",
            "Valeur non perçue : aucun indicateur de résultat.",
            "Fixer avec eux un indicateur avant et après.")),
      ],
    },
  ],
};

export const METIER_PACKS: readonly MetierPack[] = [CYBER];

/** Règles croisées métier × secteur client, là où elles changent vraiment le rendez-vous. */
export const CROSS_RULES: readonly CrossRule[] = [
  {
    domainId: "cyber-tprm",
    clientSectorId: "banque-assurance",
    why: "DORA fait du suivi des prestataires TIC une obligation : la valeur est forte, le blocage se déplace vers les achats et la conformité.",
    addLikely: ["conformite", "achats"],
    variants: {
      "r1-situation": {
        question: "Comment tenez-vous aujourd'hui le registre d'informations DORA de vos contrats TIC ?",
        good: "Dans un tableur, mis à jour quand on y pense.",
      },
      "r1-urgence": {
        question: "Que se passe-t-il si l'ACPR vous demande votre registre DORA et qu'il est incomplet ?",
        good: "Ce serait un constat de contrôle : la direction ne veut pas en entendre parler.",
      },
    },
    source: "https://www.legiscope.com/blog/dora-prestataires-tic-tierce-partie.html",
  },
  {
    domainId: "cyber-grc",
    clientSectorId: "sante-publique",
    why: "Les établissements publics de santé sont prévus comme entités essentielles NIS2 : la question NIS2 devient centrale.",
    addLikely: ["conformite"],
  },
  {
    domainId: "cyber-soc",
    clientSectorId: "energie-eau-transports",
    why: "Systèmes critiques : la localisation des journaux et la réactivité priment.",
    addLikely: ["conformite"],
  },
];

export function getMetierDomain(id: string | null | undefined): { pack: MetierPack; domain: MetierDomain } | null {
  if (!id) return null;
  for (const pack of METIER_PACKS) {
    const domain = pack.domains.find((d) => d.id === id);
    if (domain) return { pack, domain };
  }
  return null;
}

export function crossRulesFor(domainId: string | null | undefined, clientSectorId: string | null | undefined): CrossRule[] {
  if (!domainId || !clientSectorId) return [];
  return CROSS_RULES.filter((r) => r.domainId === domainId && r.clientSectorId === clientSectorId);
}
