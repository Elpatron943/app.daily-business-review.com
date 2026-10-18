/**
 * Modèles sectoriels — simulation de rendez-vous et analyse d'opportunité.
 *
 * Deux dimensions choisies par le commercial (décision du fondateur, 18 oct. 2026) :
 * - le secteur de SON CLIENT (à qui il vend) : comité, passages obligatoires,
 *   règles et arbres de décision par type de rendez-vous ;
 * - SON profil vendeur (ce qu'il vend) : objections, preuves et conditions
 *   d'achat propres à ce type d'offre, ajoutées par-dessus l'arbre client.
 *
 * Niveau de preuve : les règles marquées « source » sont sourcées et datées ;
 * tout le reste (rôles, réponses, signaux) est une hypothèse à calibrer sur
 * 30 deals clos par secteur. Aucun chiffre non sourcé.
 *
 * Miroir lisible : cerveau DBR, notes secteur-* et projet-modeles-sectoriels.
 */

export type MeetingTypeId = "R1" | "R2" | "R3" | "R4";

export type MeetingTypeDef = {
  id: MeetingTypeId;
  label: string;
  /** Ce que le commercial doit obtenir à la fin du rendez-vous. */
  goal: string;
};

export const MEETING_TYPES: readonly MeetingTypeDef[] = [
  {
    id: "R1",
    label: "Découverte",
    goal: "Le problème, son coût, qui décide, la prochaine étape datée",
  },
  {
    id: "R2",
    label: "Démonstration",
    goal: "Un cas d'usage validé par ceux qui l'utiliseront",
  },
  {
    id: "R3",
    label: "Revue sécurité, conformité, juridique",
    goal: "La liste des exigences et le chemin pour les remplir",
  },
  {
    id: "R4",
    label: "Achats et contrat",
    goal: "Le mode d'achat, le calendrier et les conditions de signature",
  },
] as const;

export type RiskLevel = "risque" | "risque_majeur";

export type TreeBranch = {
  /** Réponse ou situation de l'interlocuteur. */
  when: string;
  /** Suite : où va le rendez-vous. */
  then: string;
  risk?: RiskLevel;
  /** Action qui traite le risque. */
  action?: string;
};

export type TreeNode = {
  /** La question que le commercial doit poser (ou obtenir). */
  question: string;
  branches: TreeBranch[];
};

export type MeetingTree = {
  meeting: MeetingTypeId;
  /** Interlocuteur type joué par l'IA. */
  interlocutor: string;
  nodes: TreeNode[];
  /** Ce qui fait passer au rendez-vous suivant. */
  issue: string;
};

export type RuleEvidence = "source" | "hypothese" | "a_verifier";

export type SectorRule = {
  text: string;
  evidence: RuleEvidence;
  /** Lien de la source (règles « source »). */
  source?: string;
  /** Date à laquelle la règle a été vérifiée. */
  asOf: string;
};

export type ClientSectorModel = {
  id: string;
  label: string;
  /** Où se joue le deal, en une phrase. */
  keyInsight: string;
  committee: string[];
  veto: string[];
  rules: SectorRule[];
  trees: MeetingTree[];
  /** Couche transverse (grands groupes) : s'ajoute au secteur du client. */
  overlay?: boolean;
};

export type SellerProfile = {
  id: string;
  label: string;
  /** Ce que le commercial vend, en une phrase. */
  offer: string;
  /** Objections que l'acheteur soulève pour ce type d'offre. */
  objections: string[];
  /** Preuves attendues de ce type de vendeur. */
  proofs: string[];
  /** Conditions d'achat propres à ce type d'offre. */
  purchase: string[];
  /** Points que la couche ajoute à chaque type de rendez-vous. */
  byMeeting: Record<MeetingTypeId, string[]>;
};

const AS_OF = "2026-10-18";

function node(question: string, ...branches: TreeBranch[]): TreeNode {
  return { question, branches };
}

function go(when: string, then: string): TreeBranch {
  return { when, then };
}

function risk(
  when: string,
  then: string,
  action: string,
  level: RiskLevel = "risque",
): TreeBranch {
  return { when, then, risk: level, action };
}

const SRC = {
  dora: "https://www.legiscope.com/blog/dora-prestataires-tic-tierce-partie.html",
  seuils:
    "https://www.marche-public.fr/contrats-publics/CCP-publication-nouveaux-seuils-2026.htm",
  capeb:
    "https://www.capeb.fr/actualites/marches-publics-2026-nouveaux-seuils-et-simplification-pour-les-marches-de-travaux",
  ght: "https://acteurspublics.fr/articles/des-acheteurs-plus-muscles-au-coeur-des-groupements-hospitaliers-de-territoire/",
  dgos: "https://www.omedit-grand-est.ars.sante.fr/index.php/media/20012/download",
  nis2: "https://www.openkritis.de/eu/eu-nis-2-france.html",
  gartnerNoDecision: "https://www.mediafly.com/?p=55393",
  gartnerConflict: "https://www.geisheker.com/?p=33060",
} as const;

const NIS2_RULE: SectorRule = {
  text: "Secteur visé par NIS2 (entités essentielles) ; loi française de transposition non promulguée à l'été 2026 — ne jamais présenter l'obligation comme en vigueur en France sans vérification.",
  evidence: "a_verifier",
  source: SRC.nis2,
  asOf: AS_OF,
};

/* ------------------------------------------------------------------ */
/* Secteurs clients                                                    */
/* ------------------------------------------------------------------ */

