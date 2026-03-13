import os from "os";
import path from "path";

export const PID_FILE = path.join(os.tmpdir(), "static-server.pid");
export const DIR_FILE = path.join(os.tmpdir(), "static-server-dir");
export const PUBLIC_URL_FILE = path.join(
  os.tmpdir(),
  "static-server-public-url",
);

const defaultConfig = {
  port: 3000,
  dir: process.cwd(),
  detached: false,
  includes: [] as string[],
  excludes: [] as string[],
  spa: false,
  gzip: false,
  open: false,
  browser: false,
  public: false,
  gui: false,
  allowedCreate: false,
  allowedRename: false,
  allowedDelete: false,
  allowedUpdate: false,
};

const FlagsWihtoutValue = {
  "--detached": "detached",
  "--spa": "spa",
  "--gzip": "gzip",
  "--open": "open",
  "--browser": "browser",
  "--public": "public",
  "--gui": "gui",
  // files permissions
  "--allowed-create": "allowedCreate",
  "--allowed-rename": "allowedRename",
  "--allowed-delete": "allowedDelete",
  "--allowed-update": "allowedUpdate",
} as const;

const flags = {
  "-p": "port",
  "--port": "port",

  "-d": "dir",
  "--dir": "dir",

  "--includes": "includes",
  "--excludes": "excludes",

  ...FlagsWihtoutValue,
} as const;

export { defaultConfig, flags, FlagsWihtoutValue };

export namespace types {
  export type FlagsKeyType = keyof typeof flags;
  export type DefaultConfig = typeof defaultConfig;
  export type Config = Record<string, string | number | boolean | string[]>;
}
