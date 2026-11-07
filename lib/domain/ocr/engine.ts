import type {
  OcrAnchor,
  OcrAnchorResult,
  OcrAnchorVehicle,
  OcrBox,
  OcrDocument,
  OcrField,
  OcrFieldResult,
  OcrTemplate,
  OcrTransform,
  OcrWildcard,
  OcrWord
} from "@/lib/domain/ocr/types";

/**
 * Motor de extração por template:
 * 1. REGIÃO: palavras dentro da área marcada no exemplo → transformações →
 *    valida com os coringas.
 * 2. CORINGA: se não há região (ou ela falhou), gera candidatos no documento
 *    inteiro (palavras, sequências da mesma linha, texto depois de rótulos) e
 *    escolhe o melhor que passa em todos os coringas.
 */

/** Folga da região: proporcional ao tamanho dela (fixa engolia rótulos vizinhos). */
const REGION_TOLERANCE_MAX = 0.012;
const REGION_TOLERANCE_RATIO = 0.15;
const MAX_NGRAM = 4;

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeLoose(value: string) {
  return stripAccents(value).toLowerCase().replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------ transformações

export function applyTransforms(raw: string, transforms: OcrTransform[]) {
  // Espaços repetidos/nas pontas saem sempre ("trim" ficou só por compatibilidade).
  let value = raw.replace(/\s+/g, " ").trim();
  for (const transform of transforms) {
    if (transform === "upper") value = value.toLocaleUpperCase("pt-BR");
    if (transform === "digits_only") value = value.replace(/\D/g, "");
    if (transform === "alnum_only") value = stripAccents(value).replace(/[^0-9a-zA-Z]/g, "");
    if (transform === "no_spaces") value = value.replace(/\s+/g, "");
  }
  return value;
}

// -------------------------------------------------------------- coringas

export function maskMatches(value: string, mask: string) {
  if (value.length !== mask.length) return false;
  for (let index = 0; index < mask.length; index += 1) {
    const symbol = mask[index];
    const char = value[index];
    if (symbol === "9" && !/\d/.test(char)) return false;
    if (symbol === "A" && !/[a-zA-ZÀ-ÿ]/.test(char)) return false;
    if (symbol === "*" && !/[0-9a-zA-ZÀ-ÿ]/.test(char)) return false;
    // "_" do formato: o OCR costuma ler o sublinhado como espaço ou hífen.
    if (symbol === "_" && !/[_\s-]/.test(char)) return false;
    if (!["9", "A", "*", "_"].includes(symbol) && symbol.toLowerCase() !== char.toLowerCase()) return false;
  }
  return true;
}

function safeRegex(source: string) {
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

/** Um coringa como FILTRO do valor (after_label não filtra; ele gera candidatos). */
export function wildcardAccepts(value: string, wildcard: OcrWildcard) {
  const loose = normalizeLoose(value);
  switch (wildcard.kind) {
    case "length":
      return value.length >= wildcard.min && value.length <= wildcard.max;
    case "contains":
      return loose.includes(normalizeLoose(wildcard.value));
    case "starts_with":
      return loose.startsWith(normalizeLoose(wildcard.value));
    case "ends_with":
      return loose.endsWith(normalizeLoose(wildcard.value));
    case "mask":
      return maskMatches(value, wildcard.mask);
    case "charset":
      if (wildcard.set === "digits") return /^\d+$/.test(value);
      if (wildcard.set === "letters") return /^[\p{L} ]+$/u.test(value);
      return /^[\p{L}\d]+$/u.test(value);
    case "regex": {
      const regex = safeRegex(wildcard.source);
      return regex ? regex.test(value) : false;
    }
    case "after_label":
      return true;
    default:
      return true;
  }
}

export function fieldAccepts(field: Pick<OcrField, "wildcards">, value: string) {
  return value.length > 0 && field.wildcards.every((wildcard) => wildcardAccepts(value, wildcard));
}

/** Coringas sugeridos a partir do texto selecionado no exemplo. */
export function suggestWildcards(sample: string): OcrWildcard[] {
  const value = sample.trim();
  if (!value) return [];
  const suggestions: OcrWildcard[] = [{ kind: "length", min: value.length, max: value.length }];
  if (/^\d+$/.test(value)) suggestions.push({ kind: "charset", set: "digits" });
  else if (/^[\p{L}\d]+$/u.test(value)) {
    const mask = Array.from(value)
      .map((char) => (/\d/.test(char) ? "9" : /\p{L}/u.test(char) ? "A" : char))
      .join("");
    suggestions.push({ kind: "mask", mask });
  }
  return suggestions;
}

// ------------------------------------------------------------- geometria

function center(box: OcrBox) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function unionBox(boxes: OcrBox[]): OcrBox | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function wordsInRegion(document: OcrDocument, region: OcrBox & { page: number }, strict = false) {
  const tolX = strict ? 0 : Math.min(REGION_TOLERANCE_MAX, region.w * REGION_TOLERANCE_RATIO);
  const tolY = strict ? 0 : Math.min(REGION_TOLERANCE_MAX, region.h * REGION_TOLERANCE_RATIO);
  return document.words.filter((word) => {
    if (word.page !== region.page) return false;
    const point = center(word.box);
    return (
      point.x >= region.x - tolX &&
      point.x <= region.x + region.w + tolX &&
      point.y >= region.y - tolY &&
      point.y <= region.y + region.h + tolY
    );
  });
}

type Line = { page: number; y: number; h: number; words: OcrWord[] };

/** Agrupa palavras em linhas (mesma página, centros verticais próximos), em ordem de leitura. */
export function groupLines(words: OcrWord[]): Line[] {
  const sorted = [...words].sort((left, right) => left.page - right.page || center(left.box).y - center(right.box).y);
  const lines: Line[] = [];
  for (const word of sorted) {
    const y = center(word.box).y;
    const line = lines.find(
      (candidate) => candidate.page === word.page && Math.abs(candidate.y - y) <= Math.max(candidate.h, word.box.h) * 0.55
    );
    if (line) {
      line.words.push(word);
      line.y = (line.y * (line.words.length - 1) + y) / line.words.length;
      line.h = Math.max(line.h, word.box.h);
    } else {
      lines.push({ page: word.page, y, h: word.box.h, words: [word] });
    }
  }
  for (const line of lines) line.words.sort((left, right) => left.box.x - right.box.x);
  return lines.sort((left, right) => left.page - right.page || left.y - right.y);
}

/** Texto da área preservando as linhas (máscara de área). */
export function joinLines(words: OcrWord[]) {
  return groupLines(words)
    .map((line) => line.words.map((word) => word.text).join(" "))
    .join("\n")
    .trim();
}

/** Transformações por linha (não colapsa as quebras da área). */
function transformLines(text: string, transforms: OcrTransform[]) {
  return text
    .split("\n")
    .map((line) => applyTransforms(line, transforms))
    .filter((line) => line.length > 0)
    .join("\n");
}

export function joinWords(words: OcrWord[]) {
  return groupLines(words)
    .map((line) => line.words.map((word) => word.text).join(" "))
    .join(" ")
    .trim();
}

// ------------------------------------------------------------ candidatos

type Candidate = { raw: string; words: OcrWord[]; afterLabel: boolean };

function sequences(line: Line, start: number): Candidate[] {
  const out: Candidate[] = [];
  for (let size = 1; size <= MAX_NGRAM && start + size <= line.words.length; size += 1) {
    const words = line.words.slice(start, start + size);
    out.push({ raw: words.map((word) => word.text).join(" "), words, afterLabel: false });
  }
  return out;
}

/** Chave de comparação de rótulo: só letras e dígitos (ignora acento, pontuação, "Nº"/"N°", espaços). */
function labelKey(text: string) {
  return normalizeLoose(text).replace(/[^a-z0-9]+/g, "");
}

type LabelToken = { lineIndex: number; wordIndex: number; word: OcrWord };

/**
 * Acha o rótulo começando na palavra (lineIndex, wordIndex): segue pela linha
 * e, se ele quebrar, continua UMA linha abaixo, na palavra alinhada sob o que
 * já foi lido (colunas vizinhas na mesma linha não atrapalham).
 */
function matchLabelAt(lines: Line[], target: string, lineIndex: number, wordIndex: number): LabelToken[] | null {
  const line = lines[lineIndex];
  const tokens: LabelToken[] = [];
  let joined = "";
  for (let index = wordIndex; index < line.words.length && tokens.length < 16; index += 1) {
    const key = labelKey(line.words[index].text);
    joined += key;
    tokens.push({ lineIndex, wordIndex: index, word: line.words[index] });
    if (joined === target) return tokens;
    if (!target.startsWith(joined)) return null;
    if (!key) continue;
    const next = lines[lineIndex + 1];
    if (!next || next.page !== line.page) continue;
    const left = Math.min(...tokens.map((token) => token.word.box.x)) - 0.05;
    const right = Math.max(...tokens.map((token) => token.word.box.x + token.word.box.w)) + 0.05;
    const continueAt = next.words.findIndex((word) => word.box.x + word.box.w >= left && word.box.x <= right);
    if (continueAt < 0) continue;
    let wrapped = joined;
    const wrappedTokens = [...tokens];
    for (let below = continueAt; below < next.words.length && wrappedTokens.length < 16; below += 1) {
      wrapped += labelKey(next.words[below].text);
      wrappedTokens.push({ lineIndex: lineIndex + 1, wordIndex: below, word: next.words[below] });
      if (wrapped === target) return wrappedTokens;
      if (!target.startsWith(wrapped)) break;
    }
  }
  return null;
}

/**
 * Candidatos depois de um RÓTULO. O rótulo pode ser composto ("VALOR TOTAL DA
 * NOTA"), vir com pontuação ("Nº"/"N°", ":"), com palavras grudadas/separadas
 * pelo OCR ou quebrado na linha de baixo ("CHAVE DE / ACESSO"). O valor vem à
 * direita do rótulo (na linha onde ele termina ou na 1ª linha dele) ou na
 * linha de baixo, alinhado sob ele.
 */
function labelCandidates(lines: Line[], label: string): Candidate[] {
  const target = labelKey(label);
  if (!target) return [];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (candidates: Candidate[]) => {
    for (const candidate of candidates) {
      const id = candidate.words.map((word) => `${word.page}:${word.box.x}:${word.box.y}`).join("|");
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ ...candidate, afterLabel: true });
    }
  };

  lines.forEach((line, lineIndex) => {
    line.words.forEach((word, wordIndex) => {
      const key = labelKey(word.text);
      if (!key || !target.startsWith(key)) return;
      const tokens = matchLabelAt(lines, target, lineIndex, wordIndex);
      if (!tokens) return;
      const last = tokens[tokens.length - 1];
      const endLine = lines[last.lineIndex];
      // À direita, na linha onde o rótulo termina.
      push(sequences(endLine, last.wordIndex + 1));
      // À direita da 1ª linha do rótulo (rótulo quebrado com o valor ao lado).
      if (last.lineIndex !== lineIndex) {
        const lastOnStart = Math.max(...tokens.filter((token) => token.lineIndex === lineIndex).map((token) => token.wordIndex));
        push(sequences(line, lastOnStart + 1));
      }
      // Linha de baixo, alinhada sob o rótulo (layout de formulário).
      const below = lines[last.lineIndex + 1];
      if (below && below.page === endLine.page) {
        const labelLeft = Math.min(...tokens.map((token) => token.word.box.x)) - 0.05;
        const startBelow = below.words.findIndex((entry) => entry.box.x + entry.box.w >= labelLeft);
        if (startBelow >= 0) push(sequences(below, startBelow));
      }
    });
  });
  return out;
}

