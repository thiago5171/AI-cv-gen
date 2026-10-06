/**
 * cv-renderer.ts
 * Renders CV JSON to a clean HTML string matching the target DOCX style:
 * - White background, black text, Calibri font
 * - Name centered bold + contact line with "/" separators + horizontal rule
 * - Experience: Company|Location, Role|Date (two-column), Responsibilities/Key Results bullets, Skills inline with ";"
 * - Education: School|Location (bold), Degree|Dates
 * - Section headings: bold with bottom border
 */

export type CvLanguage = "pt-BR" | "en-US";

interface CvLink {
  label: string;
  url: string;
}

interface CvBasicInfo {
  title?: string;
  location?: string;
  email?: string;
  phone?: string;
  links?: CvLink[];
}

interface CvExperience {
  role: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  summary?: string;
  responsibilities: string[];
  keyResults: string[];
  skills: string[];
  highlights?: string[];
}

interface CvEducation {
  degree: string;
  school: string;
  location: string;
  startDate: string;
  endDate: string;
  details?: string;
}

interface CvLanguageEntry {
  name: string;
  level: string;
}

interface CvCertification {
  name: string;
  issuer: string;
  year: string | number;
}

export interface CvData {
  name: string;
  basicInfo: CvBasicInfo;
  summary?: string;
  experience: CvExperience[];
  education: CvEducation[];
  languages?: CvLanguageEntry[];
  certifications?: CvCertification[];
  skills?: string[];
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const LABELS: Record<CvLanguage, Record<string, string>> = {
  "pt-BR": {
    experience: "Experiência",
    education: "Educação",
    languages: "Idiomas",
    certifications: "Certificações",
    skills: "Habilidades Técnicas",
    summary: "Resumo Profissional",
    responsibilities: "Responsabilidades",
    keyResults: "Resultados Chave",
    expSkills: "Habilidades",
  },
  "en-US": {
    experience: "Experience",
    education: "Education",
    languages: "Languages",
    certifications: "Certifications",
    skills: "Technical Skills",
    summary: "Professional Summary",
    responsibilities: "Responsibilities",
    keyResults: "Key Results",
    expSkills: "Skills",
  },
};

// ─── Style constants ──────────────────────────────────────────────────────────

const FONT = "Calibri, 'Segoe UI', Arial, sans-serif";
const C_TEXT = "#000000";
const C_MUTED = "#000000";
const C_LIGHT = "#444444";
const C_LINK = "#0563c1"; // same hyperlink blue Word uses

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripMd(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function twoCol(
  left: string,
  right: string,
  opts: { leftBold?: boolean; leftSize?: string; rightSize?: string } = {},
): string {
  const { leftBold = false, leftSize = "10.5pt", rightSize = "10pt" } = opts;
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;line-height:1.4;">
    <span style="font-weight:${leftBold ? "bold" : "normal"};font-size:${leftSize};color:${C_TEXT};">${left}</span>
    <span style="font-size:${rightSize};color:${C_LIGHT};white-space:nowrap;margin-left:12px;">${right}</span>
  </div>`;
}

function secHeading(text: string): string {
  return `<div style="text-align:center;margin:14px 0 6px;">
    <strong style="font-size:11pt;font-family:${FONT};color:${C_TEXT};">${esc(text)}</strong>
  </div>`;
}

function boldLabel(text: string): string {
  return `<p style="margin:6px 0 2px;font-size:10pt;font-weight:bold;color:${C_TEXT};">${esc(text)}:</p>`;
}

function bulletList(items: string[]): string {
  if (!items || items.length === 0) return "";
  return `<ul style="margin:2px 0 4px;padding-left:20px;">${items
    .map(
      (it) =>
        `<li style="font-size:10pt;color:${C_TEXT};line-height:1.5;margin-bottom:2px;">${esc(it)}</li>`,
    )
    .join("")}</ul>`;
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildHeader(data: CvData): string {
  const { name, basicInfo } = data;
  const { links = [] } = basicInfo;
  const email = basicInfo.email ? stripMd(basicInfo.email) : undefined;
  const phone = basicInfo.phone ? stripMd(basicInfo.phone) : undefined;
  const location = basicInfo.location ? stripMd(basicInfo.location) : undefined;

  const contactParts: string[] = [];
  links.forEach((l) => {
    const url = stripMd(l.url);
    const label = stripMd(l.label);
    contactParts.push(
      `<a href="${esc(url)}" style="color:${C_LINK};text-decoration:underline;">${esc(label)}</a>`,
    );
  });
  if (email)
    contactParts.push(
      `<a href="mailto:${esc(email)}" style="color:${C_TEXT};text-decoration:none;">${esc(email)}</a>`,
    );
  if (location) contactParts.push(esc(location));
  if (phone) contactParts.push(esc(phone));

  return `
  <div style="text-align:center;margin-bottom:4px;">
    <h1 style="font-family:${FONT};font-size:18pt;font-weight:bold;margin:0 0 4px;color:${C_TEXT};">${esc(name)}</h1>
    <p style="font-size:9pt;margin:0 0 4px;color:${C_TEXT};">
      ${contactParts.join(' / ')}
    </p>
    <hr style="border:none;border-top:1.5px solid ${C_TEXT};margin:0;"/>
  </div>`;
}

function buildSummary(summary: string | undefined, lang: CvLanguage): string {
  if (!summary) return "";
  const L = LABELS[lang];
  return `
  ${secHeading(L.summary)}
  <p style="font-size:10pt;color:${C_TEXT};line-height:1.5;margin:0 0 4px;">${esc(summary)}</p>`;
}

function buildExperience(exp: CvExperience[], lang: CvLanguage): string {
  if (!exp || exp.length === 0) return "";
  const L = LABELS[lang];

  const entries = exp
    .map((e) => {
      const skillsLine =
        e.skills && e.skills.length > 0
          ? `<p style="font-size:10pt;color:${C_TEXT};margin:4px 0 0;">
              <strong>${esc(L.expSkills)}:</strong> ${e.skills.map(esc).join(", ")};
             </p>`
          : "";

      return `
      <div style="margin-bottom:20px;">
        ${twoCol(`<strong>${esc(e.company)}</strong>`, esc(e.location), { leftBold: false, leftSize: "11pt" })}
        ${twoCol(`<strong>${esc(e.role)}</strong>`, `${esc(e.startDate)} – ${esc(e.endDate)}`, { leftBold: false, leftSize: "10.5pt" })}
        ${e.summary ? `<p style="font-size:10pt;color:${C_LIGHT};margin:3px 0;font-style:italic;">${esc(e.summary)}</p>` : ""}
        ${e.responsibilities?.length ? boldLabel(L.responsibilities) + bulletList(e.responsibilities) : ""}
        ${e.keyResults?.length ? boldLabel(L.keyResults) + bulletList(e.keyResults) : ""}
        ${skillsLine}
      </div>`;
    })
    .join("");

  return secHeading(L.experience) + entries;
}

function buildEducation(edu: CvEducation[], lang: CvLanguage): string {
  if (!edu || edu.length === 0) return "";
  const L = LABELS[lang];

  const entries = edu
    .map((e) => {
      const details = e.details
        ? `<p style="font-size:9pt;color:${C_MUTED};margin:2px 0 0;line-height:1.5;">${esc(e.details)}</p>`
        : "";

      return `
      <div style="margin-bottom:10px;">
        ${twoCol(`<strong>${esc(e.school)}</strong>`, esc(e.location), { leftSize: "10.5pt" })}
        ${twoCol(esc(e.degree), `${esc(e.startDate)} – ${esc(e.endDate)}`, { leftSize: "10pt" })}
        ${details}
      </div>`;
    })
    .join("");

  return secHeading(L.education) + entries;
}

function buildLanguages(
  langs: CvLanguageEntry[] | undefined,
  uiLang: CvLanguage,
): string {
  if (!langs || langs.length === 0) return "";
  const L = LABELS[uiLang];

  const lines = langs
    .map(
      (l) =>
        `<p style="font-size:10pt;color:${C_TEXT};margin:2px 0;">
          <strong>${esc(l.name)}:</strong> ${esc(l.level)}
        </p>`,
    )
    .join("");

  return secHeading(L.languages) + lines;
}

function buildCertifications(
  certs: CvCertification[] | undefined,
  lang: CvLanguage,
): string {
  if (!certs || certs.length === 0) return "";
  const L = LABELS[lang];

  const items = certs
    .map(
      (c) =>
        `<li style="font-size:10pt;color:${C_TEXT};line-height:1.5;margin-bottom:2px;">
          <strong>${esc(c.name)}</strong> – ${esc(c.issuer)}${c.year ? ` (${esc(String(c.year))})` : ""}
        </li>`,
    )
    .join("");

  return (
    secHeading(L.certifications) +
    `<ul style="margin:2px 0;padding-left:20px;">${items}</ul>`
  );
}

function buildSkills(skills: string[] | undefined, lang: CvLanguage): string {
  if (!skills || skills.length === 0) return "";
  const L = LABELS[lang];

  return (
    secHeading(L.skills) +
    `<p style="font-size:10pt;color:${C_TEXT};margin:2px 0 0;line-height:1.6;">
      ${skills.map(esc).join("  ·  ")}
    </p>`
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function renderCvHtml(
  data: CvData,
  lang: CvLanguage = "pt-BR",
): string {
  const body = [
    buildSummary(data.summary, lang),
    buildExperience(data.experience, lang),
    buildEducation(data.education, lang),
    buildLanguages(data.languages, lang),
    buildCertifications(data.certifications, lang),
    buildSkills(data.skills, lang),
  ].join("");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>CV – ${esc(data.name)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: ${FONT};
      background: #ffffff;
      color: ${C_TEXT};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    a { color: ${C_TEXT}; text-decoration: none; }
    a:visited { color: ${C_TEXT}; }
    ul { list-style-type: disc; margin: 0; padding: 0; }
    li { color: ${C_TEXT}; }
    li::marker { color: ${C_TEXT}; }
    p { margin: 0; }
    h1, h2, h3 { font-weight: bold; color: ${C_TEXT}; }
    strong { color: ${C_TEXT}; }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div style="
    max-width: 794px;
    margin: 0 auto;
    padding: 20px 36px 30px;
    background: #ffffff;
    min-height: 1123px;
  ">
    ${buildHeader(data)}
    ${body}
  </div>
</body>
</html>`;
}
