import type { UbolConfig } from "../schema.ts";

export type RuleScope = "global" | "desktop" | "mobile";

export interface StylusSectionResult {
  cosmeticRules: string[];
  styleRules: string[];
  scopedCosmeticRules?: Record<RuleScope, string[]>;
  scopedStyleRules?: Record<RuleScope, string[]>;
}

export interface DualUbolConfig {
  desktop: UbolConfig;
  mobile: UbolConfig;
}

export interface AllUbolConfigs {
  desktop: UbolConfig;
  mobile: UbolConfig;
  complete: UbolConfig;
}

export interface PropertyDeclaration {
  value: string;
  important: boolean;
}

export interface SelectorEntry {
  selector: string;
  baseMap: Map<string, PropertyDeclaration>;
  lightMap: Map<string, PropertyDeclaration>;
  darkMap: Map<string, PropertyDeclaration>;
  mediaQueryMap: Map<string, Map<string, PropertyDeclaration>>;
}

export interface CompiledRules {
  cosmeticRules: string[];
  styleRules: string[];
}

export interface StylusSection {
  code?: string;
  domains?: string[];
  urlPrefixes?: string[];
  urls?: string[];
}

export interface StylusStyle {
  id?: number | string;
  name?: string;
  enabled?: boolean;
  sections?: StylusSection[];
}

export type ScopeMap = Map<RuleScope, Map<string, SelectorEntry>>;
