import type { PresentationValidationReasonCode } from "../../domain/presentation/PresentationRevision";

export type PresentationValidationOutcome =
  | Readonly<{ status: "PASS"; reasonCodes: readonly [] }>
  | Readonly<{ status: "REJECT"; reasonCodes: readonly PresentationValidationReasonCode[] }>;

const STOPWORDS = new Set([
  // English
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "within", "using", "use", "via", "while", "through", "across", "including", "that", "this", "these", "those", "its", "their", "our", "my",
  // Spanish
  "a", "al", "con", "como", "de", "del", "desde", "el", "en", "entre", "la", "las", "los", "o", "para", "por", "que", "su", "sus", "un", "una", "y", "mediante", "utilizando", "usando", "incluyendo", "dentro", "sobre",
]);

// These words may legitimately change while presenting the same underlying fact.
// They deliberately exclude leadership/seniority/scope language.
const PRESENTATION_VOCABULARY = new Set([
  "apply", "applied", "applying", "aplicar", "aplique", "apliqué", "aplicando",
  "build", "built", "building", "construir", "construi", "construí", "construido",
  "collaborate", "collaborated", "collaborating", "colaborar", "colabore", "colaboré", "colaborando",
  "configure", "configured", "configuring", "configurar", "configure", "configuré", "configurando",
  "create", "created", "creating", "crear", "cree", "creé", "creando",
  "develop", "developed", "developing", "desarrollar", "desarrolle", "desarrollé", "desarrollo", "desarrollando",
  "design", "designed", "designing", "diseñar", "disene", "diseñé", "diseno", "diseño", "diseñando",
  "implement", "implemented", "implementing", "implementar", "implemente", "implementé", "implementando",
  "integrate", "integrated", "integrating", "integrar", "integre", "integré", "integrando",
  "maintain", "maintained", "maintaining", "mantener", "mantuve", "manteniendo",
  "optimize", "optimized", "optimizing", "optimizar", "optimice", "optimicé", "optimizo", "optimización", "optimizando",
  "program", "programmed", "programming", "programar", "programe", "programé", "programando",
  "support", "supported", "supporting", "soportar", "soporte", "soporté", "soportando",
  "test", "tested", "testing", "probar", "probe", "probé", "probando",
  "work", "worked", "working", "trabajar", "trabaje", "trabajé", "trabajando",
  "focused", "focus", "orientado", "orientada", "oriented",
]);

const TECH_TOKENS = new Set([
  "angular", "astro", "auth0", "aws", "bootstrap", "c", "c++", "c#", "docker", "ec2", "express", "fastapi", "firebase", "flask", "gcp", "git", "github", "github-actions", "graphql", "html", "java", "javascript", "jest", "junit", "junit5", "jwt", "kubernetes", "mongodb", "mysql", "next.js", "nextjs", "node.js", "nodejs", "ollama", "openapi", "postgres", "postgresql", "python", "react", "redis", "rest", "s3", "selenium", "shadcn", "sonarqube", "spring", "spring-boot", "springboot", "sql", "sqlite", "supabase", "tailwind", "tailwindcss", "typescript", "vercel", "vitest",
]);

const NEGATIONS = new Set(["no", "not", "never", "without", "nunca", "sin", "ningun", "ningún", "ninguna"]);
const SENIORITY_TERMS = new Set(["senior", "sr", "lead", "leader", "principal", "staff", "manager", "head", "architect", "arquitecto", "arquitecta", "lider", "líder", "jefe", "gerente", "principal"]);
const OWNERSHIP_TERMS = new Set(["led", "lead", "owned", "owner", "spearheaded", "directed", "drove", "lideré", "lidere", "lidero", "dirigí", "dirigi", "encabecé", "encabece"]);
const SCOPE_TERMS = new Set(["enterprise", "global", "large-scale", "largescale", "mission-critical", "critical", "massive", "scalable", "high-scale", "production-grade", "empresarial", "global", "masivo", "escalable", "critico", "crítico"]);
const SUPERLATIVE_TERMS = new Set(["best", "top", "expert", "advanced", "exceptional", "world-class", "worldclass", "state-of-the-art", "leading", "experto", "experta", "avanzado", "avanzada", "mejor", "líder", "lider"]);
const CERTIFICATION_TERMS = new Set(["certified", "certification", "certificate", "certificado", "certificada", "certificación", "certificacion"]);

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim();
}

function tokenize(value: string): string[] {
  return normalized(value).match(/[\p{L}\p{N}][\p{L}\p{N}.+#/-]*/gu) ?? [];
}

function originalTokens(value: string): string[] {
  return value.normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}.+#/-]*/gu) ?? [];
}

function setDifference(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => !right.has(value));
}

function extractYears(value: string) {
  return new Set(value.match(/\b(?:19|20)\d{2}\b/g) ?? []);
}

function extractMetricTokens(value: string) {
  const years = extractYears(value);
  const matches = value.normalize("NFKC").match(/(?:[$€£]|S\/?\.?\s*)?\d+(?:[.,]\d+)?%?/g) ?? [];
  return new Set(matches.map((item) => item.replace(/\s+/g, "").toLowerCase()).filter((item) => !years.has(item)));
}

function extractUrlsAndEmails(value: string) {
  const urls = value.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi) ?? [];
  const emails = value.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) ?? [];
  return new Set([...urls, ...emails].map(normalized));
}

