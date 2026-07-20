"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const zod_1 = require("zod");
/**
 * Validates req.body / req.query / req.params against a Zod schema.
 * Usage: router.post("/auth/register", validate(registerSchema), controller)
 */
function validate(schema) {
    return (req, res, next) => {
        try {
            schema.parse({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                return res.status(400).json({
                    error: "Validation failed",
                    details: err.flatten().fieldErrors,
                });
            }
            next(err);
        }
    };
}
//# sourceMappingURL=validate.middleware.js.map