function allCandidates(lines: Line[]): Candidate[] {
  return lines.flatMap((line) => line.words.flatMap((_, start) => sequences(line, start)));
}

/** Variações de um candidato: com e sem espaços (OCR costuma quebrar placas/números). */
function variants(candidate: Candidate) {
  const set = new Set([candidate.raw, candidate.raw.replace(/\s+/g, "")]);
  return Array.from(set);
}

// -------------------------------------------------------------- extração

function pickBest(pool: Candidate[], field: OcrField) {
  const anchor = field.region ? center(field.region) : null;
  let best: { value: string; words: OcrWord[]; score: number } | null = null;
  for (const candidate of pool) {
    for (const raw of variants(candidate)) {
      const value = applyTransforms(raw, field.transforms);
      if (!fieldAccepts(field, value)) continue;
      const box = unionBox(candidate.words.map((word) => word.box));
      const distance = anchor && box ? Math.hypot(center(box).x - anchor.x, center(box).y - anchor.y) : 0.5;
      const lengthGap = field.sampleText ? Math.abs(value.length - field.sampleText.trim().length) / 20 : 0;
      const score = (candidate.afterLabel ? 2 : 0) - distance - lengthGap - candidate.words.length * 0.01;
      if (!best || score > best.score) best = { value, words: candidate.words, score };
    }
  }
  return best;
}

