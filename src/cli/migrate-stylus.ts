import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { migrateStylusJson } from "../core/stylus-migrator.ts";

export const runMigrateStylusCli = (
  argv: string[] = process.argv.slice(2),
): void => {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
Usage: npm run migrate:stylus -- <input-file> [output-file]

Arguments:
  <input-file>   Path to Stylus JSON export file
  [output-file]  Path to output uBOL backup JSON file (optional, stdout if omitted)

Examples:
  npm run migrate:stylus -- stylus-export.json ubol-backup.json
  npm run migrate:stylus -- stylus-export.json > ubol-backup.json
  cat stylus-export.json | npm run migrate:stylus --
`);
    return;
  }

  let inputContent = "";
  const inputArg = argv[0];
  const outputArg = argv[1];

  if (!inputArg) {
    if (!process.stdin.isTTY) {
      inputContent = fs.readFileSync(0, "utf-8");
    } else {
      console.error(
        "Error: Missing input file.\nUsage: npm run migrate:stylus -- <input-file> [output-file]",
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

  try {
    const result = migrateStylusJson(inputContent);
    const jsonOutput = JSON.stringify(result, null, 2);

    if (outputArg) {
      const outputPath = path.resolve(process.cwd(), outputArg);
      fs.writeFileSync(outputPath, jsonOutput + "\n", "utf-8");
      console.log(`Successfully migrated Stylus backup to ${outputArg}`);
    } else {
      process.stdout.write(jsonOutput + "\n");
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
