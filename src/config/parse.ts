import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import type { z } from 'zod';

interface ParseConfigOptions<T> {
  text: string;
  schema: z.ZodType<T>;
  name: string;
}

export function parseConfig<T>(options: ParseConfigOptions<T>): T {
  const errors: ParseError[] = [];
  const value: unknown = parse(options.text, errors, { allowTrailingComma: true });

  if (errors.length) {
    throw new Error(
      `${options.name}: ${errors.map((error) => `${printParseErrorCode(error.error)} at byte ${error.offset}`).join(', ')}`,
    );
  }

  const result = options.schema.safeParse(value);

  if (!result.success) {
    throw new Error(
      `${options.name}: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }

  return result.data;
}
