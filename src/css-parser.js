const PSEUDO_ELEMENT_LEGACY_NAMES = new Set([
  "before",
  "after",
  "first-letter",
  "first-line",
]);

const VALID_PROPERTY_PATTERN =
  /^(?:--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9_-]*)$/;
const IDENT_CHAR_PATTERN = /[a-zA-Z0-9_-]/;
const IMPORTANT_SUFFIX_PATTERN = /^!\s*important$/i;

export const MAX_CSS_ERRORS = 20;

const isWhitespace = (ch) => {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\f";
};

const formatIssueLocation = (issue) => {
  const parts = [];
  if (issue.styleName !== undefined && issue.styleName.length > 0) {
    parts.push(`style "${issue.styleName}"`);
  }
  if (issue.sectionIndex !== undefined) {
    parts.push(`section #${issue.sectionIndex}`);
  }
  if (issue.domain !== undefined && issue.domain.length > 0) {
    parts.push(`domain: ${issue.domain}`);
  }

  const scope = parts.length > 0 ? ` in ${parts.join(", ")}` : "";
  const linePrefix = String(issue.line);
  const pad = " ".repeat(linePrefix.length);
  const caretOffset = Math.max(0, issue.column - 1);

  const lines = [
    `CSS Parse Error${scope} at line ${issue.line}, column ${issue.column}:`,
    `  ${issue.message}`,
  ];

  if (issue.snippet !== undefined) {
    lines.push(`  ${linePrefix} | ${issue.snippet}`);
    lines.push(`  ${pad} | ${" ".repeat(caretOffset)}^`);
  }

  return lines.join("\n");
};

export const formatCssParseIssues = (issues, totalCount = issues.length) => {
  const formatted = issues.map(formatIssueLocation).join("\n\n");
  if (totalCount > issues.length) {
    const remaining = totalCount - issues.length;
    return `${formatted}\n\n... and ${remaining} more CSS error${remaining === 1 ? "" : "s"}.`;
  }
  return formatted;
};

export class CssParseError extends Error {
  constructor(issues, totalCount = issues.length, options) {
    super(formatCssParseIssues(issues, totalCount), options);
    this.name = "CssParseError";
    this.issues = issues;
    this.totalCount = totalCount;
    this.line = issues[0]?.line ?? 1;
    this.column = issues[0]?.column ?? 1;
  }
}

const normalizeMediaPrelude = (raw) => {
  let out = "";
  let inQuote = null;
  let parenDepth = 0;
  let pendingSpace = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inQuote !== null) {
      out += ch;
      if (ch === "\\" && i + 1 < raw.length) {
        i += 1;
        out += raw[i];
      } else if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      if (pendingSpace && out.length > 0 && !out.endsWith("(")) {
        out += " ";
      }
      pendingSpace = false;
      inQuote = ch;
      out += ch;
      continue;
    }

    if (isWhitespace(ch)) {
      pendingSpace = true;
      continue;
    }

    if (ch === "(") {
      if (pendingSpace && out.length > 0 && !out.endsWith("(")) {
        out += " ";
      }
      pendingSpace = false;
      parenDepth += 1;
      out += "(";
      continue;
    }

    if (ch === ")") {
      pendingSpace = false;
      if (parenDepth > 0) parenDepth -= 1;
      out += ")";
      continue;
    }

    if (ch === ":" && parenDepth > 0) {
      pendingSpace = false;
      out += ":";
      continue;
    }

    if (ch === ",") {
      pendingSpace = false;
      out += ", ";
      continue;
    }

    if (
      pendingSpace &&
      out.length > 0 &&
      !out.endsWith("(") &&
      !(parenDepth > 0 && out.endsWith(":")) &&
      !out.endsWith(", ")
    ) {
      out += " ";
    }
    pendingSpace = false;
    out += ch;
  }

  return out.trim();
};

