import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import {
  migrateStylusJson,
  migrateStylusJsonDual,
} from "../core/stylus-migrator.ts";

export const runMigrateStylusCli = (
  argv: string[] = process.argv.slice(2),
): void => {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
Usage: npm run migrate:stylus -- <input-file> [output-file] [options]

Arguments:
  <input-file>   Path to Stylus JSON export file or legacy uBO backup
  [output-file]  Path to output uBOL backup JSON file (optional, stdout if omitted)

Options:
  --dual, --split      Split output into ubol-config-desktop.json and ubol-config-mobile.json
  --target <platform>  Target specific platform: "desktop" or "mobile"
  -c, --config <file>  Existing uBOL JSON config to preserve non-customFilters settings and merge into
  --no-config          Do not auto-detect or load existing ubol-config.json
  -h, --help           Show this help message

Examples:
  npm run migrate:stylus -- stylus-export.json --dual
  npm run migrate:stylus -- stylus-export.json ubol-config.json
  npm run migrate:stylus -- stylus-export.json --target mobile
  npm run migrate:stylus -- stylus-export.json --config ubol-config.json
  cat stylus-export.json | npm run migrate:stylus --
`);
    return;
  }

  let configPath: string | undefined;
  let targetPlatform: "desktop" | "mobile" | undefined;
  const isDual = argv.includes("--dual") || argv.includes("--split");
  const noConfig = argv.includes("--no-config");
  const filteredArgs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-c" || arg === "--config" || arg === "--base") {
      configPath = argv[i + 1];
      i++;
    } else if (arg?.startsWith("--config=")) {
      configPath = arg.slice(9);
    } else if (arg?.startsWith("--base=")) {
      configPath = arg.slice(7);
    } else if (arg === "--target" && argv[i + 1]) {
      const val = argv[i + 1];
      if (val === "desktop" || val === "mobile") {
        targetPlatform = val;
      }
      i++;
    } else if (arg?.startsWith("--target=")) {
      const val = arg.slice(9);
      if (val === "desktop" || val === "mobile") {
        targetPlatform = val;
      }
    } else if (
      arg !== undefined &&
      arg !== "--no-config" &&
      arg !== "--dual" &&
      arg !== "--split"
    ) {
      filteredArgs.push(arg);
    }
  }

  let inputArg = filteredArgs[0];
  let outputArg = filteredArgs[1];

  if (!inputArg && process.stdin.isTTY) {
    const defaultInput = path.resolve(process.cwd(), "stylus.json");
    if (fs.existsSync(defaultInput)) {
      inputArg = "stylus.json";
      if (!isDual) {
        outputArg ??= "ubol-config.json";
      }
    }
  }

  let inputContent = "";

  if (!inputArg) {
    if (!process.stdin.isTTY) {
      inputContent = fs.readFileSync(0, "utf-8");
    } else {
      console.error(
        "Error: Missing input file.\nUsage: npm run migrate:stylus -- <input-file> [output-file] [options]",
      );
      process.exit(1);
    }
  } else {
    const inputPath = path.resolve(process.cwd(), inputArg);
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file "${inputArg}" not found.`);
      process.exit(1);
    }
    inputContent = fs.readFileSync(inputPath, "utf-8");
  }

  let existingConfig: Record<string, unknown> | undefined;

  // Determine base config source
  let resolvedConfigPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : undefined;

  if (!resolvedConfigPath && outputArg && !noConfig && !isDual) {
    const outputPath = path.resolve(process.cwd(), outputArg);
    if (fs.existsSync(outputPath)) {
      resolvedConfigPath = outputPath;
    }
  }

  if (resolvedConfigPath && fs.existsSync(resolvedConfigPath)) {
    try {
      const rawConfig = fs.readFileSync(resolvedConfigPath, "utf-8");
      existingConfig = JSON.parse(rawConfig) as Record<string, unknown>;
    } catch {
      // Ignore unparseable base config and create fresh
    }
  }

  try {
    if (isDual) {
      const result = migrateStylusJsonDual(inputContent, existingConfig);
      let desktopOutName = "ubol-config-desktop.json";
      let mobileOutName = "ubol-config-mobile.json";

      if (outputArg) {
        if (outputArg.endsWith(".json")) {
          desktopOutName = outputArg.replace(/\.json$/, "-desktop.json");
          mobileOutName = outputArg.replace(/\.json$/, "-mobile.json");
        } else {
          desktopOutName = path.join(outputArg, "ubol-config-desktop.json");
          mobileOutName = path.join(outputArg, "ubol-config-mobile.json");
        }
      }

      const desktopPath = path.resolve(process.cwd(), desktopOutName);
      const mobilePath = path.resolve(process.cwd(), mobileOutName);

      fs.writeFileSync(
        desktopPath,
        JSON.stringify(result.desktop, null, 2) + "\n",
        "utf-8",
      );
      fs.writeFileSync(
        mobilePath,
        JSON.stringify(result.mobile, null, 2) + "\n",
        "utf-8",
      );

      console.log(
        `Successfully migrated Stylus backup to ${desktopOutName} and ${mobileOutName}`,
      );
    } else {
      const result = migrateStylusJson(
        inputContent,
        existingConfig,
        targetPlatform ? { target: targetPlatform } : undefined,
      );
      const jsonOutput = JSON.stringify(result, null, 2);

      if (outputArg) {
        const outputPath = path.resolve(process.cwd(), outputArg);
        fs.writeFileSync(outputPath, jsonOutput + "\n", "utf-8");
        console.log(`Successfully migrated Stylus backup to ${outputArg}`);
      } else {
        process.stdout.write(jsonOutput + "\n");
      }
    }
  } catch (err) {
    console.error(
      "Migration failed:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
};

// Execute if run directly from CLI
if (process.argv[1]?.endsWith("migrate-stylus.ts")) {
  runMigrateStylusCli();
}
