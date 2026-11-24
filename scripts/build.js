import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown } from "rolldown";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DIST_DIR = path.join(ROOT_DIR, "dist");

const CSS_LINK_TAG = '<link rel="stylesheet" href="/src/style.css" />';
const JS_SCRIPT_TAG = '<script type="module" src="/src/main.js"></script>';
const FAVICON_HREF = 'href="/favicon.svg"';

export const buildApp = async () => {
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  const bundle = await rolldown({
    input: path.join(ROOT_DIR, "src", "main.js"),
    platform: "browser",
  });

  try {
    await bundle.write({
      file: path.join(DIST_DIR, "main.js"),
      format: "es",
      minify: true,
    });
  } finally {
    await bundle.close();
  }

  const [htmlTemplate, cssContent] = await Promise.all([
    readFile(path.join(ROOT_DIR, "index.html"), "utf8"),
    readFile(path.join(ROOT_DIR, "src", "style.css"), "utf8"),
  ]);

  if (!htmlTemplate.includes(CSS_LINK_TAG)) {
    throw new Error(
      `Missing expected stylesheet tag in index.html: ${CSS_LINK_TAG}`,
    );
  }
  if (!htmlTemplate.includes(JS_SCRIPT_TAG)) {
    throw new Error(
      `Missing expected script tag in index.html: ${JS_SCRIPT_TAG}`,
    );
  }

  const inlinedHtml = htmlTemplate
    .replace(CSS_LINK_TAG, () => `<style>\n${cssContent.trim()}\n    </style>`)
    .replace(JS_SCRIPT_TAG, '<script type="module" src="./main.js"></script>')
    .replace(FAVICON_HREF, 'href="./favicon.svg"');

  await Promise.all([
    writeFile(path.join(DIST_DIR, "index.html"), inlinedHtml, "utf8"),
    copyFile(
      path.join(ROOT_DIR, "public", "favicon.svg"),
      path.join(DIST_DIR, "favicon.svg"),
    ),
  ]);
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  await buildApp();
}
