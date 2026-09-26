const isEscaped = (str: string, index: number): boolean => {
  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && str[i] === "\\"; i--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
};

export const formatStyleDeclarations = (
  declarations:
    | [string, string][]
    | Map<string, string>
    | ReadonlyMap<string, string>
    | Iterable<[string, string]>,
): string => {
  const entries: [string, string][] = Array.isArray(declarations)
    ? declarations
    : declarations instanceof Map
      ? Array.from(declarations.entries())
      : Array.from(declarations);

  const formattedDecls: string[] = [];

  for (const [rawProp, rawVal] of entries) {
    const prop = rawProp.trim();
    if (prop.length === 0) {
      continue;
    }

    let cleanVal = rawVal.trim();
    while (
      cleanVal.endsWith(";") &&
      !isEscaped(cleanVal, cleanVal.length - 1)
    ) {
      cleanVal = cleanVal.slice(0, -1).trimEnd();
    }

    if (cleanVal.length === 0) {
      continue;
    }

    formattedDecls.push(`${prop}: ${cleanVal}`);
  }

  return formattedDecls.join("; ");
};
