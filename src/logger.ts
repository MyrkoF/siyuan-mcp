/**
 * Completely silent logger
 * No log output for end users
 */

interface LogLevel {
  DEBUG: number;
  INFO: number;
  WARN: number;
  ERROR: number;
}

const LOG_LEVELS: LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  private currentLevel: number = LOG_LEVELS.ERROR + 1; // Set above max level to disable all logging

  setLevel(level: number): void {
    // Ignore setting, stay silent
  }

  debug(message: any, ...args: any[]): void {
    // Silent - no output
  }

  info(message: any, ...args: any[]): void {
    // Silent - no output
  }

  warn(message: any, ...args: any[]): void {
    // Silent - no output
  }

  error(message: any, ...args: any[]): void {
    // Silent - no output
  }

  silentInfo(message: any, ...args: any[]): void {
    // Silent - no output
  }

  private formatMessage(message: any, ...args: any[]): string {
    // Keep method to avoid compile errors, unused
    return '';
  }
}

const logger = new Logger();
export default logger;