const normalizeSelectorText = (raw) => {
  let out = "";
  let inQuote = null;
  let pendingSpace = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inQuote !== null) {
      out += ch;
      if (ch === "\\" && i + 1 < raw.length) {
        i += 1;
        out += raw[i];
      } else if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      if (pendingSpace && out.length > 0) {
        out += " ";
      }
      pendingSpace = false;
      inQuote = ch;
      out += ch;
      continue;
    }

    if (isWhitespace(ch)) {
      pendingSpace = true;
      continue;
    }

    if (pendingSpace && out.length > 0) {
      out += " ";
    }
    pendingSpace = false;
    out += ch;
  }

  return out.trim();
};

export const parseSelectorNode = (rawText, loc = { line: 1, column: 1 }) => {
  const normalized = normalizeSelectorText(rawText);
  let baseSelector = "";
  let pseudoElement = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let inQuote = null;

  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];

    if (inQuote !== null) {
      baseSelector += ch;
      if (ch === "\\" && i + 1 < normalized.length) {
        i += 1;
        baseSelector += normalized[i];
      } else if (ch === inQuote) {
        inQuote = null;
      }
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inQuote = ch;
      baseSelector += ch;
      i += 1;
      continue;
    }

    if (ch === "(") {
      parenDepth += 1;
      baseSelector += ch;
      i += 1;
      continue;
    }
    if (ch === ")") {
      if (parenDepth > 0) parenDepth -= 1;
      baseSelector += ch;
      i += 1;
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      baseSelector += ch;
      i += 1;
      continue;
    }
    if (ch === "]") {
      if (bracketDepth > 0) bracketDepth -= 1;
      baseSelector += ch;
      i += 1;
      continue;
    }

    if (ch === ":" && parenDepth === 0 && bracketDepth === 0) {
      const isDoubleColon = normalized[i + 1] === ":";
      const nameStart = i + (isDoubleColon ? 2 : 1);
      let nameEnd = nameStart;
      while (
        nameEnd < normalized.length &&
        IDENT_CHAR_PATTERN.test(normalized[nameEnd])
      ) {
        nameEnd += 1;
      }
      const pseudoName = normalized.slice(nameStart, nameEnd);

      if (
        pseudoName.length > 0 &&
        (isDoubleColon ||
          PSEUDO_ELEMENT_LEGACY_NAMES.has(pseudoName.toLowerCase()))
      ) {
        let tokenEnd = nameEnd;
        if (normalized[tokenEnd] === "(") {
          let fnDepth = 1;
          tokenEnd += 1;
          let fnQuote = null;
          while (tokenEnd < normalized.length && fnDepth > 0) {
            const c = normalized[tokenEnd];
            if (fnQuote !== null) {
              if (c === "\\" && tokenEnd + 1 < normalized.length) {
                tokenEnd += 2;
                continue;
              }
              if (c === fnQuote) fnQuote = null;
            } else if (c === "'" || c === '"') {
              fnQuote = c;
            } else if (c === "(") {
              fnDepth += 1;
            } else if (c === ")") {
              fnDepth -= 1;
            }
            tokenEnd += 1;
          }
        }
        pseudoElement = normalized.slice(i, tokenEnd);
        i = tokenEnd;
        continue;
      }
    }

    baseSelector += ch;
    i += 1;
  }

  return {
    type: "Selector",
    raw: normalized,
    baseSelector: baseSelector.trim(),
    pseudoElement,
    loc,
  };
};

class CssParser {
  #source;
  #lines;
  #context;
  #pos = 0;
  #line = 1;
  #column = 1;
  #issues = [];
  #totalIssues = 0;

  constructor(source, context) {
    this.#source = source.replace(/\r\n?/g, "\n");
    this.#lines = this.#source.split("\n");
    this.#context = context;
  }

  get issues() {
    return this.#issues;
  }

  get totalIssues() {
    return this.#totalIssues;
  }

  #loc() {
    return { line: this.#line, column: this.#column };
  }

