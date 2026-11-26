import { IsBoolean, IsOptional, IsString, Length, MinLength } from 'class-validator';

// 管理员修改账号入参：改名 / 重置密码 / 禁用启用 / 授予撤销管理员
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  password?: string;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}
