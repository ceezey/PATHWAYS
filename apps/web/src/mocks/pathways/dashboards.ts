import type { RoleDashboardViewModel } from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'

// TODO(BACKEND): Persist approval and review actions.
// TODO(BACKEND): Persist activity progress and submissions.
// TODO(STORAGE): Upload evidence through approved storage.
// TODO(RBAC): Enforce project-manager approval permissions server-side.
// TODO(RBAC): Restrict activity updates to assigned officers.
export const mockDashboards: Record<PrototypeRole, RoleDashboardViewModel> = {
  'Program Manager': {
    role: 'Program Manager',
    greetingName: 'Program Manager Demo',
    heading: 'Program Manager dashboard',
    summary:
      'Portfolio health, escalated alerts, and human-reviewed decision support across active projects.',
    primaryAction: {
      id: 'open-project-directory',
      label: 'Open Portfolio Directory',
      kind: 'navigate',
      href: '/projects',
    },
    metrics: [
      {
        id: 'active-projects',
        label: 'Active projects',
        value: 4,
        helperText: 'Across PATHWAYS prototype portfolio',
        severity: 'info',
        href: '/projects',
      },
      {
        id: 'critical-projects',
        label: 'Critical projects',
        value: 1,
        helperText: 'Safe Spaces requires immediate review',
        severity: 'danger',
      },
      {
        id: 'at-risk-projects',
        label: 'At-risk projects',
        value: 1,
        helperText: 'Youth RISE schedule and site readiness',
        severity: 'warning',
      },
      {
        id: 'on-track-projects',
        label: 'On-track projects',
        value: 2,
        helperText: 'FutureMakers and Grassroots Centers',
        severity: 'success',
      },
    ],
    sections: [
      {
        id: 'portfolio-health',
        title: 'Portfolio health',
        description: 'Project-health progress and budget utilization.',
        viewAllHref: '/projects',
        viewAllLabel: 'View projects',
        items: [
          {
            id: 'futuremakers-ncr',
            title: 'FutureMakers NCR',
            description: 'National Capital Region - Youth Livelihoods',
            meta: 'Budget utilization 61%',
            status: 'On Track',
            severity: 'success',
            progress: 78,
            href: '/projects/futuremakers-ncr',
          },
          {
            id: 'youth-rise-western-samar',
            title: 'Youth RISE - Western Samar',
            description: 'Western Samar - Education and Skills',
            meta: 'Budget utilization 72%',
            status: 'At Risk',
            severity: 'warning',
            progress: 52,
            href: '/projects/youth-rise-western-samar',
          },
          {
            id: 'safe-spaces-northern-samar',
            title: 'Safe Spaces - Northern Samar',
            description: 'Northern Samar - Protection',
            meta: 'Budget utilization 86%',
            status: 'Critical',
            severity: 'danger',
            progress: 41,
            href: '/projects/safe-spaces-northern-samar',
          },
        ],
      },
      {
        id: 'escalated-alerts',
        title: 'Escalated alerts',
        description: 'Rule-Based Alerts that need human review.',
        items: [
          {
            id: 'alert-ss-budget',
            title: 'Budget utilization requires human review',
            description: 'Safe Spaces - Northern Samar',
            meta: 'Critical budget alert',
            status: 'Critical',
            severity: 'danger',
            primaryAction: {
              id: 'view-budget-alert',
              label: 'View alert',
              kind: 'dialog',
              dialogTitle: 'Budget utilization alert',
              dialogDescription:
                'Safe Spaces - Northern Samar has crossed the prototype budget review threshold. This is a mock Rule-Based Alert.',
            },
            secondaryAction: {
              id: 'decide-budget-alert',
              label: 'Decide',
              kind: 'dialog',
              dialogTitle: 'Decision required',
              dialogDescription:
                'Prototype decision captured for review only. Backend persistence will be added in a later phase.',
            },
          },
          {
            id: 'alert-yr-site-delay',
            title: 'Training site validation is behind schedule',
            description: 'Youth RISE - Western Samar',
            meta: 'Schedule risk',
            status: 'Warning',
            severity: 'warning',
            primaryAction: {
              id: 'view-site-alert',
              label: 'View alert',
              kind: 'dialog',
              dialogTitle: 'Training site validation alert',
              dialogDescription:
                'Site readiness has not been confirmed. This alert is generated from prototype rules and requires human review.',
            },
          },
        ],
      },
    ],
  },
  'Project Manager': {
    role: 'Project Manager',
    greetingName: 'Project Manager Demo',
    heading: 'Project Manager dashboard',
    summary:
      'Approvals, project-health queues, budget alerts, and overdue work for assigned projects.',
    metrics: [
      {
        id: 'pending-approvals',
        label: 'Pending approvals',
        value: 6,
        helperText: 'Proof and activity updates awaiting decision',
        severity: 'warning',
      },
      {
        id: 'budget-alerts',
        label: 'Active budget alerts',
        value: 2,
        helperText: 'Requires budget review and outcome logging',
        severity: 'danger',
      },
      {
        id: 'overdue-activities',
        label: 'Overdue activities',
        value: 3,
        helperText: 'Across Youth RISE and Safe Spaces',
        severity: 'warning',
      },
      {
        id: 'items-for-review',
        label: 'Items for review',
        value: 9,
        helperText: 'Approval queue plus flagged evidence',
        severity: 'info',
      },
    ],
    sections: [
      {
        id: 'project-health-list',
        title: 'Project-health list',
        description: 'Assigned project status and completion progress.',
        viewAllHref: '/projects',
        viewAllLabel: 'Go to projects',
        items: [
          {
            id: 'futuremakers-ncr',
            title: 'FutureMakers NCR',
            description: 'Cohort delivery is tracking against plan.',
            meta: 'Project Manager A',
            status: 'On Track',
            severity: 'success',
            progress: 78,
            href: '/projects/futuremakers-ncr',
          },
          {
            id: 'safe-spaces-northern-samar',
            title: 'Safe Spaces - Northern Samar',
            description: 'Budget and proof review require attention.',
            meta: 'Project Manager E',
            status: 'Critical',
            severity: 'danger',
            progress: 41,
            href: '/projects/safe-spaces-northern-samar',
          },
        ],
      },
      {
        id: 'approval-queue',
        title: 'Pending approval queue',
        description: 'Prototype actions open dialogs and do not persist decisions.',
        items: [
          {
            id: 'proof-approval-01',
            title: 'Referral pathway proof bundle',
            description: 'Safe Spaces - Northern Samar',
            meta: 'Submitted by Project Officer F',
            status: 'For Review',
            severity: 'warning',
            primaryAction: {
              id: 'approve-proof',
              label: 'Approve',
              kind: 'dialog',
              dialogTitle: 'Approve proof bundle',
              dialogDescription:
                'This prototype approval is not persisted. Backend approval workflows are scheduled later.',
            },
            secondaryAction: {
              id: 'review-proof',
              label: 'Review',
              kind: 'dialog',
              dialogTitle: 'Review proof bundle',
              dialogDescription:
                'Open the future evidence module in a later phase to inspect files and annotations.',
            },
          },
          {
            id: 'budget-alert-01',
            title: 'Budget alert requiring action',
            description: 'Safe Spaces budget utilization is 86%.',
            meta: 'Critical threshold',
            status: 'Critical',
            severity: 'danger',
            primaryAction: {
              id: 'log-budget-outcome',
              label: 'Log Outcome',
              kind: 'dialog',
              dialogTitle: 'Log prototype outcome',
              dialogDescription:
                'TODO(BACKEND): Persist approval and review actions. TODO(RBAC): Enforce project-manager approval permissions server-side.',
            },
            secondaryAction: {
              id: 'go-budget-module',
              label: 'Go to Budget Module',
              kind: 'navigate',
              href: '/projects/safe-spaces-northern-samar/budget',
            },
          },
        ],
      },
    ],
  },
  'Monitoring and Evaluation Officer': {
    role: 'Monitoring and Evaluation Officer',
    greetingName: 'Monitoring Officer Demo',
    heading: 'Monitoring and Evaluation Officer dashboard',
    summary: 'Alert review, proof queues, evaluation snapshots, and imported dataset status.',
    metrics: [
      {
        id: 'active-alerts',
        label: 'Active alerts',
        value: 5,
        helperText: 'Rule-Based Alerts requiring review',
        severity: 'warning',
      },
      {
        id: 'proof-pending',
        label: 'Proof pending review',
        value: 8,
        helperText: 'Activity evidence awaiting checks',
        severity: 'info',
      },
      {
        id: 'evaluation-snapshots',
        label: 'Evaluation snapshots',
        value: 4,
        helperText: 'Current scorecards available',
        severity: 'success',
      },
      {
        id: 'datasets-imported',
        label: 'Datasets imported',
        value: 12,
        helperText: 'This reporting period',
        severity: 'neutral',
      },
    ],
    sections: [
      {
        id: 'alerts-requiring-review',
        title: 'Active alerts requiring review',
        description: 'Human review remains required for recommendation outcomes.',
        viewAllHref: '/analytics',
        viewAllLabel: 'View analytics',
        items: [
          {
            id: 'alert-fm-bootcamp',
            title: 'Bootcamp completion checkpoint',
            description: 'FutureMakers NCR indicator evidence is ready for review.',
            meta: 'Indicator alert',
            status: 'Information',
            severity: 'info',
            primaryAction: {
              id: 'review-alert',
              label: 'Review',
              kind: 'dialog',
              dialogTitle: 'Review active alert',
              dialogDescription:
                'This opens a prototype review summary. Backend alert workflows arrive in a later phase.',
            },
            secondaryAction: {
              id: 'flag-alert',
              label: 'Flag',
              kind: 'dialog',
              dialogTitle: 'Flag alert',
              dialogDescription:
                'Prototype flag recorded for display only; no backend alert engine is updated.',
            },
          },
        ],
      },
      {
        id: 'proof-submissions',
        title: 'Proof submissions awaiting review',
        description: 'Evidence review center placeholder.',
        viewAllHref: '/projects/futuremakers-ncr/evidence',
        viewAllLabel: 'View evidence',
        items: [
          {
            id: 'proof-ss-referral',
            title: 'Referral pathway proof documents',
            description: 'Safe Spaces - Northern Samar',
            meta: 'Submitted July 2026',
            status: 'For Review',
            severity: 'warning',
            primaryAction: {
              id: 'review-proof',
              label: 'Review',
              kind: 'dialog',
              dialogTitle: 'Proof review',
              dialogDescription:
                'TODO(STORAGE): Upload evidence through approved storage. This dialog uses prototype metadata only.',
            },
          },
          {
            id: 'evaluation-fm',
            title: 'FutureMakers NCR evaluation snapshot',
            description: 'KPI achievement 78%, timeline progress 58%.',
            meta: 'Scorecard snapshot',
            status: 'On Track',
            severity: 'success',
            progress: 78,
          },
        ],
      },
    ],
  },
  'Project Officer': {
    role: 'Project Officer',
    greetingName: 'Project Officer Demo',
    heading: 'Project Officer dashboard',
    summary: 'Assigned activities, attention notices, and recent submission status.',
    metrics: [
      {
        id: 'assigned-activities',
        label: 'Assigned activities',
        value: 7,
        helperText: 'Activities assigned to prototype officer',
        severity: 'info',
      },
      {
        id: 'overdue-activities',
        label: 'Overdue activities',
        value: 1,
        helperText: 'Training site validation needs an update',
        severity: 'warning',
      },
      {
        id: 'flagged-proof',
        label: 'Flagged proof',
        value: 2,
        helperText: 'Evidence needs clarification',
        severity: 'danger',
      },
      {
        id: 'submissions-month',
        label: 'Submissions this month',
        value: 14,
        helperText: 'Prototype activity updates',
        severity: 'success',
      },
    ],
    sections: [
      {
        id: 'activity-list',
        title: 'Activity list',
        description: 'Current activity assignments and update actions.',
        viewAllHref: '/projects/futuremakers-ncr/activities',
        viewAllLabel: 'View activities',
        items: [
          {
            id: 'act-fm-02',
            title: 'Deliver skills bootcamp sessions',
            description: 'FutureMakers NCR',
            meta: 'Due Aug 30, 2026',
            status: 'In Progress',
            severity: 'info',
            progress: 64,
            primaryAction: {
              id: 'submit-update',
              label: 'Submit Update',
              kind: 'dialog',
              dialogTitle: 'Submit activity update',
              dialogDescription:
                'TODO(BACKEND): Persist activity progress and submissions. TODO(RBAC): Restrict activity updates to assigned officers.',
            },
          },
          {
            id: 'act-yr-01',
            title: 'Validate training site readiness',
            description: 'Youth RISE - Western Samar',
            meta: 'Due Jun 15, 2026',
            status: 'Overdue',
            severity: 'warning',
            progress: 45,
            primaryAction: {
              id: 'request-extension',
              label: 'Request Extension',
              kind: 'dialog',
              dialogTitle: 'Request extension',
              dialogDescription:
                'Prototype extension request only. Backend workflow and notifications are scheduled later.',
            },
          },
        ],
      },
      {
        id: 'attention-required',
        title: 'Attention-required notices',
        description: 'Flagged proof and recent submission follow-ups.',
        items: [
          {
            id: 'proof-flag-01',
            title: 'Proof photo needs clarification',
            description: 'Safe Spaces - Northern Samar',
            meta: 'Flagged by Monitoring and Evaluation Officer',
            status: 'Flagged',
            severity: 'danger',
            primaryAction: {
              id: 'resolve-proof',
              label: 'Resolve',
              kind: 'dialog',
              dialogTitle: 'Resolve flagged proof',
              dialogDescription:
                'TODO(STORAGE): Upload evidence through approved storage. This prototype does not upload files.',
            },
          },
          {
            id: 'recent-submission-01',
            title: 'Baseline profiling submission received',
            description: 'FutureMakers NCR',
            meta: 'Submitted this month',
            status: 'Received',
            severity: 'success',
          },
        ],
      },
    ],
  },
  'System Administrator': {
    role: 'System Administrator',
    greetingName: 'System Administrator Demo',
    heading: 'System Administrator dashboard',
    summary:
      'A minimal prototype overview is available. Full user management is scheduled for a later phase.',
    primaryAction: {
      id: 'open-settings',
      label: 'Open Settings',
      kind: 'navigate',
      href: '/settings',
    },
    metrics: [
      {
        id: 'prototype-routes',
        label: 'Prototype routes',
        value: 7,
        helperText: 'Primary dashboard navigation links',
        severity: 'info',
      },
      {
        id: 'role-preview',
        label: 'Role preview',
        value: 'On',
        helperText: 'Display-only role selection',
        severity: 'success',
      },
      {
        id: 'backend-status',
        label: 'Backend integration',
        value: 'Pending',
        helperText: 'No production RBAC in this phase',
        severity: 'warning',
      },
      {
        id: 'mock-data',
        label: 'Mock records',
        value: 'Ready',
        helperText: 'Frontend-only prototype data',
        severity: 'neutral',
      },
    ],
    sections: [
      {
        id: 'admin-overview',
        title: 'System overview',
        description: 'Minimal state for prototype navigation only.',
        viewAllHref: '/settings',
        viewAllLabel: 'Go to settings',
        items: [
          {
            id: 'prototype-boundary',
            title: 'Prototype mode boundary',
            description:
              'GUI prototype login and role preview do not provide production authentication or authorization.',
            meta: 'Frontend-only',
            status: 'Scheduled',
            severity: 'info',
          },
        ],
      },
    ],
  },
}

export const fallbackDashboard: RoleDashboardViewModel = {
  role: 'Program Manager',
  greetingName: 'Prototype User',
  heading: 'Dashboard unavailable for selected role',
  summary:
    'The selected role is not recognized. Choose a supported Prototype Role Preview option to continue.',
  metrics: [],
  sections: [
    {
      id: 'unknown-role',
      title: 'Unknown role',
      description: 'No dashboard records are available for this role.',
      emptyText:
        'Switch to Program Manager, Project Manager, Monitoring and Evaluation Officer, Project Officer, or System Administrator.',
      items: [],
    },
  ],
}
