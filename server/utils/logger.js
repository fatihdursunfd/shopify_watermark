/**
 * Simple Logger Utility
 * Wraps console.log/error to provide consistent formatting.
 * Removed file-system logging for stateless/containerized deployments.
 */

/**
 * Log a message to console
 */
export function log(...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${args.join(' ')}`);
}

/**
 * Log an error to console
 */
export function err(...args) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ERROR: ${args.join(' ')}`);
}

/**
 * Log a section header (for visual separation in logs)
 */
export function logSection(title) {
    const separator = '='.repeat(60);
    console.log(`\n${separator}\n${title}\n${separator}`);
}

// Retro-compatibility stubs (if needed by old code, though we should remove usages)
export function startLogSession() { return null; }
export function endLogSession() { return null; }
export function getCurrentLogFile() { return null; }