  #eof() {
    return this.#pos >= this.#source.length;
  }

  #peek(offset = 0) {
    return this.#source[this.#pos + offset] ?? "";
  }

  #advance() {
    const ch = this.#source[this.#pos];
    this.#pos += 1;
    if (ch === "\n") {
      this.#line += 1;
      this.#column = 1;
    } else {
      this.#column += 1;
    }
    return ch;
  }

  #reportError(message, loc = this.#loc()) {
    this.#totalIssues += 1;
    if (this.#issues.length >= MAX_CSS_ERRORS) return;

    const snippet = this.#lines[loc.line - 1] ?? "";
    const issue = {
      message,
      line: loc.line,
      column: loc.column,
      snippet,
    };
    if (this.#context.styleName !== undefined) {
      issue.styleName = this.#context.styleName;
    }
    if (this.#context.sectionIndex !== undefined) {
      issue.sectionIndex = this.#context.sectionIndex;
    }
    if (this.#context.domain !== undefined) {
      issue.domain = this.#context.domain;
    }
    this.#issues.push(issue);
  }

  #skipComment() {
    const startLoc = this.#loc();
    this.#advance(); // '/'
    this.#advance(); // '*'
    while (!this.#eof()) {
      if (this.#peek() === "*" && this.#peek(1) === "/") {
        this.#advance();
        this.#advance();
        return true;
      }
      this.#advance();
    }
    this.#reportError("Unclosed CSS comment '/*'.", startLoc);
    return false;
  }

  #skipWhitespaceAndComments() {
    while (!this.#eof()) {
      const ch = this.#peek();
      if (isWhitespace(ch)) {
        this.#advance();
      } else if (ch === "/" && this.#peek(1) === "*") {
        if (!this.#skipComment()) return;
      } else {
        return;
      }
    }
  }

  #readString() {
    const startLoc = this.#loc();
    const quote = this.#advance();
    let result = quote;

    while (!this.#eof()) {
      const ch = this.#advance();
      if (ch === "\\") {
        result += ch;
        if (!this.#eof()) {
          result += this.#advance();
        } else {
          this.#reportError(`Unclosed string literal (${quote}).`, startLoc);
          return result;
        }
        continue;
      }
      if (ch === "\n") {
        this.#reportError(`Unclosed string literal (${quote}).`, startLoc);
        return result;
      }
      result += ch;
      if (ch === quote) {
        return result;
      }
    }

    this.#reportError(`Unclosed string literal (${quote}).`, startLoc);
    return result;
  }

  #isUrlFunctionStart() {
    if (this.#pos + 4 > this.#source.length) return false;
    const slice = this.#source.slice(this.#pos, this.#pos + 4).toLowerCase();
    if (slice !== "url(") return false;
    if (this.#pos > 0 && IDENT_CHAR_PATTERN.test(this.#source[this.#pos - 1])) {
      return false;
    }
    return true;
  }

  #readUrlFunction() {
    const startLoc = this.#loc();
    let result = "";
    for (let i = 0; i < 4; i += 1) {
      result += this.#advance(); // 'u', 'r', 'l', '('
    }

    this.#skipWhitespaceAndComments();
    if (this.#eof()) {
      this.#reportError("Unclosed url(...) function.", startLoc);
      return result;
    }

    const next = this.#peek();
    if (next === "'" || next === '"') {
      result += this.#readString();
      this.#skipWhitespaceAndComments();
      if (this.#peek() === ")") {
        result += this.#advance();
      } else {
        this.#reportError(
          "Expected ')' to close url(...) function.",
          this.#loc(),
        );
      }
      return result;
    }

    while (!this.#eof()) {
      const ch = this.#peek();
      if (ch === ")") {
        result += this.#advance();
        return result;
      }
      if (ch === "\n" || ch === "'" || ch === '"' || ch === "(") {
        this.#reportError(
          `Unexpected character '${ch === "\n" ? "\\n" : ch}' inside unquoted url(...).`,
          this.#loc(),
        );
        return result;
      }
      if (ch === "\\") {
        result += this.#advance();
        if (!this.#eof()) {
          result += this.#advance();
        }
        continue;
      }
      result += this.#advance();
    }

    this.#reportError("Unclosed url(...) function.", startLoc);
    return result;
  }

  #skipBalancedBlock() {
    const startLoc = this.#loc();
    if (this.#peek() !== "{") return;
    this.#advance();
    let depth = 1;

    while (!this.#eof() && depth > 0) {
      const ch = this.#peek();
      if (ch === "/" && this.#peek(1) === "*") {
        this.#skipComment();
      } else if (ch === "'" || ch === '"') {
        this.#readString();
      } else if (ch === "{") {
        depth += 1;
        this.#advance();
      } else if (ch === "}") {
        depth -= 1;
        this.#advance();
      } else {
        this.#advance();
      }
    }

    if (depth > 0) {
      this.#reportError("Unclosed '{' block.", startLoc);
    }
  }

  #skipUnsupportedAtRuleRemainder() {
    while (!this.#eof()) {
      const ch = this.#peek();
      if (ch === "/" && this.#peek(1) === "*") {
        this.#skipComment();
      } else if (ch === "'" || ch === '"') {
        this.#readString();
      } else if (ch === ";") {
        this.#advance();
        return;
      } else if (ch === "{") {
        this.#skipBalancedBlock();
        return;
      } else if (ch === "}") {
        return;
      } else {
        this.#advance();
      }
    }
  }

  #parseAtRule() {
    const startLoc = this.#loc();
    this.#advance(); // '@'

    let name = "";
    while (!this.#eof() && IDENT_CHAR_PATTERN.test(this.#peek())) {
      name += this.#advance();
    }

    if (name.length === 0) {
      this.#reportError("Expected at-rule name after '@'.", startLoc);
      this.#skipUnsupportedAtRuleRemainder();
      return null;
    }

    if (name.toLowerCase() !== "media") {
      this.#reportError(
        `Unsupported at-rule '@${name}'; only '@media' is supported.`,
        startLoc,
      );
      this.#skipUnsupportedAtRuleRemainder();
      return null;
    }

    let rawPrelude = "";
    let parenDepth = 0;
    let openParenLoc = null;

    while (!this.#eof()) {
      const ch = this.#peek();
      if (ch === "/" && this.#peek(1) === "*") {
        this.#skipComment();
        rawPrelude += " ";
        continue;
      }
      if (ch === "'" || ch === '"') {
        rawPrelude += this.#readString();
        continue;
      }
      if (ch === "(") {
        if (parenDepth === 0) openParenLoc = this.#loc();
        parenDepth += 1;
        rawPrelude += this.#advance();
        continue;
      }
      if (ch === ")") {
        if (parenDepth === 0) {
          this.#reportError(
            "Unexpected ')' in '@media' condition.",
            this.#loc(),
          );
        } else {
          parenDepth -= 1;
        }
        rawPrelude += this.#advance();
        continue;
      }
      if (ch === "{" && parenDepth === 0) {
        break;
      }
      if ((ch === ";" || ch === "}") && parenDepth === 0) {
        this.#reportError(
          `Expected '{' to open '@media' block, found '${ch}'.`,
          this.#loc(),
        );
        if (ch === ";") this.#advance();
        return null;
      }
      rawPrelude += this.#advance();
    }

    if (parenDepth > 0) {
      this.#reportError(
        "Unclosed '(' in '@media' condition.",
        openParenLoc ?? startLoc,
      );
    }

    if (this.#eof() || this.#peek() !== "{") {
      this.#reportError("Expected '{' to open '@media' block.", startLoc);
      return null;
    }

    const prelude = normalizeMediaPrelude(rawPrelude);
    if (prelude.length === 0) {
      this.#reportError("Empty '@media' condition is not allowed.", startLoc);
    }

    const openBraceLoc = this.#loc();
    this.#advance(); // '{'
    const body = this.#parseBlockBody(false, openBraceLoc);

    return {
      type: "MediaRule",
      prelude,
      body,
      loc: startLoc,
    };
  }

  #parseDeclarations(openBraceLoc) {
    const declarations = [];

    while (!this.#eof()) {
      this.#skipWhitespaceAndComments();
      if (this.#eof()) {
        this.#reportError(
          "Unclosed rule block '{' (missing '}').",
          openBraceLoc,
        );
        return declarations;
      }

      if (this.#peek() === "}") {
        this.#advance();
        return declarations;
      }

      if (this.#peek() === ";") {
        this.#advance();
        continue;
      }

      const declLoc = this.#loc();
      if (this.#peek() === "@") {
        this.#reportError(
          "Nested at-rule inside declaration block is not supported; move '@media' outside the style rule.",
          declLoc,
        );
        this.#skipUnsupportedAtRuleRemainder();
        continue;
      }

      // Scan property name before ':'
      let rawProp = "";
      let foundColon = false;
      let foundNestedBrace = false;

      while (!this.#eof()) {
        const ch = this.#peek();
        if (ch === "/" && this.#peek(1) === "*") {
          this.#skipComment();
          continue;
        }
        if (ch === ":") {
          this.#advance();
          foundColon = true;
          break;
        }
        if (ch === "{") {
          foundNestedBrace = true;
          break;
        }
        if (ch === ";" || ch === "}") {
          break;
        }
        if (ch === "'" || ch === '"') {
          rawProp += this.#readString();
          continue;
        }
        rawProp += this.#advance();
      }

      if (foundNestedBrace) {
        this.#reportError(
          "Nested rule '{' inside declaration block is not supported; flatten selectors to top level.",
          this.#loc(),
        );
        this.#skipBalancedBlock();
        continue;
      }

      const property = rawProp.trim();
      if (!foundColon) {
        this.#reportError(
          `Expected ':' after property '${property || "(empty)"}'.`,
          declLoc,
        );
        if (this.#peek() === ";") this.#advance();
        continue;
      }

      if (property.length === 0) {
        this.#reportError("Missing CSS property name before ':'.", declLoc);
      } else if (!VALID_PROPERTY_PATTERN.test(property)) {
        // Might be nested selector like '&:hover { ... }' — check ahead for '{'
        const valueScan = this.#readDeclarationValue(declLoc);
        if (valueScan.nestedBraceLoc !== null) {
          this.#reportError(
            "Nested rule '{' inside declaration block is not supported; flatten selectors to top level.",
            valueScan.nestedBraceLoc,
          );
          this.#skipBalancedBlock();
        } else {
          this.#reportError(
            `Invalid CSS property name '${property}'.`,
            declLoc,
          );
        }
        continue;
      }

      const valueScan = this.#readDeclarationValue(declLoc);
      if (valueScan.nestedBraceLoc !== null) {
        this.#reportError(
          "Nested rule '{' inside declaration block is not supported; flatten selectors to top level.",
          valueScan.nestedBraceLoc,
        );
        this.#skipBalancedBlock();
        continue;
      }

      if (property.length === 0) {
        continue;
      }

      if (valueScan.value.length === 0) {
        this.#reportError(
          `Missing value for CSS property '${property}'.`,
          declLoc,
        );
        continue;
      }

      declarations.push({
        type: "Declaration",
        property,
        value: valueScan.value,
        important: valueScan.important,
        loc: declLoc,
      });
    }

    this.#reportError("Unclosed rule block '{' (missing '}').", openBraceLoc);
    return declarations;
  }

  #readDeclarationValue(declLoc) {
    let raw = "";
    let parenDepth = 0;
    let bracketDepth = 0;
    let openParenLoc = null;
    let openBracketLoc = null;
    let lastTopLevelBangIndex = -1;
    let pendingSpace = false;

    const flushSpace = () => {
      if (pendingSpace && raw.length > 0) {
        raw += " ";
      }
      pendingSpace = false;
    };

    while (!this.#eof()) {
      const ch = this.#peek();
      if (ch === "/" && this.#peek(1) === "*") {
        this.#skipComment();
        pendingSpace = true;
        continue;
      }
      if (ch === "'" || ch === '"') {
        flushSpace();
        raw += this.#readString();
        continue;
      }
      if (this.#isUrlFunctionStart()) {
        flushSpace();
        raw += this.#readUrlFunction();
        continue;
      }
      if (isWhitespace(ch)) {
        this.#advance();
        pendingSpace = true;
        continue;
      }
      if (ch === "(") {
        flushSpace();
        if (parenDepth === 0) openParenLoc = this.#loc();
        parenDepth += 1;
        raw += this.#advance();
        continue;
      }
      if (ch === ")") {
        pendingSpace = false;
        if (parenDepth === 0) {
          this.#reportError(
            "Unexpected ')' in declaration value.",
            this.#loc(),
          );
        } else {
          parenDepth -= 1;
        }
        raw += this.#advance();
        continue;
      }
      if (ch === "[") {
        flushSpace();
        if (bracketDepth === 0) openBracketLoc = this.#loc();
        bracketDepth += 1;
        raw += this.#advance();
        continue;
      }
      if (ch === "]") {
        pendingSpace = false;
        if (bracketDepth === 0) {
          this.#reportError(
            "Unexpected ']' in declaration value.",
            this.#loc(),
          );
        } else {
          bracketDepth -= 1;
        }
        raw += this.#advance();
        continue;
      }

      if (parenDepth === 0 && bracketDepth === 0) {
        if (ch === ";") {
          this.#advance();
          break;
        }
        if (ch === "}") {
          break;
        }
        if (ch === "{") {
          return {
            value: "",
            important: false,
            nestedBraceLoc: this.#loc(),
          };
        }
        if (ch === "!") {
          flushSpace();
          lastTopLevelBangIndex = raw.length;
          raw += this.#advance();
          continue;
        }
      }

      flushSpace();
      raw += this.#advance();
    }

    if (parenDepth > 0) {
      this.#reportError(
        "Unclosed '(' in declaration value.",
        openParenLoc ?? declLoc,
      );
    }
    if (bracketDepth > 0) {
      this.#reportError(
        "Unclosed '[' in declaration value.",
        openBracketLoc ?? declLoc,
      );
    }

    let value = raw.trim();
    let important = false;

    if (lastTopLevelBangIndex !== -1) {
      const suffix = value.slice(lastTopLevelBangIndex);
      if (IMPORTANT_SUFFIX_PATTERN.test(suffix)) {
        important = true;
        value = value.slice(0, lastTopLevelBangIndex).trim();
      }
    }

    return { value, important, nestedBraceLoc: null };
  }

  #parseRule() {
    const ruleLoc = this.#loc();
    const selectorParts = [];
    let currentPart = "";
    let currentPartLoc = this.#loc();
    let parenDepth = 0;
    let bracketDepth = 0;
    let openParenLoc = null;
    let openBracketLoc = null;

    while (!this.#eof()) {
      const ch = this.#peek();
      if (ch === "/" && this.#peek(1) === "*") {
        this.#skipComment();
        currentPart += " ";
        continue;
      }
      if (ch === "'" || ch === '"') {
        if (currentPart.trim().length === 0) currentPartLoc = this.#loc();
        currentPart += this.#readString();
        continue;
      }
      if (ch === "(") {
        if (currentPart.trim().length === 0) currentPartLoc = this.#loc();
        if (parenDepth === 0) openParenLoc = this.#loc();
        parenDepth += 1;
        currentPart += this.#advance();
        continue;
      }
      if (ch === ")") {
        if (parenDepth === 0) {
          this.#reportError("Unexpected ')' in selector.", this.#loc());
        } else {
          parenDepth -= 1;
        }
        currentPart += this.#advance();
        continue;
      }
      if (ch === "[") {
        if (currentPart.trim().length === 0) currentPartLoc = this.#loc();
        if (bracketDepth === 0) openBracketLoc = this.#loc();
        bracketDepth += 1;
        currentPart += this.#advance();
        continue;
      }
      if (ch === "]") {
        if (bracketDepth === 0) {
          this.#reportError("Unexpected ']' in selector.", this.#loc());
        } else {
          bracketDepth -= 1;
        }
        currentPart += this.#advance();
        continue;
      }

      if (parenDepth === 0 && bracketDepth === 0) {
        if (ch === ",") {
          selectorParts.push({ text: currentPart, loc: currentPartLoc });
          this.#advance();
          currentPart = "";
          currentPartLoc = this.#loc();
          continue;
        }
        if (ch === "{") {
          break;
        }
        if (ch === ";" || ch === "}") {
          this.#reportError(
            `Expected '{' after selector, found unexpected '${ch}'.`,
            this.#loc(),
          );
          if (ch === ";") this.#advance();
          return null;
        }
      }

      if (currentPart.trim().length === 0 && !isWhitespace(ch)) {
        currentPartLoc = this.#loc();
      }
      currentPart += this.#advance();
    }

    if (parenDepth > 0) {
      this.#reportError("Unclosed '(' in selector.", openParenLoc ?? ruleLoc);
    }
    if (bracketDepth > 0) {
      this.#reportError("Unclosed '[' in selector.", openBracketLoc ?? ruleLoc);
    }

    if (this.#eof() || this.#peek() !== "{") {
      this.#reportError("Expected '{' to open style rule block.", ruleLoc);
      return null;
    }

    selectorParts.push({ text: currentPart, loc: currentPartLoc });

    const selectors = [];
    for (const part of selectorParts) {
      const node = parseSelectorNode(part.text, part.loc);
      if (node.raw.length === 0) {
        this.#reportError("Empty selector before '{' or ','.", part.loc);
      } else {
        selectors.push(node);
      }
    }

    const openBraceLoc = this.#loc();
    this.#advance(); // '{'
    const declarations = this.#parseDeclarations(openBraceLoc);

    return {
      type: "Rule",
      selectors,
      declarations,
      loc: ruleLoc,
    };
  }

  #parseBlockBody(isTopLevel, openBraceLoc = null) {
    const body = [];

    while (!this.#eof()) {
      this.#skipWhitespaceAndComments();
      if (this.#eof()) {
        if (!isTopLevel && openBraceLoc !== null) {
          this.#reportError(
            "Unclosed '@media' block '{' (missing '}').",
            openBraceLoc,
          );
        }
        return body;
      }

      const ch = this.#peek();
      if (ch === "}") {
        if (isTopLevel) {
          this.#reportError("Unexpected '}' at top level.", this.#loc());
          this.#advance();
          continue;
        }
        this.#advance();
        return body;
      }

      if (ch === "@") {
        const atRule = this.#parseAtRule();
        if (atRule !== null) {
          body.push(atRule);
        }
        continue;
      }

      const rule = this.#parseRule();
      if (rule !== null) {
        body.push(rule);
      }
    }

    if (!isTopLevel && openBraceLoc !== null) {
      this.#reportError(
        "Unclosed '@media' block '{' (missing '}').",
        openBraceLoc,
      );
    }
    return body;
  }

  parse() {
    const body = this.#parseBlockBody(true);
    return {
      type: "StyleSheet",
      body,
    };
  }
}

export const parseCss = (source, context = {}) => {
  if (typeof source !== "string") {
    throw new TypeError("CSS source must be a string.");
  }
  const parser = new CssParser(source, context);
  const ast = parser.parse();
  if (parser.issues.length > 0) {
    throw new CssParseError(parser.issues, parser.totalIssues);
  }
  return ast;
};
