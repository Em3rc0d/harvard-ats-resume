import { describe, expect, it } from "vitest";
import { validatePresentationRewrite } from "./PresentationFactValidator";

function reasons(source: string, proposal: string) {
  return validatePresentationRewrite(source, proposal).reasonCodes;
}

describe("B9 PresentationFactValidator", () => {
  it("accepts a conservative wording-only rewrite", () => {
    const result = validatePresentationRewrite(
      "Developed REST APIs with Spring Boot, applying layered architecture and security best practices.",
      "Developed REST APIs with Spring Boot using layered architecture and security best practices.",
    );
    expect(result).toEqual({ status: "PASS", reasonCodes: [] });
  });

  it("accepts a Spanish verb-form presentation improvement without changing facts", () => {
    const result = validatePresentationRewrite(
      "Desarrollo y optimización de APIs REST con Spring Boot, aplicando arquitectura por capas y buenas prácticas de seguridad.",
      "Desarrollo y optimizo APIs REST con Spring Boot, aplicando arquitectura por capas y buenas prácticas de seguridad.",
    );
    expect(result).toEqual({ status: "PASS", reasonCodes: [] });
  });

  it("rejects a fabricated metric", () => {
    expect(reasons(
      "Developed REST APIs with Spring Boot.",
      "Developed REST APIs with Spring Boot, improving throughput by 40%.",
    )).toContain("METRIC_ADDED");
  });

  it("rejects a changed metric", () => {
    expect(reasons(
      "Reduced latency by 20%.",
      "Reduced latency by 35%.",
    )).toContain("METRIC_CHANGED");
  });

  it("rejects changed dates", () => {
    expect(reasons(
      "Worked on the platform in 2024.",
      "Worked on the platform in 2025.",
    )).toContain("DATE_CHANGED");
  });

  it("rejects a new technology or skill", () => {
    expect(reasons(
      "Built APIs with Node.js and Express.",
      "Built APIs with Node.js, Express and Kubernetes.",
    )).toContain("SKILL_ADDED");
  });

  it("rejects unsupported seniority", () => {
    expect(reasons(
      "Backend Developer working with Spring Boot.",
      "Senior Backend Developer working with Spring Boot.",
    )).toContain("SENIORITY_STRENGTHENED");
  });

  it("rejects unsupported ownership", () => {
    expect(reasons(
      "Collaborated on backend API development.",
      "Led backend API development.",
    )).toContain("OWNERSHIP_STRENGTHENED");
  });

  it("rejects unsupported scale claims", () => {
    expect(reasons(
      "Built a backend service.",
      "Built a scalable enterprise backend service.",
    )).toContain("SCOPE_STRENGTHENED");
  });

  it("rejects unsupported superlatives", () => {
    expect(reasons(
      "Worked with React.",
      "Expert in React.",
    )).toContain("UNSUPPORTED_SUPERLATIVE");
  });

  it("rejects a new certification claim", () => {
    expect(reasons(
      "AWS cloud experience.",
      "AWS certified cloud experience.",
    )).toContain("CERTIFICATION_ADDED");
  });

  it("rejects negation changes", () => {
    expect(reasons(
      "Worked without production access.",
      "Worked with production access.",
    )).toContain("NEGATION_CHANGED");
  });

  it("rejects generic new factual content even when it is not a known skill", () => {
    expect(reasons(
      "Built an inventory system.",
      "Built an inventory system for banking clients.",
    )).toContain("FACT_ADDED");
  });

  it("rejects removal of protected entities", () => {
    expect(reasons(
      "Integrated Spring Boot with MongoDB Atlas.",
      "Integrated Spring Boot with MongoDB.",
    )).toContain("FACT_REMOVED_MATERIALLY");
  });

  it("rejects destructive compression", () => {
    expect(reasons(
      "Designed and developed a full stack system for products, invoices, categories, users and suppliers.",
      "Built a system.",
    )).toContain("FACT_REMOVED_MATERIALLY");
  });
});
