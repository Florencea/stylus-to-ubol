const COLOR_PROPERTIES: ReadonlySet<string> = new Set([
  "box-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "outline",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-inline",
  "border-inline-start",
  "border-inline-end",
  "border-block",
  "border-block-start",
  "border-block-end",
  "column-rule",
  "text-decoration",
]);

const CSS_NAMED_COLORS: ReadonlySet<string> = new Set([
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
  "transparent",
  "currentcolor",
]);

const VAR_COLOR_KEYWORDS: readonly string[] = [
  "color",
  "bg",
  "border",
  "fill",
  "stroke",
];

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const COLOR_FUNCTION_REGEX =
  /^(?:rgba?|hsla?|color|oklch|oklab|hwb|lab|lch|light-dark)\s*\(/i;

const isColorValue = (val: string): boolean => {
  const cleanVal = val
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*!important\s*$/i, "")
    .trim()
    .toLowerCase();
  if (!cleanVal) return false;
  if (HEX_COLOR_REGEX.test(cleanVal)) {
    return true;
  }
  if (COLOR_FUNCTION_REGEX.test(cleanVal)) {
    return true;
  }
  return CSS_NAMED_COLORS.has(cleanVal);
};

export const isColorProperty = (prop: string, value?: string): boolean => {
  const normalized = prop.trim().toLowerCase();
  if (normalized.startsWith("--")) {
    if (VAR_COLOR_KEYWORDS.some((kw) => normalized.includes(kw))) {
      return true;
    }
    if (value !== undefined) {
      return isColorValue(value);
    }
    return false;
  }
  const clean = normalized.replace(/^-(?:webkit|moz|ms|o)-/, "");
  if (clean.includes("color") || clean.includes("background")) {
    return true;
  }
  return COLOR_PROPERTIES.has(clean);
};
