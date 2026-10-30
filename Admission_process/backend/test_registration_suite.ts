import sequelize from './src/config/database';
import User from './src/models/User';
import Admission from './src/models/Admission';
import Otp from './src/models/Otp';
import bcrypt from 'bcryptjs';
import authService from './src/services/auth.service';
import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function setupVerifiedOtp(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  await Otp.destroy({ where: { email: normalizedEmail, purpose: 'REGISTER' } });
  
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash('123456', salt);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  return await Otp.create({
    email: normalizedEmail,
    otpHash,
    purpose: 'REGISTER',
    verified: true,
    expiresAt,
    attempts: 0,
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING AUTOMATED REGISTRATION SUITE VERIFICATION');
  console.log('====================================================');

  await sequelize.authenticate();
  console.log('✓ Database connection established successfully.\n');

  let passedTests = 0;
  let totalTests = 0;

  // --------------------------------------------------------------------------
  // TEST CASE 1 & 2: Register a completely new email address
  // --------------------------------------------------------------------------
  totalTests++;
  const newEmail = `test_student_${Date.now()}@example.com`;
  console.log(`[TEST 1 & 2] Registering brand new student: ${newEmail}`);
  try {
    await setupVerifiedOtp(newEmail);
    const res = await axios.post(`${BASE_URL}/auth/register`, {
      firstName: 'Rohit',
      lastName: 'Patil',
      email: newEmail,
      password: 'Password@123',
      phone: String(Math.floor(6000000000 + Math.random() * 3999999999)),
      registrationType: 'FRESH',
    });

    if (res.status === 201 && res.data.success && res.data.data.token) {
      console.log('✓ Registration succeeded with HTTP 201.');
      console.log('  Token returned:', res.data.data.token.slice(0, 20) + '...');
      console.log('  User payload:', res.data.data.user.name, `(${res.data.data.user.email})`, 'System:', res.data.data.user.system);

      // Verify DB records
      const userRecord = await User.findOne({ where: { email: newEmail } });
      const admissionRecord = await Admission.findOne({ where: { userId: userRecord?.id } });

      if (userRecord && admissionRecord && admissionRecord.applicationStatus === 'DRAFT') {
        console.log('✓ User and DRAFT Admission records exist in database atomically.');
        passedTests++;
      } else {
        console.error('✗ DB verification failed: User or Admission not found or not DRAFT');
      }
    } else {
      console.error('✗ Unexpected response:', res.status, res.data);
    }
  } catch (err: any) {
    console.error('✗ Test 1 & 2 failed:', err.response?.data || err.message);
  }

  // --------------------------------------------------------------------------
  // TEST CASE 3 & 4: Attempt registration again with the same email (Duplicate check)
  // --------------------------------------------------------------------------
  totalTests++;
  console.log(`\n[TEST 3 & 4] Attempting registration again with existing email: ${newEmail}`);
  try {
    // Setup another verified OTP to simulate user trying to register again
    await setupVerifiedOtp(newEmail);
    await axios.post(`${BASE_URL}/auth/register`, {
      firstName: 'Rohit',
      lastName: 'Patil',
      email: newEmail,
      password: 'Password@123',
      phone: '9888877777',
      registrationType: 'FRESH',
    });
    console.error('✗ Duplicate registration unexpectedly succeeded! (Should have failed with 409)');
  } catch (err: any) {
    if (err.response?.status === 409) {
      console.log('✓ Successfully caught duplicate registration: HTTP 409 Conflict.');
      console.log('  Error message:', err.response.data.error);

      // Confirm duplicate count in DB
      const userCount = await User.count({ where: { email: newEmail } });
      if (userCount === 1) {
        console.log('✓ Confirmed only 1 user account exists in database (no duplicates created).');
        passedTests++;
      } else {
        console.error(`✗ Duplicate accounts found! Count: ${userCount}`);
      }
    } else {
      console.error('✗ Unexpected error status:', err.response?.status, err.response?.data);
    }
  }

  // --------------------------------------------------------------------------
  // TEST CASE 5 & 6: Simulate failure during related database operation & verify rollback
  // --------------------------------------------------------------------------
  totalTests++;
  const rollbackEmail = `test_rollback_${Date.now()}@example.com`;
  console.log(`\n[TEST 5 & 6] Testing transaction atomicity & rollback on failure: ${rollbackEmail}`);
  try {
    let transactionRolledBack = false;
    try {
      await sequelize.transaction(async (t) => {
        // 1. Create user
        await User.create(
          {
            username: `rollback_user_${Date.now()}`,
            email: rollbackEmail,
            passwordHash: 'dummy_hash',
            firstName: 'Rollback',
            lastName: 'Test',
            role: 'STUDENT',
            status: 'ACTIVE',
            registrationType: 'FRESH',
          },
          { transaction: t }
        );

        // 2. Deliberately throw an exception to simulate failure in a related DB operation
        throw new Error('Simulated database constraint failure during admission initialization');
      });
    } catch (simulatedErr: any) {
      if (simulatedErr.message.includes('Simulated database constraint failure')) {
        transactionRolledBack = true;
      }
    }

    // Verify rollback
    const userInDb = await User.findOne({ where: { email: rollbackEmail } });
    if (transactionRolledBack && !userInDb) {
      console.log('✓ Simulated failure caught. Transaction rolled back cleanly.');
      console.log('✓ Verified user record was NOT committed to the database.');
      passedTests++;
    } else {
      console.error('✗ Rollback test failed: user was committed despite error!', userInDb);
    }
  } catch (err: any) {
    console.error('✗ Test 5 & 6 error:', err);
  }

  // --------------------------------------------------------------------------
  // TEST CASE 7: Safe recovery for partial/incomplete registration (Scenario C)
  // --------------------------------------------------------------------------
  totalTests++;
  const incompleteEmail = `partial_reg_${Date.now()}@example.com`;
  console.log(`\n[TEST 7] Testing recovery of previously failed registration: ${incompleteEmail}`);
  try {
    // 1. Manually create a partial user record without an Admission record
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Secret12345', salt);
    await User.create({
      username: `partial_${Date.now()}`,
      email: incompleteEmail,
      passwordHash,
      firstName: 'Partial',
      lastName: 'Student',
      role: 'STUDENT',
      status: 'ACTIVE',
      registrationType: 'FRESH',
      lastActivityAt: null,
    });

    // Verify it is indeed partial (no Admission record)
    const partialUser = await User.findOne({ where: { email: incompleteEmail } });
    const initialAdm = await Admission.findOne({ where: { userId: partialUser?.id } });
    if (initialAdm) throw new Error('Setup error: Admission already exists!');

    // 2. Try registering with WRONG password -> must be rejected with 409
    await setupVerifiedOtp(incompleteEmail);
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        firstName: 'Partial',
        lastName: 'Student',
        email: incompleteEmail,
        password: 'WrongPassword999',
        phone: '9876543210',
        registrationType: 'FRESH',
      });
      console.error('✗ Unexpected: registration succeeded with wrong password');
    } catch (err: any) {
      if (err.response?.status === 409) {
        console.log('✓ Mismatched password on partial account correctly rejected with HTTP 409 Conflict.');
      }
    }

    // 3. Retry registering with MATCHING password ('Secret12345') -> must succeed with HTTP 200 recovery!
    await setupVerifiedOtp(incompleteEmail);
    const res = await axios.post(`${BASE_URL}/auth/register`, {
      firstName: 'Partial',
      lastName: 'Student',
      email: incompleteEmail,
      password: 'Secret12345',
      phone: '9876543210',
      registrationType: 'FRESH',
    });

    if (res.status === 200 && res.data.success && res.data.data.token) {
      console.log('✓ Recovery succeeded with HTTP 200!');
      console.log('  Returned token:', res.data.data.token.slice(0, 20) + '...');
      console.log('  User payload:', res.data.data.user.name, `(${res.data.data.user.email})`);

      // Verify DB state
      const existingUser = await User.findOne({ where: { email: incompleteEmail } });
      const existingAdm = await Admission.findOne({ where: { userId: existingUser?.id } });
      const userCount = await User.count({ where: { email: incompleteEmail } });

      if (userCount === 1 && existingAdm && existingAdm.applicationStatus === 'DRAFT') {
        console.log('✓ Verified: No duplicate account created (count = 1), draft admission created and intact.');
        passedTests++;
      } else {
        console.error('✗ Recovery validation failed:', { userCount, hasAdmission: !!existingAdm });
      }
    } else {
      console.error('✗ Recovery response unexpected:', res.status, res.data);
    }
  } catch (err: any) {
    console.error('✗ Test 7 recovery failed:', err.response?.data || err.message);
  }

  // --------------------------------------------------------------------------
  // TEST CASE 8 & 9: Concurrent registration requests with the same email
  // --------------------------------------------------------------------------
  totalTests++;
  const concurrentEmail = `test_concurrent_${Date.now()}@example.com`;
  console.log(`\n[TEST 8 & 9] Submitting two registration requests simultaneously: ${concurrentEmail}`);
  try {
    await setupVerifiedOtp(concurrentEmail);

    const payload = {
      firstName: 'Concurrent',
      lastName: 'Tester',
      email: concurrentEmail,
      password: 'Password@123',
      phone: String(Math.floor(6000000000 + Math.random() * 3999999999)),
      registrationType: 'FRESH',
    };

    const results = await Promise.allSettled([
      axios.post(`${BASE_URL}/auth/register`, payload),
      axios.post(`${BASE_URL}/auth/register`, payload),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    console.log(`  Requests outcome: ${successes.length} succeeded, ${failures.length} failed.`);

    const countInDb = await User.count({ where: { email: concurrentEmail } });
    console.log(`  Accounts created in DB: ${countInDb}`);

    if (countInDb === 1) {
      console.log('✓ Concurrency safety confirmed: Exactly one valid account created!');
      passedTests++;
    } else {
      console.error(`✗ Concurrency violation! ${countInDb} accounts created.`);
    }
  } catch (err: any) {
    console.error('✗ Test 8 & 9 failed:', err);
  }

  // --------------------------------------------------------------------------
  // TEST CASE 10: Email verification enforcement (reject unverified requests)
  // --------------------------------------------------------------------------
  totalTests++;
  const unverifiedEmail = `unverified_${Date.now()}@example.com`;
  console.log(`\n[TEST 10] Testing email verification enforcement without OTP: ${unverifiedEmail}`);
  try {
    // Ensure no verified OTP exists
    await Otp.destroy({ where: { email: unverifiedEmail } });

    await axios.post(`${BASE_URL}/auth/register`, {
      firstName: 'Unverified',
      lastName: 'User',
      email: unverifiedEmail,
      password: 'Password@123',
      phone: '9999911111',
      registrationType: 'FRESH',
    });
    console.error('✗ Unverified registration unexpectedly succeeded! (Should have been rejected)');
  } catch (err: any) {
    if (err.response?.status === 403) {
      console.log('✓ Unverified registration rejected with HTTP 403 Forbidden.');
      console.log('  Error message:', err.response.data.error);
      passedTests++;
    } else {
      console.error('✗ Unexpected status:', err.response?.status, err.response?.data);
    }
  }

  // --------------------------------------------------------------------------
  // TEST CASE 11: Existing student login & admission workflow verification
  // --------------------------------------------------------------------------
  totalTests++;
  console.log(`\n[TEST 11] Testing student login and admission dashboard access for registered student...`);
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: newEmail,
      password: 'Password@123',
    });

    if (loginRes.data.success && loginRes.data.data.token) {
      const studentToken = loginRes.data.data.token;
      console.log('✓ Student login succeeded with HTTP 200.');
      console.log('  Token received:', studentToken.slice(0, 20) + '...');

      // Call student dashboard step-status API
      const statusRes = await axios.get(`${BASE_URL}/student/step-status`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });

      if (statusRes.data.success && statusRes.data.data.applicationStatus === 'DRAFT') {
        console.log('✓ Student step-status accessed successfully.');
        console.log('  Application status:', statusRes.data.data.applicationStatus);
        console.log('  Step 1 accessible:', statusRes.data.data.stepStatus['1']);
        passedTests++;
      } else {
        console.error('✗ step-status API response unexpected:', statusRes.data);
      }
    } else {
      console.error('✗ Student login failed:', loginRes.data);
    }
  } catch (err: any) {
    console.error('✗ Test 11 failed:', err.response?.data || err.message);
  }

  console.log('\n====================================================');
  console.log(`AUTOMATED TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('====================================================');

  await sequelize.close();
}

runTests().catch(console.error);
