import { IsBoolean, IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

// 管理员开通账号入参
export class CreateUserDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @Length(1, 50)
  name!: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  password!: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}
