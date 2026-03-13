import chalk from "chalk";
import { Print } from "./utils.js";

export function printHelp() {
  const p = Print();

  p.block(chalk.bold.cyan("Static CLI — Local Static Server"));

  // ===== USAGE =====
  p.newline();
  p.block(chalk.bold.yellow("USAGE:"));
  p.block("")
    .padStart(2)
    .inline(chalk.green("static"))
    .inline(" <command> [options]");

  // ===== COMMANDS =====
  p.newline();
  p.block(chalk.bold.yellow("COMMANDS:"));

  const cmd = (name: string, desc: string) =>
    p
      .block("")
      .padStart(2)
      .inline(chalk.green(name.padEnd(10)))
      .inline(desc);

  cmd("start", "Start local server");
  cmd("stop", "Stop local server");
  cmd("restart", "Restart local server");
  cmd("status", "Show server status");

  // ===== FLAGS =====
  p.newline();
  p.block(chalk.bold.yellow("OPTIONS / FLAGS:"));

  const flag = (name: string, desc: string) =>
    p
      .block("")
      .padStart(2)
      .inline(chalk.cyan(name.padEnd(24)))
      .inline(desc);

  flag("-h, --help", "Show help information");
  flag("-v, --version", "Print static-cli version");
  flag("-p, --port <number>", "Start server on specific port");

  flag("--spa", "Serve HTML file instead of 404");
  flag("--gzip", "Enable gzip compression");
  flag("--gui", "Open web GUI");

  p.block("")
    .padStart(6)
    .inline(chalk.underline.blue("http://localhost:3000/__dashboard"));

// flag
  flag(
    "--includes <glob>",
    'Include files/folders (glob). Multiple patterns separated by ";"',
  );

  p.block("")
    .padStart(6)
    .inline(chalk.dim('Example: "src/**/*.js;assets/**/*.css"'));

  flag(
    "--excludes <glob>",
    'Exclude files/folders (glob). Multiple patterns separated by ";"',
  );

  p.block("")
    .padStart(6)
    .inline(chalk.dim('Example: "node_modules/**;dist/**"'));

  flag("--open, --browse", "Open URL in browser");

  // ===== FILE PERMISSIONS =====
  p.newline();
  p.block(chalk.bold.yellow("FILE PERMISSIONS:"));

  flag("--allowed-create", "Allow creating files");
  flag("--allowed-rename", "Allow renaming files");
  flag("--allowed-delete", "Allow deleting files");
  flag("--allowed-update", "Allow updating files");

  // ===== EXAMPLES =====
  p.newline();
  p.block(chalk.bold.yellow("EXAMPLES:"));

  const ex = (cmd: string) => p.block("").padStart(2).inline(chalk.dim(cmd));

  ex("static start");
  ex("static start -p 8080 --gzip");
  ex("static start --spa --open");
  ex("static status");

  p.end();
}