const toBoxes = (words: OcrWord[]) => words.map((word) => ({ ...word.box, page: word.page }));

export function extractField(document: OcrDocument, field: OcrField): OcrFieldResult {
  const base = { fieldId: field.id };

  if (field.mode === "area") {
    if (!field.region) return { ...base, value: null, source: "none", boxes: [], valid: false };
    const words = wordsInRegion(document, field.region, true);
    const value = transformLines(joinLines(words), field.transforms);
    if (!value) return { ...base, value: null, source: "none", boxes: [], valid: false };
    const valid = field.wildcards.every((wildcard) => wildcardAccepts(value.replace(/\n/g, " "), wildcard));
    return { ...base, value, source: "region", boxes: toBoxes(words), valid };
  }

  if (field.region) {
    const words = wordsInRegion(document, field.region);
    const value = applyTransforms(joinWords(words), field.transforms);
    if (words.length > 0 && fieldAccepts(field, value)) {
      return { ...base, value, source: "region", boxes: toBoxes(words), valid: true };
    }
    // A área pegou algo a mais (rótulo vizinho, ruído): tenta trechos dentro dela.
    const local = field.wildcards.length > 0 ? pickBest(allCandidates(groupLines(words)), field) : null;
    if (local) return { ...base, value: local.value, source: "region", boxes: toBoxes(local.words), valid: true };
  }

  const lines = groupLines(document.words);
  const labels = field.wildcards.filter((wildcard): wildcard is Extract<OcrWildcard, { kind: "after_label" }> => wildcard.kind === "after_label");
  const pool = labels.length > 0 ? labels.flatMap((wildcard) => labelCandidates(lines, wildcard.label)) : allCandidates(lines);
  // Sem nenhum filtro, "qualquer texto" não é um coringa útil: só a região vale.
  const hasFilter = field.wildcards.some((wildcard) => wildcard.kind !== "after_label") || labels.length > 0;
  if (!hasFilter) return { ...base, value: null, source: "none", boxes: [], valid: false };

  const best = pickBest(pool, field);
  if (!best) return { ...base, value: null, source: "none", boxes: [], valid: false };
  return { ...base, value: best.value, source: "wildcard", boxes: toBoxes(best.words), valid: true };
}

