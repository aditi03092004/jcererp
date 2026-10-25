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
    const all = await Department.findAll({ order: [['name', 'ASC']] });
    return res.json({ success: true, message: '5 Core engineering departments verified & seeded', departments: all });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