export const CLIENT_SECTOR_MODELS: readonly ClientSectorModel[] = [
  {
    id: "banque-assurance",
    label: "Banque, assurance",
    keyInsight:
      "Le deal se joue en revue risques : les risques TIC et la conformité ont un droit de veto, cadré par DORA.",
    committee: [
      "Sponsor métier",
      "DSI",
      "Risques TIC ou RSSI",
      "Conformité",
      "Juridique",
      "Achats",
    ],
    veto: ["Risques TIC", "Conformité"],
    rules: [
      {
        text: "DORA : due diligence avant contrat, registre d'informations de tous les contrats TIC (art. 28.3), clauses contractuelles obligatoires (art. 30), stratégie de sortie ; exigences renforcées pour une fonction critique ou importante ; clauses contrôlées par l'ACPR et l'AMF.",
        evidence: "source",
        source: SRC.dora,
        asOf: AS_OF,
      },
    ],
    trees: [
      {
        meeting: "R1",
        interlocutor: "Sponsor métier (direction commerciale ou réseau)",
        nodes: [
          node(
            "Quel problème voulez-vous résoudre, et que vous coûte-t-il aujourd'hui ?",
            go("Problème relié à un indicateur que le sponsor suit", "passer à la question suivante"),
            risk("Réponse vague", "rester sur ce point", "demander l'effet sur un indicateur précis"),
          ),
          node(
            "En dehors de vous, qui devra valider : risques TIC, conformité, achats ?",
            go("Rôles nommés", "passer à la question suivante"),
            risk("« On verra plus tard »", "comité inconnu", "proposer de cartographier ensemble le circuit de validation"),
          ),
          node(
            "Ce service sera-t-il classé comme soutenant une fonction critique ou importante ?",
            go("Non ou ne sait pas", "à confirmer en revue risques"),
            risk("Oui", "exigences DORA renforcées (audit, plan de sortie)", "préparer le dossier de revue dès maintenant"),
          ),
        ],
        issue: "Sponsor nommé, circuit de validation connu, démonstration datée.",
      },
      {
        meeting: "R2",
        interlocutor: "Sponsor métier et deux futurs utilisateurs",
        nodes: [
          node(
            "Sur quel compte ou quel deal voulez-vous voir l'outil ?",
            go("Données fictives exigées", "normal en banque : jeu de démonstration"),
            go("Cas réel accepté", "passer à la question suivante"),
          ),
          node(
            "Qui l'utilisera chaque semaine, et que fera-t-il autrement ?",
            go("Usage décrit par les utilisateurs", "passer à la question suivante"),
            risk("Seul le sponsor parle", "pas d'adhésion terrain", "demander un atelier avec deux utilisateurs"),
          ),
          node(
            "Quelles données sortiront de l'établissement (hébergement, sous-traitants) ?",
            go("Question posée par le client", "préparer la revue risques"),
            go("Non posée", "la poser soi-même, elle reviendra en revue risques"),
          ),
        ],
        issue: "Cas d'usage validé par les utilisateurs, revue risques planifiée.",
      },
      {
        meeting: "R3",
        interlocutor: "Responsable des risques TIC, avec un juriste",
        nodes: [
          node(
            "Quel questionnaire de due diligence fournisseur utilisez-vous, et dans quel délai ?",
            go("Questionnaire transmis", "passer à la question suivante"),
            risk("Aucun contact côté risques", "le deal ne peut pas passer", "obtenir le nom par le sponsor", "risque_majeur"),
          ),
          node(
            "Quelles clauses DORA demandez-vous (audit, localisation des données, sous-traitance, sortie) ?",
            go("Avenant type acceptable", "passer à la question suivante"),
            risk("Demandes au-delà de ce que le vendeur peut prouver", "négociation longue", "remonter à sa direction ; aucune garantie sans preuve"),
          ),
          node(
            "Le contrat sera-t-il inscrit au registre comme fonction critique ou importante ?",
            go("Non", "issue"),
            risk("Oui", "exigences renforcées", "fournir un plan de sortie détaillé"),
          ),
        ],
        issue: "Liste des exigences validée, aucun point bloquant ouvert.",
      },
      {
        meeting: "R4",
        interlocutor: "Acheteur",
        nodes: [
          node(
            "Faut-il un référencement fournisseur avant la commande ?",
            risk("Oui", "délai supplémentaire", "intégrer son délai à la date de signature"),
            go("Non", "passer à la question suivante"),
          ),
          node(
            "Qui signe, et à partir de quel montant faut-il un comité ?",
            go("Réponse claire", "passer à la question suivante"),
            risk("Inconnu", "date de signature non défendable", "obtenir le circuit de signature écrit"),
          ),
          node(
            "Quelles conditions sont non négociables pour vous ?",
            go("Liste obtenue", "issue"),
          ),
        ],
        issue: "Chemin de signature daté, signataire connu.",
      },
    ],
  },
  {
    id: "public",
    label: "Secteur public (État, collectivités)",
    keyInsight:
      "Le deal se gagne avant la consultation : une fois la procédure lancée, l'égalité entre candidats encadre chaque échange.",
    committee: [
      "Service prescripteur (direction métier)",
      "DSI",
      "Acheteur public",
      "Contrôle juridique",
      "Élu ou direction générale",
    ],
    veto: ["Acheteur (procédure)", "Budget voté"],
    rules: [
      {
        text: "2026-2027, fournitures et services : procédure formalisée dès 140 000 € HT (État) et 216 000 € HT (collectivités).",
        evidence: "source",
        source: SRC.seuils,
        asOf: AS_OF,
      },
      {
        text: "Dispense de publicité et de mise en concurrence jusqu'à 60 000 € HT depuis le 1er avril 2026 ; publicité au BOAMP ou en annonce légale obligatoire dès 90 000 € ; découper un besoin pour rester sous un seuil est interdit.",
        evidence: "source",
        source: SRC.capeb,
        asOf: AS_OF,
      },
      {
        text: "L'acheteur peut consulter les entreprises avant la procédure (sourçage, code de la commande publique) ; le vendeur informe sans rédiger le cahier des charges.",
        evidence: "source",
        asOf: AS_OF,
      },
      NIS2_RULE,
    ],
    trees: [
      {
        meeting: "R1",
        interlocutor: "Service prescripteur (direction métier)",
        nodes: [
          node(
            "Ce besoin est-il inscrit dans un projet et un budget voté ?",
            go("Oui", "passer à la question suivante"),
            risk("Non", "pas d'achat avant le prochain cycle budgétaire", "demander la date de ce cycle et qui porte la demande"),
          ),
          node(
            "Comment prévoyez-vous d'acheter : marché existant, centrale d'achat, nouvelle consultation ?",
            risk("Marché existant ou centrale", "le vendeur doit y être référencé", "identifier le titulaire ou la centrale et la date de renouvellement", "risque_majeur"),
            go("Nouvelle consultation", "passer à la question suivante"),
          ),
          node(
            "À quelle date la consultation sera-t-elle publiée ?",
            go("Pas encore publiée", "sourçage : informer sans rédiger le cahier des charges"),
            go("Déjà publiée", "les échanges passent par la plateforme de la consultation"),
          ),
        ],
        issue: "Mode d'achat connu, montant estimé, date de publication.",
      },
      {
        meeting: "R2",
        interlocutor: "Prescripteur et futurs utilisateurs",
        nodes: [
          node(
            "Sommes-nous avant ou pendant la consultation ?",
            go("Avant", "démonstration d'information, sans prix ni engagement"),
            go("Pendant", "seulement si le règlement prévoit une audition ou une soutenance"),
          ),
          node(
            "Quels critères comptent le plus pour vos utilisateurs ?",
            go("Critères fonctionnels précis", "passer à la question suivante"),
            risk("Uniquement le prix", "marché joué au moins-disant", "documenter les critères de qualité exprimés par les utilisateurs"),
          ),
          node(
            "Qui rédigera le cahier des charges, et quand ?",
            go("Rédacteur et date connus", "issue"),
            risk("Inconnu", "calendrier non prévisible", "obtenir le nom du rédacteur"),
          ),
        ],
        issue: "Besoins et critères compris, sans orienter la future consultation.",
      },
      {
        meeting: "R3",
        interlocutor: "DSI et délégué à la protection des données",
        nodes: [
          node(
            "Quelles exigences d'hébergement et de sécurité appliquez-vous à ce type de données ?",
            go("Exigences écrites", "passer à la question suivante"),
            risk("Exigences au-delà de ce que le vendeur peut prouver", "point bloquant", "remonter ; aucune garantie sans preuve", "risque_majeur"),
          ),
          node(
            "Faudra-t-il un contrat de sous-traitance RGPD, sur votre modèle ou le nôtre ?",
            go("Réponse obtenue", "passer à la question suivante"),
          ),
          node(
            "Votre structure se prépare-t-elle aux obligations NIS2 ?",
            go("Oui", "attendre des exigences cyber dans le cahier des charges"),
            go("Non ou ne sait pas", "noter, à revérifier"),
          ),
        ],
        issue: "Exigences sécurité et données connues avant la publication.",
      },
      {
        meeting: "R4",
        interlocutor: "Acheteur public",
        nodes: [
          node(
            "Quel est le montant estimé du besoin sur toute sa durée ?",
            go("Jusqu'à 60 000 € HT", "achat sans mise en concurrence possible, cycle court"),
            go("Entre 60 000 € HT et le seuil européen", "procédure adaptée"),
            go("Au-delà (140 000 € HT État, 216 000 € HT collectivités)", "procédure formalisée, cycle le plus long"),
          ),
          node(
            "Quels critères d'attribution et quelle pondération ?",
            go("Publiés", "construire l'offre sur ces critères"),
          ),
          node(
            "Quelle date limite de remise, et quand la décision ?",
            go("Dates connues", "issue"),
          ),
        ],
        issue: "Offre remise dans les délais, date de notification prévue.",
      },
    ],
  },
  {
    id: "sante-publique",
    label: "Santé publique (hôpitaux, GHT)",
    keyInsight:
      "Le premier tri est le niveau d'achat : établissement, GHT ou centrale nationale. Absent de la bonne centrale, le vendeur perd sans rendez-vous.",
    committee: [
      "Direction métier ou soignante qui porte le besoin",
      "DSI du GHT",
      "Direction des achats du GHT",
      "RSSI",
      "Délégué à la protection des données",
    ],
    veto: ["Achats du GHT", "Sécurité"],
    rules: [
      {
        text: "Commande publique : procédure formalisée dès 216 000 € HT pour les hôpitaux (2026-2027).",
        evidence: "source",
        source: SRC.seuils,
        asOf: AS_OF,
      },
      {
        text: "Achats mutualisés au sein des GHT (l'établissement support porte la fonction achat) ; trois opérateurs nationaux : Ugap, UniHA, Resah (centrale du Resah réservée à ses adhérents).",
        evidence: "source",
        source: SRC.dgos,
        asOf: AS_OF,
      },
      {
        text: "Une solution qui héberge des données de santé doit recourir à un hébergeur certifié HDS (code de la santé publique).",
        evidence: "source",
        asOf: AS_OF,
      },
      NIS2_RULE,
    ],
    trees: [
      {
        meeting: "R1",
        interlocutor: "Porteur du besoin (direction métier ou DSI)",
        nodes: [
          node(
            "Le projet est-il porté par votre établissement ou par le GHT ?",
            go("Par le GHT", "décision au niveau du groupement, passer à la question suivante"),
            risk("Par l'établissement seul", "un marché du GHT couvre peut-être déjà le besoin", "le vérifier auprès des achats du GHT"),
          ),
          node(
            "Passez-vous par une centrale (Ugap, UniHA, Resah) pour ce type d'achat ?",
            risk("Oui", "le vendeur doit y être référencé", "identifier la centrale et sa prochaine consultation", "risque_majeur"),
            go("Non", "procédure propre au GHT ou à l'établissement"),
          ),
          node(
            "Qui, côté métier ou soignant, défendra le projet ?",
            go("Porteur nommé", "issue"),
            risk("Seule la DSI est impliquée", "pas de sponsor métier", "obtenir un porteur métier"),
          ),
        ],
        issue: "Niveau d'achat connu, porteur métier nommé.",
      },
      {
        meeting: "R2",
        interlocutor: "Équipes utilisatrices",
        nodes: [
          node(
            "Combien de temps vos équipes peuvent-elles consacrer à l'outil, et à quel moment ?",
            go("Créneau réaliste décrit", "passer à la question suivante"),
            risk("« Aucun temps »", "adoption faible", "montrer ce que l'outil retire de leur charge"),
          ),
          node(
            "Avec quels logiciels existants l'outil doit-il échanger ?",
            go("Liste obtenue", "passer à la question suivante"),
          ),
          node(
            "L'outil traitera-t-il des données de santé ?",
            go("Oui", "hébergement certifié HDS exigé, à prouver en revue sécurité"),
            go("Non", "le confirmer par écrit"),
          ),
        ],
        issue: "Usage validé par les équipes, périmètre des données clair.",
      },
      {
        meeting: "R3",
        interlocutor: "RSSI et DPO du GHT",
        nodes: [
          node(
            "Quelles pièces exigez-vous (certification de l'hébergeur, analyse de risques, contrat de sous-traitance) ?",
            go("Liste transmise", "passer à la question suivante"),
            risk("Exigence impossible à prouver", "point bloquant", "remonter ; aucune garantie sans preuve", "risque_majeur"),
          ),
          node(
            "Vous préparez-vous aux obligations NIS2 ?",
            go("Oui", "attendre des clauses cyber renforcées"),
            go("Non ou ne sait pas", "noter, à revérifier"),
          ),
          node(
            "Qui signe l'avis sécurité et dans quel délai ?",
            go("Signataire et date", "issue"),
          ),
        ],
        issue: "Avis sécurité favorable daté.",
      },
      {
        meeting: "R4",
        interlocutor: "Direction des achats du GHT",
        nodes: [
          node(
            "Passerez-vous par une centrale ou par votre propre consultation ?",
            go("Centrale", "vérifier le référencement et l'adhésion de l'établissement"),
            go("Consultation propre", "seuils de la commande publique (procédure formalisée dès 216 000 € HT)"),
          ),
          node(
            "Quelle date de publication et quels critères ?",
            go("Connus", "issue"),
          ),
        ],
        issue: "Voie d'achat et calendrier connus.",
      },
    ],
  },
  {
    id: "energie-eau-transports",
    label: "Énergie, eau, transports",
    keyInsight:
      "Deux questions trient le deal : l'achat relève-t-il de la commande publique (activité de réseau), et touche-t-il un système critique ? Si oui aux deux, la cybersécurité décide.",
    committee: [
      "Direction métier ou exploitation",
      "DSI",
      "Cybersécurité (RSSI, sécurité des systèmes industriels)",
      "Achats",
      "Juridique",
    ],
    veto: ["Cybersécurité", "Achats"],
    rules: [
      {
        text: "Les entités adjudicatrices (opérateurs de réseaux d'énergie, d'eau, de transport) appliquent la commande publique pour ces activités : procédure formalisée dès 432 000 € HT en 2026-2027.",
        evidence: "source",
        source: SRC.seuils,
        asOf: AS_OF,
      },
      NIS2_RULE,
    ],
    trees: [
      {
        meeting: "R1",
        interlocutor: "Direction métier ou exploitation",
        nodes: [
          node(
            "L'outil servira-t-il une activité de réseau (production, transport, distribution) ou une fonction support ?",
            go("Activité de réseau", "l'achat suit la commande publique"),
            go("Fonction support", "achat privé possible, à confirmer avec les achats"),
          ),
          node(
            "L'outil sera-t-il connecté à un système que vous considérez comme critique ?",
            go("Non", "passer à la question suivante"),
            risk("Oui", "exigences cyber les plus fortes", "impliquer la cybersécurité dès la démonstration", "risque_majeur"),
          ),
          node(
            "Quel incident ou quelle perte ce projet doit-il éviter ?",
            go("Enjeu d'exploitation formulé", "issue"),
            risk("Enjeu vague", "pas d'urgence", "relier le projet à un incident ou un indicateur d'exploitation"),
          ),
        ],
        issue: "Régime d'achat et niveau de criticité connus, enjeu d'exploitation formulé.",
      },
      {
        meeting: "R2",
        interlocutor: "Exploitation et utilisateurs",
        nodes: [
          node(
            "Dans quelles conditions de terrain l'outil sera-t-il utilisé ?",
            go("Décrites", "adapter la démonstration"),
          ),
          node(
            "Quelles données de vos installations l'outil verra-t-il ?",
            go("Aucune donnée d'installation", "passer à la question suivante"),
            risk("Données d'installation", "revue cyber approfondie", "préparer la revue cyber"),
          ),
          node(
            "Qui valide l'usage côté exploitation ?",
            go("Nommé", "issue"),
          ),
        ],
        issue: "Usage validé par l'exploitation, données concernées listées.",
      },
      {
        meeting: "R3",
        interlocutor: "Responsable cybersécurité",
        nodes: [
          node(
            "Quel référentiel de sécurité appliquez-vous à vos fournisseurs ?",
            go("Référentiel transmis", "passer à la question suivante"),
            risk("Exigence impossible à prouver", "point bloquant", "remonter ; aucune garantie sans preuve", "risque_majeur"),
          ),
          node(
            "Quelles clauses cyber et de notification d'incident imposez-vous ?",
            go("Clauses transmises", "passer à la question suivante"),
          ),
          node(
            "Qui rend l'avis final et quand ?",
            go("Connu", "issue"),
          ),
        ],
        issue: "Avis cyber favorable daté.",
      },
      {
        meeting: "R4",
        interlocutor: "Acheteur",
        nodes: [
          node(
            "L'achat suit-il vos règles d'entité adjudicatrice ?",
            go("Oui", "au-delà de 432 000 € HT : procédure formalisée, cycle long"),
            go("Non", "circuit achats privé (référencement, comité)"),
          ),
          node(
            "Faut-il être qualifié ou référencé au préalable ?",
            risk("Oui", "délai supplémentaire", "intégrer ce délai au forecast"),
            go("Non", "passer à la question suivante"),
          ),
          node(
            "Qui signe et quand ?",
            go("Connu", "issue"),
          ),
        ],
        issue: "Voie d'achat et date de signature connues.",
      },
    ],
  },
  {
    id: "industrie",
    label: "Industrie",
    keyInsight:
      "L'usine porte souvent le besoin, mais les achats centraux et le panel fournisseurs décident de qui peut vendre.",
    committee: [
      "Direction d'usine ou de business unit",
      "Méthodes ou amélioration continue",
      "DSI (et sécurité des systèmes industriels)",
      "Achats centraux",
      "Contrôle de gestion",
    ],
    veto: ["Achats (panel fournisseurs)", "DSI"],
    rules: [
      {
        text: "Délai de paiement entre entreprises plafonné par le code de commerce.",
        evidence: "source",
        asOf: AS_OF,
      },
      {
        text: "Certains sous-secteurs de la fabrication sont visés par NIS2 : périmètre exact à vérifier.",
        evidence: "a_verifier",
        asOf: AS_OF,
      },
    ],
    trees: [
      {
        meeting: "R1",
        interlocutor: "Direction d'usine ou de BU",
        nodes: [
          node(
            "Quel indicateur de l'usine ce projet doit-il faire bouger ?",
            go("Indicateur suivi en revue de direction", "passer à la question suivante"),
            risk("Aucun", "projet sans décision", "relier le projet à un indicateur suivi"),
          ),
          node(
            "Cette dépense relève-t-elle du budget de l'usine ou d'un programme du groupe ?",
            go("Budget de l'usine", "passer à la question suivante"),
            risk("Programme du groupe", "décision déplacée au siège", "identifier le porteur du programme"),
          ),
          node(
            "Sommes-nous déjà au panel fournisseurs, ou faut-il y entrer ?",
            go("Au panel", "issue"),
            risk("Hors panel", "référencement obligatoire avant toute commande", "obtenir le contact achats", "risque_majeur"),
          ),
        ],
        issue: "Indicateur cible, porteur budgétaire et statut au panel connus.",
      },
      {
        meeting: "R2",
        interlocutor: "Équipes terrain et méthodes",
        nodes: [
          node(
            "Qui l'utilisera en atelier ou en bureau, et à quel moment de sa journée ?",
            go("Usage décrit", "passer à la question suivante"),
          ),
          node(
            "Pouvez-vous tester sur une ligne ou un site pilote ?",
            go("Pilote accepté", "définir le critère de succès du pilote"),
            risk("Refus", "preuve impossible avant la décision", "proposer un périmètre de test plus petit"),
          ),
          node(
            "Qui mesure le résultat du pilote ?",
            go("Nommé", "issue"),
          ),
        ],
        issue: "Pilote cadré avec critère de succès et responsable.",
      },
      {
        meeting: "R3",
        interlocutor: "DSI",
        nodes: [
          node(
            "L'outil touchera-t-il le réseau industriel ou seulement l'informatique de gestion ?",
            go("Gestion seule", "passer à la question suivante"),
            risk("Réseau industriel", "revue sécurité approfondie", "préparer un dossier sécurité dédié", "risque_majeur"),
          ),
          node(
            "Quel questionnaire sécurité et quelles intégrations exigez-vous ?",
            go("Transmis", "passer à la question suivante"),
          ),
          node(
            "Qui valide côté DSI et quand ?",
            go("Connu", "issue"),
          ),
        ],
        issue: "Avis DSI favorable daté.",
      },
      {
        meeting: "R4",
        interlocutor: "Acheteur central",
        nodes: [
          node(
            "Quelle procédure : appel d'offres, consultation de plusieurs fournisseurs, gré à gré ?",
            go("Connue", "passer à la question suivante"),
          ),
          node(
            "Quelles conditions contractuelles types (paiement, pénalités, réversibilité) ?",
            go("Transmises", "passer à la question suivante"),
          ),
          node(
            "Qui signe et à quel seuil faut-il un comité ?",
            go("Connu", "issue"),
            risk("Inconnu", "date de signature non défendable", "obtenir le circuit de signature"),
          ),
        ],
        issue: "Procédure, conditions et signataire connus.",
      },
    ],
  },
  {
    id: "grands-groupes",
    label: "Grands groupes multi-filiales",
    overlay: true,
    keyInsight:
      "Le contact enthousiaste est dans une filiale ; le budget, le référencement et le veto sont souvent ailleurs dans le groupe.",
    committee: [
      "Sponsor en filiale",
      "Direction métier groupe",
      "Achats groupe",
      "DSI groupe",
      "Sécurité groupe",
      "Direction financière de la filiale qui paie",
    ],
    veto: ["Achats groupe", "DSI groupe"],
    rules: [
      {
        text: "Environ 40 % des parcours d'achat B2B finissent sans décision (Gartner) — repère général, non spécifique aux groupes français.",
        evidence: "source",
        source: SRC.gartnerNoDecision,
        asOf: AS_OF,
      },
      {
        text: "74 % des groupes d'achat B2B vivent un conflit interne nuisible pendant la décision (Gartner, mai 2025).",
        evidence: "source",
        source: SRC.gartnerConflict,
        asOf: AS_OF,
      },
    ],
    trees: [
      {
        meeting: "R1",
        interlocutor: "Sponsor en filiale",
        nodes: [
          node(
            "Quelle entité paiera : votre filiale, une autre, ou le groupe ?",
            go("Sa filiale, avec budget", "passer à la question suivante"),
            risk("Le groupe ou une autre entité", "le sponsor n'a pas le budget", "identifier qui le détient et obtenir une introduction", "risque_majeur"),
          ),
          node(
            "Existe-t-il un accord-cadre ou un référencement groupe pour ce type d'offre ?",
            go("Non", "passer à la question suivante"),
            risk("Oui, avec un concurrent", "la filiale ne peut pas acheter hors accord", "demander la date de renouvellement et les exceptions", "risque_majeur"),
          ),
          node(
            "Qui au groupe peut bloquer ce projet, même si votre filiale le veut ?",
            go("Rôles nommés (achats, DSI, sécurité)", "issue"),
            risk("« Personne »", "veto invisible", "vérifier auprès des achats groupe"),
          ),
        ],
        issue: "Entité payeuse, référencement et détenteurs du veto connus.",
      },
      {
        meeting: "R2",
        interlocutor: "Filiale et représentant du groupe",
        nodes: [
          node(
            "Qui, côté groupe, doit voir la démonstration ?",
            go("Un représentant groupe présent", "passer à la question suivante"),
            risk("Filiale seule", "décision prise sans le groupe, puis bloquée", "inviter un représentant groupe"),
          ),
          node(
            "D'autres filiales ont-elles le même besoin ?",
            go("Oui", "potentiel d'extension, décision groupe plus probable"),
            go("Non", "décision locale possible"),
          ),
          node(
            "Sur quels critères le groupe et la filiale sont-ils en désaccord ?",
            go("Désaccord nommé", "le traiter avant la revue sécurité"),
            risk("« Aucun »", "conflit caché", "poser la question à chacun séparément"),
          ),
        ],
        issue: "Critères partagés par la filiale et le groupe.",
      },
      {
        meeting: "R3",
        interlocutor: "Sécurité et juridique groupe",
        nodes: [
          node(
            "La revue se fait-elle au niveau groupe ou filiale ?",
            go("Groupe", "obtenir le questionnaire groupe"),
            risk("Filiale", "le groupe peut la refaire ensuite", "vérifier que la revue filiale suffit"),
          ),
          node(
            "Quel modèle de contrat et de DPA s'impose : groupe ou local ?",
            go("Connu", "passer à la question suivante"),
          ),
          node(
            "Qui signe l'avis et quand ?",
            go("Connu", "issue"),
          ),
        ],
        issue: "Avis sécurité et juridique au bon niveau, daté.",
      },
      {
        meeting: "R4",
        interlocutor: "Achats groupe",
        nodes: [
          node(
            "Faut-il un référencement groupe avant la commande de la filiale ?",
            risk("Oui", "délai supplémentaire", "intégrer ce délai au forecast"),
            go("Non", "passer à la question suivante"),
          ),
          node(
            "Qui signe : la filiale, le groupe, ou les deux ?",
            go("Connu", "passer à la question suivante"),
          ),
          node(
            "Le contrat pourra-t-il être étendu aux autres filiales ?",
            go("Réponse obtenue", "issue"),
          ),
        ],
        issue: "Chemin de signature entre filiale et groupe daté.",
      },
    ],
  },
  {
    id: "generique",
    label: "Autre secteur (modèle générique B2B)",
    keyInsight:
      "Sans modèle sectoriel dédié : vérifier le problème, le comité, les revues obligatoires et le circuit d'achat.",
    committee: ["Sponsor métier", "Utilisateurs", "DSI ou sécurité", "Achats", "Direction financière"],
    veto: ["Achats", "DSI ou sécurité"],
    rules: [
      {
        text: "Modèle générique : uniquement des hypothèses, à remplacer par un modèle sectoriel dédié.",
        evidence: "hypothese",
        asOf: AS_OF,
      },
    ],
    trees: [
      {
        meeting: "R1",
        interlocutor: "Sponsor métier",
        nodes: [
          node(
            "Quel problème voulez-vous résoudre, et que vous coûte-t-il ?",
            go("Problème relié à un indicateur", "passer à la question suivante"),
            risk("Réponse vague", "pas d'urgence", "demander l'effet sur un indicateur précis"),
          ),
          node(
            "Qui d'autre devra valider, et qui peut dire non ?",
            go("Rôles nommés", "passer à la question suivante"),
            risk("Inconnu", "comité inconnu", "cartographier le circuit de décision"),
          ),
          node(
            "Que se passe-t-il si vous ne faites rien cette année ?",
            go("Conséquence concrète", "issue"),
            risk("Rien de grave", "statu quo probable", "chercher un événement qui crée l'urgence"),
          ),
        ],
        issue: "Problème, décideurs et prochaine étape datée.",
      },
      {
        meeting: "R2",
        interlocutor: "Sponsor et utilisateurs",
        nodes: [
          node(
            "Sur quel cas réel voulez-vous voir la solution ?",
            go("Cas fourni", "passer à la question suivante"),
          ),
          node(
            "Qui l'utilisera, et que fera-t-il autrement ?",
            go("Usage décrit", "issue"),
            risk("Seul le sponsor parle", "pas d'adhésion terrain", "impliquer deux utilisateurs"),
          ),
        ],
        issue: "Cas d'usage validé.",
      },
      {
        meeting: "R3",
        interlocutor: "DSI ou responsable sécurité",
        nodes: [
          node(
            "Quelles exigences de sécurité et de données appliquez-vous ?",
            go("Liste transmise", "passer à la question suivante"),
            risk("Exigence impossible à prouver", "point bloquant", "remonter ; aucune garantie sans preuve", "risque_majeur"),
          ),
          node(
            "Qui rend l'avis et quand ?",
            go("Connu", "issue"),
          ),
        ],
        issue: "Avis favorable daté.",
      },
      {
        meeting: "R4",
        interlocutor: "Acheteur",
        nodes: [
          node(
            "Quelle procédure d'achat, et faut-il un référencement ?",
            go("Connue", "passer à la question suivante"),
          ),
          node(
            "Qui signe, et quand ?",
            go("Connu", "issue"),
            risk("Inconnu", "date non défendable", "obtenir le circuit de signature"),
          ),
        ],
        issue: "Chemin de signature daté.",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Profils vendeur                                                     */
/* ------------------------------------------------------------------ */

export const SELLER_PROFILES: readonly SellerProfile[] = [
  {
    id: "editeur-saas",
    label: "Éditeur SaaS",
    offer: "un logiciel en abonnement",
    objections: [
      "Où sont hébergées nos données, et par qui ?",
      "Comment récupère-t-on nos données si on arrête ?",
      "Encore un outil de plus : comment s'intègre-t-il à l'existant ?",
    ],
    proofs: ["Essai ou pilote sur un cas réel", "Documentation sécurité et hébergement", "Références comparables"],
    purchase: ["Durée d'engagement de l'abonnement", "Nombre de licences", "Réversibilité des données"],
    byMeeting: {
      R1: ["Quel outil ou quelle habitude l'abonnement remplace-t-il ?"],
      R2: ["Proposer un essai ou un pilote borné dans le temps"],
      R3: ["Hébergement, sous-traitants, réversibilité, intégration au SI"],
      R4: ["Durée d'engagement, licences, conditions de sortie"],
    },
  },
  {
    id: "esn-integrateur",
    label: "ESN, intégrateur",
    offer: "des jours de consultants ou un projet d'intégration",
    objections: [
      "Vos taux journaliers sont au-dessus de nos autres prestataires.",
      "Qui exactement sera sur le projet, et quand ?",
      "Régie ou forfait : qui porte le risque si ça dérape ?",
    ],
    proofs: ["CV et disponibilité des consultants", "Références de projets similaires", "Méthode et engagements de livraison"],
    purchase: ["Référencement prestataire", "Mode régie ou forfait", "Comparaison des taux journaliers par les achats"],
    byMeeting: {
      R1: ["Le besoin est-il un projet (forfait) ou du renfort (régie) ?"],
      R2: ["Présenter l'équipe proposée et la méthode, pas un produit"],
      R3: ["Accès des consultants au SI, sous-traitance, confidentialité"],
      R4: ["Taux journaliers, mode de facturation, référencement prestataire"],
    },
  },
  {
    id: "conseil",
    label: "Cabinet de conseil",
    offer: "une mission de conseil",
    objections: [
      "Qu'apportez-vous que nos équipes internes ne savent pas faire ?",
      "Comment mesure-t-on le résultat de la mission ?",
      "Avez-vous déjà fait cela dans une organisation comme la nôtre ?",
    ],
    proofs: ["Références comparables", "Livrables et jalons détaillés", "Équipe et expérience du secteur"],
    purchase: ["Achats de prestations intellectuelles", "Livrables, jalons et conditions de recette"],
    byMeeting: {
      R1: ["Qui en direction générale porte la mission ?"],
      R2: ["Présenter la démarche et un livrable type, pas une démonstration logicielle"],
      R3: ["Confidentialité, accès aux données de l'organisation"],
      R4: ["Forfait par jalon, conditions de recette des livrables"],
    },
  },
  {
    id: "fabricant",
    label: "Fabricant, équipementier",
    offer: "des équipements ou des produits industriels",
    objections: [
      "Votre produit répond-il exactement à notre cahier des charges technique ?",
      "Quels délais de livraison et de mise en service ?",
      "Qui assure la maintenance et les pièces ?",
    ],
    proofs: ["Essais et qualification produit", "Certifications techniques", "Références d'installations comparables"],
    purchase: ["Cahier des charges technique", "Délais de livraison", "Garantie, maintenance et pièces"],
    byMeeting: {
      R1: ["Quel cahier des charges technique existe déjà ?"],
      R2: ["Essai, visite d'installation ou échantillon plutôt qu'une démonstration"],
      R3: ["Conformité technique et sécurité de l'équipement"],
      R4: ["Délais, garantie, contrat de maintenance"],
    },
  },
  {
    id: "services-recurrents",
    label: "Prestataire de services récurrents",
    offer: "un service récurrent sous contrat-cadre",
    objections: [
      "Le prestataire actuel fait l'affaire, pourquoi changer ?",
      "Comment se passe la transition sans interruption de service ?",
      "Quels niveaux de service et quelles pénalités ?",
    ],
    proofs: ["Plan de transition", "Niveaux de service mesurés chez d'autres clients", "Références comparables"],
    purchase: ["Contrat-cadre", "Niveaux de service et pénalités", "Date de fin du contrat en place"],
    byMeeting: {
      R1: ["Quand se termine le contrat du prestataire en place ?"],
      R2: ["Montrer le plan de transition et le pilotage du service"],
      R3: ["Accès aux sites et aux données, continuité de service"],
      R4: ["Durée du contrat-cadre, niveaux de service, pénalités"],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Accès                                                               */
/* ------------------------------------------------------------------ */

export function getClientSectorModel(
  id: string | null | undefined,
): ClientSectorModel | null {
  if (!id) return null;
  return CLIENT_SECTOR_MODELS.find((m) => m.id === id) ?? null;
}

export function getSellerProfile(
  id: string | null | undefined,
): SellerProfile | null {
  if (!id) return null;
  return SELLER_PROFILES.find((p) => p.id === id) ?? null;
}

export function getMeetingType(
  id: string | null | undefined,
): MeetingTypeDef | null {
  if (!id) return null;
  return MEETING_TYPES.find((m) => m.id === id) ?? null;
}

/** Secteurs clients proposés au choix (hors couche transverse). */
export function selectableClientSectors(): ClientSectorModel[] {
  return CLIENT_SECTOR_MODELS.filter((m) => !m.overlay);
}

/**
 * Associe la famille / le sous-secteur du chatbot (dealReviewSectors) au
 * modèle client. Famille inconnue → modèle générique.
 */
export function clientModelIdFromDealReviewSector(
  sectorId: string | null | undefined,
  subSectorId?: string | null,
): string {
  switch (sectorId) {
    case "banque-assurance":
      return "banque-assurance";
    case "secteur-public":
      return "public";
    case "energie-utilities":
      return "energie-eau-transports";
    case "industrie-manufacturing":
      return "industrie";
    case "sante-pharma":
      return subSectorId === "etablissement-sante" ? "sante-publique" : "generique";
    default:
      return "generique";
  }
}

export function getMeetingTree(
  model: ClientSectorModel | null,
  meeting: MeetingTypeId,
): MeetingTree | null {
  return model?.trees.find((t) => t.meeting === meeting) ?? null;
}

/* ------------------------------------------------------------------ */
/* Texte injecté dans les prompts                                      */
/* ------------------------------------------------------------------ */

function evidenceLabel(e: RuleEvidence): string {
  if (e === "source") return "sourcé";
  if (e === "a_verifier") return "à vérifier";
  return "hypothèse";
}

function rulesText(rules: SectorRule[]): string {
  return rules
    .map((r) => `- [${evidenceLabel(r.evidence)}, ${r.asOf}] ${r.text}`)
    .join("\n");
}

export function treeText(tree: MeetingTree): string {
  const lines: string[] = [`Interlocuteur type : ${tree.interlocutor}`];
  tree.nodes.forEach((n, i) => {
    lines.push(`Q${i + 1}. ${n.question}`);
    for (const b of n.branches) {
      const flag =
        b.risk === "risque_majeur"
          ? " [RISQUE MAJEUR]"
          : b.risk === "risque"
            ? " [RISQUE]"
            : "";
      lines.push(
        `   - si ${b.when} → ${b.then}${flag}${b.action ? ` (action : ${b.action})` : ""}`,
      );
    }
  });
  lines.push(`Issue attendue : ${tree.issue}`);
  return lines.join("\n");
}

function modelHeader(model: ClientSectorModel): string {
  return `## ${model.label}
${model.keyInsight}
Comité (hypothèse) : ${model.committee.join(", ")}.
Peut dire non : ${model.veto.join(", ")}.
Règles :
${rulesText(model.rules)}`;
}

function sellerText(seller: SellerProfile, meeting?: MeetingTypeId): string {
  const meetingLine = meeting
    ? `\nPour ce rendez-vous : ${seller.byMeeting[meeting].join(" ; ")}.`
    : "";
  return `## Profil du vendeur : ${seller.label} (vend ${seller.offer})
Objections typiques : ${seller.objections.map((o) => `« ${o} »`).join(" ")}
Preuves attendues : ${seller.proofs.join(", ")}.
Conditions d'achat propres : ${seller.purchase.join(", ")}.${meetingLine}`;
}

export type SectorContextInput = {
  clientSectorId: string | null | undefined;
  sellerProfileId: string | null | undefined;
  /** Compte rattaché à un groupe (holding) : ajoute la couche grands groupes. */
  multiEntity?: boolean;
};

/**
 * Bloc « modèle sectoriel » pour la revue d'opportunité (analyse) :
 * comité attendu, veto, règles, et les questions clés des 4 rendez-vous.
 */
export function buildSectorReviewAddendum(input: SectorContextInput): string | null {
  const model = getClientSectorModel(input.clientSectorId);
  const seller = getSellerProfile(input.sellerProfileId);
  const overlay = input.multiEntity ? getClientSectorModel("grands-groupes") : null;
  if (!model && !seller && !overlay) return null;

  const parts: string[] = ["# Modèle sectoriel (analyse de l'opportunité)"];
  for (const m of [model, overlay]) {
    if (!m) continue;
    parts.push(modelHeader(m));
    parts.push(
      "Passages clés par rendez-vous :\n" +
        m.trees
          .map((t) => {
            const label = getMeetingType(t.meeting)?.label ?? t.meeting;
            return `- ${t.meeting} ${label} : ${t.nodes.map((n) => n.question).join(" / ")}`;
          })
          .join("\n"),
    );
  }
  if (seller) parts.push(sellerText(seller));
  parts.push(`## Comment t'en servir
- Compare le comité de <diagnostic> au comité attendu : nomme les rôles qui peuvent dire non et qui ne sont pas couverts, sans inventer de personne.
- Situe l'opportunité dans les rendez-vous R1 à R4 et signale le passage obligatoire suivant.
- Une règle « hypothèse » ou « à vérifier » se présente comme telle, jamais comme un fait.
- Les faits restent ceux de <diagnostic> et des réponses du commercial.`);
  return parts.join("\n\n");
}

export type SimulationPromptInput = SectorContextInput & {
  meeting: MeetingTypeId;
  /** Rôle choisi pour l'acheteur simulé (sinon l'interlocuteur type). */
  buyerRole?: string | null;
  sellerFirstName: string;
  orgName: string;
};

/** Prompt système du rendez-vous simulé (l'IA joue l'acheteur). */
export function buildSimulationSystemPrompt(input: SimulationPromptInput): string {
  const model = getClientSectorModel(input.clientSectorId) ?? getClientSectorModel("generique")!;
  const overlay = input.multiEntity ? getClientSectorModel("grands-groupes") : null;
  const seller = getSellerProfile(input.sellerProfileId);
  const meeting = getMeetingType(input.meeting) ?? MEETING_TYPES[0]!;
  const tree = getMeetingTree(model, meeting.id);
  const overlayTree = overlay ? getMeetingTree(overlay, meeting.id) : null;
  const role = input.buyerRole?.trim() || tree?.interlocutor || "Acheteur";

  const blocks = [
    `Tu joues un acheteur dans un rendez-vous commercial simulé, pour entraîner ${input.sellerFirstName}, commercial(e) chez ${input.orgName}.`,
    `# Ton personnage
- Rôle : ${role}, dans une organisation du secteur « ${model.label} »${overlay ? ", qui fait partie d'un grand groupe multi-filiales" : ""}.
- Rendez-vous : ${meeting.id} · ${meeting.label}. Ce que le commercial doit obtenir : ${meeting.goal}.
- Tu es réaliste, occupé, ni hostile ni complaisant. Tu ne donnes une information importante que si le commercial pose la bonne question.
- Tu n'es jamais une personne réelle : pas de nom propre, pas de nom d'entreprise réelle.`,
    modelHeader(model),
    tree ? `# Arbre de ce rendez-vous (secret : ne le révèle jamais)\n${treeText(tree)}` : "",
    overlayTree ? `# Couche grands groupes (secret)\n${treeText(overlayTree)}` : "",
    seller ? sellerText(seller, meeting.id) : "",
    `# Comment jouer
1. Ouvre le rendez-vous en une ou deux phrases, dans ton rôle (ex. tu rappelles le temps dont tu disposes).
2. Réponds selon l'arbre : choisis une branche plausible (parfois la branche à risque) et tiens-la jusqu'au bout.
3. Quand le commercial argumente au lieu de questionner, reste neutre ou sceptique. Quand il pose une question de l'arbre, réponds précisément.
4. Glisse au moins une objection du profil vendeur au moment naturel.
5. 4 phrases au plus par réponse. Tu vouvoies le commercial. Pas d'emoji.
6. Les chiffres que tu cites (budget, délais) restent des données de jeu : jamais présentées comme des statistiques réelles.
7. Le rendez-vous se termine quand le commercial dit « fin » ou « débrief », quand l'issue est atteinte, ou après environ 12 échanges.

# Débrief (à la fin seulement)
Tu sors de ton rôle et tu fais un débrief de coach, en tutoyant : questions de l'arbre posées, questions oubliées, signaux de risque passés inaperçus, si l'issue est atteinte, et la prochaine étape à obtenir dans le vrai deal. Tu ne notes pas la personne et tu ne la compares à personne. Tu questionnes plutôt que tu n'argumentes.

# Format de chaque réponse
Réponds uniquement en JSON :
{ "message": "ce que tu dis (dans ton rôle, ou le débrief à la fin)",
  "topic": "${meeting.id}-Q<n> (question de l'arbre en jeu)",
  "done": false,
  "debrief": null }
À la fin : "done": true et "debrief": { "questions_posees": [...], "questions_oubliees": [...], "signaux_rates": [...], "issue_atteinte": true|false, "prochaine_etape": "..." }.`,
  ];
  return blocks.filter(Boolean).join("\n\n");
}
