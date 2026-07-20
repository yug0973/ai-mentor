"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUser = registerUser;
exports.loginUser = loginUser;
exports.getCurrentUser = getCurrentUser;
const prisma_1 = require("../config/prisma");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const AppError_1 = require("../utils/AppError");
function toPublicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
    };
}
async function registerUser(input) {
    const existing = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
        throw new AppError_1.AppError("An account with this email already exists", 409);
    }
    const passwordHash = await (0, password_1.hashPassword)(input.password);
    const user = await prisma_1.prisma.user.create({
        data: {
            name: input.name,
            email: input.email,
            passwordHash,
        },
    });
    const token = (0, jwt_1.signToken)({ userId: user.id, email: user.email });
    return { user: toPublicUser(user), token };
}
async function loginUser(input) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
        throw new AppError_1.AppError("Invalid email or password", 401);
    }
    const isValid = await (0, password_1.comparePassword)(input.password, user.passwordHash);
    if (!isValid) {
        throw new AppError_1.AppError("Invalid email or password", 401);
    }
    const token = (0, jwt_1.signToken)({ userId: user.id, email: user.email });
    return { user: toPublicUser(user), token };
}
async function getCurrentUser(userId) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw new AppError_1.AppError("User not found", 404);
    }
    return toPublicUser(user);
}
//# sourceMappingURL=auth.service.js.map