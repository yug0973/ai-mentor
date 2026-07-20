"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
const bcrypt_1 = __importDefault(require("bcrypt"));
const SALT_ROUNDS = 12;
/**
 * Hashes a plaintext password. Passwords are NEVER stored directly —
 * only the bcrypt hash is persisted.
 */
async function hashPassword(plainPassword) {
    return bcrypt_1.default.hash(plainPassword, SALT_ROUNDS);
}
/**
 * Compares a plaintext password against a stored bcrypt hash.
 */
async function comparePassword(plainPassword, hashedPassword) {
    return bcrypt_1.default.compare(plainPassword, hashedPassword);
}
//# sourceMappingURL=password.js.map