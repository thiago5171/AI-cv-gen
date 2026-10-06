/**
 * generate-templates.mjs
 * Generates cv-pt.docx and cv-en.docx with docxtemplater placeholders.
 *
 * Uses invisible tables for two-column layout (Company | Location, Role | Dates)
 * because Google Docs ignores RIGHT tab stops from the docx library.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  UnderlineType,
  convertInchesToTwip,
} from "docx";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/templates");
mkdirSync(OUT_DIR, { recursive: true });

// ─── Page geometry ───────────────────────────────────────────────────────────

const A4_WIDTH = 11906; // A4 in twips
const MARGIN_TWIP = convertInchesToTwip(0.5); // 720
const TEXT_WIDTH = A4_WIDTH - 2 * MARGIN_TWIP; // 10466
const COL_LEFT = Math.round(TEXT_WIDTH * 0.70); // 7326
const COL_RIGHT = TEXT_WIDTH - COL_LEFT;         // 3140

// ─── Labels ──────────────────────────────────────────────────────────────────

const LABELS = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER,
  left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
};

function boldText(text, size = 22) {
  return new TextRun({ text, bold: true, size, color: "000000", font: "Calibri" });
}

function normalText(text, size = 20, color = "000000") {
  return new TextRun({ text, size, color, font: "Calibri" });
}

const LINK_COLOR = "0563C1"; // same hyperlink blue Word uses

function linkText(text, size = 18) {
  return new TextRun({
    text,
    size,
    color: LINK_COLOR,
    font: "Calibri",
    underline: { type: UnderlineType.SINGLE, color: LINK_COLOR },
  });
}

function sectionHeading(text) {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: true, size: 22, color: "000000", font: "Calibri" }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 60 },
  });
}

function labelRun(text) {
  return new TextRun({ text, bold: true, size: 20, color: "000000", font: "Calibri" });
}

function bullet(text) {
  return new Paragraph({
    children: [normalText(text)],
    bullet: { level: 0 },
    spacing: { after: 20 },
  });
}

function spacer(twips) {
  return new Paragraph({ children: [], spacing: { before: twips, after: 0 } });
}

/**
 * Two-column row using an invisible table.
 * Google Docs ignores RIGHT tab stops from the docx library,
 * but tables with hidden borders work everywhere.
 */
function twoColTable(leftRuns, rightRuns) {
  return new Table({
    columnWidths: [COL_LEFT, COL_RIGHT],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: leftRuns, spacing: { after: 0 } })],
            width: { size: COL_LEFT, type: WidthType.DXA },
            borders: NO_BORDERS,
          }),
          new TableCell({
            children: [new Paragraph({
              children: rightRuns,
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0 },
            })],
            width: { size: COL_RIGHT, type: WidthType.DXA },
            borders: NO_BORDERS,
          }),
        ],
      }),
    ],
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    borders: NO_BORDERS,
  });
}

// ─── Template builder ─────────────────────────────────────────────────────────

