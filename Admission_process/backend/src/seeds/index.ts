import bcrypt from 'bcryptjs';
import sequelize from '../config/database';
import User from '../models/User';
import Department from '../models/Department';
import Subject from '../models/Subject';
import Teacher from '../models/Teacher';
import Admin from '../models/Admin';
import RejectionReason from '../models/RejectionReason';
import HOD from '../models/HOD';
import AcademicYear from '../models/AcademicYear';
import Semester from '../models/Semester';
import Section from '../models/Section';
import HODAssignmentHistory from '../models/HODAssignmentHistory';
import FacultyAuthorizationRequest from '../models/FacultyAuthorizationRequest';
import FacultyAssignment from '../models/FacultyAssignment';

export async function seed(exitOnComplete = false) {
  try {
    console.log('Initiating database schema sync...');
    await sequelize.sync();
    console.log('Database synced. Starting seed...');

    // ─── 1. Academic Years ──────────────────────────────────────────────────
    await AcademicYear.findOrCreate({
      where: { year: '2026-27' },
      defaults: {
        year: '2026-27',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2027-06-30'),
        status: 'ACTIVE',
        isCurrent: true,
      },
    });

    await AcademicYear.findOrCreate({
      where: { year: '2025-26' },
      defaults: {
        year: '2025-26',
        startDate: new Date('2025-07-01'),
        endDate: new Date('2026-06-30'),
        status: 'ARCHIVED',
        isCurrent: false,
      },
    });

    await AcademicYear.findOrCreate({
      where: { year: '2027-28' },
      defaults: {
        year: '2027-28',
        startDate: new Date('2027-07-01'),
        endDate: new Date('2028-06-30'),
        status: 'UPCOMING',
        isCurrent: false,
      },
    });
    console.log('✓ Academic Years created.');

    // ─── 2. Departments (Branches) ─────────────────────────────────────────
    const departmentsData = [
      { name: 'Computer Science & Engineering', code: 'CSE' },
      { name: 'Electronics & Communication Engineering', code: 'ECE' },
      { name: 'Mechanical Engineering', code: 'ME' },
      { name: 'Civil Engineering', code: 'CV' },
      { name: 'Computer Science & Engineering (AIML)', code: 'CSE-AIML' },
    ];

    for (const d of departmentsData) {
      await Department.findOrCreate({ where: { code: d.code }, defaults: d });
    }

    const depts = await Department.findAll();
    const cse = depts.find(d => d.code === 'CSE') || depts[0];
    const ece = depts.find(d => d.code === 'ECE') || depts[1];
    console.log('✓ Departments created.');

    // ─── 3. Semesters (2026-27) ─────────────────────────────────────────────
    const semestersList = [
      { num: 1, name: '1st Semester', start: '2026-08-01', end: '2026-12-31' },
      { num: 2, name: '2nd Semester', start: '2027-01-15', end: '2027-05-31' },
      { num: 3, name: '3rd Semester', start: '2026-08-01', end: '2026-12-31' },
      { num: 4, name: '4th Semester', start: '2027-01-15', end: '2027-05-31' },
      { num: 5, name: '5th Semester', start: '2026-08-01', end: '2026-12-31' },
      { num: 6, name: '6th Semester', start: '2027-01-15', end: '2027-05-31' },
      { num: 7, name: '7th Semester', start: '2026-08-01', end: '2026-12-31' },
      { num: 8, name: '8th Semester', start: '2027-01-15', end: '2027-05-31' },
    ];

    for (const s of semestersList) {
      await Semester.findOrCreate({
        where: { academicYear: '2026-27', semesterNumber: s.num },
        defaults: {
          academicYear: '2026-27',
          semesterNumber: s.num,
          semesterName: s.name,
          startDate: new Date(s.start),
          endDate: new Date(s.end),
          status: s.num % 2 !== 0 ? 'ACTIVE' : 'UPCOMING',
        },
      });
    }
    console.log('✓ Semesters created.');

    // ─── 4. Sections ────────────────────────────────────────────────────────
    // Sections are intentionally created on-demand by HODs per semester/department
    console.log('✓ Sections ready for HOD creation.');

    // ─── 5. Rejection Reasons ──────────────────────────────────────────────
    const reasons = [
      { code: 'DOC_NOT_VERIFIED', label: 'Documents Not Verified', description: 'Uploaded documents are missing or invalid' },
      { code: 'INCOMPLETE_DOCUMENTS', label: 'Incomplete Documents', description: 'Some mandatory documents were not uploaded' },
      { code: 'FEES_NOT_PAID', label: 'Fees Not Paid', description: 'Admission or application fees have not been paid' },
      { code: 'ELIGIBILITY_FAILED', label: 'Eligibility Criteria Not Met', description: 'Candidate does not satisfy the academic eligibility criteria' },
      { code: 'INVALID_CERTIFICATES', label: 'Invalid / Mismatched Certificates', description: 'Certificates provided contain mismatched details or invalid verification details' },
      { code: 'DUPLICATE_APPLICATION', label: 'Duplicate Application Found', description: 'A duplicate admission application has been registered for this candidate' },
      { code: 'AADHAAR_MISMATCH', label: 'Aadhaar Verification Failed', description: 'Aadhaar details could not be verified' },
      { code: 'USN_CONFLICT', label: 'USN Conflict / Already Exists', description: 'University Seat Number conflicts with an existing registration' },
      { code: 'OTHER', label: 'Other', description: 'Other rejection reason (additional comments provided in remarks)' },
    ];
    for (const r of reasons) {
      await RejectionReason.findOrCreate({ where: { code: r.code }, defaults: r });
    }
    console.log('✓ Rejection Reasons created.');

    // ─── 6. Subjects ───────────────────────────────────────────────────────
    const subjectsData = [
      { name: 'Database Management Systems', code: 'CS301', semester: 3, departmentId: cse.id, credits: 4, type: 'Theory' },
      { name: 'Data Structures & Algorithms', code: 'CS302', semester: 3, departmentId: cse.id, credits: 4, type: 'Theory' },
      { name: 'Operating Systems', code: 'CS304', semester: 3, departmentId: cse.id, credits: 4, type: 'Theory' },
      { name: 'Computer Networks', code: 'CS303', semester: 3, departmentId: cse.id, credits: 4, type: 'Theory' },
      { name: 'Discrete Mathematics', code: 'CS305', semester: 3, departmentId: cse.id, credits: 3, type: 'Theory' },
      { name: 'Big Data Analytics', code: 'CS501', semester: 5, departmentId: cse.id, credits: 4, type: 'Theory' },
      { name: 'Artificial Intelligence & ML', code: 'CS502', semester: 5, departmentId: cse.id, credits: 4, type: 'Theory' },
      { name: 'Cloud Computing Architecture', code: 'CS503', semester: 5, departmentId: cse.id, credits: 3, type: 'Theory' },
      { name: 'Database Systems Laboratory', code: 'CSL306', semester: 3, departmentId: cse.id, credits: 2, type: 'Practical' },
      { name: 'Big Data Analytics Lab', code: 'CSL504', semester: 5, departmentId: cse.id, credits: 2, type: 'Practical' },
      { name: 'Internet of Things Elective', code: 'CSE505', semester: 5, departmentId: cse.id, credits: 3, type: 'Elective' },
      { name: 'Digital Signal Processing', code: 'EC501', semester: 5, departmentId: ece.id, credits: 4, type: 'Theory' },
      { name: 'VLSI Design & Architecture', code: 'EC502', semester: 5, departmentId: ece.id, credits: 4, type: 'Theory' },
    ];

    for (const sub of subjectsData) {
      await Subject.findOrCreate({ where: { code: sub.code }, defaults: sub as any });
    }
    const allSubjects = await Subject.findAll();
    console.log('✓ Subjects created.');

    // ─── 7. Users (Admin, Principal, Dean, HOD, Teachers) ───────────────────
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@college.com';
    const adminPass = process.env.INITIAL_ADMIN_PASSWORD || 'password123';
    const adminHash = await bcrypt.hash(adminPass, 10);

    const principalEmail = process.env.INITIAL_PRINCIPAL_EMAIL || 'principal@college.com';
    const principalPass = process.env.INITIAL_PRINCIPAL_PASSWORD || 'password123';
    const principalHash = await bcrypt.hash(principalPass, 10);

    // Dean Academics (Real user)
    const deanEmail = process.env.DEAN_EMAIL || 'hodcse.erp@gmail.com';
    const deanPass = 'password123';
    const deanHash = await bcrypt.hash(deanPass, 10);

    const [adminUser] = await User.findOrCreate({
      where: { email: adminEmail },
      defaults: {
        username: adminEmail,
        email: adminEmail,
        passwordHash: adminHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        firstName: 'Shivakumar',
        lastName: 'Biradar',
        phone: '9876543200',
        profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&fit=crop',
      },
    });

    await User.findOrCreate({
      where: { email: principalEmail },
      defaults: {
        username: principalEmail,
        email: principalEmail,
        passwordHash: principalHash,
        role: 'PRINCIPAL',
        status: 'ACTIVE',
        firstName: 'Dr. S.V.',
        lastName: 'Gorbal',
        phone: '9876543201',
        profileImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&fit=crop',
      },
    });

    const [deanUser] = await User.findOrCreate({
      where: { email: deanEmail },
      defaults: {
        username: deanEmail,
        email: deanEmail,
        passwordHash: deanHash,
        role: 'DEAN',
        status: 'ACTIVE',
        firstName: 'Dr. K.B.',
        lastName: 'Manwade',
        phone: '9876543203',
        profileImage: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&fit=crop',
      },
    });

    // CyberAdmin (SignalSafe Campus integration)
    const cyberAdminEmail = (process.env.INITIAL_CYBERADMIN_EMAIL || '').trim().toLowerCase();
    const cyberAdminPass = process.env.INITIAL_CYBERADMIN_PASSWORD;
    if (cyberAdminEmail && cyberAdminPass) {
      const cyberAdminHash = await bcrypt.hash(cyberAdminPass, 10);
      await User.findOrCreate({
        where: { email: cyberAdminEmail },
        defaults: {
          username: cyberAdminEmail,
          email: cyberAdminEmail,
          passwordHash: cyberAdminHash,
          role: 'CYBERADMIN',
          status: 'ACTIVE',
          firstName: 'Cyber',
          lastName: 'Security Officer',
          phone: '9876543202',
          profileImage: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=200&fit=crop',
          mustChangePassword: false,
        },
      });
      console.log(`✓ CyberAdmin user seeded: ${cyberAdminEmail}`);
    }

    // HOD User
    const [hodUser] = await User.findOrCreate({
      where: { email: 'hod@college.com' },
      defaults: {
        username: 'hod1',
        email: 'hod@college.com',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'HOD',
        status: 'ACTIVE',
        firstName: 'Dr. Rahul',
        lastName: 'Sharma',
        phone: '9876543202',
        profileImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&fit=crop',
      },
    });

    // Active Teacher User
    const [teacherUser] = await User.findOrCreate({
      where: { email: 'teacher@college.com' },
      defaults: {
        username: 'teacher1',
        email: 'teacher@college.com',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'TEACHER',
        status: 'ACTIVE',
        firstName: 'Sarah',
        lastName: 'Smith',
        phone: '9876543299',
        profileImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&fit=crop',
      },
    });

    // Faculty pending request user
    const [pendingFacultyUser] = await User.findOrCreate({
      where: { email: 'faculty.rahul@college.com' },
      defaults: {
        username: 'faculty.rahul',
        email: 'faculty.rahul@college.com',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'TEACHER',
        status: 'INACTIVE',
        firstName: 'Rahul',
        lastName: 'Verma',
        phone: '9876543288',
        profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&fit=crop',
      },
    });

    // Another pending faculty
    const [pendingFacultyUser2] = await User.findOrCreate({
      where: { email: 'faculty.anita@college.com' },
      defaults: {
        username: 'faculty.anita',
        email: 'faculty.anita@college.com',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'TEACHER',
        status: 'INACTIVE',
        firstName: 'Anita',
        lastName: 'Deshmukh',
        phone: '9876543277',
        profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&fit=crop',
      },
    });

    console.log('✓ Users created.');

    // ─── 8. Profiles & Links ────────────────────────────────────────────────
    await Admin.findOrCreate({
      where: { userId: adminUser.id },
      defaults: {
        userId: adminUser.id,
        designation: 'Senior Admission Officer',
        employeeId: 'EMP-001',
      },
    });

    const [teacherRecord] = await Teacher.findOrCreate({
      where: { userId: teacherUser.id },
      defaults: {
        userId: teacherUser.id,
        departmentId: cse.id,
        designation: 'Associate Professor',
        joiningDate: new Date('2020-08-01'),
      },
    });

    const [hodRecord] = await HOD.findOrCreate({
      where: { userId: hodUser.id, departmentId: cse.id },
      defaults: {
        userId: hodUser.id,
        departmentId: cse.id,
        tenureStartDate: new Date('2022-01-01'),
        isActive: true,
        appointmentOrderNo: 'APP-HOD-2022-001',
        appointmentDate: new Date('2022-01-01'),
      },
    });

    // HOD Assignment History
    await HODAssignmentHistory.findOrCreate({
      where: { userId: hodUser.id, departmentId: cse.id, academicYear: '2026-27' },
      defaults: {
        hodId: hodRecord.id,
        userId: hodUser.id,
        departmentId: cse.id,
        academicYear: '2026-27',
        startDate: new Date('2026-07-01'),
        status: 'ACTIVE',
        assignedByUserId: deanUser.id,
      },
    });

    // Faculty Assignment for Sarah Smith
    const bigDataSubject = allSubjects.find(s => s.code === 'CS501') || allSubjects[0];
    if (bigDataSubject) {
      await FacultyAssignment.findOrCreate({
        where: { userId: teacherUser.id, subjectId: bigDataSubject.id },
        defaults: {
          teacherId: teacherRecord.id,
          userId: teacherUser.id,
          departmentId: cse.id,
          subjectId: bigDataSubject.id,
          semester: 5,
          section: 'Section A',
          academicYear: '2026-27',
          status: 'ACTIVE',
        },
      });
    }

    // Pending Faculty Authorization Requests for Dean review
    const aiSubject = allSubjects.find(s => s.code === 'CS502') || allSubjects[0];
    const cloudSubject = allSubjects.find(s => s.code === 'CS503') || allSubjects[0];

    await FacultyAuthorizationRequest.findOrCreate({
      where: { facultyUserId: pendingFacultyUser.id },
      defaults: {
        facultyUserId: pendingFacultyUser.id,
        departmentId: cse.id,
        subjectId: aiSubject ? aiSubject.id : null,
        semester: 5,
        section: 'Section A',
        academicYear: '2026-27',
        designation: 'Assistant Professor',
        createdByHODId: hodUser.id,
        authority: 'DEAN',
        status: 'PENDING',
      },
    });

    await FacultyAuthorizationRequest.findOrCreate({
      where: { facultyUserId: pendingFacultyUser2.id },
      defaults: {
        facultyUserId: pendingFacultyUser2.id,
        departmentId: cse.id,
        subjectId: cloudSubject ? cloudSubject.id : null,
        semester: 5,
        section: 'Section B',
        academicYear: '2026-27',
        designation: 'Assistant Professor',
        createdByHODId: hodUser.id,
        authority: 'DEAN',
        status: 'PENDING',
      },
    });

    console.log('✓ Academic profiles, assignments, and authorization requests linked.');

    console.log('');
    console.log('='.repeat(55));
    console.log('  DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(55));
    console.log('');
    console.log('  LOGIN CREDENTIALS:');
    console.log('  Dean     → dean@college.com       / password123 (No OTP required)');
    console.log('  Principal→ principal@college.com  / password123');
    console.log('  Admin    → admin@college.com      / password123');
    console.log('  HOD      → hod@college.com        / password123');
    console.log('  Teacher  → teacher@college.com    / password123');
    console.log('='.repeat(55));

    if (exitOnComplete) {
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    if (exitOnComplete) {
      process.exit(1);
    }
    throw error;
  }
}

// Run if called directly
if (process.argv[1]?.replace(/\\/g, '/').endsWith('src/seeds/index.ts')) {
  seed(true);
}
