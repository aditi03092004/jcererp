import { Request, Response, NextFunction } from 'express';
import { HttpException } from '../utils/error.util';
import logger from '../utils/logger.util';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const correlationId = (req as any).correlationId || 'N/A';
  const status = err.status || 500;

  // Identify if it's a known operational exception
  const isOperational = err instanceof HttpException;

  // Detect raw Sequelize / DB errors that expose SQL internals — these must be sanitized
  const isSequelizeError = err.name?.startsWith('Sequelize') || !!err.sql;

  let message = err.message || 'Internal Server Error';
  let errorResponse: any = { success: false, error: message, message };

  if (isSequelizeError) {
    // Structured backend logging for DB / Sequelize errors
    logger.error('PostgreSQL Database Error:', {
      correlationId,
      endpoint: req.originalUrl || req.path,
      method: req.method,
      requestParams: req.params,
      sectionId: req.params?.sectionId || null,
      authenticatedUserId: (req as any).user?.id || null,
      departmentId: (req as any).departmentId || null,
      semester: req.params?.semester || req.query?.semester || req.body?.semester || null,
      academicYear: req.params?.academicYear || req.query?.academicYear || req.body?.academicYear || null,
      sequelizeOperation: err.name,
      pgErrorCode: err.parent?.code || err.original?.code || null,
      pgErrorMessage: err.parent?.message || err.original?.message || err.message,
      sql: err.sql,
      parameters: err.parameters,
      stack: err.stack,
    });

    if (err.name === 'SequelizeUniqueConstraintError') {
      const duplicateField = err.errors?.[0]?.path || 'record';
      const duplicateMsg = err.errors?.[0]?.message || `A ${duplicateField} with these details already exists.`;
      res.status(409).json({
        success: false,
        errorCode: 'DUPLICATE_RESOURCE',
        error: duplicateMsg,
        message: duplicateMsg,
        referenceId: correlationId,
      });
      return;
    }

    if (err.name === 'SequelizeValidationError') {
      const validationMsg = err.errors?.[0]?.message || 'Validation failed for one or more fields.';
      res.status(400).json({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        error: validationMsg,
        message: validationMsg,
        referenceId: correlationId,
      });
      return;
    }

    errorResponse = {
      success: false,
      errorCode: 'DATABASE_ERROR',
      error: 'Database operation failed. Please try again.',
      message: 'Database operation failed. Please try again.',
      referenceId: correlationId,
    };
    res.status(500).json(errorResponse);
    return;
  } else if (!isOperational) {
    // Plain Error thrown from controller business logic
    logger.error('Unhandled Application Error:', {
      correlationId,
      endpoint: req.originalUrl || req.path,
      method: req.method,
      message: err.message,
      stack: err.stack,
    });
    errorResponse = {
      success: false,
      errorCode: 'INTERNAL_ERROR',
      error: message,
      message,
    };
  } else {
    // Log operational HttpException
    logger.warn(`Operational HTTP Exception [${status}]: ${message}`, {
      correlationId,
      errorCode: err.errorCode,
      path: req.path,
      method: req.method,
    });
    errorResponse = {
      success: false,
      errorCode: err.errorCode || undefined,
      error: message,
      message,
      fields: (err as any).fields || undefined,
    };
  }

  // Include stack trace in development for debugging
  if (process.env.NODE_ENV !== 'production' && !isSequelizeError) {
    errorResponse.stack = err.stack;
    errorResponse.details = (err as any).details || (err as any).errors || undefined;
  }

  res.status(status).json(errorResponse);
};

