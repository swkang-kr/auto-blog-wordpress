export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class GoogleTrendsError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'TRENDS_ERROR', cause);
  }
}

export class ContentGenerationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONTENT_ERROR', cause);
  }
}

export class ImageGenerationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'IMAGE_ERROR', cause);
  }
}

export class WordPressError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'WP_ERROR', cause);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIG_ERROR', cause);
  }
}
