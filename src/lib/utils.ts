
import type { Stats } from "fs";

export function Print() {
  const logs: (string | number)[] = [];
  return {
    block: function (msg: string | number = "") {
      logs.push(msg);
      return this;
    },
    inline: function (msg: string | number = "") {
      if (!logs.length) logs.push("");
      logs[logs.length - 1] += `${msg}`;
      return this;
    },
    end: function (msg?: string | number, cb?: Function, before = true) {
      if (msg) {
        logs.push(msg);
      }
      const messages = logs.join("\n");
      if (typeof cb === "function" && before) cb();
      console.log(messages);
      if (typeof cb === "function" && !before) cb();
    },

    insertChar: function (char: string, n = 1, start = true) {
      if (!logs.length) logs.push("");

      if (start) {
        logs[logs.length - 1] = char.repeat(n) + logs[logs.length - 1];
      } else {
        logs[logs.length - 1] += char.repeat(n);
      }

      return this;
    },
    tab: function (n = 1) {
      return this.insertChar("\t", n);
    },
    tabEnd: function (n = 1) {
      return this.insertChar("\t", n, false);
    },
    tabBlock: function (n = 1) {
      this.block("");
      return this.tab(n);
    },
    newline: function (n = 1) {
      return this.insertChar("\n", n);
    },
    newlineEnd: function (n = 1) {
      return this.insertChar("\n", n, false);
    },
    padStart: function (n = 1) {
      return this.insertChar(" ", n);
    },
    padEnd: function (n = 1) {
      return this.insertChar(" ", n, false);
    },
    padBlockStart: function (n = 1) {
      this.block("");
      return this.padStart(n);
    },
    padBlockEnd: function (n = 1) {
      this.block("");
      return this.padEnd(n);
    },
  };
}
type FormattedFileStats = {
  type: "File" | "Directory" | "Symlink" | "Other";
  size: string;
  sizeInBytes: number;
  createdAt: string;
  modifiedAt: string;
  lastAccessed: string;
};

export function formatFileStats(stats: Stats): FormattedFileStats {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getType = () => {
    if (stats.isDirectory()) return "Directory";
    if (stats.isFile()) return "File";
    if (stats.isSymbolicLink()) return "Symlink";
    return "Other";
  };

  return {
    type: getType(),
    size: formatFileSize(stats.size),
    sizeInBytes: stats.size,
    createdAt: formatDate(stats.birthtimeMs),
    modifiedAt: formatDate(stats.mtimeMs),
    lastAccessed: formatDate(stats.atimeMs),
  };
}
