-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "browser_provider" TEXT NOT NULL DEFAULT 'gologin',
ADD COLUMN     "multilogin_profile_id" TEXT,
ALTER COLUMN "gologin_profile_id" DROP NOT NULL;
