import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedAdmin } from '../admin-session.service';

type RequestWithAdmin = {
  admin?: AuthenticatedAdmin;
};

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithAdmin>();
    return request.admin;
  },
);
