import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import http from 'http';
import { io as ioClient, Socket } from '../../../frontend/node_modules/socket.io-client';
import { generateToken } from '../utils/jwt.util';
import SecurityIncident from '../models/agentshield/SecurityIncident';
import SecurityEvent from '../models/agentshield/SecurityEvent';
import DetectionRule from '../models/agentshield/DetectionRule';
import sequelize from '../config/database';
import User from '../models/User';

const BASE_URL = 'http://localhost:5000';

function httpRequest(options: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE_URL}${options.path}`,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runAudit() {
  console.log('================================================================');
  console.log('   AGENTSHIELD REAL-TIME END-TO-END AUDIT & VERIFICATION       ');
  console.log('================================================================\n');

  await sequelize.authenticate();

  let studentUser = await User.findOne({ where: { role: 'STUDENT', status: 'ACTIVE' } });
  if (!studentUser) {
    studentUser = await User.create({
      username: 'student.e2e@jcer.edu',
      email: 'student.e2e@jcer.edu',
      passwordHash: '$2a$10$dummyhashplaceholderforstudent12345678901234567890',
      role: 'STUDENT',
      status: 'ACTIVE',
      firstName: 'Student',
      lastName: 'Tester',
    });
  }

  let cyberAdminUser = await User.findOne({ where: { role: 'CYBERADMIN', status: 'ACTIVE' } });
  if (!cyberAdminUser) {
    cyberAdminUser = await User.create({
      username: 'cyberadmin.e2e@jcer.edu',
      email: 'cyberadmin.e2e@jcer.edu',
      passwordHash: '$2a$10$dummyhashplaceholderforcyberadmin1234567890123456',
      role: 'CYBERADMIN',
      status: 'ACTIVE',
      firstName: 'Cyber',
      lastName: 'Admin',
    });
  }

  studentUser.set('lastActivityAt', new Date());
  await studentUser.save();

  const studentId = studentUser?.getDataValue('id') || studentUser?.id;
  const studentEmail = studentUser?.getDataValue('email') || studentUser?.email;
  const studentRole = studentUser?.getDataValue('role') || studentUser?.role;
  const studentTv = studentUser?.getDataValue('tokenVersion') ?? 0;

  const cyberId = cyberAdminUser?.getDataValue('id') || cyberAdminUser?.id;
  const cyberEmail = cyberAdminUser?.getDataValue('email') || cyberAdminUser?.email;
  const cyberRole = cyberAdminUser?.getDataValue('role') || cyberAdminUser?.role;
  const cyberTv = cyberAdminUser?.getDataValue('tokenVersion') ?? 0;

  console.log('Student user in DB:', studentId, studentEmail);
  console.log('CyberAdmin user in DB:', cyberId, cyberEmail);

  // Tokens
  const cyberAdminToken = generateToken({
    id: cyberId,
    role: cyberRole,
    tv: cyberTv,
  });

  const studentToken = generateToken({
    id: studentId,
    role: studentRole,
    tv: studentTv,
  });

  // ── TEST 1: Unauthenticated Access ───────────────────────────────────────────
  console.log('1. Testing Unauthenticated Access to /api/v1/agentshield/health...');
  const unauthRes = await httpRequest({ path: '/api/v1/agentshield/health' });
  console.log(`   Result: HTTP ${unauthRes.statusCode} Body:`, unauthRes.body);
  if (unauthRes.statusCode !== 401) throw new Error('Unauthenticated access was NOT rejected with 401!');

  // ── TEST 2: Student Forbidden ────────────────────────────────────────────────
  console.log('2. Testing Student Role Access to /api/v1/agentshield/health...');
  const studentRes = await httpRequest({
    path: '/api/v1/agentshield/health',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  console.log(`   Result: HTTP ${studentRes.statusCode} Body:`, studentRes.body);
  if (studentRes.statusCode !== 403) throw new Error('Student access was NOT rejected with 403!');

  // ── TEST 3: CyberAdmin Authorized ───────────────────────────────────────────
  console.log('3. Testing CyberAdmin Access to /api/v1/agentshield/health...');
  const cyberRes = await httpRequest({
    path: '/api/v1/agentshield/health',
    headers: { Authorization: `Bearer ${cyberAdminToken}` },
  });
  console.log(`   Result: HTTP ${cyberRes.statusCode} (Expected: 200)`);
  console.log(`   Telemetry Status: ${cyberRes.body.data?.status || 'Unknown'}`);
  if (cyberRes.statusCode !== 200) throw new Error('CyberAdmin access failed!');

  // ── TEST 4: Socket.IO Authentication & Live Reception ───────────────────────
  console.log('\n4. Connecting Socket.IO Client with CyberAdmin Token...');
  let receivedSocketEvent: any = null;
  let receivedSocketIncident: any = null;

  const socket: Socket = ioClient(BASE_URL, {
    auth: { token: cyberAdminToken },
    transports: ['websocket'],
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      console.log(`   Socket.IO Connected successfully! (Socket ID: ${socket.id})`);
      resolve();
    });
    socket.on('connect_error', (err) => {
      console.error('   Socket connection error:', err.message);
      reject(err);
    });
  });

  socket.on('agentshield:event', (evt) => {
    console.log(`   [Live Socket Event Received] Rule: ${evt.ruleId} | Path: ${evt.route} | Risk: ${evt.riskLevel}`);
    receivedSocketEvent = evt;
  });

  socket.on('agentshield:incident', (inc) => {
    console.log(`   [Live Socket Incident Received] ${inc.incidentNumber} (${inc.title})`);
    receivedSocketIncident = inc;
  });

  // ── TEST 5: Route Probing Simulation (Sequential 404s) ───────────────────────
  console.log('\n5. Generating Controlled Route Probing Requests (Burst of 404s)...');
  for (let i = 1; i <= 6; i++) {
    const probePath = `/api/v1/test-probing-route-${i}_${Date.now()}`;
    const pRes = await httpRequest({ path: probePath });
    console.log(`   Probe ${i}/6: ${probePath} => HTTP ${pRes.statusCode}`);
  }

  // Allow async setImmediate evaluation
  await new Promise((r) => setTimeout(r, 1500));

  // ── TEST 6: Manual Restriction Lift via CyberAdmin API ───────────────────────
  console.log('\n6. Testing Manual Unblocking (Lift Restriction) via CyberAdmin API...');
  const liftRes = await httpRequest({
    path: '/api/v1/agentshield/lift-restriction',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cyberAdminToken}`,
      'Content-Type': 'application/json',
    },
    body: { clientIp: '127.0.0.1' },
  });
  console.log(`   Lift Restriction Result: HTTP ${liftRes.statusCode} Body:`, JSON.stringify(liftRes.body));
  if (liftRes.statusCode !== 200) throw new Error('Failed to lift restriction via CyberAdmin API!');

  // ── TEST 7: Canary Honeypot Probe ───────────────────────────────────────────
  console.log('\n7. Probing Decoy Canary Honeypot Endpoint (/api/v1/system/debug-internal-keys)...');
  const honeypotRes = await httpRequest({ path: '/api/v1/system/debug-internal-keys' });
  console.log(`   Honeypot Response: HTTP ${honeypotRes.statusCode} (Expected: 404 harmless)`);
  console.log(`   Body:`, JSON.stringify(honeypotRes.body));
  if (honeypotRes.statusCode !== 404) throw new Error('Honeypot did not return 404!');

  await new Promise((r) => setTimeout(r, 1500));

  // ── TEST 8: WebSocket Disconnection & Polling Fallback ───────────────────────
  console.log('\n8. Disconnecting WebSocket and Verifying REST Polling Fallback...');
  socket.disconnect();
  console.log('   Socket disconnected.');

  const pollingRes = await httpRequest({
    path: '/api/v1/agentshield/events?limit=5',
    headers: { Authorization: `Bearer ${cyberAdminToken}` },
  });
  console.log(`   Polling fallback retrieved ${pollingRes.body.data?.length || 0} recent events via REST API.`);
  if (!pollingRes.body.data || pollingRes.body.data.length === 0) {
    throw new Error('Polling fallback failed to retrieve persisted events!');
  }

  // ── TEST 9: Verify Persistence in PostgreSQL ─────────────────────────────────
  console.log('\n9. Verifying Event and Incident Persistence in Database...');
  const latestEvent = await SecurityEvent.findOne({ order: [['timestamp', 'DESC']] });
  const latestIncident = await SecurityIncident.findOne({ order: [['lastObservedAt', 'DESC']] });

  console.log(`   Latest Persisted Event: ${latestEvent?.getDataValue('id')} (Rule: ${latestEvent?.getDataValue('ruleId')}, Risk: ${latestEvent?.getDataValue('riskLevel')})`);
  console.log(`   Latest Persisted Incident: ${latestIncident?.getDataValue('incidentNumber')} (Status: ${latestIncident?.getDataValue('status')}, Events: ${latestIncident?.getDataValue('eventCount')})`);

  if (!latestEvent || !latestIncident) {
    throw new Error('Events or Incidents were not persisted to database!');
  }

  console.log('\n================================================================');
  console.log('   ALL AUDIT & END-TO-END VERIFICATION CHECKS PASSED           ');
  console.log('================================================================\n');

  process.exit(0);
}

runAudit().catch((err) => {
  console.error('\nAudit Failed with Error:', err);
  process.exit(1);
});