function buildTemplate(lang) {
  const L = LABELS[lang];
  const children = [];

  // ── HEADER ──
  children.push(
    new Paragraph({
      children: [boldText("{name}", 36)],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        normalText("{#basicInfo.links}", 18),
        linkText("{label}"),
        normalText(" / ", 18, "888888"),
        normalText("{/basicInfo.links}", 18),
        normalText("{basicInfo.email}", 18),
        normalText(" / ", 18, "888888"),
        normalText("{basicInfo.location}", 18),
        normalText(" / ", 18, "888888"),
        normalText("{basicInfo.phone}", 18),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [],
      spacing: { before: 0, after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" } },
    }),
  );

  // ── SUMMARY ──
  children.push(
    new Paragraph({ children: [new TextRun("{#summary}")], spacing: { after: 0 } }),
    sectionHeading(L.summary),
    new Paragraph({ children: [normalText("{summary}", 20)], spacing: { after: 60 } }),
    new Paragraph({ children: [new TextRun("{/summary}")], spacing: { after: 0 } }),
  );

  // ── EXPERIENCE ──
  children.push(sectionHeading(L.experience));
  children.push(
    new Paragraph({ children: [new TextRun("{#experience}")], spacing: { after: 0 } }),

    spacer(80),

    // Company | Location (table)
    twoColTable(
      [boldText("{company}", 22)],
      [normalText("{location}", 20, "444444")],
    ),

    // Role | Dates (table)
    twoColTable(
      [boldText("{role}", 20)],
      [normalText("{startDate} – {endDate}", 20, "444444")],
    ),

    // Summary (optional)
    new Paragraph({ children: [new TextRun("{#summary}")] }),
    new Paragraph({
      children: [new TextRun({ text: "{summary}", italics: true, size: 19, color: "444444", font: "Calibri" })],
      spacing: { after: 40 },
    }),
    new Paragraph({ children: [new TextRun("{/summary}")] }),

    // Responsibilities
    new Paragraph({ children: [labelRun(`${L.responsibilities}:`)], spacing: { before: 40, after: 20 } }),
    new Paragraph({ children: [new TextRun("{#responsibilities}")] }),
    bullet("{.}"),
    new Paragraph({ children: [new TextRun("{/responsibilities}")] }),

    // Key Results
    new Paragraph({ children: [labelRun(`${L.keyResults}:`)], spacing: { before: 40, after: 20 } }),
    new Paragraph({ children: [new TextRun("{#keyResults}")] }),
    bullet("{.}"),
    new Paragraph({ children: [new TextRun("{/keyResults}")] }),

    // Skills inline
    new Paragraph({
      children: [
        labelRun(`${L.expSkills}: `),
        new TextRun({ text: "{#skills}{.}, {/skills}", size: 20, color: "000000", font: "Calibri" }),
      ],
      spacing: { before: 40, after: 200 },
    }),

    new Paragraph({ children: [new TextRun("{/experience}")], spacing: { after: 0 } }),
  );

  // ── EDUCATION ──
  children.push(sectionHeading(L.education));
  children.push(
    new Paragraph({ children: [new TextRun("{#education}")] }),

    spacer(40),

    // School | Location (table)
    twoColTable(
      [boldText("{school}", 22)],
      [normalText("{location}", 20, "444444")],
    ),

    // Degree | Dates (table)
    twoColTable(
      [normalText("{degree}", 20)],
      [normalText("{startDate} – {endDate}", 20, "444444")],
    ),

    // Details
    new Paragraph({ children: [new TextRun("{#details}")] }),
    new Paragraph({ children: [normalText("{details}", 19, "444444")], spacing: { after: 20 } }),
    new Paragraph({ children: [new TextRun("{/details}")] }),

    new Paragraph({ children: [new TextRun("{/education}")] }),
  );

  // ── LANGUAGES ──
  children.push(sectionHeading(L.languages));
  children.push(
    new Paragraph({ children: [new TextRun("{#languages}")] }),
    new Paragraph({
      children: [boldText("{name}", 20), normalText(": ", 20), normalText("{level}", 20, "444444")],
      spacing: { after: 20 },
    }),
    new Paragraph({ children: [new TextRun("{/languages}")] }),
  );

  // ── CERTIFICATIONS ──
  children.push(sectionHeading(L.certifications));
  children.push(
    new Paragraph({ children: [new TextRun("{#certifications}")] }),
    new Paragraph({
      children: [
        boldText("{name}", 20),
        normalText(" – ", 20, "444444"),
        normalText("{issuer}", 20, "444444"),
        normalText(" ({year})", 20, "444444"),
      ],
      bullet: { level: 0 },
      spacing: { after: 20 },
    }),
    new Paragraph({ children: [new TextRun("{/certifications}")] }),
  );

  // ── GLOBAL SKILLS ──
  children.push(sectionHeading(L.skills));
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "{#skills}{.}  ·  {/skills}", size: 20, color: "000000", font: "Calibri" })],
      spacing: { after: 60 },
    }),
  );

  return new Document({
    creator: "CV Gen",
    title: `CV Template – ${lang}`,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 20, color: "000000" },
          paragraph: { spacing: { after: 40, line: 276 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.4),
            right: MARGIN_TWIP,
            bottom: convertInchesToTwip(0.4),
            left: MARGIN_TWIP,
          },
        },
      },
      children,
    }],
  });
}

// ─── Generate ─────────────────────────────────────────────────────────────────

const langs = ["pt-BR", "en-US"];
const fileNames = { "pt-BR": "cv-pt.docx", "en-US": "cv-en.docx" };

for (const lang of langs) {
  const doc = buildTemplate(lang);
  const buffer = await Packer.toBuffer(doc);
  const outPath = join(OUT_DIR, fileNames[lang]);
  writeFileSync(outPath, buffer);
  console.log(`✓ Generated: ${outPath}`);
}

console.log("\nDone!");
