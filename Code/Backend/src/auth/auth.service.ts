import {
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import ms from 'ms';
import crypto from 'crypto';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthProvidersEnum } from './auth-providers.enum';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { NullableType } from '../utils/types/nullable.type';
import { LoginResponseDto } from './dto/login-response.dto';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshPayloadType } from './strategies/types/jwt-refresh-payload.type';
import { JwtPayloadType } from './strategies/types/jwt-payload.type';
import { UsersService } from '../users/users.service';
import { AllConfigType } from '../config/config.type';
import { MailService } from '../mail/mail.service';
import { RoleEnum } from '../roles/roles.enum';
import { Session } from '../session/domain/session';
import { SessionService } from '../session/session.service';
import { StatusEnum } from '../statuses/statuses.enum';
import { UserTypeEnum } from '../user-type/user-types.enum';
import { User } from '../users/domain/user';
import { MerchandiserService } from '../merchandiser/merchandiser.service';
import { JobTypesService } from '../job-types/job-types.service';
import { CountriesService } from '../countries/countries.service';
import { CitiesService } from '../cities/cities.service';
import { AuthRegisterClientDto } from './dto/auth-register-client.dto';
import { ClientService } from '../client/client.service';
import { ClientCompanyService } from '../client-company/client-company.service';
import { ClientCompanyAssignedClientService } from '../client-company-assigned-client/client-company-assigned-client.service';
import { AuthRegisterAkzenteDto } from './dto/auth-register-akzente.dto';
import { AkzenteService } from '../akzente/akzente.service';
import { ClientCompanyAssignedAkzenteService } from '../client-company-assigned-akzente/client-company-assigned-akzente.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private sessionService: SessionService,
    private mailService: MailService,
    private configService: ConfigService<AllConfigType>,
    private citiesService: CitiesService,
    private merchandiserService: MerchandiserService,
    private jobTypesService: JobTypesService,
    private countriesService: CountriesService,
    private clientService: ClientService,
    private clientCompanyService: ClientCompanyService,
    private clientCompanyAssignedClientService: ClientCompanyAssignedClientService,
    private akzenteService: AkzenteService,
    @Inject(forwardRef(() => ClientCompanyAssignedAkzenteService))
    private readonly clientCompanyAssignedAkzenteService: ClientCompanyAssignedAkzenteService,
  ) {}

  async validateLogin(loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'notFound',
        },
      });
    }

    if (user.provider !== AuthProvidersEnum.email) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: `needLoginViaProvider:${user.provider}`,
        },
      });
    }

    if (user.status?.id?.toString() === StatusEnum.inactive.toString()) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          status: 'unconfirmedProfile',
        },
      });
    }

    if (!user.password) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'incorrectPassword',
        },
      });
    }

    const isValidPassword = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isValidPassword) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'incorrectPassword',
        },
      });
    }

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const session = await this.sessionService.create({
      user,
      hash,
    });

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: user.id,
      role: user.role,
      sessionId: session.id,
      hash,
    });

    return {
      refreshToken,
      token,
      tokenExpires,
      user,
    };
  }

  async validateSocialLogin(
    authProvider: string,
    socialData: SocialInterface,
  ): Promise<LoginResponseDto> {
    let user: NullableType<User> = null;
    const socialEmail = socialData.email?.toLowerCase();
    let userByEmail: NullableType<User> = null;

    if (socialEmail) {
      userByEmail = await this.usersService.findByEmail(socialEmail);
    }

    if (socialData.id) {
      user = await this.usersService.findBySocialIdAndProvider({
        socialId: socialData.id,
        provider: authProvider,
      });
    }

    if (user) {
      if (socialEmail && !userByEmail) {
        user.email = socialEmail;
      }
      await this.usersService.update(user.id, user);
    } else if (userByEmail) {
      user = userByEmail;
    } else if (socialData.id) {
      const role = {
        id: RoleEnum.user,
      };
      const status = {
        id: StatusEnum.active,
      };

      user = await this.usersService.create({
        email: socialEmail ?? null,
        firstName: socialData.firstName ?? null,
        lastName: socialData.lastName ?? null,
        socialId: socialData.id,
        provider: authProvider,
        role,
        status,
      });

      user = await this.usersService.findById(user.id);
    }

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'userNotFound',
        },
      });
    }

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const session = await this.sessionService.create({
      user,
      hash,
    });

    const {
      token: jwtToken,
      refreshToken,
      tokenExpires,
    } = await this.getTokensData({
      id: user.id,
      role: user.role,
      sessionId: session.id,
      hash,
    });

    return {
      refreshToken,
      token: jwtToken,
      tokenExpires,
      user,
    };
  }

  async register(dto: AuthRegisterLoginDto): Promise<void> {
    // Validate job types exist
    if (!dto.jobTypeIds || dto.jobTypeIds.length === 0) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          jobTypeIds: 'At least one job type is required',
        },
      });
    }

    const jobTypes = await this.jobTypesService.findByIds(dto.jobTypeIds);
    if (jobTypes.length !== dto.jobTypeIds.length) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          jobTypeIds: 'Some job types not found',
        },
      });
    }

    // Validate country exists (required)
    if (!dto.countryId) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          countryId: 'Country is required',
        },
      });
    }

    const country = await this.countriesService.findById(dto.countryId);
    if (!country) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          countryId: 'Country not found',
        },
      });
    }

    // Validate city exists (required - database constraint)
    if (!dto.cityId) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          cityId: 'City is required',
        },
      });
    }

    const city = await this.citiesService.findById(dto.cityId);
    if (!city) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          cityId: 'City not found',
        },
      });
    }

    // Create user
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone || '',
      role: {
        id: RoleEnum.user,
      },
      status: {
        id: StatusEnum.inactive,
      },
      type: {
        id: UserTypeEnum.merchandiser,
      },
    });

    // Create merchandiser profile with job types
    await this.merchandiserService.create({
      user: { id: Number(user.id) },
      street: '',
      zipCode: dto.zipCode || '',
      city: { id: dto.cityId },
      jobTypeIds: dto.jobTypeIds,
    });

    const hash = await this.jwtService.signAsync(
      {
        confirmEmailUserId: user.id,
      },
      {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
        expiresIn: this.configService.getOrThrow('auth.confirmEmailExpires', {
          infer: true,
        }),
      },
    );

    await this.mailService.userSignUp({
      to: dto.email,
      data: {
        hash,
      },
    });
  }

  async registerClient(dto: AuthRegisterClientDto, akzenteUserId: User['id']): Promise<void> {
    // Verify the requesting user is an Akzente user
    const akzenteUser = await this.usersService.findById(akzenteUserId);
    if (!akzenteUser || akzenteUser.type?.id !== UserTypeEnum.akzente) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'unauthorizedUserType',
        },
      });
    }

    // Check if email already exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'emailAlreadyExists',
        },
      });
    }

    // Validate client companies exist
    const clientCompanyIds = dto.clientCompanies.map(cc => cc.id);
    const clientCompanies = await this.clientCompanyService.findByIds(clientCompanyIds);
    if (clientCompanies.length !== clientCompanyIds.length) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          clientCompanies: 'Some client companies not found',
        },
      });
    }

    // Generate random password if not provided (auto-generate for contact persons)
    // Password will be sent via email to the user
    // Generate a random password of exactly 10 characters
    const generatedPassword = dto.password || this.generateRandomPassword(10);
    
    // Log the generated password for debugging (remove in production)
    console.log('🔑 Generated password for client registration:', generatedPassword);
    console.log('📧 Email:', dto.email);

    // Create user with generated or provided password
    const user = await this.usersService.create({
      email: dto.email,
      password: generatedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone || '', // Handle optional phone
      gender: dto.gender,
      role: {
        id: RoleEnum.user,
      },
      status: {
        id: StatusEnum.active, // Set to active so user can login immediately
      },
      type: {
        id: UserTypeEnum.client,
      },
    });
    
    // Verify the password was stored correctly by checking the user
    const createdUser = await this.usersService.findById(user.id);
    if (createdUser?.password) {
      const passwordMatches = await bcrypt.compare(generatedPassword, createdUser.password);
      console.log('✅ Password verification after creation:', passwordMatches ? 'MATCH' : 'MISMATCH');
      if (!passwordMatches) {
        console.error('❌ CRITICAL: Generated password does not match stored hash!');
        console.error('Generated:', generatedPassword);
        console.error('Stored hash:', createdUser.password);
      }
    }

    // Create client profile
    const client = await this.clientService.create({
      user: { id: Number(user.id) },
    });

    // Create client assignments to companies
    for (const clientCompany of clientCompanies) {
      await this.clientCompanyAssignedClientService.create({
        client: { id: client.id },
        clientCompany: { id: clientCompany.id },
      });
    }

    // Send welcome email with password (always send, even if password was provided)
    try {
      await this.mailService.akzenteWelcome({
        to: dto.email,
        data: {
          firstName: dto.firstName,
          password: generatedPassword,
        },
      });
    } catch (emailError) {
      console.error('❌ Error sending welcome email:', emailError);
      // Don't fail the registration if email fails, but log it
    }
  }

  async registerAkzente(dto: AuthRegisterAkzenteDto, adminUserId: User['id']): Promise<void> {

    // Verify the requesting user is an admin or has permission
    const adminUser = await this.usersService.findById(adminUserId);
    if (!adminUser || adminUser.role?.id !== RoleEnum.admin) {
      console.error('❌ Unauthorized: User is not an admin');
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'unauthorizedUserRole',
        },
      });
    }

    // Validate that favorite client companies exist
    const clientCompanyIds = dto.clientCompanies.map(company => company.id);
    const existingCompanies = await this.clientCompanyService.findByIds(clientCompanyIds);
    
    if (existingCompanies.length !== clientCompanyIds.length) {
      console.error('❌ Some favorite client companies not found');
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          clientCompanies: 'Some client companies were not found',
        },
      });
    }


    try {
      // Check if user with email already exists
      const existingUser = await this.usersService.findByEmail(dto.email);
      if (existingUser) {
        console.error('❌ User with email already exists');
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'Email already exists',
          },
        });
      }

      // DO NOT hash password here: let usersService create() handle hashing ONCE!
      // const salt = await bcrypt.genSalt();
      // console.log(dto.password);
      // const hashedPassword = await bcrypt.hash(dto.password, salt);

      // Create user with Akzente type
      const user = await this.usersService.create({
        email: dto.email,
        password: dto.password, // pass as plaintext to service!
        firstName: dto.firstName,
        lastName: dto.lastName,
        gender: dto.gender,
        phone: dto.phone || '', // Handle optional phone
        type: {
          id: UserTypeEnum.akzente,
        },
        role: {
          id: RoleEnum.user, // or RoleEnum.admin based on your requirements
        },
        status: {
          id: StatusEnum.active, // Akzente users are active by default
        },
      });

      // Create Akzente profile
      const akzenteProfile = await this.akzenteService.create({
        user: { id: Number(user.id) },
        isSales: dto.isSales ?? false, // Use provided value or default to false
      });

      // Create favorite client company relationships
      const clientCompanyPromises = existingCompanies.map(company =>
        this.clientCompanyAssignedAkzenteService.create({
          akzente: { id: akzenteProfile.id },
          clientCompany: { id: company.id },
        })
      );

      await Promise.all(clientCompanyPromises);

      // Send welcome email (optional)
      await this.mailService.akzenteWelcome({
        to: dto.email,
        data: {
          firstName: dto.firstName,
          password: dto.password,
        },
      });


    } catch (error) {
      console.error('❌ Error during Akzente user registration:', error);
      throw error;
    }
  }

  async confirmEmail(hash: string): Promise<void> {
    let userId: User['id'];

    try {
      const jwtData = await this.jwtService.verifyAsync<{
        confirmEmailUserId: User['id'];
      }>(hash, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
      });

      userId = jwtData.confirmEmailUserId;
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `invalidHash`,
        },
      });
    }

    const user = await this.usersService.findById(userId);

    if (
      !user ||
      user?.status?.id?.toString() !== StatusEnum.inactive.toString()
    ) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        error: `notFound`,
      });
    }

    user.status = {
      id: StatusEnum.active,
    };

    await this.usersService.update(user.id, user);
  }

  async confirmNewEmail(hash: string): Promise<void> {
    let userId: User['id'];
    let newEmail: User['email'];

    try {
      const jwtData = await this.jwtService.verifyAsync<{
        confirmEmailUserId: User['id'];
        newEmail: User['email'];
      }>(hash, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
      });

      userId = jwtData.confirmEmailUserId;
      newEmail = jwtData.newEmail;
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `invalidHash`,
        },
      });
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        error: `notFound`,
      });
    }

    user.email = newEmail;
    user.status = {
      id: StatusEnum.active,
    };

    await this.usersService.update(user.id, user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'emailNotExists',
        },
      });
    }

    const tokenExpiresIn = this.configService.getOrThrow('auth.forgotExpires', {
      infer: true,
    });

    const tokenExpires = Date.now() + ms(tokenExpiresIn);

    const hash = await this.jwtService.signAsync(
      {
        forgotUserId: user.id,
      },
      {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
        expiresIn: tokenExpiresIn,
      },
    );

    await this.mailService.forgotPassword({
      to: email,
      data: {
        hash,
        tokenExpires,
      },
    });
  }

  async resetPassword(hash: string, password: string): Promise<void> {
    let userId: User['id'];

    try {
      const jwtData = await this.jwtService.verifyAsync<{
        forgotUserId: User['id'];
      }>(hash, {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
      });

      userId = jwtData.forgotUserId;
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `invalidHash`,
        },
      });
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `notFound`,
        },
      });
    }

    user.password = password;

    await this.sessionService.deleteByUserId({
      userId: user.id,
    });

    await this.usersService.update(user.id, user);
  }

  async me(userJwtPayload: JwtPayloadType): Promise<NullableType<User>> {
    return this.usersService.findById(userJwtPayload.id);
  }

  async update(
    userJwtPayload: JwtPayloadType,
    userDto: AuthUpdateDto,
  ): Promise<NullableType<User>> {
    const currentUser = await this.usersService.findById(userJwtPayload.id);

    if (!currentUser) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'userNotFound',
        },
      });
    }

    if (userDto.password) {
      if (!userDto.oldPassword) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'missingOldPassword',
          },
        });
      }

      if (!currentUser.password) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'incorrectOldPassword',
          },
        });
      }

      const isValidOldPassword = await bcrypt.compare(
        userDto.oldPassword,
        currentUser.password,
      );

      if (!isValidOldPassword) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'incorrectOldPassword',
          },
        });
      } else {
        await this.sessionService.deleteByUserIdWithExclude({
          userId: currentUser.id,
          excludeSessionId: userJwtPayload.sessionId,
        });
      }
    }

    if (userDto.email && userDto.email !== currentUser.email) {
      const userByEmail = await this.usersService.findByEmail(userDto.email);

      if (userByEmail && userByEmail.id !== currentUser.id) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'emailExists',
          },
        });
      }

      const hash = await this.jwtService.signAsync(
        {
          confirmEmailUserId: currentUser.id,
          newEmail: userDto.email,
        },
        {
          secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
            infer: true,
          }),
          expiresIn: this.configService.getOrThrow('auth.confirmEmailExpires', {
            infer: true,
          }),
        },
      );

      await this.mailService.confirmNewEmail({
        to: userDto.email,
        data: {
          hash,
        },
      });
    }

    delete userDto.email;
    delete userDto.oldPassword;

    await this.usersService.update(userJwtPayload.id, userDto);

    return this.usersService.findById(userJwtPayload.id);
  }

  async refreshToken(
    data: Pick<JwtRefreshPayloadType, 'sessionId' | 'hash'>,
  ): Promise<Omit<LoginResponseDto, 'user'>> {
    const session = await this.sessionService.findById(data.sessionId);

    if (!session) {
      throw new UnauthorizedException();
    }

    if (session.hash !== data.hash) {
      throw new UnauthorizedException();
    }

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const user = await this.usersService.findById(session.user.id);

    if (!user?.role) {
      throw new UnauthorizedException();
    }

    await this.sessionService.update(session.id, {
      hash,
    });

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: session.user.id,
      role: {
        id: user.role.id,
      },
      sessionId: session.id,
      hash,
    });

    return {
      token,
      refreshToken,
      tokenExpires,
    };
  }

  async softDelete(user: User): Promise<void> {
    await this.usersService.remove(user.id);
  }

  async logout(data: Pick<JwtRefreshPayloadType, 'sessionId'>) {
    return this.sessionService.deleteById(data.sessionId);
  }

  async resendConfirmationEmail(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'emailNotExists',
        },
      });
    }

    // Check if user is already confirmed
    if (user.status?.id?.toString() === StatusEnum.active.toString()) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'emailAlreadyConfirmed',
        },
      });
    }

    // Check if user is inactive (unconfirmed)
    if (user.status?.id?.toString() !== StatusEnum.inactive.toString()) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'invalidAccountStatus',
        },
      });
    }

    const hash = await this.jwtService.signAsync(
      {
        confirmEmailUserId: user.id,
      },
      {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
        expiresIn: this.configService.getOrThrow('auth.confirmEmailExpires', {
          infer: true,
        }),
      },
    );

    await this.mailService.userSignUp({
      to: email,
      data: {
        hash,
      },
    });
  }

  private async getTokensData(data: {
    id: User['id'];
    role: User['role'];
    sessionId: Session['id'];
    hash: Session['hash'];
  }) {
    const tokenExpiresIn = this.configService.getOrThrow('auth.expires', {
      infer: true,
    });

    const tokenExpires = Date.now() + ms(tokenExpiresIn);

    // Determine user type for JWT payload
    const userType = await this.determineUserType(Number(data.id));

    const [token, refreshToken] = await Promise.all([
      await this.jwtService.signAsync(
        {
          id: data.id,
          role: data.role,
          userType: userType,
          sessionId: data.sessionId,
        },
        {
          secret: this.configService.getOrThrow('auth.secret', { infer: true }),
          expiresIn: tokenExpiresIn,
        },
      ),
      await this.jwtService.signAsync(
        {
          sessionId: data.sessionId,
          hash: data.hash,
        },
        {
          secret: this.configService.getOrThrow('auth.refreshSecret', {
            infer: true,
          }),
          expiresIn: this.configService.getOrThrow('auth.refreshExpires', {
            infer: true,
          }),
        },
      ),
    ]);

    return {
      token,
      refreshToken,
      tokenExpires,
    };
  }

  async validateAkzenteLogin(loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'notFound',
        },
      });
    }

    // Check if user type is akzente
    if (user.type?.id !== UserTypeEnum.akzente) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          userType: 'unauthorizedUserType',
        },
      });
    }

    return this.performLogin(user, loginDto.password);
  }

  async validateClientLogin(loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'notFound',
        },
      });
    }

    // Check if user type is client
    if (user.type?.id !== UserTypeEnum.client) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          userType: 'unauthorizedUserType',
        },
      });
    }

    return this.performLogin(user, loginDto.password);
  }

  async validateMerchandiserLogin(loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'notFound',
        },
      });
    }

    // Check if user type is merchandiser
    if (user.type?.id !== UserTypeEnum.merchandiser) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          userType: 'unauthorizedUserType',
        },
      });
    }

    return this.performLogin(user, loginDto.password);
  }

  private async performLogin(user: User, password: string): Promise<LoginResponseDto> {
    if (user.provider !== AuthProvidersEnum.email) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: `needLoginViaProvider:${user.provider}`,
        },
      });
    }

    if (user.status?.id?.toString() === StatusEnum.inactive.toString()) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          status: 'unconfirmedProfile',
        },
      });
    }

    if (!user.password) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'incorrectPassword',
        },
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'incorrectPassword',
        },
      });
    }

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const session = await this.sessionService.create({
      user,
      hash,
    });

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: user.id,
      role: user.role,
      sessionId: session.id,
      hash,
    });

    return {
      refreshToken,
      token,
      tokenExpires,
      user,
    };
  }

  /**
   * Generate a random password of specified length (max 10 characters)
   * @param length - Length of password (default: 10, max: 10)
   * @returns Random password string
   */
  private generateRandomPassword(length: number = 10): string {
    // Ensure length doesn't exceed 10
    const passwordLength = Math.min(length, 10);
    
    // Character sets for password generation
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const allChars = lowercase + uppercase + numbers;
    
    let password = '';
    
    // Ensure at least one character from each set for better security
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    
    // Fill the rest randomly
    for (let i = password.length; i < passwordLength; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password to randomize character positions
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Determine user type based on user ID
   * This method checks which entity (akzente, client, merchandiser) the user belongs to
   */
  private async determineUserType(userId: number): Promise<'akzente' | 'client' | 'merchandiser'> {
    try {
      // Make all calls in parallel for better performance
      const [akzenteEntity, clientEntity, merchandiserEntity] = await Promise.all([
        this.akzenteService.findByUserId(userId).catch(() => null),
        this.clientService.findByUserId(userId).catch(() => null),
        this.merchandiserService.findByUserIdNumber(userId).catch(() => null),
      ]);

      // Determine user type based on which entity exists
      if (akzenteEntity) {
        return 'akzente';
      } else if (clientEntity) {
        return 'client';
      } else if (merchandiserEntity) {
        return 'merchandiser';
      }

      // Default to akzente if no specific type found
      return 'akzente';
    } catch (error) {
      console.error('Error determining user type:', error);
      // Default to akzente if there's an error
      return 'akzente';
    }
  }
}
