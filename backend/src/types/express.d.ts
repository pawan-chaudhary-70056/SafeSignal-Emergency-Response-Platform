import type { RoleCode } from "../modules/roles/role.constants.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: RoleCode;
        sessionId: string;
      };
    }
  }
}

export {};
