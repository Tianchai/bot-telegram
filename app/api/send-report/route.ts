import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import _ from "lodash";
import { createClient } from "@supabase/supabase-js";

dayjs.extend(utc);

/**
 * Send report to the target of Telegram group
 * - FastCron is the service that will trigger this API every 15 minutes
 * - Checking time from shift of employee 1hr before and 15mins after
 */

export const POST = async (request: Request) => {
  const body = await request.json();
  const { shift } = body;

  const targetShift = dayjs(shift * 1000).local();

  const supabase = createClient(
    "https://gkomhvdthksfpctqlfli.supabase.co",
    process.env.secret_supabase as string,
  );

  // Get shift IDs from database from "in" time
  const { data: shiftData } = await supabase
    .from("shift")
    .select("*")
    .eq("in", targetShift.format("HH:mm:ss"));

  // Get employees from database table "employee_shift" by using `shift_id`
  const { data: employeeShiftData } = await supabase
    .from("employee_shift")
    .select("*")
    .in(
      "shift_id",
      (shiftData || []).map((shift) => shift.id),
    );

  // Deduplicate employee IDs
  const targetEmployees = Array.from(
    new Set(employeeShiftData?.map((employeeShift) => employeeShift.emp_id)),
  );

  // Get timesheet records from database table "timesheet" by using `emp_id` and `type` (in)
  const start = targetShift.subtract(1, "hour").format("YYYY-MM-DDTHH:mm:ss");
  const end = targetShift.add(15, "minute").format("YYYY-MM-DDTHH:mm:ss");
  const response = await supabase
    .from("timesheet")
    .select("*")
    .in("emp_id", targetEmployees)
    .gte("created_at", start)
    .lte("created_at", end);

  const timesheetData = response.data;

  // Filter employees who have not submitted their timesheet
  const submittedEmployeeIds = Array.from(
    new Set(timesheetData?.map((timesheet) => timesheet.emp_id)),
  );

  const notSubmittedEmployees = _.xor(targetEmployees, submittedEmployeeIds);

  // Get employee names from database table "employee" by using `emp_id`
  const { data: employeeData } = await supabase
    .from("employee")
    .select("*")
    .in("id", notSubmittedEmployees);

  const notSubmittedEmployeeNames = employeeData?.map(
    (employee) => employee.name,
  );

  if (notSubmittedEmployeeNames?.length)
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: "-1003717168310", // Target group ID
        parse_mode: "MarkdownV2",
        text: `คนมาสาย:\n• ${notSubmittedEmployeeNames?.join("\n• ") || "ไม่มีใครมาสาย"}`,
      },
    );

  return new Response("Send report");
};
