import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Request,
  Post,
  UseGuards,
  Patch,
  Delete,
  SerializeOptions,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthForgotPasswordDto } from './dto/auth-forgot-password.dto';
import { AuthConfirmEmailDto } from './dto/auth-confirm-email.dto';
import { AuthResetPasswordDto } from './dto/auth-reset-password.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthGuard } from '@nestjs/passport';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { NullableType } from '../utils/types/nullable.type';
import { User } from '../users/domain/user';
import { AuthRegisterClientDto } from './dto/auth-register-client.dto';
import { UserTypeEnum } from '../user-type/user-types.enum';
import { AuthResendConfirmationDto } from './dto/auth-resend-confirmation.dto';
import { AuthRegisterAkzenteDto } from './dto/auth-register-akzente.dto';

@ApiTags('Auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('email/login')
  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  public login(@Body() loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    return this.authService.validateLogin(loginDto);
  }

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('akzente/login')
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Login endpoint for Akzente users only',
  })
  @HttpCode(HttpStatus.OK)
  public loginAkzente(@Body() loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    return this.authService.validateAkzenteLogin(loginDto);
  }

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('client/login')
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Login endpoint for Client users only',
  })
  @HttpCode(HttpStatus.OK)
  public loginClient(@Body() loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    return this.authService.validateClientLogin(loginDto);
  }

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('merchandiser/login')
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Login endpoint for Merchandiser users only',
  })
  @HttpCode(HttpStatus.OK)
  public loginMerchandiser(@Body() loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    return this.authService.validateMerchandiserLogin(loginDto);
  }

  @Post('email/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@Body() createUserDto: AuthRegisterLoginDto): Promise<void> {
    return this.authService.register(createUserDto);
  }

  @Post('email/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(@Body() confirmEmailDto: AuthConfirmEmailDto): Promise<void> {
    return this.authService.confirmEmail(confirmEmailDto.hash);
  }

  @Post('email/confirm/new')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmNewEmail(@Body() confirmEmailDto: AuthConfirmEmailDto): Promise<void> {
    return this.authService.confirmNewEmail(confirmEmailDto.hash);
  }

  @Post('forgot/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() forgotPasswordDto: AuthForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() resetPasswordDto: AuthResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(
      resetPasswordDto.hash,
      resetPasswordDto.password,
    );
  }

  @ApiBearerAuth()
  @SerializeOptions({
    groups: ['me'],
  })
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  public me(@Request() request): Promise<NullableType<User>> {
    return this.authService.me(request.user);
  }

  @ApiBearerAuth()
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  public refresh(@Request() request): Promise<Omit<LoginResponseDto, 'user'>> {
    return this.authService.refreshToken({
      sessionId: request.user.sessionId,
      hash: request.user.hash,
    });
  }

  @ApiBearerAuth()
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(@Request() request): Promise<void> {
    await this.authService.logout({
      sessionId: request.user.sessionId,
    });
  }

  @Post('register-client')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Register a new client user',
    description: 'Creates a new client user. Only Akzente users can access this endpoint.',
  })
  @ApiBody({
    type: AuthRegisterClientDto,
    description: 'Client user registration data',
  })
  async registerClient(
    @Body() createUserDto: AuthRegisterClientDto,
    @Request() request,
  ): Promise<void> {
    // Verify the requesting user is an Akzente user
    const user = request.user;
    return this.authService.registerClient(createUserDto, user.id);
  }

  @Post('register-akzente')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Register a new Akzente user with favorite client companies',
    description: 'Creates a new Akzente user and assigns favorite client companies. Only admin users can access this endpoint.',
  })
  @ApiBody({
    type: AuthRegisterAkzenteDto,
    description: 'Akzente user registration data including favorite client companies',
  })
  async registerAkzente(
    @Body() createUserDto: AuthRegisterAkzenteDto,
    @Request() request,
  ): Promise<void> {
    
    // Verify the requesting user is an admin
    const user = request.user;
    
    return this.authService.registerAkzente(createUserDto, user.id);
  }

  @ApiBearerAuth()
  @SerializeOptions({
    groups: ['me'],
  })
  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  public update(
    @Request() request,
    @Body() userDto: AuthUpdateDto,
  ): Promise<NullableType<User>> {
    return this.authService.update(request.user, userDto);
  }

  @ApiBearerAuth()
  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Request() request): Promise<void> {
    return this.authService.softDelete(request.user);
  }

  @Post('email/resend-confirmation')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendConfirmationEmail(@Body() resendDto: AuthResendConfirmationDto): Promise<void> {
    return this.authService.resendConfirmationEmail(resendDto.email);
  }
}
