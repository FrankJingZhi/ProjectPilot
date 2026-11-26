import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import type { CurrentUserShape } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// 用户管理：仅系统管理员（团队账号由管理员开通，不开放注册）
@UseGuards(AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: CurrentUserShape,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(id, dto, actor.id);
  }
}
