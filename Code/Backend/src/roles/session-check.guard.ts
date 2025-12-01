import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionService } from '../session/session.service';

@Injectable()
export class SessionCheckGuard implements CanActivate {
  constructor(
    private sessionService: SessionService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sessionId) {
      return false;
    }

    const session = await this.sessionService.findById(user.sessionId);
    if (!session) {
      throw new UnauthorizedException('Session has been terminated');
    }

    return true;
  }
}