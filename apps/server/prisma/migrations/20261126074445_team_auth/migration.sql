-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- 数据回填：个人版默认用户升级为系统管理员
UPDATE "users" SET "isAdmin" = true
WHERE "id" = '00000000-0000-0000-0000-000000000001';

-- 数据回填：为存量项目补 OWNER 成员记录（幂等，不重复插入）
INSERT INTO "project_members" ("id", "projectId", "userId", "role", "joinedAt")
SELECT gen_random_uuid(), p."id", p."ownerId", CAST('OWNER' AS "MemberRole"), now()
FROM "projects" p
WHERE NOT EXISTS (
  SELECT 1 FROM "project_members" m
  WHERE m."projectId" = p."id" AND m."userId" = p."ownerId"
);
