-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "pricingMarginPercent" DECIMAL(65,30) NOT NULL DEFAULT 0.30,
ADD COLUMN     "pricingTaxBurdenPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "pricingBusinessDaysPerMonth" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "pricingBillableHoursPerDay" DECIMAL(65,30) NOT NULL DEFAULT 8,
ADD COLUMN     "pricingActiveStaffCount" DECIMAL(65,30) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "RoleRate" ADD COLUMN     "grossSalary" DECIMAL(65,30),
ADD COLUMN     "payrollBurdenPercent" DECIMAL(65,30),
ADD COLUMN     "billableHoursPerMonth" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "StudioFixedCost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "monthlyAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioFixedCost_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StudioFixedCost" ADD CONSTRAINT "StudioFixedCost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
