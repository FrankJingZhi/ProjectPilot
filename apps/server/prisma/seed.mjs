// 数据库种子：创建个人版默认用户（幂等）
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  const user = await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      email: 'owner@projectpilot.local',
      name: '本地用户',
      passwordHash: '',
    },
  });
  console.log('默认用户就绪:', user.email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
