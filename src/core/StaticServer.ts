import http from "http";
import fs from "fs";
import pfs from "fs/promises";
import { constants } from "fs/promises";
import path from "path";
import archiver from "archiver";
import mime from "mime-types";
import { type types } from "../lib/config.js";
import ProcessManagement from "./ProcessManagement.js";
import { createGzip } from "zlib";
import { Readable } from "stream";
import { exec, execSync, spawn } from "child_process";
import { Print } from "../lib/utils.js";
import chalk from "chalk";
import { formatFileStats } from "../lib/index.js";
import Busboy from "busboy";
import { minimatch } from "minimatch";
import { createRequire } from "module";
import { match } from "assert";
const require = createRequire(import.meta.url);

let guiDist: string | null = null;

try {
  const entry = require.resolve("@tridaksh/static-gui/package.json");
  const guiRoot = path.dirname(entry);
  guiDist = path.join(guiRoot, "dist");
} catch {
  guiDist = null;
}

function handleFsError(res: any, error: any) {
  if (!error?.code) {
    return res.sendError(500, "Internal Server Error");
  }

  switch (error.code) {
    case "ENOENT":
      return res.sendError(404, "File or directory not found");

    case "EEXIST":
      return res.sendError(409, "File already exists");

    case "EACCES":
    case "EPERM":
      return res.sendError(403, "Permission denied");

    case "ENOTDIR":
      return res.sendError(400, "Not a directory");

    case "EISDIR":
      return res.sendError(400, "Path is a directory");

    default:
      console.error("Unhandled FS error:", error);
      return res.sendError(500, "Filesystem error");
  }
}
function setDownloadHeader(res: any, filename: string) {
  const encoded = encodeURIComponent(filename);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="file"; filename*=UTF-8''${encoded}`,
  );
}

type Query = {
  show?: boolean;
  redirect?: string;
  search?: string;
  info?: boolean;
  command?: string;

  // crud
  rename?: string;
  create?: "file" | "dir";
  update?: boolean;
  delete?: boolean;
};

const gzipSupportedFiles = [
  "js",
  "css",
  "html",
  "txt",
  "xml",
  "json",
  "csv",
  "md",
  "ttf",
  "otf",
  "tar",
];

//#region HttpServer
// class HttpServer {
//   public server: http.Server;
//   public paths: { methods: string; path: string }[];
//   constructor() {
//     this.server = http.createServer();
//     this.paths = [];
//   }

//   public get(
//     path: string,
//     handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
//   ) {
//     this.server.on("request", (req, res) => {
//       if (req.url === path && req.method === "GET") {
//         handler(req, res);
//         return;
//       }
//     });
//   }

//   public listen(port: number, handler?: any) {
//     return this.server.listen(port, handler);
//   }
// }

async function searchDirectory(
  dirPath: string,
  search: string,
  result: string[] = [],
): Promise<string[]> {
  try {
    const entries = await pfs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.includes(search)) {
          result.push(fullPath);
          continue;
        }
        await searchDirectory(fullPath, search, result);
      } else {
        if (entry.name.includes(search)) {
          result.push(fullPath);
        }
      }
    }
    return result;
  } catch (err) {
    return [];
  }
}

class StaticServer extends ProcessManagement {
  public config = {} as types.DefaultConfig;
  public server: http.Server | null = null;
  public shouldGzip = false;
  public localUrl: string;
  public publicUrl: string | null = null;
  constructor(config: types.DefaultConfig) {
    super();
    this.config = config;
    this.localUrl = `http://localhost:${this.config.port}`;
    this.publicUrl = this.getPublicUrl();

    if (this.config.gui && !guiDist) {
      Print()
        .block()
        .block(chalk.red("Static Server GUI not installed."))
        .block(chalk.yellow("Install with:\nnpm install @tridaksh/static-gui"))
        .end();
      process.exit(1);
    }
  }
  private initServer() {
    const server = http.createServer(async (req, res) => {
      res.sendError = (code: number, message: string) => {
        res.statusCode = code;
        if (typeof message === "string") {
          res.setHeader("Content-Type", "text/plain");
          res.setHeader("Content-Length", Buffer.byteLength(message));
          res.end(message);
          return;
        }

        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Length",
          Buffer.byteLength(JSON.stringify(message)),
        );
        res.end(JSON.stringify(message));
      };

      if (req.method === "OPTIONS" || req.method === "HEAD") {
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        headers.set("Accept", "*/*");
        headers.set("Accept-Ranges", "bytes");
        res.writeHead(200, [...headers.entries()]);
        res.end();
        return;
      }

      const acceptEncoding = req.headers["accept-encoding"];
      const range = req.headers.range;

      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host}`);
      const url = decodeURIComponent(parsedUrl.pathname);

      const query: Query = Object.fromEntries(parsedUrl.searchParams.entries());

      const decorateUrl = (p: string): string => path.join(p);
      this.shouldGzip =
        (acceptEncoding?.includes("gzip") || this.config.gzip) &&
        gzipSupportedFiles.includes(path.extname(url!));

      const safePath = path.normalize(url).replace(/^(\.\.[\/\\])+/, "");
      const baseDir = path.resolve(this.config.dir);
      const resolvedPath = path.resolve(baseDir, "." + safePath);

      if (!resolvedPath.startsWith(baseDir)) {
        res.sendError(403, "Forbidden");
        return;
      }

      if (
        safePath.startsWith(decorateUrl("/__dashboard")) &&
        this.config.gui &&
        guiDist &&
        req.method === "GET"
      ) {
        const relativePath = safePath.replace(decorateUrl("/__dashboard"), "");
        const filePath = path.join(guiDist, relativePath);

        try {
          const stat = await pfs.stat(filePath);

          if (stat.isFile()) {
            const data = await pfs.readFile(filePath);
            const mimeType =
              mime.lookup(filePath) || "application/octet-stream";

            if (!this.isModified(req, stat.size, stat.mtimeMs)) {
              res.statusCode = 304;
              res.end();
              return;
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", mimeType);
            res.setHeader("Content-Length", stat.size);
            res.setHeader("Cache-Control", "public, no-cache");
            this.setEtag(res, stat.size, stat.mtimeMs);

            res.end(data);
            return;
          }
        } catch {}

        // SPA fallback
        const indexPath = path.join(guiDist, "index.html");
        const index = await pfs.readFile(indexPath);

        const stat = await pfs.stat(indexPath);
        if (!this.isModified(req, stat.size, stat.mtimeMs)) {
          res.statusCode = 304;
          res.end();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.setHeader("Content-Length", Buffer.byteLength(index));
        res.setHeader("Cache-Control", "public, no-cache");
        this.setEtag(res, stat.size, stat.mtimeMs);

        res.end(index);
        return;
      }

      if (
        !url?.endsWith("/ls") &&
        (await this.isPathExcludes(this.config.excludes, url!))
      ) {
        res.sendError(404, "Not Found");
        return;
      }

      if (
        !url?.endsWith("/ls") &&
        !(await this.isPathIncludes(this.config.includes, url!))
      ) {
        res.sendError(404, "Not Found");
        return;
      }

      if (safePath === decorateUrl("/=") && req.method === "GET") {
        const stat = await pfs.stat(this.config.dir);
        if (!this.isModified(req, stat.size, stat.mtimeMs)) {
          res.statusCode = 304;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Cache-Control", "public, no-cache");
        this.setEtag(res, stat.size, stat.mtimeMs);

        const filename = path.basename(this.config.dir) + ".tar.gz";
        setDownloadHeader(res, filename);

        const archive = archiver("tar", {
          gzip: true,
          gzipOptions: {
            level: 9,
          },
        });

        archive.pipe(res);
        archive.directory(this.config.dir, false).finalize();
        console.log("Archiving in progress...");
        archive.on("error", (err) => {
          res.sendError(500, "Internal Server Error");
          archive.end();
        });

        archive.on("end", () => {
          console.log("Archiving completed");
        });
        res.on("close", () => {
          archive.end();
          console.log("Archiving stopped");
        });
        res.on("error", (err) => {
          res.sendError(500, "Internal Server Error");
          archive.end();
        });
        return;
      }
      if (safePath === decorateUrl("/") && req.method === "GET") {
        try {
          if (query["redirect"] && this.config.spa) {
            throw "not found";
          }
          await pfs.access("./index.html", constants.F_OK | constants.R_OK);
          const data = await pfs.readFile("./index.html");
          const stats = await pfs.stat("./index.html");
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");

          if (this.shouldGzip) {
            res.setHeader("Content-Encoding", "gzip");
            Readable.from(data)
              .pipe(createGzip({ level: 9 }))
              .pipe(res);
          } else {
            res.setHeader("Content-Length", stats.size);
            res.end(data);
          }
          return;
        } catch (error) {
          if (this.config.spa) {
            this.spaErrorResponse(res, 404);
            return;
          }
          res.sendError(404, "Not Found");
          return;
        }
      }

      if (safePath.endsWith(decorateUrl("/ls")) && req.method === "GET") {
        const lsDir = safePath.endsWith(decorateUrl("/ls/"))
          ? path.dirname(resolvedPath.replace("/ls/", ""))
          : path.dirname(resolvedPath.replace("/ls", ""));
        // normalize query.search
        if (query.search) {
          query.search = query.search.replace(/(\\|\/\/|\.\.)/g, "/");
        }

        try {
          let files = !query.search?.trim()
            ? await pfs.readdir(lsDir)
            : await searchDirectory(lsDir, query.search.trim()).then((f) =>
                f.map((p) => p.replace(lsDir + decorateUrl("/"), "")),
              );
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");

          let matchPath = url?.slice(1).replace("ls", "").toLowerCase();

          if (matchPath.endsWith("/")) {
            matchPath = matchPath.slice(0, -1);
          }
          if (matchPath.startsWith("/")) {
            matchPath = matchPath.slice(1);
          }

          let formatedListDir = await this.formatListDir(lsDir, files);

          if (this.config.excludes.length) {
            let isSendEmptyListDir = false;
            formatedListDir = formatedListDir.filter(
              (p) =>
                !this.config.excludes.some((pattern) => {
                  p = p.toLowerCase();
                  const full = matchPath ? matchPath + "/" + p : p;
                  pattern = pattern.toLowerCase();
                  if (
                    minimatch(full, pattern) ||
                    pattern.startsWith(full) ||
                    (full.endsWith("/") &&
                      !/^\*+\W\w+$/.test(pattern) &&
                      full.startsWith(
                        path.dirname(
                          pattern.replace(/\*/g, "").replace(/\/+/g, "/"),
                        ),
                      )) ||
                    (pattern.startsWith("**") && full.endsWith("/"))
                  ) {
                    return true;
                  }

                  if (
                    full.startsWith(pattern.split("/")[0] || "") ||
                    (pattern.startsWith("**") && !full.endsWith("/"))
                  ) {
                    isSendEmptyListDir = true;
                  }
                  return false;
                }),
            );
            if (
              formatedListDir.length === 0 &&
              !query.search &&
              !isSendEmptyListDir
            ) {
              if (this.config.spa) {
                this.spaErrorResponse(res, 404);
                return;
              }
              res.sendError(404, "Not Found");
              return;
            }
          }

          if (this.config.includes.length) {
            let isSendEmptyListDir = false;
            formatedListDir = formatedListDir.filter((p) =>
              this.config.includes.some((pattern) => {
                p = p.toLowerCase();
                const full = matchPath ? matchPath + "/" + p : p;
                pattern = pattern.toLowerCase();
                if (
                  minimatch(full, pattern) ||
                  pattern.startsWith(full) ||
                  (full.endsWith("/") &&
                    !/^\*+\W\w+$/.test(pattern) &&
                    full.startsWith(
                      path.dirname(
                        pattern.replace(/\*/g, "").replace(/\/+/g, "/"),
                      ),
                    )) ||
                  (pattern.startsWith("**") && full.endsWith("/"))
                ) {
                  return true;
                }

                if (
                  full.startsWith(pattern.split("/")[0] || "") ||
                  (pattern.startsWith("**") && !full.endsWith("/"))
                ) {
                  isSendEmptyListDir = true;
                }
                return false;

                // if this block will cause empty formattedListDir, in this case we return response with empty listDir [] ! don't think just return! withour sending 404, but   check file inside folder like if pattern === "dist/core/index.ts"  instead of pattern === "dist/core/index.js"
              }),
            );
            if (
              formatedListDir.length === 0 &&
              !query.search &&
              !isSendEmptyListDir
            ) {
              if (this.config.spa) {
                this.spaErrorResponse(res, 404);
                return;
              }
              res.sendError(404, "Not Found");
              return;
            }
          }

          res.end(formatedListDir.join("\n"));
          return;
        } catch (error) {
          if (this.config.spa) {
            this.spaErrorResponse(res, 404);
            return;
          }
          res.sendError(404, "Not Found");
          return;
        }
      }

      if (safePath && req.method === "GET" && query["info"]) {
        const reqUrl = resolvedPath;
        try {
          await pfs.access(reqUrl, constants.F_OK | constants.R_OK);
          const stat = await pfs.stat(reqUrl);
          const formatedStat = formatFileStats(stat);
          const formatedStatString = JSON.stringify({
            ...formatedStat,
            name: path.basename(reqUrl),
          });
          const byteLength = Buffer.byteLength(formatedStatString, "utf-8");

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Content-Length", byteLength);
          res.end(formatedStatString);
          return;
        } catch (error) {
          if (this.config.spa) {
            this.spaErrorResponse(res, 404);
            return;
          }
          res.sendError(404, "Not Found");
        }
        return;
      }

      // crud
      if (safePath) {
        const reqUrl = resolvedPath;

        if (req.method === "GET" && query["rename"]) {
          if (!this.config.allowedRename) {
            return res.sendError(403, "Forbidden");
          }
          try {
            await pfs.access(
              reqUrl,
              constants.F_OK | constants.R_OK | constants.W_OK,
            );
            const newPath = path.join(path.dirname(reqUrl), query["rename"]);
            await pfs.rename(reqUrl, newPath);
            const body = JSON.stringify({
              success: true,
              message: "File renamed successfully",
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Length", Buffer.byteLength(body));
            res.end(body);
            return;
          } catch (error) {
            handleFsError(res, error);
            return;
          }
        }
        if (req.method === "GET" && query["create"]) {
          if (!this.config.allowedCreate) {
            return res.sendError(403, "Forbidden");
          }
          try {
            if (query["create"] === "file") {
              const handle = await pfs.open(reqUrl, "wx");
              await handle.close();
            } else if (query["create"] === "dir") {
              await pfs.mkdir(reqUrl);
            } else {
              return res.sendError(400, "Invalid create type");
            }

            const body = JSON.stringify({
              success: true,
              message: "Created successfully",
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Length", Buffer.byteLength(body));
            res.end(body);
            return;
          } catch (error) {
            return handleFsError(res, error);
          }
        }
        //#region Update in Progress
        if (req.method === "POST" && query["update"]) {
          if (!this.config.allowedUpdate) {
            return res.sendError(403, "Forbidden");
          }
          try {
            const stat = await pfs.stat(reqUrl);
            if (!stat.isFile()) {
              return res.sendError(400, "Target is not a file");
            }

            const busboy = Busboy({
              headers: req.headers,
              limits: { files: 1 },
            });

            let writeStream;

            busboy.on("file", (name, file) => {
              writeStream = fs.createWriteStream(reqUrl, { flags: "w" });

              file.pipe(writeStream);

              file.on("error", (err) => {
                return handleFsError(res, err);
              });

              writeStream.on("error", (err) => {
                return handleFsError(res, err);
              });
            });

            busboy.on("finish", () => {
              const body = JSON.stringify({
                success: true,
                message: "File updated successfully",
              });

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Content-Length", Buffer.byteLength(body));
              res.end(body);
            });

            busboy.on("error", (err) => {
              return handleFsError(res, err);
            });

            req.pipe(busboy);
            return;
          } catch (error) {
            return handleFsError(res, error);
          }
        }
        if (req.method === "DELETE" && query["delete"]) {
          if (!this.config.allowedDelete) {
            return res.sendError(403, "Forbidden");
          }
          try {
            await pfs.access(
              reqUrl,
              constants.F_OK | constants.R_OK | constants.W_OK,
            );
            const stat = await pfs.stat(reqUrl);

            if (stat.isDirectory()) {
              await pfs.rm(reqUrl, { recursive: true });
            } else {
              await pfs.unlink(reqUrl);
            }

            const body = JSON.stringify({
              success: true,
              message: "File deleted successfully",
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Length", Buffer.byteLength(body));
            res.end(body);
            return;
          } catch (error) {
            return handleFsError(res, error);
          }
        }
      }

      if (safePath && req.method === "GET") {
        const reqUrl = resolvedPath;
        try {
          await pfs.access(reqUrl, constants.F_OK | constants.R_OK);
          const stat = await pfs.stat(reqUrl);
          const mimeType = mime.lookup(reqUrl) || "text/plain";

          if (!gzipSupportedFiles.includes(mimeType) && query.show) {
            if (range) {
              const fileSize = stat.size;
              const parts = range.replace(/bytes=/, "").split("-");

              const start = parseInt(parts[0] ?? "", 10);
              const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

              if (start >= fileSize || end >= fileSize) {
                res.writeHead(416, {
                  "Content-Range": `bytes */${fileSize}`,
                });
                return res.end();
              }

              const chunkSize = end - start + 1;

              res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunkSize,
                "Content-Type": mimeType,
              });

              const stream = fs.createReadStream(reqUrl, { start, end });
              stream.pipe(res);

              stream.on("error", () => {
                res.destroy();
              });
              res.on("close", () => {
                stream.destroy();
              });
              return;
            }
          }

          if (!this.isModified(req, stat.size, stat.mtimeMs)) {
            res.statusCode = 304;
            res.end();
            return;
          }

          if (this.shouldGzip) {
            res.setHeader("Content-Encoding", "gzip");
          }
          res.setHeader("Cache-Control", "private, no-cache");
          this.setEtag(res, stat.size, stat.mtimeMs);

          //#region TODO: We can also range requests for static folders

          if (stat.isDirectory()) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/gzip"); // "application/x-tar");
            res.removeHeader("Content-Encoding");
            const filename = path.basename(reqUrl) + ".tar.gz";
            setDownloadHeader(res, filename);

            res.setHeader("transfer-encoding", "chunked");

            const archive = archiver("tar", {
              gzip: true,
              gzipOptions: {
                level: 9,
              },
            });

            archive.pipe(res);
            archive.directory(reqUrl, false);
            archive.finalize();

            console.log("Archiving in progress...");

            archive.on("error", function (err) {
              archive.end();
              throw err;
            });

            return;
          }
          // Dir-Handling End

          res.statusCode = 200;
          res.setHeader("Content-Type", mimeType);

          //#region TODO: We can also range requests for static files

          const stream = fs.createReadStream(reqUrl);

          if (this.shouldGzip) {
            const filename = path.basename(reqUrl) + ".gz";
            setDownloadHeader(res, filename);

            if (query.show) res.setHeader("Content-Disposition", "inline");
            stream.pipe(createGzip()).pipe(res);
          } else {
            if (!query.show) {
              const filename = path.basename(reqUrl);
              setDownloadHeader(res, filename);
            }
            stream.pipe(res);
          }

          stream.on("error", () => {
            res.destroy();
          });
          res.on("close", () => stream.destroy());
          return;
        } catch (error) {
          if (this.config.spa) {
            this.spaErrorResponse(res, 404);
            return;
          }
          res.sendError(404, "Not Found");
          return;
        }
      }

      res.sendError(404, "Not Found");
      return;
    });
    server.keepAliveTimeout = 120 * 1000;
    return server.listen(this.config.port).on("error", (err) => {
      console.error(err.message);
    });
  }

  private setEtag(res: any, size: number, mtime: number) {
    res.setHeader("ETag", `${size}-${mtime}`);
  }
  private isModified(req: any, size: number, mtime: number) {
    if (req.headers["if-none-match"] !== `${size}-${mtime}`) {
      return true;
    }
    return false;
  }

  private async isPathIncludes(data: string[], filePath: string) {
    if (data.length === 0) return true;

    let file = filePath;
    if (filePath.startsWith("/")) {
      file = filePath!.slice(1);
    }

    if (file.endsWith("/")) {
      file = file.slice(0, -1);
    }

    try {
      const stat = await pfs.stat(file);
      if (stat.isDirectory()) {
        file += "/";
      }
    } catch (error) {}

    return data.some((e) => minimatch(file, e));
  }
  private isPathExcludes(data: string[], filePath: string) {
    if (data.length === 0) return false;
    return this.isPathIncludes(data, filePath);
  }
  private async formatListDir(
    rootPath: string,
    dirList: string[],
  ): Promise<string[]> {
    // Filter due to `DumpStack.log.tmp`
    const result = await Promise.all(
      dirList.map(async (file) => {
        const filePath = path.join(rootPath, file);
        file = file.split(path.sep).join("/");
        try {
          const stat = await pfs.stat(filePath);
          if (stat.isDirectory()) {
            return file + "/";
          }
          return file;
        } catch (error) {
          return null;
        }
      }),
    );
    return result.filter(Boolean) as string[];
  }

  public openBrowser(url: string) {
    let startCommand;

    if (process.platform === "win32") {
      startCommand = `start ${url}`;
    } else if (process.platform === "darwin") {
      startCommand = `open ${url}`;
    } else {
      startCommand = `xdg-open ${url}`;
    }
    exec(startCommand, (err) => {
      if (err) {
        console.log(`Error opening browser: ${err}`);
      }
    });
  }
  public isToolExists(command: string) {
    try {
      execSync(command, { stdio: "ignore" });
      return true;
    } catch (error) {
      return false;
    }
  }

  public async spaErrorResponse(
    res: http.ServerResponse,
    statusCode: number,
    message?: string,
  ) {
    try {
      const notFoundPagePath = path.join(
        global.__dirname,
        "public",
        "not-found.html",
      );
      const data = await pfs.readFile(notFoundPagePath);
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (this.shouldGzip) {
        res.setHeader("Content-Encoding", "gzip");
        Readable.from(data)
          .pipe(createGzip({ level: 9 }))
          .pipe(res);
      } else {
        res.setHeader("Content-Length", Buffer.byteLength(data));
        res.end(data);
      }
    } catch (error) {
      console.log(error);
      res.sendError(404, "Not Found");
    }
  }

  private startLogs() {
    process.stdout.write("\x1Bc"); // ANSI escape sequence to clear the console
    const print = Print()
      .block(chalk.black.bgWhite(" STATIC SERVER Started "))
      .inline("...")
      .block()
      .padBlockStart(3)
      .inline(`PID: ${this.getPid()}`)
      .padBlockStart(3)
      .inline(`Dir: ${this.config.dir}`);

    if (this.config.includes.length > 0) {
      print
        .padBlockStart(3)
        .inline("Includes: ")
        .inline(this.config.includes.join(", "));
    }

    if (this.config.excludes.length > 0) {
      print
        .padBlockStart(3)
        .inline("Excludes: ")
        .inline(this.config.excludes.join(", "));
    }

    print
      .block()
      .padBlockStart(3)
      .inline("Open: " + chalk.underline(this.localUrl))
      .block()
      .end();

    if (this.publicUrl) this.publicUrlLogs();
  }
  private publicUrlLogs() {
    Print()
      .padStart(3)
      .inline("Public URL: " + chalk.underline(this.publicUrl))
      .block()
      .end();
  }
  private cloudflaredNotInstallLogs() {
    Print()
      .block(chalk.red.red("cloudflared is not installed"))
      .block(chalk.red("To install, run command or see following links:"))
      .end();

    Print()
      .block()
      .block(chalk.blue("cloudflared installation ways:"))
      .block()
      .end();

    Print()
      .padStart(3)
      .inline(chalk.blue.bold("windows:"))
      .padBlockStart(5)
      .inline(chalk.gray("command: "))
      .inline("winget install --id Cloudflare.cloudflared")
      .end();

    Print()
      .padStart(3)
      .inline(chalk.blue.bold("macOS:"))
      .padBlockStart(5)
      .inline(chalk.gray("command: "))
      .inline("brew install cloudflared")
      .end();

    Print()
      .padStart(3)
      .inline(chalk.blue.bold("linux and other ways of installation visit:"))
      .padBlockStart(5)
      .inline(chalk.gray("link: "))
      .inline(
        chalk.underline(
          "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/#linux",
        ),
      )
      .block()
      .end();
  }

  public start() {
    if (this.isPidFileExists && this.isProcessRunning) {
      Print().block(chalk.yellow("Static Server already running...")).end();
      return;
    }
    this.localUrl = `http://localhost:${this.config.port}`;
    this.server = this.initServer().on("listening", () => {
      this.saveCurrentPid();
      this.startLogs();

      if (this.config.public) {
        if (!this.isToolExists("cloudflared -v")) {
          this.cloudflaredNotInstallLogs();
          return;
        }

        console.log(`Generating Public URL...`);

        const cloudflared = spawn("cloudflared", [
          "tunnel",
          "--url",
          this.localUrl,
        ]);
        cloudflared.stderr.on("data", (chunk) => {
          const output = chunk.toString();
          // Example: Extract the quick tunnel URL
          if (output.includes(".trycloudflare.com")) {
            const generatedUrl = output.match(
              /https:\/\/[^\s]+\.trycloudflare\.com/,
            );
            if (generatedUrl) {
              this.publicUrl = generatedUrl[0];
              this.publicUrlLogs();
              this.savePublicUrl(this.publicUrl!);

              if (this.config.open) {
                if (this.config.gui) {
                  this.openBrowser(this.publicUrl + "/__dashboard");
                } else {
                  setTimeout(() => this.openBrowser(this.publicUrl!), 7000);
                }
              }
            } else {
              Print()
                .block(chalk.red("Issuing in Generating public url"))
                .block("Please restart the server to get public url")
                .end();
            }
          }
        });

        cloudflared.stdout.on("data", (chunk) => {
          console.log(chunk.toString());
        });
      }
      if ((this.config.open || this.config.public) && !this.config.public) {
        if (this.config.gui) {
          this.openBrowser(this.localUrl + "/__dashboard");
        } else {
          this.openBrowser(this.localUrl);
        }
      }
    });
  }
  public stop(showMessage = true) {
    if (!this.isPidFileExists) {
      !this.isProcessRunning && this.isPidFileExists && this.removePidFile();
      showMessage &&
        Print()
          .block(chalk.blue.bold("Static Server is already Stopped..."))
          .end();
      return;
    }
    if (!this.isProcessRunning) {
      this.isPidFileExists && this.removePidFile();
      showMessage &&
        Print()
          .block(chalk.blue.bold("Static Server is already Stopped..."))
          .end();
      return;
    }
    this.killPreviousProcess();
    showMessage && console.log(`🛑 Static Server Stopped...`);
  }
  public status() {
    if (!this.isPidFileExists || !this.isProcessRunning) {
      !this.isProcessRunning && this.isPidFileExists && this.removePidFile();
      console.log(`⭕ Static Server is not running...`);
      return;
    }
    this.startLogs();
    process.exit(0);
  }
  public restart() {
    this.stop(false);
    console.log("Restarting...");
    this.start();
  }

  public async graceFulShutdown() {
    this.removePidFile();
    await this.server?.close(() => {
      console.log("🛑 Static Server Stopped...");
    });
    process.exit(0);
  }
}

export default StaticServer;
