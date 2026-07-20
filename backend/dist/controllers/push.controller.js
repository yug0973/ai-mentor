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
exports.getPublicKey = getPublicKey;
exports.subscribe = subscribe;
exports.unsubscribe = unsubscribe;
const env_1 = require("../config/env");
const pushService = __importStar(require("../services/push.service"));
async function getPublicKey(_req, res) {
    res.status(200).json({ publicKey: env_1.env.VAPID_PUBLIC_KEY ?? null });
}
async function subscribe(req, res, next) {
    try {
        const subscription = await pushService.saveSubscription(req.user.userId, req.body);
        res.status(201).json({ subscription });
    }
    catch (err) {
        next(err);
    }
}
async function unsubscribe(req, res, next) {
    try {
        await pushService.removeSubscription(req.body.endpoint);
        res.status(200).json({ message: "Unsubscribed" });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=push.controller.js.map