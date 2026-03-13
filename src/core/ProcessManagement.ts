import fs from "fs";
import { DIR_FILE, PID_FILE, PUBLIC_URL_FILE } from "../lib/config.js";

class ProcessManagement {
  public getPid(): number {
    return Number(fs.readFileSync(PID_FILE, "utf-8"));
  }
  public removePidFile() {
    fs.unlinkSync(PID_FILE);
    fs.existsSync(DIR_FILE) && fs.unlinkSync(DIR_FILE);
    fs.existsSync(PUBLIC_URL_FILE) && fs.unlinkSync(PUBLIC_URL_FILE);
  }
  public killPreviousProcess() {
    const oldPid = this.getPid();
    try {
      process.kill(oldPid);
    } catch (error) {}
    this.removePidFile();
  }
  public saveCurrentPid(): void {
    fs.writeFileSync(PID_FILE, String(process.pid), "utf-8");
  }
  public savePublicUrl(url: string): void {
    fs.writeFileSync(PUBLIC_URL_FILE, url, "utf-8");
  }
  public getPublicUrl(): string | null {
    if (fs.existsSync(PUBLIC_URL_FILE)) {
      return fs.readFileSync(PUBLIC_URL_FILE, "utf-8");
    }
    return null;
  }
  public get isPidFileExists() {
    return fs.existsSync(PID_FILE);
  }
  public get isProcessRunning() {
    try {
      const oldPid = this.getPid();
      process.kill(oldPid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default ProcessManagement;
