'use strict';

const { body } = require('express-validator');

/**
 * Returns an express-validator chain that enforces the password policy on
 * the given field name.
 *
 * Policy:
 *   - Minimum 12 characters
 *   - At least 1 uppercase letter  [A-Z]
 *   - At least 1 lowercase letter  [a-z]
 *   - At least 1 digit             [0-9]
 *   - At least 1 special character [!@#$%^&*…]
 *
 * Each rule produces its own field error so the client can highlight exactly
 * which requirement is unmet.
 *
 * Usage:
 *   validate([ passwordStrength('password') ])
 *   validate([ body('currentPassword').notEmpty(), passwordStrength('newPassword') ])
 */
function passwordStrength(fieldName) {
  return body(fieldName)
    .isLength({ min: 12 })
    .withMessage('Password must be at least 12 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/)
    .withMessage('Password must contain at least one special character (!@#$%^&* etc.)');
}

module.exports = { passwordStrength };