export function extractTemplate(document: OcrDocument, template: Pick<OcrTemplate, "fields">) {
  return template.fields.map((field) => extractField(document, field));
}

export function documentText(document: OcrDocument) {
  return groupLines(document.words)
    .map((line) => line.words.map((word) => word.text).join(" "))
    .join("\n");
}

// ----------------------------------------------------------------- âncoras

/** Trocas típicas do OCR: comparamos numa forma canônica que as ignora. */
const OCR_CONFUSABLE: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };

function compactUpper(value: string) {
  return stripAccents(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalOcr(value: string) {
  return compactUpper(value).replace(/[OQDILZSBG]/g, (char) => OCR_CONFUSABLE[char] ?? char);
}

const MERCOSUL_LETTERS = "ABCDEFGHIJ";

/** Placa nas duas grafias: antiga (ABC1234) e Mercosul (ABC1C34). */
export function plateVariants(placa: string) {
  const plate = compactUpper(placa);
  const variants = new Set([plate]);
  if (/^[A-Z]{3}\d{4}$/.test(plate)) variants.add(plate.slice(0, 4) + MERCOSUL_LETTERS[Number(plate[4])] + plate.slice(5));
  if (/^[A-Z]{3}\d[A-J]\d{2}$/.test(plate)) variants.add(plate.slice(0, 4) + MERCOSUL_LETTERS.indexOf(plate[4]) + plate.slice(5));
  return Array.from(variants);
}

function anchorVariants(anchor: OcrAnchor, vehicle: OcrAnchorVehicle): string[] | null {
  if (anchor.kind === "text") return anchor.value.trim() ? [anchor.value] : null;
  const raw = String(vehicle[anchor.field] ?? "").trim();
  if (!raw) return null;
  if (anchor.field === "placa") return plateVariants(raw);
  if (anchor.field === "renavam") {
    const digits = raw.replace(/\D/g, "");
    return Array.from(new Set([digits, digits.replace(/^0+/, "")])).filter(Boolean);
  }
  return [raw];
}

/**
 * Confere as âncoras no texto inteiro do documento (sem depender de posição).
 * Ignora espaços/pontuação (o OCR quebra "ABC 1D23") e as trocas O/0, I/1...
 */
export function checkAnchors(document: OcrDocument, anchors: OcrAnchor[], vehicle: OcrAnchorVehicle): OcrAnchorResult[] {
  if (anchors.length === 0) return [];
  const text = documentText(document);
  const compact = compactUpper(text);
  const canonical = canonicalOcr(text);
  const loose = normalizeLoose(text);
  return anchors.map((anchor) => {
    const variants = anchorVariants(anchor, vehicle);
    const expected = anchor.kind === "text" ? anchor.value : (vehicle[anchor.field] ?? null);
    if (!variants) return { anchor, status: anchor.kind === "text" ? "ok" : "skipped", expected };
    const found = variants.some((variant) => {
      const compactVariant = compactUpper(variant);
      if (!compactVariant) return false;
      if (anchor.kind === "text" && loose.includes(normalizeLoose(variant))) return true;
      return compact.includes(compactVariant) || canonical.includes(canonicalOcr(variant));
    });
    return { anchor, status: found ? "ok" : "missing", expected };
  });
}

export function anchorLabel(anchor: OcrAnchor) {
  if (anchor.kind === "text") return `Texto “${anchor.value}”`;
  return {
    placa: "Placa do veículo da pasta",
    chassi: "Chassi do veículo da pasta",
    renavam: "Renavam do veículo da pasta",
    codigo_nota_fiscal: "Código da nota fiscal do veículo da pasta"
  }[anchor.field];
}
