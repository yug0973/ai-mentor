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
exports.create = create;
exports.list = list;
exports.get = get;
exports.updateProgress = updateProgress;
exports.adapt = adapt;
exports.updateTopicStatus = updateTopicStatus;
exports.generateMilestoneQuiz = generateMilestoneQuiz;
const roadmapService = __importStar(require("../services/roadmap.service"));
async function create(req, res, next) {
    try {
        const roadmap = await roadmapService.createRoadmap(req.user.userId);
        res.status(201).json({ roadmap });
    }
    catch (err) {
        next(err);
    }
}
async function list(req, res, next) {
    try {
        const roadmaps = await roadmapService.listRoadmaps(req.user.userId);
        res.status(200).json({ roadmaps });
    }
    catch (err) {
        next(err);
    }
}
async function get(req, res, next) {
    try {
        const roadmap = await roadmapService.getRoadmap(req.user.userId, req.params.roadmapId);
        res.status(200).json({ roadmap });
    }
    catch (err) {
        next(err);
    }
}
async function updateProgress(req, res, next) {
    try {
        const roadmap = await roadmapService.updateProgress(req.user.userId, req.params.roadmapId, req.body.progressPercent);
        res.status(200).json({ roadmap });
    }
    catch (err) {
        next(err);
    }
}
async function adapt(req, res, next) {
    try {
        const result = await roadmapService.adaptRoadmap(req.user.userId, req.params.roadmapId, {
            milestoneId: req.body.milestoneId,
            quizId: req.body.quizId,
            scorePercent: req.body.scorePercent,
            topicBreakdown: req.body.topicBreakdown,
        });
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
async function updateTopicStatus(req, res, next) {
    try {
        const roadmap = await roadmapService.updateTopicStatus(req.user.userId, req.params.roadmapId, req.params.topicId, req.body.status);
        res.status(200).json({ roadmap });
    }
    catch (err) {
        next(err);
    }
}
async function generateMilestoneQuiz(req, res, next) {
    try {
        const result = await roadmapService.generateMilestoneQuiz(req.user.userId, req.params.roadmapId, req.params.milestoneId);
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=roadmap.controller.js.map