function extractProtectedEntityTokens(value: string) {
  const tokens = originalTokens(value);
  const protectedTokens = new Set<string>();

  tokens.forEach((token, index) => {
    const lower = normalized(token);
    const hasTechPunctuation = /[.+#/-]/.test(token);
    const hasDigit = /\d/.test(token);
    const allCaps = token.length >= 2 && token === token.toUpperCase() && token !== token.toLowerCase();
    const capitalized = /^\p{Lu}/u.test(token) && index > 0;

    if (TECH_TOKENS.has(lower) || hasTechPunctuation || hasDigit || allCaps || capitalized) {
      protectedTokens.add(lower);
    }
  });

  return protectedTokens;
}

function novelContentTokens(source: string, proposal: string) {
  const sourceTokens = new Set(tokenize(source));
  const proposalTokens = new Set(tokenize(proposal));

  return setDifference(proposalTokens, sourceTokens).filter((token) =>
    !STOPWORDS.has(token)
    && !PRESENTATION_VOCABULARY.has(token)
    && !/^\d/.test(token),
  );
}

function newlyIntroduced(proposal: string, source: string, vocabulary: Set<string>) {
  const proposalTokens = new Set(tokenize(proposal));
  const sourceTokens = new Set(tokenize(source));
  return [...vocabulary].some((token) => proposalTokens.has(token) && !sourceTokens.has(token));
}

function materiallyCompressed(source: string, proposal: string) {
  const sourceTokens = tokenize(source);
  const proposalTokens = tokenize(proposal);
  return sourceTokens.length >= 8 && proposalTokens.length < Math.ceil(sourceTokens.length * 0.55);
}

export function validatePresentationRewrite(source: string, proposal: string): PresentationValidationOutcome {
  const reasons = new Set<PresentationValidationReasonCode>();
  const sourceNormalized = normalized(source);
  const proposalNormalized = normalized(proposal);

  if (!sourceNormalized || !proposalNormalized) {
    return { status: "REJECT", reasonCodes: ["SOURCE_NOT_PRESERVED"] };
  }

  const sourceYears = extractYears(source);
  const proposalYears = extractYears(proposal);
  if (setDifference(sourceYears, proposalYears).length > 0 || setDifference(proposalYears, sourceYears).length > 0) {
    reasons.add("DATE_CHANGED");
  }

  const sourceMetrics = extractMetricTokens(source);
  const proposalMetrics = extractMetricTokens(proposal);
  const addedMetrics = setDifference(proposalMetrics, sourceMetrics);
  const removedMetrics = setDifference(sourceMetrics, proposalMetrics);
  if (sourceMetrics.size === 0 && addedMetrics.length > 0) {
    reasons.add("METRIC_ADDED");
  } else if (addedMetrics.length > 0 || removedMetrics.length > 0) {
    reasons.add("METRIC_CHANGED");
  }

  const sourceLinks = extractUrlsAndEmails(source);
  const proposalLinks = extractUrlsAndEmails(proposal);
  if (setDifference(sourceLinks, proposalLinks).length > 0) reasons.add("FACT_REMOVED_MATERIALLY");
  if (setDifference(proposalLinks, sourceLinks).length > 0) reasons.add("FACT_ADDED");

  const sourceProtected = extractProtectedEntityTokens(source);
  const proposalProtected = extractProtectedEntityTokens(proposal);
  if (setDifference(sourceProtected, proposalProtected).length > 0) reasons.add("FACT_REMOVED_MATERIALLY");

  const sourceTech = new Set(tokenize(source).filter((token) => TECH_TOKENS.has(token)));
  const proposalTech = new Set(tokenize(proposal).filter((token) => TECH_TOKENS.has(token)));
  if (setDifference(proposalTech, sourceTech).length > 0) reasons.add("SKILL_ADDED");

  const sourceNegations = tokenize(source).filter((token) => NEGATIONS.has(token));
  const proposalNegations = tokenize(proposal).filter((token) => NEGATIONS.has(token));
  if (sourceNegations.join("|") !== proposalNegations.join("|")) reasons.add("NEGATION_CHANGED");

  if (newlyIntroduced(proposal, source, SENIORITY_TERMS)) reasons.add("SENIORITY_STRENGTHENED");
  if (newlyIntroduced(proposal, source, OWNERSHIP_TERMS)) reasons.add("OWNERSHIP_STRENGTHENED");
  if (newlyIntroduced(proposal, source, SCOPE_TERMS)) reasons.add("SCOPE_STRENGTHENED");
  if (newlyIntroduced(proposal, source, SUPERLATIVE_TERMS)) reasons.add("UNSUPPORTED_SUPERLATIVE");
  if (newlyIntroduced(proposal, source, CERTIFICATION_TERMS)) reasons.add("CERTIFICATION_ADDED");

  if (novelContentTokens(source, proposal).length > 0) reasons.add("FACT_ADDED");
  if (materiallyCompressed(source, proposal)) reasons.add("FACT_REMOVED_MATERIALLY");

  if (reasons.size > 0) {
    return { status: "REJECT", reasonCodes: [...reasons].sort() as PresentationValidationReasonCode[] };
  }

  return { status: "PASS", reasonCodes: [] };
}
