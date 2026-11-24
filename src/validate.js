export class ValidationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ValidationError";
  }
}

const VALID_BASE_SOURCES = new Set(["default", "cached", "uploaded"]);

const isPlainObject = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isStringArray = (value) => {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
};

const isStylusSection = (value) => {
  if (!isPlainObject(value)) return false;
  if (typeof value.code !== "string") return false;
  if (value.domains !== undefined && !isStringArray(value.domains)) {
    return false;
  }
  return true;
};

const isStylusStyleItem = (value) => {
  if (!isPlainObject(value)) return false;
  if (!Array.isArray(value.sections)) return false;
  return value.sections.every(isStylusSection);
};

const isStylusSettingsItem = (value) => {
  return isPlainObject(value) && isPlainObject(value.settings);
};

export const parseRawText = (input) => {
  if (typeof input !== "string") {
    throw new ValidationError("Expected a string input.");
  }
  return input;
};

export const parseDownloadFilename = (input) => {
  if (typeof input !== "string" || input.length === 0) {
    throw new ValidationError("Expected a non-empty filename string.");
  }
  return input;
};

export const parseDownloadContent = (input) => {
  if (typeof input !== "string") {
    throw new ValidationError("Expected a string download payload.");
  }
  return input;
};

export const parseBaseSource = (input) => {
  if (typeof input !== "string" || !VALID_BASE_SOURCES.has(input)) {
    throw new ValidationError(
      'Expected base source to be "default", "cached", or "uploaded".',
    );
  }
  return input;
};

export const safeParseBaseConfigObject = (input) => {
  if (!isPlainObject(input)) {
    return {
      success: false,
      error: new ValidationError("Expected a JSON object configuration."),
    };
  }
  return { success: true, data: input };
};

export const parseBaseConfigObject = (input) => {
  const result = safeParseBaseConfigObject(input);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
};

export const safeParseStoredBaseConfig = (input) => {
  if (
    !isPlainObject(input) ||
    typeof input.rawText !== "string" ||
    typeof input.fileName !== "string" ||
    typeof input.savedAt !== "number" ||
    !Number.isFinite(input.savedAt)
  ) {
    return {
      success: false,
      error: new ValidationError(
        "Expected stored base config with rawText, fileName, and finite savedAt.",
      ),
    };
  }
  return {
    success: true,
    data: {
      rawText: input.rawText,
      fileName: input.fileName,
      savedAt: input.savedAt,
    },
  };
};

export const parseStoredBaseConfig = (input) => {
  const result = safeParseStoredBaseConfig(input);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
};

export const parseStylusExport = (input) => {
  if (Array.isArray(input)) {
    if (input.length > 0 && isStylusSettingsItem(input[0])) {
      const rest = input.slice(1);
      if (rest.every(isStylusStyleItem)) {
        return rest;
      }
    }
    if (input.every(isStylusStyleItem)) {
      return input;
    }
    throw new ValidationError(
      "Expected Stylus export array containing valid style sections.",
    );
  }

  if (isPlainObject(input)) {
    if (Array.isArray(input.styles) && input.styles.every(isStylusStyleItem)) {
      return input.styles;
    }
    if (isStylusStyleItem(input)) {
      return [input];
    }
  }

  throw new ValidationError(
    "Expected Stylus export JSON containing style sections.",
  );
};

export const parseStylusRules = (input) => {
  if (!Array.isArray(input)) {
    throw new ValidationError("Expected an array of Stylus rules.");
  }

  for (let i = 0; i < input.length; i += 1) {
    const rule = input[i];
    if (
      !isPlainObject(rule) ||
      typeof rule.domain !== "string" ||
      typeof rule.code !== "string"
    ) {
      throw new ValidationError(
        `Invalid Stylus rule at index ${i}: expected string domain and code.`,
      );
    }
    if (rule.styleName !== undefined && typeof rule.styleName !== "string") {
      throw new ValidationError(
        `Invalid Stylus rule at index ${i}: styleName must be a string.`,
      );
    }
    if (
      rule.sectionIndex !== undefined &&
      (typeof rule.sectionIndex !== "number" ||
        !Number.isInteger(rule.sectionIndex) ||
        rule.sectionIndex < 1)
    ) {
      throw new ValidationError(
        `Invalid Stylus rule at index ${i}: sectionIndex must be a positive integer.`,
      );
    }
  }

  return input;
};

export const parseUbolConfig = (input) => {
  if (!isPlainObject(input)) {
    throw new ValidationError("Expected a uBOL configuration object.");
  }
  if (!Array.isArray(input.customFilters)) {
    throw new ValidationError("Expected customFilters to be an array.");
  }
  for (let i = 0; i < input.customFilters.length; i += 1) {
    const entry = input.customFilters[i];
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      !isStringArray(entry[1])
    ) {
      throw new ValidationError(
        `Invalid customFilters entry at index ${i}: expected [domain, selectors[]].`,
      );
    }
  }
  if (!isStringArray(input.sandboxFilters)) {
    throw new ValidationError(
      "Expected sandboxFilters to be an array of strings.",
    );
  }
  return input;
};

export const parseCssDeclarationNode = (input) => {
  if (
    !isPlainObject(input) ||
    input.type !== "Declaration" ||
    typeof input.property !== "string" ||
    typeof input.value !== "string" ||
    typeof input.important !== "boolean"
  ) {
    throw new ValidationError(
      "Expected a valid CSS Declaration AST node with property, value, and important.",
    );
  }
  return input;
};

export const parseCssSelectorNode = (input) => {
  if (
    !isPlainObject(input) ||
    input.type !== "Selector" ||
    typeof input.raw !== "string" ||
    typeof input.baseSelector !== "string" ||
    typeof input.pseudoElement !== "string"
  ) {
    throw new ValidationError(
      "Expected a valid CSS Selector AST node with raw, baseSelector, and pseudoElement.",
    );
  }
  return input;
};
