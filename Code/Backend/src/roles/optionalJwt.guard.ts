import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard
  extends AuthGuard('jwt')
  implements CanActivate
{
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check for Authorization header with token
    const token = request.headers['authorization']?.split(' ')[1];

    if (!token) {
      // If no token, allow request to continue (but without setting a user)
      return true;
    }

    // If there is a token, call the default AuthGuard to validate it
    const canActivate = (await super.canActivate(context)) as boolean;
    return canActivate;
  }

  handleRequest(err, user) {
    // If token is invalid or expired, user will be null
    if (err || !user) {
      return; // No user will be attached to the request, which means the request proceeds without a user
    }

    // If token is valid, the user will be attached to the request
    return user;
  }
}
