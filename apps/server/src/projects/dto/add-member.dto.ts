import { IsIn, IsUUID } from 'class-validator';

// 可分配的项目角色（OWNER 由创建项目时自动产生，不可手动授予）
export const ASSIGNABLE_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// 添加项目成员入参
export class AddMemberDto {
  @IsUUID()
  userId!: string;

  @IsIn(ASSIGNABLE_ROLES, { message: '角色只能是 ADMIN / MEMBER / VIEWER' })
  role!: AssignableRole;
}
