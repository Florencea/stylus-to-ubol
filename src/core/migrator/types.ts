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

export interface SelectorEntry {
  selector: string;
  lightMap: Map<string, string>;
  darkMap: Map<string, string>;
  mediaQueryMap: Map<string, Map<string, string>>;
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
