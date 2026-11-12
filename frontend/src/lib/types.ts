export type Role = "CITIZEN" | "DISPATCHER" | "RESPONDER" | "ADMIN";

export type IncidentStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AssignmentStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "REASSIGNED" | "COMPLETED";

export type NotificationType =
  | "INCIDENT_SUBMITTED"
  | "INCIDENT_STATUS_UPDATED"
  | "INCIDENT_PRIORITY_UPDATED"
  | "ASSIGNMENT_CREATED"
  | "ASSIGNMENT_ACCEPTED"
  | "ASSIGNMENT_REJECTED"
  | "ASSIGNMENT_REASSIGNED"
  | "INCIDENT_RESOLVED";

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  accountStatus: string;
  role: Role;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface HistoryEntry {
  id: string;
  previousStatus: IncidentStatus | null;
  newStatus: IncidentStatus;
  reason: string | null;
  createdAt: string;
  changedBy: { fullName: string; role: { name: Role } } | null;
}

export interface Assignment {
  id: string;
  incidentId: string;
  responderId: string;
  status: AssignmentStatus;
  assignmentNote: string | null;
  rejectionReason: string | null;
  assignedAt: string;
  incident: Incident;
}

export interface Incident {
  id: string;
  referenceNumber: string;
  description: string;
  contactInformation: string | null;
  latitude: number | null;
  longitude: number | null;
  locationDescription: string | null;
  priority: Priority;
  status: IncidentStatus;
  rejectionReason: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  category: Category;
  assignments?: Assignment[];
  statusHistory?: HistoryEntry[];
}

export interface IncidentStats {
  total: number;
  active: number;
  resolved: number;
  closed: number;
  rejected: number;
  cancelled: number;
  averageResolutionMinutes: number | null;
  byStatus: Array<{ status: IncidentStatus; count: number }>;
  byPriority: Array<{ priority: Priority; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
  recent: Array<{
    id: string;
    referenceNumber: string;
    status: IncidentStatus;
    priority: Priority;
    createdAt: string;
    resolvedAt: string | null;
    category: { name: string };
  }>;
}

export interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface ResponderProfile {
  responderType: string;
  availabilityStatus: "AVAILABLE" | "BUSY" | "UNAVAILABLE";
}

export interface ResponderSelf {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  accountStatus: string;
  responderProfile: ResponderProfile | null;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  accountStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: string;
  role: { name: Role };
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
}

export interface ResponderOption {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  responderProfile: {
    availabilityStatus: "AVAILABLE" | "BUSY" | "UNAVAILABLE";
    responderType: string;
  } | null;
}
