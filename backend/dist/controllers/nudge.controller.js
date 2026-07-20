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
exports.check = check;
exports.list = list;
const AppError_1 = require("../utils/AppError");
const nudgeService = __importStar(require("../services/nudge.service"));
function assertSelf(req) {
    if (req.user.userId !== req.params.userId) {
        throw new AppError_1.AppError("You can only trigger nudge checks for your own account", 403);
    }
}
async function check(req, res, next) {
    try {
        assertSelf(req);
        const result = await nudgeService.checkAndNudgeUser(req.params.userId);
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
async function list(req, res, next) {
    try {
        assertSelf(req);
        const logs = await nudgeService.listNudgeLogs(req.params.userId);
        res.status(200).json({ logs });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=nudge.controller.js.map