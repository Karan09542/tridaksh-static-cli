#!/usr/bin/env node
import StaticServer from "./core/StaticServer.js";
import type { types } from "./lib/config.js";
import parseArgs from "./lib/parseArgs.js";
import pkg from "../package.json" with { type: "json" };
import { Print } from "./lib/utils.js";
import chalk from "chalk";
import { fileURLToPath } from "node:url";
import path from "path";
import { printHelp } from "./lib/index.js";

global.__filename = fileURLToPath(import.meta.url);
global.__dirname = path.dirname(__filename);

const argv = process.argv.slice(3) as types.FlagsKeyType[];
const config = parseArgs(argv);

const staticServer = new StaticServer(config);

switch (process.argv[2]) {
  case "start":
    staticServer.start();
    break;
  case "stop":
    staticServer.stop();
    break;
  case "status":
    staticServer.status();
    break;
  case "restart":
    staticServer.restart();
    break;

  case "--version":
  case "-v":
    console.log(pkg.version);
    process.exit(0);

  case "-h":
  case "--help":
    printHelp()
    process.exit(0);

  default:
    Print()
      .block(chalk.red.bold("[ERROR]: Invalid command!"))
      .block(chalk.yellow.underline.bold("Expected:"))
      .inline(chalk.bold(" static [start|stop|status|restart]"))
      .end();
    process.exit(1);
}

process.on("SIGINT", async () => await staticServer.graceFulShutdown());
process.on("SIGHUP", async () => await staticServer.graceFulShutdown());
