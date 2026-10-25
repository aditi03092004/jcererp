import { Router } from 'express';
import * as systemController from '../controllers/system.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/rbac.middleware';

import { getBranches } from '../controllers/admission.controller';

const router = Router();

router.get('/academic-years', systemController.getAcademicYears as any);
router.post('/academic-years', authMiddleware as any, authorizeRoles('ADMIN', 'SUPER_ADMIN') as any, systemController.createAcademicYear as any);
router.post('/academic-years/generate', authMiddleware as any, authorizeRoles('ADMIN', 'SUPER_ADMIN') as any, systemController.generateAcademicYears as any);
router.post('/academic-years/active', authMiddleware as any, authorizeRoles('ADMIN', 'SUPER_ADMIN') as any, systemController.setActiveAcademicYear as any);
router.get('/semesters', systemController.getSemesters as any);
router.put('/semesters/:id', authMiddleware as any, authorizeRoles('ADMIN', 'SUPER_ADMIN', 'DEAN') as any, systemController.updateSemester as any);
router.get('/config', systemController.getConfig as any);
router.get('/health', systemController.getHealth as any);
router.get('/db-status', authMiddleware as any, authorizeRoles('SUPER_ADMIN') as any, systemController.dbStatus as any);
router.get('/version', systemController.getVersion as any);
router.get('/features', systemController.getFeatures as any);
router.get('/branches', getBranches as any);

router.get('/seed-departments', async (_req, res) => {
  try {
    const Department = (await import('../models/Department')).default;
    const AcademicYear = (await import('../models/AcademicYear')).default;
    const Semester = (await import('../models/Semester')).default;

    // 1. Core Engineering Departments
    const standardDepts = [
      { name: 'Computer Science & Engineering', code: 'CSE' },
      { name: 'Electronics & Communication Engineering', code: 'ECE' },
      { name: 'Mechanical Engineering', code: 'ME' },
      { name: 'Civil Engineering', code: 'CV' },
      { name: 'Computer Science & Engineering (AIML)', code: 'CSE-AIML' },
    ];
    for (const d of standardDepts) {
      await Department.findOrCreate({ where: { code: d.code }, defaults: d as any });
    }

    // 2. Academic Years starting from 2026-27
    const academicYears = [
      { year: '2026-27', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), status: 'ACTIVE', isCurrent: true, isOperational: true },
      { year: '2027-28', startDate: new Date('2027-07-01'), endDate: new Date('2028-06-30'), status: 'UPCOMING', isCurrent: false, isOperational: true },
      { year: '2028-29', startDate: new Date('2028-07-01'), endDate: new Date('2029-06-30'), status: 'UPCOMING', isCurrent: false, isOperational: true },
    ];
    for (const ay of academicYears) {
      await AcademicYear.findOrCreate({ where: { year: ay.year }, defaults: ay as any });
    }

    // 3. Semesters for 2026-27
    for (let num = 1; num <= 8; num++) {
      await Semester.findOrCreate({
        where: { academicYear: '2026-27', semesterNumber: num },
        defaults: {
          academicYear: '2026-27',
          semesterNumber: num,
          semesterName: `${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'} Semester`,
          startDate: num % 2 !== 0 ? new Date('2026-08-01') : new Date('2027-01-15'),
          endDate: num % 2 !== 0 ? new Date('2026-12-31') : new Date('2027-05-31'),
          status: num % 2 !== 0 ? 'ACTIVE' : 'UPCOMING',
        } as any,
      });
    }

    const depts = await Department.findAll({ order: [['name', 'ASC']] });
    const years = await AcademicYear.findAll({ where: { isOperational: true }, order: [['year', 'ASC']] });

    return res.json({
      success: true,
      message: 'Departments and Academic Years (starting 2026) seeded successfully',
      departments: depts,
      academicYears: years,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/seed-database', async (req, res) => {
  // Alias to seed-departments
  return (router as any).handle({ ...req, url: '/seed-departments' }, res);
});

export default router;
