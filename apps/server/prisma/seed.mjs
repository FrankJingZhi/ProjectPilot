// 数据库种子：创建初始管理员账号（幂等）
// 初始密码由服务端启动时根据 ADMIN_INITIAL_PASSWORD 环境变量设置
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  const user = await prisma.user.upsert({
    where: { id: ADMIN_USER_ID },
    update: { isAdmin: true },
    create: {
      id: ADMIN_USER_ID,
      email: 'owner@projectpilot.local',
      name: '系统管理员',
      passwordHash: '',
      isAdmin: true,
    },
  });
  console.log('管理员账号就绪:', user.email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
