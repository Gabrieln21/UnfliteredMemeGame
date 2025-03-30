/**
 * Authentication Middleware
 * This module provides middleware functions for handling user authentication
 * and session management in the application.
 */

import { Request, Response, NextFunction } from 'express';
import { Session } from 'express-session';

/**
 * Custom request interface that extends Express Request
 * Adds typing for session data and flash messages
 *
 * @interface AuthenticatedRequest
 * @extends {Request}
 */
export interface AuthenticatedRequest extends Request {
    session: Session & {
        /** User ID stored in session */
        userId?: number;
        /** User object stored in session */
        user?: {
            /** Unique identifier for the user */
            id: number;
            /** Username of the authenticated user */
            username: string;
            /** Email address of the authenticated user */
            email: string;
        };
    };
    flash: {
        (message?: string): { [key: string]: string[] };
        (event: string, message: string | string[]): any;
    };
}

/**
 * Session Middleware
 * Makes the authenticated user's data available to all views/templates
 */
export const sessionMiddleware = (
    request: Request,
    response: Response,
    next: NextFunction
): void => {
    const req = request as AuthenticatedRequest;
    response.locals.user = req.session?.user || null;
    next();
};

/**
 * Protected Route Middleware
 * Ensures that routes can only be accessed by authenticated users
 */
export const requireAuth = (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction
): void => {
    if (!request.session?.userId) {
        request.flash('error', 'You must be logged in to access this page');
        return response.redirect('/auth/login');
    }
    next();
};

/**
 * Guest-Only Route Middleware
 * Ensures that certain routes (like login/register) can only be accessed
 * by non-authenticated users
 */
export const requireGuest = (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction
): void => {
    if (request.session?.userId) {
        return response.redirect('/');
    }
    next();
};
