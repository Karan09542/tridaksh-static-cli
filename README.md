# Static CLI

Fast ⚡ local static file server with advanced controls, GUI, permissions, gzip support, and SPA routing.

<p>
  <a href="https://www.npmjs.com/package/@tridaksh/static-cli">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D18-green" />
  </a>
  <a href="https://github.com/karan09542/tridaksh-static-cli">
    <img src="https://img.shields.io/badge/source-GitHub-181717?style=flat-square&logo=github" />
  </a>
  <a href="https://static-cli.vercel.app/">
    <img src="https://img.shields.io/badge/docs-website-blue?style=flat-square&logo=readthedocs" />
  </a>
</p>

---

## ✨ Features

* ⚡ fast static server
* 🧭 SPA fallback support
* 🗜️ Gzip compression
* 🖥️ Optionally install, Built-in Web GUI dashboard
* 📁 Include / exclude via glob patterns
* 🔐 File operation permissions
* 🌐 Open browser automatically
* 📊 Server status & process control

---

## 📦 Installation

### Global (recommended)

```bash
npm install -g static-cli
```

### Run without installing

```bash
npx static-cli start
```

---

## 🚀 Quick Start

Start server in current directory:

```bash
static start
```

Start on specific port:

```bash
static start -p 8080
```

---

## 🧭 Commands

| Command   | Description        |
| --------- | ------------------ |
| `start`   | Start local server |
| `stop`    | Stop local server  |
| `restart` | Restart server     |
| `status`  | Show server status |

---

## ⚙️ Flags

| Flag                  | Description                  |
| --------------------- | ---------------------------- |
| `-h, --help`          | Show help                    |
| `-v, --version`       | Show CLI version             |
| `-p, --port <number>` | Use custom port              |
| `--spa`               | Serve HTML instead of 404    |
| `--gzip`              | Enable gzip compression      |
| `--gui`               | Open web GUI dashboard       |
| `--open, --browse`    | Open URL in browser          |
| `--includes <glob>`   | Include files/folders (glob) |
| `--excludes <glob>`   | Exclude files/folders (glob) |
| `--allowed-create`    | Allow file creation          |
| `--allowed-rename`    | Allow file renaming          |
| `--allowed-delete`    | Allow file deletion          |
| `--allowed-update`    | Allow file updates           |

---

## 🖥️ Web GUI

Launch dashboard:

```bash
static start --gui
```

Open:

```
http://localhost:3000/__dashboard
```

---

## 📁 Include / Exclude Patterns

Multiple glob patterns can be provided using `;` as separator.

⚠️ Must be wrapped in quotes.

### Examples

```bash
static start --includes "src/**/*.js;assets/**/*.css"
```

```bash
static start --excludes "node_modules/**;dist/**"
```

---

## 🌐 SPA Mode.

Instead of returning 404, server returns your HTML entry file.

```bash
static start --spa
```

---

## 🗜️ Gzip Compression

Enable fast transfer:

```bash
static start --gzip
```

---

## 🔐 File Permissions

Allow specific file operations in GUI:

```bash
static start --allowed-create --allowed-delete
```

Available permissions:

* create
* rename
* delete
* update

---

## 🌍 Open Browser Automatically

```bash
static start --open
```

---

## 📊 Server Status

```bash
static status
```

---

## 🔁 Restart Server

```bash
static restart
```

---

## 🧪 Advanced Examples

Start SPA server with gzip on port 5000:

```bash
static start -p 5000 --spa --gzip
```

Start server with GUI and open browser:

```bash
static start --gui --open
```

Serve only selected files:

```bash
static start --includes "public/**"
```

Exclude build folders:

```bash
static start --excludes "dist/**;node_modules/**"
```

---

## 🧰 Requirements

* Node.js ≥ 18 recommended

---

## 📄 License

MIT
