-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Template_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "documentFilename" TEXT NOT NULL,
    "documentOriginalName" TEXT NOT NULL,
    "documentMimeType" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateVersionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Field_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateCollaborator_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Instance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Instance_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Instance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FieldValue_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FieldValue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "fieldId" TEXT,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "performedById" TEXT,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionLog_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActionLog_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActionLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_versionNumber_key" ON "TemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateCollaborator_templateId_userId_key" ON "TemplateCollaborator"("templateId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldValue_instanceId_fieldId_key" ON "FieldValue"("instanceId", "fieldId");
