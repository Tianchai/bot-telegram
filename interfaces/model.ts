export interface Employee {
  id: number;
  telegram_id?: number;
  name: string;
  send_alert: boolean;
  absence?: Absence[];
  timesheet?: Timesheet[];
}

export interface Shift {
  id: number;
  in: string; // Time format
  out: string; // Time format
}

export interface Absence {
  id: number;
  emp_id: number | Employee;
  shift_id: number | Shift;
  date: string; // Date format
  created_at: string; // ISO date format
}

export interface Timesheet {
  id: number;
  emp_id: number | Employee;
  type: "in" | "out";
  created_at: string; // ISO date format
}

export interface EmployeeShift {
  emp_id: number | Employee;
  shift_id: number | Shift;
  workday?: string[];
}
