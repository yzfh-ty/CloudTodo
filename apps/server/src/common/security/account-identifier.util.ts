import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function assertUnambiguousUsername(username: string) {
  if (username.includes('@')) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'username must not contain @',
    });
  }
}

export function accountLookupWhere(account: string): Prisma.UserWhereInput {
  return account.includes('@')
    ? { email: account.toLowerCase() }
    : { username: account };
}

export function emailConflictWhere(
  email: string,
  excludedUserId?: string,
): Prisma.UserWhereInput {
  return {
    OR: [{ email }, { username: email }],
    ...(excludedUserId ? { NOT: { id: excludedUserId } } : {}),
  };
}

export function usernameConflictWhere(
  username: string,
  excludedUserId?: string,
): Prisma.UserWhereInput {
  return {
    OR: [{ username }, { email: username }],
    ...(excludedUserId ? { NOT: { id: excludedUserId } } : {}),
  };
}
