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
exports.start = start;
exports.respond = respond;
exports.get = get;
exports.list = list;
const interviewService = __importStar(require("../services/interview.service"));
async function start(req, res, next) {
    try {
        const { mode } = req.body || {};
        const result = await interviewService.createInterviewSession(req.user.userId, mode);
        res.status(201).json(result);
    }
    catch (err) {
        next(err);
    }
}
async function respond(req, res, next) {
    try {
        const { sessionId } = req.params;
        const { message } = req.body;
        const result = await interviewService.continueInterviewSession(req.user.userId, sessionId, message);
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
async function get(req, res, next) {
    try {
        const session = await interviewService.getInterviewSession(req.user.userId, req.params.sessionId);
        res.status(200).json({ session });
    }
    catch (err) {
        next(err);
    }
}
async function list(req, res, next) {
    try {
        const sessions = await interviewService.listInterviewSessions(req.user.userId);
        res.status(200).json({ sessions });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=interview.controller.js.map