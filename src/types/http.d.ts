import "http";

declare module "http" {
  interface ServerResponse {
    // send: (data: any) => void;
    sendError: (code: number, message: string) => void;
  }
}

export {};
