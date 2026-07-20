"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const env_1 = require("./env");
exports.prisma = global.__prisma ??
    new client_1.PrismaClient({
        log: env_1.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
    });
if (env_1.env.NODE_ENV !== "production") {
    global.__prisma = exports.prisma;
}
//# sourceMappingURL=prisma.js.map