import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import User from '../models/User';
import Admin from '../models/Admin';

async function updatePrivilegedAccounts() {
  console.log('\n====================================================');
  console.log('🔒 UPDATING PRIVILEGED ACCOUNTS FOR TESTING');
  console.log('====================================================\n');

  try {
    await sequelize.authenticate();
    console.log('✓ Database connection authenticated.');

    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'arihantdesai483@gmail.com').trim().toLowerCase();
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Desai@2004';

    const admin2Email = process.env.INITIAL_ADMIN2_EMAIL ? process.env.INITIAL_ADMIN2_EMAIL.trim().toLowerCase() : null;
    const admin2Password = process.env.INITIAL_ADMIN2_PASSWORD || 'Desai@2004';

    const principalEmail = (process.env.INITIAL_PRINCIPAL_EMAIL || 'arihantdesai47@gmail.com').trim().toLowerCase();
    const principalPassword = process.env.INITIAL_PRINCIPAL_PASSWORD || 'Desai@2004';

    const cyberAdminEmail = process.env.INITIAL_CYBERADMIN_EMAIL ? process.env.INITIAL_CYBERADMIN_EMAIL.trim().toLowerCase() : null;
    const cyberAdminPassword = process.env.INITIAL_CYBERADMIN_PASSWORD || 'Desai@2004';

    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    const hashedPrincipalPassword = await bcrypt.hash(principalPassword, 10);

    // ─── 1. UPDATE / ENSURE ADMIN 1 ACCOUNT ────────────────────────────────────
    let targetAdmin = await User.findOne({ where: { email: adminEmail } });
    if (!targetAdmin) {
      targetAdmin = await User.findOne({ where: { email: 'admin@college.com' } });
    }

    if (targetAdmin) {
      await targetAdmin.update({
        username: adminEmail,
        email: adminEmail,
        passwordHash: hashedAdminPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
        firstName: 'Shivakumar',
        lastName: 'Biradar',
        mustChangePassword: false,
      });

      const adminProfile = await Admin.findOne({ where: { userId: targetAdmin.id } });
      if (!adminProfile) {
        await Admin.create({
          userId: targetAdmin.id,
          designation: 'Senior Admission Officer',
          employeeId: 'EMP-001',
        });
      }
      console.log(`✓ Preserved Admin 1 account ID [${targetAdmin.id}] with email: ${adminEmail}`);
    } else {
      targetAdmin = await User.create({
        username: adminEmail,
        email: adminEmail,
        passwordHash: hashedAdminPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
        firstName: 'Shivakumar',
        lastName: 'Biradar',
        phone: '9876543200',
        mustChangePassword: false,
      });
      await Admin.create({
        userId: targetAdmin.id,
        designation: 'Senior Admission Officer',
        employeeId: 'EMP-001',
      });
      console.log(`✓ Created new Admin 1 account ID [${targetAdmin.id}] with email: ${adminEmail}`);
    }

    // ─── 1.5. UPDATE / ENSURE ADMIN 2 ACCOUNT ──────────────────────────────────
    if (admin2Email) {
      const hashedAdmin2Password = await bcrypt.hash(admin2Password, 10);
      let targetAdmin2 = await User.findOne({ where: { email: admin2Email } });
      if (targetAdmin2) {
        await targetAdmin2.update({
          username: admin2Email,
          email: admin2Email,
          passwordHash: hashedAdmin2Password,
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Admin',
          lastName: 'Two',
          mustChangePassword: false,
        });
        const admin2Profile = await Admin.findOne({ where: { userId: targetAdmin2.id } });
        if (!admin2Profile) {
          await Admin.create({
            userId: targetAdmin2.id,
            designation: 'Admission Officer',
            employeeId: 'EMP-002',
          });
        }
        console.log(`✓ Preserved Admin 2 account ID [${targetAdmin2.id}] with email: ${admin2Email}`);
      } else {
        targetAdmin2 = await User.create({
          username: admin2Email,
          email: admin2Email,
          passwordHash: hashedAdmin2Password,
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Admin',
          lastName: 'Two',
          phone: '9876543209',
          mustChangePassword: false,
        });
        await Admin.create({
          userId: targetAdmin2.id,
          designation: 'Admission Officer',
          employeeId: 'EMP-002',
        });
        console.log(`✓ Created new Admin 2 account ID [${targetAdmin2.id}] with email: ${admin2Email}`);
      }
    }

    // ─── 2. UPDATE EXISTING PRINCIPAL ACCOUNT ──────────────────────────────────
    let principalUsers = await User.findAll({
      where: {
        [Op.or]: [
          { role: 'PRINCIPAL' },
          { email: 'principal@college.com' },
          { email: principalEmail }
        ]
      },
      order: [['createdAt', 'ASC']]
    });

    let targetPrincipal: User;

    if (principalUsers.length > 0) {
      targetPrincipal = principalUsers[0];

      // Remove any other user record that claims principalEmail to avoid unique constraint error
      const extraUsersWithPrincipalEmail = await User.findAll({
        where: { email: principalEmail, id: { [Op.ne]: targetPrincipal.id } }
      });
      for (const extra of extraUsersWithPrincipalEmail) {
        await extra.destroy();
      }

      await targetPrincipal.update({
        username: principalEmail,
        email: principalEmail,
        passwordHash: hashedPrincipalPassword,
        role: 'PRINCIPAL',
        status: 'ACTIVE',
        firstName: 'Dr. S.V.',
        lastName: 'Gorbal',
        phone: '9448693987',
        mustChangePassword: false,
      });

      console.log(`✓ Preserved Principal account ID [${targetPrincipal.id}] and updated name to Dr. S.V. Gorbal, email to: ${principalEmail}`);
    } else {
      targetPrincipal = await User.create({
        username: principalEmail,
        email: principalEmail,
        passwordHash: hashedPrincipalPassword,
        role: 'PRINCIPAL',
        status: 'ACTIVE',
        firstName: 'Dr. S.V.',
        lastName: 'Gorbal',
        phone: '9876543201',
        mustChangePassword: false,
      });
      console.log(`✓ Created new Principal account ID [${targetPrincipal.id}] with email: ${principalEmail}`);
    }

    // ─── 2.5. UPDATE / ENSURE CYBERADMIN ACCOUNT (SIGNALSAFE) ─────────────────
    if (cyberAdminEmail) {
      const hashedCyberAdminPassword = await bcrypt.hash(cyberAdminPassword, 10);
      let targetCyberAdmin = await User.findOne({ where: { email: cyberAdminEmail } });
      if (targetCyberAdmin) {
        await targetCyberAdmin.update({
          username: cyberAdminEmail,
          email: cyberAdminEmail,
          passwordHash: hashedCyberAdminPassword,
          role: 'CYBERADMIN',
          status: 'ACTIVE',
          firstName: 'Cyber',
          lastName: 'Security Officer',
          mustChangePassword: false,
        });
        console.log(`✓ Preserved CyberAdmin account ID [${targetCyberAdmin.id}] with email: ${cyberAdminEmail}`);
      } else {
        targetCyberAdmin = await User.create({
          username: cyberAdminEmail,
          email: cyberAdminEmail,
          passwordHash: hashedCyberAdminPassword,
          role: 'CYBERADMIN',
          status: 'ACTIVE',
          firstName: 'Cyber',
          lastName: 'Security Officer',
          phone: '9876543202',
          mustChangePassword: false,
        });
        console.log(`✓ Created new CyberAdmin account ID [${targetCyberAdmin.id}] with email: ${cyberAdminEmail}`);
      }
    }

    // ─── 3. VERIFICATION CHECKS ──────────────────────────────────────────────
    console.log('\n----------------------------------------------------');
    console.log('🔍 RUNNING DATABASE VERIFICATION CHECKS...');
    console.log('----------------------------------------------------');

    const adminCount = await User.count({ where: { role: 'ADMIN' } });
    const principalCount = await User.count({ where: { role: 'PRINCIPAL' } });
    const cyberAdminCount = await User.count({ where: { role: 'CYBERADMIN' } });

    console.log(`• Total Active ADMIN Accounts in DB     : ${adminCount}`);
    console.log(`• Total Active PRINCIPAL Accounts in DB : ${principalCount}`);
    console.log(`• Total Active CYBERADMIN Accounts in DB: ${cyberAdminCount}`);

    console.log('\n====================================================');
    console.log('🎉 PRIVILEGED ACCOUNT SEEDING/UPDATE SUCCESSFUL');
    console.log('====================================================\n');

    process.exit(0);
  } catch (err: any) {
    console.error('❌ Script failed:', err.message);
    if (err.errors) {
      console.error('Detailed validation errors:', JSON.stringify(err.errors, null, 2));
    }
    process.exit(1);
  }
}

updatePrivilegedAccounts();
