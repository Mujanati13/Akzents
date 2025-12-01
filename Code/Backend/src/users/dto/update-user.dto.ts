import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  MinLength,
  IsEnum,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { FileDto } from '../../files/dto/file.dto';
import { RoleDto } from '../../roles/dto/role.dto';
import { StatusDto } from '../../statuses/dto/status.dto';
import { UserTypeDto } from '../../user-type/dto/user-type.dto';
import { GenderEnum } from '../enums/gender.enum';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';
import { ClientCompanyDto } from '../../client-company/dto/client-company.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ example: 'test1@example.com', type: String })
  @Transform(lowerCaseTransformer)
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @MinLength(6)
  password?: string;

  provider?: string;

  socialId?: string | null;

  @ApiPropertyOptional({ example: 'John', type: String })
  @IsOptional()
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Doe', type: String })
  @IsOptional()
  lastName?: string | null;

  @ApiPropertyOptional({ enum: GenderEnum, example: GenderEnum.MALE })
  @IsOptional()
  @IsEnum(GenderEnum)
  gender?: GenderEnum | null;

  @ApiPropertyOptional({ example: '+1234567890', type: String })
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({ type: () => UserTypeDto })
  @IsOptional()
  @Type(() => UserTypeDto)
  type?: UserTypeDto;

  @ApiPropertyOptional({ type: () => FileDto })
  @IsOptional()
  photo?: FileDto | null;

  @ApiPropertyOptional({ type: () => RoleDto })
  @IsOptional()
  @Type(() => RoleDto)
  role?: RoleDto | null;

  @ApiPropertyOptional({ type: () => StatusDto })
  @IsOptional()
  @Type(() => StatusDto)
  status?: StatusDto;

  @ApiPropertyOptional({
    type: [ClientCompanyDto],
    description: 'Favorite client companies (for akzente users)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientCompanyDto)
  favoriteClientCompanies?: ClientCompanyDto[];

  @ApiPropertyOptional({
    type: [ClientCompanyDto],
    description: 'Assigned client companies (for client users)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientCompanyDto)
  clientCompanies?: ClientCompanyDto[];
}
