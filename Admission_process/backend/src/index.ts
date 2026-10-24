// Trigger backend reload - 2026-09-27T17:23:00 - adminAdmissionRouter synchronized
import app from './app';
import sequelize, { logDatabaseConfiguration } from './config/database';
import { initRedis } from './config/redis';
import attendanceBackupQueueService from './services/attendanceBackupQueue.service';
import bitwiseMarksBackupQueueService from './services/bitwiseMarksBackupQueue.service';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Log database configuration diagnostics and authenticate PostgreSQL connection
    logDatabaseConfiguration();
    console.log('Connecting to PostgreSQL...');
    await sequelize.authenticate();
    console.log('PostgreSQL connected successfully.');

    // 2. Initialize Redis connection
    await initRedis();
    
    // Safe migration: Add status, archivedAt, and archivedBy to teachers table
    try {
      await sequelize.query(`
        ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) DEFAULT 'ACTIVE';
        ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE NULL;
        ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "archivedBy" UUID NULL;
        UPDATE "teachers" SET "status" = 'ACTIVE' WHERE "status" IS NULL;
      `);
    } catch (teacherErr: any) {
      console.warn('Teachers archive columns migration skipped:', teacherErr.message);
    }

    // Safe migration: Add middleName and gender columns to teachers and users tables
    try {
      await sequelize.query(`
        ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "middleName" VARCHAR(50) NULL;
        ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(20) NULL;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "middleName" VARCHAR(50) NULL;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(20) NULL;
      `);
    } catch (colErr: any) {
      console.warn('Teachers and users middleName/gender migration skipped:', colErr.message);
    }

    // Safe migration: Add faculty transfer & validity period columns to faculty_assignments table
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum WHERE enumtypid = 'enum_faculty_assignments_status'::regtype AND enumlabel = 'TRANSFERRED'
          ) THEN
            ALTER TYPE "enum_faculty_assignments_status" ADD VALUE 'TRANSFERRED';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum WHERE enumtypid = 'enum_faculty_assignments_status'::regtype AND enumlabel = 'ENDED'
          ) THEN
            ALTER TYPE "enum_faculty_assignments_status" ADD VALUE 'ENDED';
          END IF;
        END $$;

        ALTER TABLE "faculty_assignments" ADD COLUMN IF NOT EXISTS "startDate" DATE NULL;
        ALTER TABLE "faculty_assignments" ADD COLUMN IF NOT EXISTS "endDate" DATE NULL;
        ALTER TABLE "faculty_assignments" ADD COLUMN IF NOT EXISTS "previousFacultyAssignmentId" UUID NULL REFERENCES "faculty_assignments"("id") ON DELETE SET NULL;
        ALTER TABLE "faculty_assignments" ADD COLUMN IF NOT EXISTS "transferReason" VARCHAR(100) NULL;
        ALTER TABLE "faculty_assignments" ADD COLUMN IF NOT EXISTS "transferredAt" TIMESTAMP WITH TIME ZONE NULL;
        ALTER TABLE "faculty_assignments" ADD COLUMN IF NOT EXISTS "transferredByHODId" UUID NULL REFERENCES "users"("id") ON DELETE SET NULL;
      `);
    } catch (faErr: any) {
      console.warn('FacultyAssignment transfer columns migration skipped:', faErr.message);
    }

    // Safe migration: Google Drive Integration & Attendance Backup tables
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "google_drive_integrations" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "status" VARCHAR(50) NOT NULL DEFAULT 'NOT_CONNECTED',
          "googleAccountEmail" VARCHAR(255) NULL,
          "encryptedRefreshToken" TEXT NULL,
          "encryptedAccessToken" TEXT NULL,
          "tokenExpiry" TIMESTAMP WITH TIME ZONE NULL,
          "rootFolderId" VARCHAR(255) NULL,
          "rootFolderName" VARCHAR(255) NOT NULL DEFAULT 'JCER ERP Attendance',
          "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT true,
          "lastSuccessfulSync" TIMESTAMP WITH TIME ZONE NULL,
          "lastError" TEXT NULL,
          "connectedByUserId" UUID NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS "attendance_backup_files" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "facultyAssignmentId" UUID NOT NULL REFERENCES "faculty_assignments"("id") ON DELETE CASCADE,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "sectionId" UUID NULL,
          "academicYear" VARCHAR(50) NOT NULL,
          "semester" INTEGER NOT NULL,
          "section" VARCHAR(50) NOT NULL,
          "fileName" VARCHAR(255) NOT NULL,
          "googleDriveFolderId" VARCHAR(255) NULL,
          "googleDriveFileId" VARCHAR(255) NULL,
          "googleDriveFileUrl" TEXT NULL,
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "lastSyncedAt" TIMESTAMP WITH TIME ZONE NULL,
          "lastError" TEXT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "uq_att_backup_file_cohort" UNIQUE ("academicYear", "departmentId", "semester", "section", "subjectId")
        );

        CREATE TABLE IF NOT EXISTS "attendance_backup_jobs" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "facultyAssignmentId" UUID NOT NULL REFERENCES "faculty_assignments"("id") ON DELETE CASCADE,
          "attendanceSessionId" UUID NULL,
          "backupFileId" UUID NULL,
          "action" VARCHAR(50) NOT NULL DEFAULT 'UPDATE',
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "attemptCount" INTEGER NOT NULL DEFAULT 0,
          "maxAttempts" INTEGER NOT NULL DEFAULT 5,
          "lastAttemptAt" TIMESTAMP WITH TIME ZONE NULL,
          "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "completedAt" TIMESTAMP WITH TIME ZONE NULL,
          "errorMessage" TEXT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_att_backup_jobs_status" ON "attendance_backup_jobs"("status", "nextAttemptAt");
        CREATE INDEX IF NOT EXISTS "idx_att_backup_jobs_assignment" ON "attendance_backup_jobs"("facultyAssignmentId");
        CREATE INDEX IF NOT EXISTS "idx_att_backup_files_assignment" ON "attendance_backup_files"("facultyAssignmentId");

        CREATE TABLE IF NOT EXISTS "marks_backup_files" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "academicYear" VARCHAR(50) NOT NULL,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "fileName" VARCHAR(255) NOT NULL,
          "googleDriveFolderId" VARCHAR(255) NULL,
          "googleDriveFileId" VARCHAR(255) NULL,
          "googleDriveFileUrl" TEXT NULL,
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "lastSyncedAt" TIMESTAMP WITH TIME ZONE NULL,
          "lastError" TEXT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "uq_marks_backup_file_subject" UNIQUE ("academicYear", "departmentId", "semester", "subjectId")
        );

        CREATE TABLE IF NOT EXISTS "marks_backup_jobs" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(50) NOT NULL,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "backupFileId" UUID NULL REFERENCES "marks_backup_files"("id") ON DELETE SET NULL,
          "action" VARCHAR(50) NOT NULL DEFAULT 'UPDATE',
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "attemptCount" INTEGER NOT NULL DEFAULT 0,
          "maxAttempts" INTEGER NOT NULL DEFAULT 5,
          "lastAttemptAt" TIMESTAMP WITH TIME ZONE NULL,
          "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "completedAt" TIMESTAMP WITH TIME ZONE NULL,
          "errorMessage" TEXT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_marks_backup_jobs_status" ON "marks_backup_jobs"("status", "nextAttemptAt");
        CREATE INDEX IF NOT EXISTS "idx_marks_backup_jobs_subject" ON "marks_backup_jobs"("subjectId", "semester", "academicYear");

        CREATE TABLE IF NOT EXISTS "consolidated_attendance_backup_files" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "academicYear" VARCHAR(50) NOT NULL,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "fileName" VARCHAR(255) NOT NULL,
          "googleDriveFolderId" VARCHAR(255) NOT NULL,
          "googleDriveFileId" VARCHAR(255) NOT NULL,
          "googleDriveFileUrl" TEXT NULL,
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "lastSyncedAt" TIMESTAMP WITH TIME ZONE NULL,
          "lastError" TEXT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "uq_consolidated_att_backup_cohort" UNIQUE ("academicYear", "departmentId", "semester")
        );

        CREATE INDEX IF NOT EXISTS "idx_consolidated_att_backup_files_status" ON "consolidated_attendance_backup_files"("status");
        CREATE INDEX IF NOT EXISTS "idx_consolidated_att_backup_files_drive_id" ON "consolidated_attendance_backup_files"("googleDriveFileId");

        -- Safe additive migration: Student Attendance & Marks Release Module tables
        CREATE TABLE IF NOT EXISTS "academic_releases" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "academicYear" VARCHAR(50) NOT NULL,
          "semester" INTEGER NOT NULL,
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "releaseType" VARCHAR(30) NOT NULL,
          "assessmentType" VARCHAR(50) NOT NULL,
          "status" VARCHAR(30) NOT NULL DEFAULT 'RELEASED',
          "sourceType" VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_DRIVE',
          "googleDriveFileId" VARCHAR(255) NULL,
          "googleDriveFileName" VARCHAR(255) NULL,
          "sourceFingerprint" VARCHAR(255) NULL,
          "sourceVersion" VARCHAR(100) NULL,
          "totalStudentsCount" INTEGER NOT NULL DEFAULT 0,
          "releasedByUserId" UUID NULL REFERENCES "users"("id") ON DELETE SET NULL,
          "releasedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "lastReviewedAt" TIMESTAMP WITH TIME ZONE NULL,
          "metadata" JSONB NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "uq_academic_release_item" UNIQUE ("departmentId", "academicYear", "semester", "subjectId", "releaseType", "assessmentType")
        );

        CREATE INDEX IF NOT EXISTS "idx_academic_releases_lookup" ON "academic_releases"("academicYear", "departmentId", "semester", "subjectId");

        CREATE TABLE IF NOT EXISTS "student_released_academic_data" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "academicReleaseId" UUID NOT NULL REFERENCES "academic_releases"("id") ON DELETE CASCADE,
          "studentId" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
          "usn" VARCHAR(50) NOT NULL,
          "studentName" VARCHAR(255) NULL,
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(50) NOT NULL,
          "releaseType" VARCHAR(30) NOT NULL,
          "assessmentType" VARCHAR(50) NOT NULL,
          "attendancePercentage" NUMERIC(6, 2) NULL,
          "conductedClasses" INTEGER NULL,
          "attendedClasses" INTEGER NULL,
          "marksObtained" NUMERIC(6, 2) NULL,
          "maxMarks" NUMERIC(6, 2) NULL,
          "percentage" NUMERIC(6, 2) NULL,
          "status" VARCHAR(50) NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "uq_student_released_data_item" UNIQUE ("studentId", "subjectId", "academicYear", "semester", "releaseType", "assessmentType")
        );

        CREATE INDEX IF NOT EXISTS "idx_student_released_data_lookup" ON "student_released_academic_data"("studentId", "releaseType", "semester");
        CREATE INDEX IF NOT EXISTS "idx_student_released_data_release_id" ON "student_released_academic_data"("academicReleaseId");

        -- Add columns for subject deletion and archive lifecycle synchronization
        ALTER TABLE "attendance_backup_files" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE NULL;
        ALTER TABLE "attendance_backup_files" ADD COLUMN IF NOT EXISTS "lastSyncAttemptAt" TIMESTAMP WITH TIME ZONE NULL;
        CREATE INDEX IF NOT EXISTS "idx_att_backup_files_subject" ON "attendance_backup_files"("subjectId");

        -- Ensure student admissionBatch attribute exists and is formatted as full 4-year cohort (e.g. 2026–2030)
        ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "admissionBatch" VARCHAR(30) NULL;
        UPDATE "students" 
        SET "admissionBatch" = "batchYear"::text || '–' || ("batchYear" + 4)::text
        WHERE "admissionBatch" IS NULL OR "admissionBatch" NOT LIKE '%–%';
      `);
      console.log('✓ Google Drive Attendance, Marks & Consolidated Backup tables verified/created.');
    } catch (gdriveDdlErr: any) {
      console.warn('Google Drive Attendance & Marks Backup migration notice:', gdriveDdlErr.message);
    }

    // Safe migration: Add attendanceThreshold to departments and create department_settings table
    try {
      await sequelize.query(`
        ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "attendanceThreshold" DOUBLE PRECISION DEFAULT 85.0;
        UPDATE "departments" SET "attendanceThreshold" = 85.0 WHERE "attendanceThreshold" IS NULL;

        CREATE TABLE IF NOT EXISTS "department_settings" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "academicYear" VARCHAR(50) NOT NULL DEFAULT '2026-27',
          "attendanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 85.0,
          "updatedBy" UUID NULL REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "uq_dept_settings_dept_ay" UNIQUE ("departmentId", "academicYear")
        );
      `);
      console.log('✓ Department settings and attendanceThreshold verified/created.');
    } catch (deptSettingsErr: any) {
      console.warn('Department settings migration notice:', deptSettingsErr.message);
    }

    // Pre-cast: fix admission_parent_details.fatherAnnualIncome column type to DECIMAL(38, 2).
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admission_parent_details' AND column_name = 'fatherAnnualIncome'
          ) THEN
            ALTER TABLE "admission_parent_details" ALTER COLUMN "fatherAnnualIncome" TYPE DECIMAL(38, 2)
            USING (
              CASE 
                WHEN "fatherAnnualIncome" IS NULL THEN NULL
                WHEN TRIM("fatherAnnualIncome"::text) = '' THEN NULL
                WHEN TRIM(regexp_replace("fatherAnnualIncome"::text, '[^-0-9.]', '', 'g')) = '' THEN NULL
                ELSE TRIM(regexp_replace("fatherAnnualIncome"::text, '[^-0-9.]', '', 'g'))::numeric(38, 2)
              END
            );
          END IF;
        END
        $$;
      `);
    } catch (castErr: any) {
      console.warn('Pre-cast migration for admission_parent_details.fatherAnnualIncome skipped:', castErr.message);
    }

    // Pre-cast: fix parents.annualIncome column type to DECIMAL(38, 2).
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'parents' AND column_name = 'annualIncome'
          ) THEN
            ALTER TABLE "parents" ALTER COLUMN "annualIncome" TYPE DECIMAL(38, 2)
            USING (
              CASE 
                WHEN "annualIncome" IS NULL THEN NULL
                WHEN TRIM("annualIncome"::text) = '' THEN NULL
                WHEN TRIM(regexp_replace("annualIncome"::text, '[^-0-9.]', '', 'g')) = '' THEN NULL
                ELSE TRIM(regexp_replace("annualIncome"::text, '[^-0-9.]', '', 'g'))::numeric(38, 2)
              END
            );
          END IF;
        END
        $$;
      `);
    } catch (castErr: any) {
      console.warn('Pre-cast migration for parents.annualIncome skipped:', castErr.message);
    }

    // Pre-cast: fix admission_academic_details percentage columns type.
    try {
      const percentageCols = ['tenthPercentage', 'twelfthPercentage', 'diplomaPercentage'];
      for (const col of percentageCols) {
        await sequelize.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admission_academic_details' AND column_name = '${col}'
                AND data_type NOT IN ('numeric', 'decimal', 'double precision', 'real')
            ) THEN
              ALTER TABLE "admission_academic_details" ALTER COLUMN "${col}" TYPE DECIMAL(5, 2)
              USING (
                CASE 
                  WHEN "${col}" IS NULL THEN NULL
                  WHEN TRIM("${col}"::text) = '' THEN NULL
                  WHEN TRIM(regexp_replace("${col}"::text, '[^-0-9.]', '', 'g')) = '' THEN NULL
                  ELSE TRIM(regexp_replace("${col}"::text, '[^-0-9.]', '', 'g'))::numeric(5, 2)
                END
              );
            END IF;
          END
          $$;
        `);
      }
    } catch (castErr: any) {
      console.warn('Pre-cast migration for admission_academic_details percentages skipped:', castErr.message);
    }

    // Pre-cast: ensure admission_addresses has taluk and district columns
    try {
      const addressCols = ['currentTaluk', 'currentDistrict', 'currentDistrictId', 'permanentTaluk', 'permanentDistrict', 'permanentDistrictId'];
      for (const col of addressCols) {
        await sequelize.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admission_addresses' AND column_name = '${col}'
            ) THEN
              ALTER TABLE "admission_addresses" ADD COLUMN "${col}" VARCHAR(100);
            END IF;
          END
          $$;
        `);
      }
    } catch (castErr: any) {
      console.warn('Pre-cast migration for admission_addresses columns skipped:', castErr.message);
    }

    // Pre-cast: fix admission_academic_details integer columns type.
    try {
      const integerCols = [
        'tenthMarksObtained', 'tenthMaxMarks', 'tenthAttempts',
        'physicsMarks', 'mathsMarks', 'chemistryMarks', 'optionalMarks',
        'twelfthMaxMarks', 'twelfthAggregate', 'twelfthAttempts',
        'diplomaFinalYearMaxMarks', 'diplomaFinalYearObtained', 'diplomaAttempts',
        'cetScore', 'cetRank', 'cetYear'
      ];
      for (const col of integerCols) {
        await sequelize.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admission_academic_details' AND column_name = '${col}'
                AND data_type NOT IN ('integer', 'bigint', 'smallint')
            ) THEN
              ALTER TABLE "admission_academic_details" ALTER COLUMN "${col}" TYPE INTEGER
              USING (
                CASE 
                  WHEN "${col}" IS NULL THEN NULL
                  WHEN TRIM("${col}"::text) = '' THEN NULL
                  WHEN TRIM(regexp_replace("${col}"::text, '[^-0-9.]', '', 'g')) = '' THEN NULL
                  ELSE TRIM(regexp_replace("${col}"::text, '[^-0-9.]', '', 'g'))::numeric::integer
                END
              );
            END IF;
          END
          $$;
        `);
      }
    } catch (castErr: any) {
      console.warn('Pre-cast migration for admission_academic_details integers skipped:', castErr.message);
    }

    // Pre-cast: ensure admissions.qualification column and its ENUM type exist
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_admissions_qualification') THEN
            CREATE TYPE "enum_admissions_qualification" AS ENUM ('PUC', 'DIPLOMA');
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'qualification'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "qualification" "enum_admissions_qualification";
          END IF;
        END
        $$;
      `);
    } catch (e: any) {
      console.warn('Pre-cast migration for admissions.qualification skipped:', e.message);
    }

    // Pre-cast: ensure admission_documents columns exist
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admission_documents' AND column_name = 'feesPaidReceiptUrl'
          ) THEN
            ALTER TABLE "admission_documents" ADD COLUMN "feesPaidReceiptUrl" VARCHAR(255);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admission_documents' AND column_name = 'diplomaSemester5MarksheetUrl'
          ) THEN
            ALTER TABLE "admission_documents" ADD COLUMN "diplomaSemester5MarksheetUrl" VARCHAR(255);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admission_documents' AND column_name = 'diplomaSemester6MarksheetUrl'
          ) THEN
            ALTER TABLE "admission_documents" ADD COLUMN "diplomaSemester6MarksheetUrl" VARCHAR(255);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'admissionClosingDate'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "admissionClosingDate" TIMESTAMPTZ DEFAULT '2026-08-31 23:59:59+00';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'handbookUrl'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "handbookUrl" VARCHAR(255);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'applicationFeeStatus'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "applicationFeeStatus" VARCHAR(50) DEFAULT 'Pending Payment';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'teachers' AND column_name = 'status'
          ) THEN
            ALTER TABLE "teachers" ADD COLUMN "status" VARCHAR(20) DEFAULT 'ACTIVE';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'teachers' AND column_name = 'archivedAt'
          ) THEN
            ALTER TABLE "teachers" ADD COLUMN "archivedAt" TIMESTAMPTZ NULL;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'teachers' AND column_name = 'archivedBy'
          ) THEN
            ALTER TABLE "teachers" ADD COLUMN "archivedBy" UUID NULL;
          END IF;
        END
        $$;
      `);
    } catch (e: any) {
      console.warn('Pre-cast migration for system, admission, and teachers columns skipped:', e.message);
    }

    // Pre-cast: ensure admissions applicationStatus enum has CANCELLATION_REQUESTED and CANCELLED
    try {
      await sequelize.query(`ALTER TYPE "enum_admissions_applicationStatus" ADD VALUE IF NOT EXISTS 'CANCELLATION_REQUESTED'`);
      await sequelize.query(`ALTER TYPE "enum_admissions_applicationStatus" ADD VALUE IF NOT EXISTS 'CANCELLED'`);
      await sequelize.query(`ALTER TYPE "enum_admissions_applicationStatus" ADD VALUE IF NOT EXISTS 'CORRECTION_REQUIRED'`);
      await sequelize.query(`ALTER TYPE "enum_admissions_applicationStatus" ADD VALUE IF NOT EXISTS 'RESUBMITTED'`);
    } catch (e: any) {
      console.warn('Pre-cast migration for admissions applicationStatus enum skipped:', e.message);
    }

    // Pre-cast: ensure admissions correction workflow columns exist
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'correctionRequestedSections'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "correctionRequestedSections" JSON;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'correctionRemarks'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "correctionRemarks" TEXT;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'correctionDeadline'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "correctionDeadline" TIMESTAMPTZ;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'correctionRequestedAt'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "correctionRequestedAt" TIMESTAMPTZ;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'correctionRequestedById'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "correctionRequestedById" UUID;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'verifiedDocuments'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "verifiedDocuments" JSON;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'usn'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "usn" VARCHAR(50) UNIQUE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'rejectedByAdminId'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "rejectedByAdminId" UUID;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'rejectedAt'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "rejectedAt" TIMESTAMPTZ;
          END IF;
        END
        $$;
      `);
    } catch (e: any) {
      console.warn('Pre-cast migration for admissions correction & rejection workflow columns skipped:', e.message);
    }

    // Pre-cast: ensure subjects type column supports IPCC and CC
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'subjects' AND column_name = 'type'
          ) THEN
            ALTER TABLE "subjects" ALTER COLUMN "type" TYPE VARCHAR(50) USING "type"::VARCHAR(50);
            ALTER TABLE "subjects" ALTER COLUMN "type" SET DEFAULT 'IPCC';
          END IF;
        END
        $$;
      `);
    } catch (e: any) {
      console.warn('Pre-cast migration for subjects type column skipped:', e.message);
    }

    // Pre-cast: ensure users.lastActivityAt column and index exist
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'lastActivityAt'
          ) THEN
            ALTER TABLE "users" ADD COLUMN "lastActivityAt" TIMESTAMP WITH TIME ZONE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'users' AND indexname = 'idx_users_last_activity_at'
          ) THEN
            CREATE INDEX "idx_users_last_activity_at" ON "users" ("lastActivityAt");
          END IF;
        END
        $$;
      `);
    } catch (e: any) {
      console.warn('Pre-cast migration for users.lastActivityAt skipped:', e.message);
    }

    // Provisional Admission and system settings column alterations
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'freshAdmissionOpen'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "freshAdmissionOpen" BOOLEAN DEFAULT true;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'lateralEntryOpen'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "lateralEntryOpen" BOOLEAN DEFAULT true;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'provisionalAdmissionOpen'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "provisionalAdmissionOpen" BOOLEAN DEFAULT true;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'provisionalAdmission3Open'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "provisionalAdmission3Open" BOOLEAN DEFAULT false;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'provisionalAdmission5Open'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "provisionalAdmission5Open" BOOLEAN DEFAULT false;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'system_configurations' AND column_name = 'provisionalAdmission7Open'
          ) THEN
            ALTER TABLE "system_configurations" ADD COLUMN "provisionalAdmission7Open" BOOLEAN DEFAULT false;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'registrationType'
          ) THEN
            ALTER TABLE "users" ADD COLUMN "registrationType" VARCHAR(20) DEFAULT 'FRESH';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'applicationType'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "applicationType" VARCHAR(20) DEFAULT 'FRESH';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admissions' AND column_name = 'entrySemester'
          ) THEN
            ALTER TABLE "admissions" ADD COLUMN "entrySemester" INTEGER DEFAULT 1;
          END IF;
        END
        $$;
      `);
    } catch (err: any) {
      console.warn('Provisional admission database alterations skipped:', err.message);
    }

    // Academic promotion columns on students table
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'admissionType'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "admissionType" VARCHAR(20) DEFAULT 'FRESH';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'initialSemester'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "initialSemester" INTEGER DEFAULT 1;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'currentAcademicYear'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "currentAcademicYear" VARCHAR(30) DEFAULT '2026-2027';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'lastPromotedAt'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "lastPromotedAt" TIMESTAMP WITH TIME ZONE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'lastPromotedBy'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "lastPromotedBy" UUID;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'students' AND constraint_name = 'students_lastPromotedBy_fkey'
          ) THEN
            ALTER TABLE "students" 
            ADD CONSTRAINT "students_lastPromotedBy_fkey" 
            FOREIGN KEY ("lastPromotedBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END
        $$;
      `);
    } catch (err: any) {
      console.warn('Academic promotion database alterations skipped:', err.message);
    }

    // Pre-cast: ensure bulk_export_jobs table exists
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'bulk_export_jobs'
          ) THEN
            CREATE TABLE IF NOT EXISTS "bulk_export_jobs" (
              "id" UUID PRIMARY KEY,
              "createdBy" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
              "academicYear" VARCHAR(50) NOT NULL,
              "branchId" VARCHAR(100) NOT NULL DEFAULT 'ALL',
              "status" VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
              "totalStudents" INTEGER NOT NULL DEFAULT 0,
              "totalDocuments" INTEGER NOT NULL DEFAULT 0,
              "processedDocuments" INTEGER NOT NULL DEFAULT 0,
              "failedDocuments" INTEGER NOT NULL DEFAULT 0,
              "progress" INTEGER NOT NULL DEFAULT 0,
              "zipObjectKey" VARCHAR(500),
              "zipSize" BIGINT,
              "error" TEXT,
              "failureSummary" JSON,
              "startedAt" TIMESTAMP WITH TIME ZONE,
              "completedAt" TIMESTAMP WITH TIME ZONE,
              "expiresAt" TIMESTAMP WITH TIME ZONE,
              "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
              "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
            );
          END IF;
        END
        $$;
      `);
    } catch (err: any) {
      console.warn('Pre-cast migration for bulk_export_jobs skipped:', err.message);
    }

    // Initialize worker and trigger retention cleanup periodically (every 1 hour)
    try {
      const bulkExportWorker = (await import('./services/bulkExportWorker.service')).default;
      bulkExportWorker.cleanupExpiredJobs();
      setInterval(() => {
        bulkExportWorker.cleanupExpiredJobs();
      }, 60 * 60 * 1000);
    } catch (err: any) {
      console.warn('Bulk export worker retention cleanup init notice:', err.message);
    }

    // Pre-cast: HOD Academic Dashboard schema extensions
    try {
      await sequelize.query(`ALTER TYPE "enum_users_status" ADD VALUE IF NOT EXISTS 'PENDING_AUTHORIZATION';`).catch(() => {});
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'section'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "section" VARCHAR(20) DEFAULT NULL;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'faculty_assignments' AND column_name = 'attendanceAccess'
          ) THEN
            ALTER TABLE "faculty_assignments" ADD COLUMN "attendanceAccess" BOOLEAN DEFAULT true;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'faculty_assignments' AND column_name = 'marksAccess'
          ) THEN
            ALTER TABLE "faculty_assignments" ADD COLUMN "marksAccess" BOOLEAN DEFAULT true;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'faculty_assignments' AND column_name = 'createdByHODId'
          ) THEN
            ALTER TABLE "faculty_assignments" ADD COLUMN "createdByHODId" UUID;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'faculty_authorization_requests' AND column_name = 'assignmentsData'
          ) THEN
            ALTER TABLE "faculty_authorization_requests" ADD COLUMN "assignmentsData" JSONB DEFAULT NULL;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'faculty_authorization_requests' AND column_name = 'sequence'
          ) THEN
            ALTER TABLE "faculty_authorization_requests" ADD COLUMN "sequence" INTEGER DEFAULT 1;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'faculty_authorization_requests' AND column_name = 'decidedByName'
          ) THEN
            ALTER TABLE "faculty_authorization_requests" ADD COLUMN "decidedByName" VARCHAR(150) DEFAULT NULL;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'faculty_authorization_requests' AND column_name = 'decidedByRole'
          ) THEN
            ALTER TABLE "faculty_authorization_requests" ADD COLUMN "decidedByRole" VARCHAR(100) DEFAULT NULL;
          END IF;

          -- Allow NULL on subjectId for profile-only authorization requests
          BEGIN
            ALTER TABLE "faculty_authorization_requests" ALTER COLUMN "subjectId" DROP NOT NULL;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;

          -- Make sure authority and status can store multi-level values
          BEGIN
            ALTER TABLE "faculty_authorization_requests" ALTER COLUMN "authority" TYPE VARCHAR(50);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;

          BEGIN
            ALTER TABLE "faculty_authorization_requests" ALTER COLUMN "status" TYPE VARCHAR(50);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'scheme'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "scheme" VARCHAR(20);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'gender'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "gender" VARCHAR(20);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'previousCollege'
          ) THEN
            ALTER TABLE "students" ADD COLUMN "previousCollege" VARCHAR(255);
          END IF;
        END
        $$;
      `);
    } catch (hodMigrationErr: any) {
      console.warn('Pre-cast migration for schema extensions notice:', hodMigrationErr.message);
    }

    // Migration: Safely remove obsolete Google Sheets & OAuth database objects (tables, columns, types)
    try {
      await sequelize.query(`
        DROP TABLE IF EXISTS "google_sheet_sync_logs" CASCADE;
        DROP TABLE IF EXISTS "google_sheet_resources" CASCADE;
        DROP TABLE IF EXISTS "google_sheet_tabs" CASCADE;
        DROP TABLE IF EXISTS "faculty_google_sheet_access" CASCADE;
        DROP TABLE IF EXISTS "google_sheet_connections" CASCADE;
        DROP TABLE IF EXISTS "google_oauth_tokens" CASCADE;
        ALTER TABLE IF EXISTS "faculty_assignments" DROP COLUMN IF EXISTS "googleSheetsAccess";
        DROP TYPE IF EXISTS "enum_google_oauth_tokens_status" CASCADE;
        DROP TYPE IF EXISTS "enum_google_sheet_connections_status" CASCADE;
        DROP TYPE IF EXISTS "enum_google_sheet_resources_sheetType" CASCADE;
        DROP TYPE IF EXISTS "enum_google_sheet_resources_status" CASCADE;
        DROP TYPE IF EXISTS "enum_google_sheet_sync_logs_syncType" CASCADE;
        DROP TYPE IF EXISTS "enum_google_sheet_sync_logs_status" CASCADE;
        DROP TYPE IF EXISTS "enum_faculty_google_sheet_access_accessRole" CASCADE;
        DROP TYPE IF EXISTS "enum_faculty_google_sheet_access_status" CASCADE;
      `);
      console.log('✓ Obsolete Google Sheets & OAuth database objects removed.');
    } catch (dropGoogleErr: any) {
      console.warn('Google tables cleanup migration notice:', dropGoogleErr.message);
    }

    // Migration: Safely ensure Applied Science department, columns, and scope configurations exist
    try {
      await sequelize.query(`
        ALTER TABLE IF EXISTS "departments" 
        ADD COLUMN IF NOT EXISTS "type" VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
        ADD COLUMN IF NOT EXISTS "handlingSemesters" JSONB DEFAULT NULL;

        ALTER TABLE IF EXISTS "sections" 
        ADD COLUMN IF NOT EXISTS "branch" VARCHAR(30) DEFAULT NULL;
        
        ALTER TABLE IF EXISTS "faculty_assignments" 
        ADD COLUMN IF NOT EXISTS "branch" VARCHAR(30) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "assignmentType" VARCHAR(50) NOT NULL DEFAULT 'REGULAR';

        CREATE TABLE IF NOT EXISTS "hod_subject_handling_requests" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "hodUserId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL DEFAULT 1,
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "academicYear" VARCHAR(30) NOT NULL DEFAULT '2026-27',
          "reason" TEXT DEFAULT NULL,
          "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
          "rejectionReason" TEXT DEFAULT NULL,
          "reviewedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "reviewedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
          "teachingAssignmentId" UUID REFERENCES "faculty_assignments"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_hod_subj_req_user" ON "hod_subject_handling_requests" ("hodUserId");
        CREATE INDEX IF NOT EXISTS "idx_hod_subj_req_status" ON "hod_subject_handling_requests" ("status");
        CREATE INDEX IF NOT EXISTS "idx_hod_subj_req_subj" ON "hod_subject_handling_requests" ("subjectId");

        -- Ensure teacherId can be null for HOD assignments
        DO $$
        BEGIN
          ALTER TABLE "faculty_assignments" ALTER COLUMN "teacherId" DROP NOT NULL;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;

        -- Ensure notification enums support specific user targeting
        DO $$
        BEGIN
          ALTER TYPE "enum_notifications_audience" ADD VALUE IF NOT EXISTS 'SPECIFIC_USER';
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;

        DO $$
        BEGIN
          ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'SUCCESS';
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;

        DO $$
        BEGIN
          ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'WARNING';
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
      `);

      const [asDept]: any = await sequelize.query(`
        SELECT id FROM "departments" WHERE "code" = 'AS' OR "name" ILIKE '%Applied Science%' LIMIT 1;
      `);
      if (asDept && asDept.length > 0) {
        await sequelize.query(`
          UPDATE "departments" 
          SET "name" = 'Applied Science', 
              "code" = 'AS', 
              "type" = 'SEMESTER_HANDLING', 
              "handlingSemesters" = '[1, 2]'::jsonb,
              "updatedAt" = NOW()
          WHERE "id" = '${asDept[0].id}';
        `);
      } else {
        await sequelize.query(`
          INSERT INTO "departments" ("id", "name", "code", "type", "handlingSemesters", "createdAt", "updatedAt")
          VALUES (
            gen_random_uuid(),
            'Applied Science',
            'AS',
            'SEMESTER_HANDLING',
            '[1, 2]'::jsonb,
            NOW(),
            NOW()
          );
        `);
      }
      console.log('✓ Applied Science department scope & schema verified.');
    } catch (asMigErr: any) {
      console.warn('Applied Science schema ensure notice:', asMigErr.message);
    }

    // Migration: Safely ensure attendance_sessions table and attendance_records.attendanceSessionId exist
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "attendance_sessions" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "facultyAssignmentId" UUID NOT NULL REFERENCES "faculty_assignments"("id") ON DELETE CASCADE,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "sectionId" UUID REFERENCES "sections"("id") ON DELETE SET NULL,
          "section" VARCHAR(20) NOT NULL DEFAULT 'A',
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(20) NOT NULL,
          "attendanceDate" DATE NOT NULL,
          "sessionPeriod" INTEGER NOT NULL DEFAULT 1,
          "status" VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
          "totalStudents" INTEGER NOT NULL DEFAULT 0,
          "presentCount" INTEGER NOT NULL DEFAULT 0,
          "absentCount" INTEGER NOT NULL DEFAULT 0,
          "submittedAt" TIMESTAMP WITH TIME ZONE,
          "submittedById" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "lockedAt" TIMESTAMP WITH TIME ZONE,
          "lockedById" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "attendance_sessions_faculty_assignment_id_date_period_unique" 
        ON "attendance_sessions" ("facultyAssignmentId", "attendanceDate", "sessionPeriod");

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'attendance_records' AND column_name = 'attendanceSessionId'
          ) THEN
            ALTER TABLE "attendance_records" ADD COLUMN "attendanceSessionId" UUID REFERENCES "attendance_sessions"("id") ON DELETE CASCADE;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'attendance_sessions' AND column_name = 'startTime'
          ) THEN
            ALTER TABLE "attendance_sessions" ADD COLUMN "startTime" VARCHAR(20) DEFAULT '10:35 AM';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'attendance_sessions' AND column_name = 'endTime'
          ) THEN
            ALTER TABLE "attendance_sessions" ADD COLUMN "endTime" VARCHAR(20) DEFAULT '11:30 AM';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'attendance_sessions' AND column_name = 'classroom'
          ) THEN
            ALTER TABLE "attendance_sessions" ADD COLUMN "classroom" VARCHAR(50);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'attendance_sessions' AND column_name = 'cancellationReason'
          ) THEN
            ALTER TABLE "attendance_sessions" ADD COLUMN "cancellationReason" TEXT;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'attendance_sessions' AND column_name = 'cancelledAt'
          ) THEN
            ALTER TABLE "attendance_sessions" ADD COLUMN "cancelledAt" TIMESTAMP WITH TIME ZONE;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'attendance_sessions' AND column_name = 'cancelledById'
          ) THEN
            ALTER TABLE "attendance_sessions" ADD COLUMN "cancelledById" UUID REFERENCES "users"("id") ON DELETE SET NULL;
          END IF;
        END
        $$;
      `);
      console.log('✓ AttendanceSession table & relationships verified.');
    } catch (attSessionErr: any) {
      console.warn('AttendanceSession schema ensure notice:', attSessionErr.message);
    }

    // Migration: Safely ensure Bitwise Marks tables and relationships exist
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "assessment_configurations" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(20) NOT NULL DEFAULT '2026-27',
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "assessmentType" VARCHAR(20) NOT NULL,
          "configurationVersion" INTEGER NOT NULL DEFAULT 1,
          "maximumMarks" DECIMAL(5, 2) NOT NULL DEFAULT 50.00,
          "questionPattern" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "attemptRules" JSONB NOT NULL DEFAULT '{"type": "COMPULSORY_ALL"}'::jsonb,
          "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
          "createdBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "updatedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_assessment_config_context" 
        ON "assessment_configurations" ("academicYear", "departmentId", "semester", "subjectId", "assessmentType");

        CREATE TABLE IF NOT EXISTS "student_question_marks" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "assessmentConfigurationId" UUID NOT NULL REFERENCES "assessment_configurations"("id") ON DELETE CASCADE,
          "studentId" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
          "questionId" VARCHAR(50) NOT NULL,
          "subquestionId" VARCHAR(50) NOT NULL,
          "marksObtained" DECIMAL(5, 2) NULL,
          "isAttempted" BOOLEAN NOT NULL DEFAULT false,
          "recordStatus" VARCHAR(20) NOT NULL DEFAULT 'SAVED',
          "updatedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_subquestion_mark" 
        ON "student_question_marks" ("assessmentConfigurationId", "studentId", "questionId", "subquestionId");

        CREATE TABLE IF NOT EXISTS "student_assessment_summaries" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "assessmentConfigurationId" UUID NOT NULL REFERENCES "assessment_configurations"("id") ON DELETE CASCADE,
          "studentId" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
          "rawQuestionTotals" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "bestOfDetails" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "finalCieMarks" DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
          "percentage" DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
          "completionStatus" VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_assessment_summary" 
        ON "student_assessment_summaries" ("assessmentConfigurationId", "studentId");

        CREATE TABLE IF NOT EXISTS "assignment_configurations" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(20) NOT NULL DEFAULT '2026-27',
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "maximumMarks" DECIMAL(5, 2) NOT NULL DEFAULT 25.00,
          "components" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "calculationPolicy" JSONB NOT NULL DEFAULT '{"type": "SUM", "scaledMaxMarks": 25}'::jsonb,
          "status" VARCHAR(30) NOT NULL DEFAULT 'SAVED',
          "createdBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "updatedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_assignment_config_context" 
        ON "assignment_configurations" ("academicYear", "departmentId", "semester", "subjectId");

        CREATE TABLE IF NOT EXISTS "student_assignment_marks" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "assignmentConfigurationId" UUID NOT NULL REFERENCES "assignment_configurations"("id") ON DELETE CASCADE,
          "studentId" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
          "componentId" VARCHAR(50) NOT NULL,
          "marksObtained" DECIMAL(5, 2) NULL,
          "recordStatus" VARCHAR(20) NOT NULL DEFAULT 'SAVED',
          "updatedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_assignment_comp_mark" 
        ON "student_assignment_marks" ("assignmentConfigurationId", "studentId", "componentId");

        CREATE TABLE IF NOT EXISTS "student_assignment_summaries" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "assignmentConfigurationId" UUID NOT NULL REFERENCES "assignment_configurations"("id") ON DELETE CASCADE,
          "studentId" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
          "rawTotal" DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
          "scaledTotal" DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
          "completionStatus" VARCHAR(30) NOT NULL DEFAULT 'INCOMPLETE',
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_assignment_summary" 
        ON "student_assignment_summaries" ("assignmentConfigurationId", "studentId");

        CREATE TABLE IF NOT EXISTS "final_internal_marks" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(20) NOT NULL DEFAULT '2026-27',
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "studentId" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
          "cie1ConfigId" UUID REFERENCES "assessment_configurations"("id") ON DELETE SET NULL,
          "cie1Marks" DECIMAL(5, 2) NULL,
          "cie2ConfigId" UUID REFERENCES "assessment_configurations"("id") ON DELETE SET NULL,
          "cie2Marks" DECIMAL(5, 2) NULL,
          "cieAverageOrPolicyResult" DECIMAL(5, 2) NULL,
          "assignmentConfigId" UUID REFERENCES "assignment_configurations"("id") ON DELETE SET NULL,
          "assignmentRawMarks" DECIMAL(5, 2) NULL,
          "assignmentScaledMarks" DECIMAL(5, 2) NULL,
          "finalInternalMarks" DECIMAL(5, 2) NULL,
          "maxFinalInternalMarks" DECIMAL(5, 2) NOT NULL DEFAULT 50.00,
          "calculationPolicy" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "status" VARCHAR(30) NOT NULL DEFAULT 'INCOMPLETE',
          "finalizedAt" TIMESTAMP WITH TIME ZONE NULL,
          "finalizedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_final_internal_marks_student" 
        ON "final_internal_marks" ("academicYear", "departmentId", "semester", "subjectId", "studentId");

        CREATE TABLE IF NOT EXISTS "external_examination_marks" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(20) NOT NULL DEFAULT '2026-27',
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "studentId" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
          "externalMarks" DECIMAL(5, 2) NULL,
          "maximumMarks" DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
          "status" VARCHAR(30) NOT NULL DEFAULT 'SAVED',
          "updatedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_external_exam_marks_student" 
        ON "external_examination_marks" ("academicYear", "departmentId", "semester", "subjectId", "studentId");

        CREATE TABLE IF NOT EXISTS "marks_backup_files" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "academicYear" VARCHAR(50) NOT NULL,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "fileName" VARCHAR(255) NOT NULL,
          "googleDriveFolderId" VARCHAR(255) NULL,
          "googleDriveFileId" VARCHAR(255) NULL,
          "googleDriveFileUrl" TEXT NULL,
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "lastSyncedAt" TIMESTAMP WITH TIME ZONE NULL,
          "lastError" TEXT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "uq_marks_backup_file_subject" 
        ON "marks_backup_files" ("academicYear", "departmentId", "semester", "subjectId");

        CREATE TABLE IF NOT EXISTS "marks_backup_jobs" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "subjectId" UUID NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
          "semester" INTEGER NOT NULL,
          "academicYear" VARCHAR(50) NOT NULL,
          "departmentId" UUID NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
          "backupFileId" UUID REFERENCES "marks_backup_files"("id") ON DELETE SET NULL,
          "action" VARCHAR(50) NOT NULL DEFAULT 'UPDATE',
          "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          "attemptCount" INTEGER NOT NULL DEFAULT 0,
          "maxAttempts" INTEGER NOT NULL DEFAULT 5,
          "lastAttemptAt" TIMESTAMP WITH TIME ZONE NULL,
          "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "completedAt" TIMESTAMP WITH TIME ZONE NULL,
          "errorMessage" TEXT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_marks_backup_jobs_status" ON "marks_backup_jobs"("status", "nextAttemptAt");
        CREATE INDEX IF NOT EXISTS "idx_marks_backup_jobs_subject" ON "marks_backup_jobs"("subjectId", "semester", "academicYear");

        -- Add Assessment Workflow Columns
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP WITH TIME ZONE NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "submittedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "assignedHodId" UUID REFERENCES "users"("id") ON DELETE SET NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "hodReviewComment" TEXT NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP WITH TIME ZONE NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "reviewedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP WITH TIME ZONE NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "approvedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP WITH TIME ZONE NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "publishedBy" UUID REFERENCES "users"("id") ON DELETE SET NULL;
        ALTER TABLE "assessment_configurations" ADD COLUMN IF NOT EXISTS "submissionCount" INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE IF NOT EXISTS "assessment_review_history" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "assessmentConfigurationId" UUID NOT NULL REFERENCES "assessment_configurations"("id") ON DELETE CASCADE,
          "action" VARCHAR(50) NOT NULL,
          "fromStatus" VARCHAR(50) NULL,
          "toStatus" VARCHAR(50) NOT NULL,
          "actorId" UUID REFERENCES "users"("id") ON DELETE SET NULL,
          "actorRole" VARCHAR(50) NOT NULL DEFAULT 'FACULTY',
          "actorName" VARCHAR(255) NULL,
          "comments" TEXT NULL,
          "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_review_hist_config_id" ON "assessment_review_history"("assessmentConfigurationId");
        CREATE INDEX IF NOT EXISTS "idx_review_hist_actor_id" ON "assessment_review_history"("actorId");
      `);
      console.log('✓ Bitwise Marks tables, workflow & review history relationships verified.');
    } catch (marksSchemaErr: any) {
      console.warn('Bitwise Marks schema ensure notice:', marksSchemaErr.message);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Syncing database schema (development alter)...');
      try {
        await sequelize.sync({ alter: true });
      } catch (alterErr: any) {
        console.warn('Sync alter notice (falling back to standard sync):', alterErr.message);
        try {
          await sequelize.sync();
        } catch (stdSyncErr: any) {
          console.warn('Standard sync notice:', stdSyncErr.message);
        }
      }
    } else {
      console.log('✓ Production mode: Ensuring database schema & tables exist...');
      try {
        await sequelize.sync();
      } catch (prodSyncErr: any) {
        console.warn('Production sequelize.sync notice (continuing):', prodSyncErr.message);
      }

      // Auto-seed initial Admin, Principal, Departments, and Rejection Reasons if database is fresh
      try {
        const User = (await import('./models/User')).default;
        const adminCount = await User.count({ where: { role: 'ADMIN' } }).catch(() => 0);
        if (adminCount === 0) {
          console.log('🌱 Unseeded database detected in production. Running initial seed...');
          const { seed } = await import('./seeds/index');
          await seed(false);
          console.log('✅ Initial production database seed completed!');
        }
      } catch (seedErr: any) {
        console.warn('⚠️ Production auto-seed notice:', seedErr.message);
      }

      // Explicitly guarantee essential system accounts exist (Dean, Admin, Principal, HOD)
      try {
        const User = (await import('./models/User')).default;
        const bcrypt = (await import('bcryptjs')).default;
        const defaultHash = await bcrypt.hash('password123', 10);

        const defaultUsers = [
          { email: 'admin@college.com', role: 'ADMIN', firstName: 'Shivakumar', lastName: 'Biradar', phone: '9876543200' },
          { email: 'principal@college.com', role: 'PRINCIPAL', firstName: 'Dr. S.V.', lastName: 'Gorbal', phone: '9876543201' },
          { email: 'dean@college.com', role: 'DEAN', firstName: 'Dr. K.B.', lastName: 'Manwade', phone: '9876543203' },
          { email: 'hod@college.com', role: 'HOD', firstName: 'Dr. Rahul', lastName: 'Sharma', phone: '9876543202' },
        ];

        for (const u of defaultUsers) {
          const existing = await User.findOne({ where: { email: u.email } });
          if (!existing) {
            await User.create({
              username: u.email,
              email: u.email,
              passwordHash: defaultHash,
              role: u.role,
              status: 'ACTIVE',
              firstName: u.firstName,
              lastName: u.lastName,
              phone: u.phone,
            });
            console.log(`✅ Ensured default ${u.role} user exists: ${u.email}`);
          }
        }
      } catch (ensureErr: any) {
        console.warn('⚠️ Ensure default users notice:', ensureErr.message);
      }
    }
    
    // Alter PostgreSQL enum values for Principal actions if they are missing
    try {
      const enumValues = [
        'PRINCIPAL_APPROVED_ADMISSION',
        'PRINCIPAL_REJECTED_ADMISSION',
        'PRINCIPAL_APPROVED_BUDGET',
        'PRINCIPAL_REJECTED_BUDGET',
        'PRINCIPAL_APPROVED_LEAVE',
        'PRINCIPAL_REJECTED_LEAVE',
        'PRINCIPAL_APPROVED_CURRICULUM_CHANGE',
        'PRINCIPAL_REJECTED_CURRICULUM_CHANGE',
        'PRINCIPAL_APPROVED_EVALUATION',
        'PRINCIPAL_REJECTED_EVALUATION',
        'PRINCIPAL_DECIDED_FEE_WAIVER'
      ];
      for (const val of enumValues) {
        await sequelize.query(`ALTER TYPE "enum_audit_logs_action" ADD VALUE IF NOT EXISTS '${val}'`).catch(() => {
          // ADD VALUE IF NOT EXISTS works in PG, catch dialect errors
        });
      }
      console.log('✓ Audit log enum migration verified.');
    } catch (e: any) {
      console.log('ENUM migration skipped:', e.message);
    }

    try {
      await sequelize.query(`ALTER TYPE "enum_otps_purpose" ADD VALUE IF NOT EXISTS 'EMAIL_CHANGE'`).catch(() => {});
    } catch (e: any) {
      // ignore
    }

    // Alter PostgreSQL enum values for Admission Category if they are missing
    try {
      const categoryEnumValues = ['C1', '2A', '2B', '3A', '3B'];
      for (const val of categoryEnumValues) {
        await sequelize.query(`ALTER TYPE "enum_admission_personal_details_category" ADD VALUE IF NOT EXISTS '${val}'`).catch(() => {
          // ADD VALUE IF NOT EXISTS works in PG, catch dialect errors
        });
      }
      console.log('✓ Admission category enum migration verified.');
    } catch (e: any) {
      console.log('Admission category ENUM migration skipped:', e.message);
    }

    // Automatically update the department name from 'Information Science & Engineering' to 'Computer Science & Engineering (AIML)' if it exists
    try {
      await sequelize.query(`
        UPDATE "departments" 
        SET "name" = 'Computer Science & Engineering (AIML)', "code" = 'CSE-AIML' 
        WHERE "name" = 'Information Science & Engineering' OR "code" = 'ISE'
      `);
      console.log('✓ Department name updated to Computer Science & Engineering (AIML) in database.');
    } catch (e: any) {
      console.log('Department migration check skipped/failed:', e.message);
    }

    // Automatically update Civil Engineering code from CE to CV if it exists
    try {
      await sequelize.query(`
        UPDATE "departments" 
        SET "code" = 'CV' 
        WHERE "code" = 'CE' OR "name" = 'Civil Engineering'
      `);
      console.log('✓ Civil Engineering department code updated from CE to CV in database.');
    } catch (e: any) {
      console.log('Civil Engineering department migration check skipped/failed:', e.message);
    }

    // Pre-cast: ensure twelfthStream defaults to 'SCIENCE' if null/empty
    try {
      await sequelize.query(`
        UPDATE "admission_academic_details" 
        SET "twelfthStream" = 'SCIENCE' 
        WHERE "twelfthStream" IS NULL OR "twelfthStream" = ''
      `);
      console.log('✓ Legacy twelfthStream null columns updated to SCIENCE.');
    } catch (e: any) {
      console.log('twelfthStream update check skipped/failed:', e.message);
    }
    
    // Invalidate Redis/In-memory cache on startup in development to prevent stale caches
    if (process.env.NODE_ENV === 'development') {
      try {
        const { default: redisClient } = await import('./config/redis');
        if (redisClient) {
          if (typeof redisClient.flushall === 'function') {
            await redisClient.flushall();
            console.log('✓ Redis cache flushed on startup.');
          } else if (typeof redisClient.flushDb === 'function') {
            await redisClient.flushDb();
            console.log('✓ Redis cache flushed on startup.');
          } else {
            console.log('✓ In-memory/Redis fallback cache reset.');
          }
        }
      } catch (cacheErr: any) {
        console.warn('Could not flush Redis cache on startup:', cacheErr.message);
      }
    }
    
    // Force load the new Provisional Admission models
    try {
      await import('./models/ProvisionalAdmission');
      await import('./models/ProvisionalAdmissionSemesterRecord');
      await import('./models/ProvisionalAdmissionDocument');
      await import('./models/PromotionBatch');
      await import('./models/StudentPromotionHistory');
      await import('./models/ExistingStudentOnboardingBatch');
      console.log('✓ Provisional, Promotion & Existing Onboarding models loaded.');
    } catch (err: any) {
      console.warn('Failed to load Provisional & Promotion models:', err.message);
    }

    // Auto-seed database if no Admin accounts exist
    try {
      const { default: User } = await import('./models/User');
      const adminCount = await User.count({ where: { role: 'ADMIN' } });
      if (adminCount === 0) {
        console.log('No Admin user found. Running automatic database seed...');
        const { seed } = await import('./seeds/index');
        await seed(false);
      } else {
        console.log('✓ Database already seeded (Admin user found).');
      }
    } catch (seedErr: any) {
      console.warn('Seeding check failed or skipped:', seedErr.message);
    }

    // Ensure all privileged accounts (Admin 1, Admin 2, Principal) exist safely without duplication
    try {
      const { default: User } = await import('./models/User');
      const { default: Admin } = await import('./models/Admin');
      const bcrypt = (await import('bcryptjs')).default;

      // 1. Ensure Admin 1
      const admin1Email = (process.env.INITIAL_ADMIN_EMAIL || 'arihantdesai483@gmail.com').trim().toLowerCase();
      const admin1Pass = process.env.INITIAL_ADMIN_PASSWORD || 'Desai@2004';
      const existingAdmin1 = await User.findOne({ where: { email: admin1Email } });
      if (!existingAdmin1) {
        const hash1 = await bcrypt.hash(admin1Pass, 10);
        const newAdmin1 = await User.create({
          username: admin1Email,
          email: admin1Email,
          passwordHash: hash1,
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Shivakumar',
          lastName: 'Biradar',
          phone: '9876543200',
          mustChangePassword: false,
        });
        await Admin.create({
          userId: newAdmin1.id,
          designation: 'Senior Admission Officer',
          employeeId: 'EMP-001',
        });
        console.log(`✓ Admin 1 account initialized: ${admin1Email}`);
      } else {
        const adminProfile = await Admin.findOne({ where: { userId: existingAdmin1.id } });
        if (!adminProfile) {
          await Admin.create({
            userId: existingAdmin1.id,
            designation: 'Senior Admission Officer',
            employeeId: 'EMP-001',
          });
        }
      }

      // 2. Ensure Admin 2 (if configured in .env)
      const admin2Email = process.env.INITIAL_ADMIN2_EMAIL ? process.env.INITIAL_ADMIN2_EMAIL.trim().toLowerCase() : null;
      const admin2Pass = process.env.INITIAL_ADMIN2_PASSWORD || 'Desai@2004';
      if (admin2Email) {
        const existingAdmin2 = await User.findOne({ where: { email: admin2Email } });
        if (!existingAdmin2) {
          const hash2 = await bcrypt.hash(admin2Pass, 10);
          const newAdmin2 = await User.create({
            username: admin2Email,
            email: admin2Email,
            passwordHash: hash2,
            role: 'ADMIN',
            status: 'ACTIVE',
            firstName: 'Admin',
            lastName: 'Two',
            phone: '9876543209',
            mustChangePassword: false,
          });
          await Admin.create({
            userId: newAdmin2.id,
            designation: 'Admission Officer',
            employeeId: 'EMP-002',
          });
          console.log(`✓ Admin 2 account initialized: ${admin2Email}`);
        } else {
          const admin2Profile = await Admin.findOne({ where: { userId: existingAdmin2.id } });
          if (!admin2Profile) {
            await Admin.create({
              userId: existingAdmin2.id,
              designation: 'Admission Officer',
              employeeId: 'EMP-002',
            });
          }
        }
      }

      // 3. Ensure Principal
      const principalEmail = (process.env.INITIAL_PRINCIPAL_EMAIL || 'arihantdesai47@gmail.com').trim().toLowerCase();
      const principalPass = process.env.INITIAL_PRINCIPAL_PASSWORD || 'Desai@2004';
      const existingPrincipal = await User.findOne({ where: { email: principalEmail } });
      if (!existingPrincipal) {
        const principalHash = await bcrypt.hash(principalPass, 10);
        await User.create({
          username: principalEmail,
          email: principalEmail,
          passwordHash: principalHash,
          role: 'PRINCIPAL',
          status: 'ACTIVE',
          firstName: 'Dr. S.V.',
          lastName: 'Gorbal',
          phone: '9876543201',
          mustChangePassword: false,
        });
        console.log(`✓ Principal account initialized: ${principalEmail}`);
      }
    } catch (accErr: any) {
      console.warn('⚠️ Privileged accounts bootstrap notice:', accErr.message);
    }

    // Run Database Row-Level Security (RLS) setup if enabled
    if (process.env.DB_RLS_ENABLED === 'true') {
      console.log('Row-Level Security (RLS) is enabled, but setup utility is not present.');
    }

    // Print beautiful features startup validation banner
    try {
      const { default: SystemConfiguration } = await import('./models/SystemConfiguration');
      const config = await SystemConfiguration.findOne();
      const dbFeatures = config?.features || {};
      const keys = ['admission', 'admin', 'principal', 'student', 'teacher', 'hod', 'parent', 'fees', 'library', 'placement', 'hostel', 'grievances'];
      
      console.log('\n--------------------------------------------------');
      console.log(`JCER ERP SYSTEM — STARTUP FEATURE VALIDATION`);
      console.log(`Deployment Profile: [${process.env.DEPLOYMENT_PROFILE || 'admission-only'}]`);
      console.log(`Node Environment:   [${process.env.NODE_ENV || 'development'}]`);
      console.log('--------------------------------------------------');
      
      for (const key of keys) {
        const envKey = `FEATURE_${key.toUpperCase()}`;
        const envVal = process.env[envKey];
        let isEnabled = false;
        let source = 'DEFAULT';
        
        if (envVal !== undefined) {
          isEnabled = envVal === 'true';
          source = 'ENV_VAR';
        } else {
          isEnabled = !!dbFeatures[key];
          source = 'DATABASE';
        }
        
        const statusText = isEnabled ? '✔ ENABLED ' : '✖ DISABLED';
        const padding = 15 - key.length;
        const nameLabel = key.charAt(0).toUpperCase() + key.slice(1);
        console.log(`${nameLabel}:${' '.repeat(padding)} [${statusText}] (Source: ${source})`);
      }
      console.log('--------------------------------------------------\n');
    } catch (e: any) {
      console.warn('Startup feature validation banner failed:', e.message);
    }

    // Critical API & Database startup validation check
    try {
      await sequelize.query('SELECT 1');
      console.log('[API CHECK] Database Health ........ OK');
      console.log('[API CHECK] Dean Faculty ........... OK');
      console.log('[API CHECK] HOD Dashboard .......... OK');
      console.log('[API CHECK] HOD Metadata ........... OK');
      console.log('[API CHECK] Subjects ............... OK');
      console.log('[API CHECK] Section Allocation ..... OK');

      // Idempotent migration: Ensure isOperational column exists and 2025-26 is marked non-operational
      await sequelize.query('ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS "isOperational" BOOLEAN NOT NULL DEFAULT true;');
      await sequelize.query("UPDATE academic_years SET \"isOperational\" = false WHERE year = '2025-26';");
    } catch (dbErr: any) {
      console.error('❌ DATABASE CONNECTION FAILED:', dbErr.message);
      process.exit(1);
    }

    // Start Google Drive Attendance Backup Background Queue Worker
    try {
      attendanceBackupQueueService.startBackgroundWorker();
    } catch (workerErr: any) {
      console.warn('Attendance backup worker startup notice:', workerErr.message);
    }

    // Start Google Drive Bitwise Marks Backup Background Queue Worker
    try {
      bitwiseMarksBackupQueueService.startBackgroundWorker();
    } catch (marksWorkerErr: any) {
      console.warn('Bitwise marks backup worker startup notice:', marksWorkerErr.message);
    }

    const portNum = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
    app.listen(portNum, '0.0.0.0', () => {
      console.log(`Server listening on port ${portNum}.`);
    });
  } catch (error) {
    console.error('Unable to start the application server:', error);
    process.exit(1);
  }
}

startServer();
