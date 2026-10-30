import { Op } from 'sequelize';
import Teacher from '../models/Teacher';
import Department from '../models/Department';
import User from '../models/User';
import FacultyAssignment from '../models/FacultyAssignment';
import Subject from '../models/Subject';
import logger from '../utils/logger.util';

export const teachingProfileService = {
  /**
   * Resolves teaching profile details, eligibility, and active assignments for Dean or Principal
   */
  async getTeachingProfile(userId: string) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'status'],
    });

    if (!user) {
      throw new Error('User not found.');
    }

    const teacher = await Teacher.findOne({
      where: { [Op.or]: [{ userId }, { id: userId }] },
      include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code', 'type'] }],
    });

    const candidateIds = Array.from(new Set([userId, user.id, teacher?.id, teacher?.userId].filter(Boolean) as string[]));

    const activeAssignments = await FacultyAssignment.findAll({
      where: {
        [Op.or]: [
          { userId: { [Op.in]: candidateIds } },
          { teacherId: { [Op.in]: candidateIds } },
        ],
        status: {
          [Op.or]: [
            { [Op.in]: ['ACTIVE'] },
            { [Op.is]: null },
          ],
        },
      },
      include: [
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'code', 'credits', 'type', 'semester'] },
        { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
      ],
      order: [['semester', 'ASC'], ['createdAt', 'DESC']],
    });

    const isEligible = Boolean(teacher && teacher.status === 'ACTIVE' && teacher.departmentId);

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      isEligible,
      isTeachingEligible: isEligible,
      coreDepartmentId: teacher?.departmentId || null,
      coreDepartmentCode: (teacher as any)?.department?.code || null,
      coreDepartmentName: (teacher as any)?.department?.name || null,
      coreDepartment: (teacher as any)?.department
        ? {
            id: (teacher as any).department.id,
            name: (teacher as any).department.name,
            code: (teacher as any).department.code,
          }
        : null,
      designation: teacher?.designation || (user.role === 'DEAN' ? 'Dean Academics' : user.role === 'PRINCIPAL' ? 'Principal' : 'Faculty'),
      activeAssignments: activeAssignments.map((a: any) => ({
        id: a.id,
        subjectId: a.subjectId,
        subjectName: a.subject?.name || 'Assigned Subject',
        subjectCode: a.subject?.code || 'N/A',
        credits: a.subject?.credits || 4,
        semester: a.semester,
        section: a.section,
        academicYear: a.academicYear,
        teachingDepartmentCode: a.department?.code || null,
        teachingDepartmentName: a.department?.name || null,
        status: a.status,
      })),
      totalActiveAssignmentsCount: activeAssignments.length,
    };
  },

  /**
   * Updates or enables teaching profile for Dean or Principal
   */
  async updateTeachingProfile(userId: string, targetRole: 'DEAN' | 'PRINCIPAL', coreDepartmentId: string) {
    if (!coreDepartmentId) {
      throw new Error('Core department selection is required.');
    }

    const dept = await Department.findByPk(coreDepartmentId);
    if (!dept) {
      throw new Error('Selected core department does not exist.');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    let teacher = await Teacher.findOne({ where: { [Op.or]: [{ userId }, { id: userId }] } });

    // Enforce safety rule: if changing department when active assignments exist
    if (teacher && teacher.departmentId && teacher.departmentId !== coreDepartmentId) {
      const candidateIds = Array.from(new Set([userId, user.id, teacher.id, teacher.userId].filter(Boolean) as string[]));
      const activeAssignments = await FacultyAssignment.findAll({
        where: {
          [Op.or]: [
            { userId: { [Op.in]: candidateIds } },
            { teacherId: { [Op.in]: candidateIds } },
          ],
          status: {
            [Op.or]: [
              { [Op.in]: ['ACTIVE'] },
              { [Op.is]: null },
            ],
          },
        },
      });
      if (activeAssignments.length > 0) {
        throw new Error(
          `Cannot change Core Department while you have ${activeAssignments.length} active teaching assignment(s). Please unallocate or transfer existing assignments first.`
        );
      }
    }

    if (teacher) {
      await teacher.update({
        departmentId: coreDepartmentId,
        status: 'ACTIVE',
      });
      logger.info(`Updated teaching profile for ${targetRole} user ${userId} to department ${dept.code}`);
    } else {
      teacher = await Teacher.create({
        userId,
        departmentId: coreDepartmentId,
        designation: targetRole === 'DEAN' ? 'Dean Academics' : 'Principal',
        status: 'ACTIVE',
        joiningDate: new Date(),
      });
      logger.info(`Created new teaching profile for ${targetRole} user ${userId} in department ${dept.code}`);
    }

    return this.getTeachingProfile(userId);
  },
};

export default teachingProfileService;
