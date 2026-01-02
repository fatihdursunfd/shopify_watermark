/**
 * Wrapper for async route handlers to catch errors automatically.
 * Eliminates the need for try-catch blocks in every route.
 * 
 * @param {Function} fn - Async route handler function
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global Error Handling Middleware
 * Centralizes error response logic.
 */
export const errorHandler = (err, req, res, next) => {
    console.error('❌ [SERVER ERROR]', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        ok: false,
        error: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};