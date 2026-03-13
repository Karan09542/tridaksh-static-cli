import fs from "fs";
import path from "path";
import {
  defaultConfig,
  DIR_FILE,
  flags,
  FlagsWihtoutValue,
  type types,
} from "./config.js";
import { Print } from "./utils.js";
import chalk from "chalk";
const setDirPathToFile = (config: types.DefaultConfig) => {
  if (!fs.existsSync(DIR_FILE)) {
    fs.writeFileSync(DIR_FILE, config.dir, "utf-8");
    return;
  }
  const fullPath = fs.readFileSync(DIR_FILE, "utf-8");
  config.dir = fullPath;
};

function hasGlobMagic(str: string) {
  return /[*?[\]{}()!]/.test(str);
}

function safeIsDirectory(p: string) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function parseArgs(argv: types.FlagsKeyType[]) {
  const config = { ...defaultConfig };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg in FlagsWihtoutValue) {
      (config as types.Config)[flags[arg]] = true;
      continue;
    }
    // flag handling
    if (arg in flags) {
      const key = flags[arg];
      const value = argv[i + 1];

      if (!value || value.startsWith("-")) {
        Print()
          .block(chalk.red.bold("[ERROR]: "))
          .inline(`Missing value for '${arg}'`)
          .end();
        process.exit(1);
      }

      //#region lib: minimatch/isglob

      // ./dist -> dist , /dist -> dist
      if (key === "includes" || key === "excludes") {
        (config as types.Config)[key] = value
          .replace(/['"]/g, "")
          .split(";")
          .map((raw) => {
            let item = raw.trim();
            if (
              !item.endsWith("**") &&
              item.search(/(\*.*)$/) === -1
            ) {
              if (!item.endsWith("/")) item = item + "/";
              item = item + "**";
            }
            if (item.startsWith("/")) {
              item = item.slice(1);
            }
            if (key === "includes" && !hasGlobMagic(item)  && !fs.existsSync(item)) {
              Print()
                .block(chalk.red.bold("[ERROR]: "))
                .inline(
                  `Invalid argument for --includes: The file '${item}' was not found.`,
                )
                .block(
                  "Please ensure the path is correct or use the --help option for assistance.",
                )
                .end();
              process.exit(1);
            }
            return path.normalize(item).split(path.sep).join("/");
          });
      } else {
        (config as types.Config)[key] = key === "port" ? Number(value) : value;
      }
      i += 1;
      continue;
    }

    // non-flag argument → directory
    if (!arg.startsWith("-")) {
      if (argv[i - 1]) {
        if (["--includes", "--excludes"].includes(argv[i - 1]!)) continue;
      }
      config.dir = arg;
    }

    if (!(arg in flags) && arg.startsWith("-")) {
      const validFlag = Object.keys(flags).find((key) => key.includes(arg));
      Print()
        .block(chalk.red.bold("[ERROR]: "))
        .inline(`Invalid argument: ${arg}`)
        .end(validFlag ? `, Did you mean ${validFlag}?` : "");
      process.exit(1);
    }
  }

  // resolve + validate directory
  const fullPath = path.resolve(process.cwd(), config.dir);

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    Print()
      .block(chalk.red.bold("[ERROR]: "))
      .inline(`Invalid directory: ${config.dir}`)
      .end();
    process.exit(1);
  }

  config.dir = fullPath;

  setDirPathToFile(config);

  return config;
}

export default parseArgs;
