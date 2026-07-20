"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.me = me;
exports.logout = logout;
const authService = __importStar(require("../services/auth.service"));
async function register(req, res, next) {
    try {
        const result = await authService.registerUser(req.body);
        res.status(201).json(result);
    }
    catch (err) {
        next(err);
    }
}
async function login(req, res, next) {
    try {
        const result = await authService.loginUser(req.body);
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
async function me(req, res, next) {
    try {
        // req.user is guaranteed by the requireAuth middleware run before this.
        const user = await authService.getCurrentUser(req.user.userId);
        res.status(200).json({ user });
    }
    catch (err) {
        next(err);
    }
}
async function logout(_req, res) {
    // JWTs are stateless — logout is handled client-side by discarding the
    // token. This endpoint exists for API symmetry and future token-blocklist
    // support if that's ever needed.
    res.status(200).json({ message: "Logged out successfully" });
}
//# sourceMappingURL=auth.controller.js.map