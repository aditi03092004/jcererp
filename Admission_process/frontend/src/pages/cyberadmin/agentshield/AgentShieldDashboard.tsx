import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SecurityOverviewTab from './tabs/SecurityOverviewTab';
import LiveThreatMonitorTab from './tabs/LiveThreatMonitorTab';
import SecurityIncidentsTab from './tabs/SecurityIncidentsTab';
import BlockedRequestsTab from './tabs/BlockedRequestsTab';
import DetectionRulesTab from './tabs/DetectionRulesTab';
import OwaspZapTab from './tabs/OwaspZapTab';
import SecurityAuditLogsTab from './tabs/SecurityAuditLogsTab';
import HealthDiagnosticModal from './modals/HealthDiagnosticModal';

export const AgentShieldDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';
  const [isHealthModalOpen, setIsHealthModalOpen] = useState<boolean>(false);

  return (
    <div className="w-full">
      {currentTab === 'overview' && (
        <SecurityOverviewTab onOpenHealthModal={() => setIsHealthModalOpen(true)} />
      )}
      {currentTab === 'live' && <LiveThreatMonitorTab />}
      {currentTab === 'incidents' && <SecurityIncidentsTab />}
      {currentTab === 'blocked' && <BlockedRequestsTab />}
      {currentTab === 'rules' && <DetectionRulesTab />}
      {currentTab === 'zap' && <OwaspZapTab />}
      {currentTab === 'audit' && <SecurityAuditLogsTab />}

      {/* Global Health Diagnostics Modal */}
      <HealthDiagnosticModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
      />
    </div>
  );
};

export default AgentShieldDashboard;

