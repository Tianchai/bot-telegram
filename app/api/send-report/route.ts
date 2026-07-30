import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import isBetween from "dayjs/plugin/isBetween";
import timezone from "dayjs/plugin/timezone";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type {
  Employee,
  EmployeeShift,
  Shift,
  TimesheetView,
} from "@/interfaces/model";

dayjs.extend(utc);
dayjs.extend(isBetween);
dayjs.extend(timezone);

dayjs.tz.setDefault("Asia/Bangkok");

/**
 * Send report to the target of Telegram group
 * - FastCron is the service that will trigger this API every 15 minutes
 * - Checking time from shift of employee 1hr before and 15mins after
 */
export const POST = async (request: Request) => {
  const body = await request.json();
  const { shift } = body;

  const targetTime = dayjs.tz(shift * 1000).subtract(15, "minute");
  const start = targetTime.subtract(1, "hour");
  const end = targetTime.add(15, "minute");

  const supabase = createClient(
    "https://gkomhvdthksfpctqlfli.supabase.co",
    process.env.secret_supabase as string,
  );

  // Fetch data
  const responseIn = await supabase
    .from("employee_shift")
    .select(
      "emp_id!inner (id, name, absence (*), timesheet_view (*)), shift_id!inner (*)",
    )
    .eq("shift_id.in", targetTime.format("HH:mm:ss"));

  const dataIn = responseIn?.data as unknown as EmployeeShift[] | null;

  const employeeListId = dataIn?.map((row) => (row.emp_id as Employee).id);

  const responseOut = await supabase
    .from("employee_shift")
    .select(
      "emp_id!inner (id, name, absence (*), timesheet_view (*)), shift_id!inner (*)",
    )
    .eq("shift_id.out", targetTime.format("HH:mm:ss"))
    .in("emp_id.id", employeeListId ?? []);

  const dataOut = responseOut?.data as unknown as EmployeeShift[] | null;

  const lateEmployees: string[] = [];

  const debug: Record<string, unknown>[] = [];

  dataIn?.forEach((row) => {
    const { emp_id, shift_id } = row;

    // Check if employee take absence on this shift
    const isAbsenceTaken = (emp_id as Employee)?.absence?.some(
      (abs) =>
        abs.shift_id === (shift_id as Shift).id &&
        targetTime.isSame(dayjs.tz(abs.date), "day"),
    );

    const tsInfo: Record<string, unknown>[] = [];
    // Check if employee submit timesheet in time
    const isSubmittedInTime = (emp_id as Employee)?.timesheet_view?.some(
      (ts) => {
        const tsv = ts as TimesheetView;
        tsInfo.push({
          created_at_unix: tsv.created_at_unix,
          created_at: tsv.created_at,
          formatted_created_at: dayjs
            .tz(tsv.created_at_unix, dayjs.tz.guess())
            .format("YYYY-MM-DD HH:mm:ss.SSS"),
          start: start.format("YYYY-MM-DD HH:mm:ss.SSS"),
          end: end.format("YYYY-MM-DD HH:mm:ss.SSS"),
        });
        return dayjs(tsv.created_at).isBetween(start, end, "second", "[]");
      },
    );

    // Check if employee already submitted in prequel shift
    const prequelData = dataOut?.find(
      (item) => (item.emp_id as Employee).id === (emp_id as Employee).id,
    );
    const isPrequelAbsenceTaken = !prequelData
      ? true
      : (prequelData?.emp_id as Employee)?.absence?.some((abs) => {
          const prequelIn = (prequelData?.shift_id as Shift).in;
          const timeS1 = dayjs(
            `1990-01-01 ${prequelIn}`,
            "YYYY-MM-DD HH:mm:ss",
          );
          const timeS2 = dayjs(
            `1990-01-01 ${targetTime.format("HH:mm:ss")}`,
            "YYYY-MM-DD HH:mm:ss",
          );
          const dayToSubtract = timeS1.isAfter(timeS2) ? 1 : 0;
          const prequelTime = targetTime.subtract(dayToSubtract, "day");
          return (
            abs.shift_id === (prequelData?.shift_id as Shift).id &&
            prequelTime.isSame(dayjs.tz(abs.date), "day")
          );
        });

    debug.push({
      emp: (emp_id as Employee)?.name,
      tsInfo,
      isAbsenceTaken,
      isSubmittedInTime,
      isPrequelAbsenceTaken,
    });

    if (!isAbsenceTaken && !isSubmittedInTime && isPrequelAbsenceTaken)
      lateEmployees.push((emp_id as Employee)?.name);
  });

  // if (lateEmployees?.length)
  //   await axios.post(
  //     `https://api.telegram.org/bot${process.env.telegram_bot_token}/sendMessage`,
  //     {
  //       chat_id: "-1003717168310", // Target group ID
  //       parse_mode: "MarkdownV2",
  //       text: `คนมาสาย:\n• ${lateEmployees?.join("\n• ")}`,
  //     },
  //   );

  return NextResponse.json({
    timezone: dayjs.tz.guess(),
    timestamp: targetTime.format("YYYY-MM-DD HH:mm:ss.SSS"),
    unix: targetTime.valueOf(),
    shift,
    late: lateEmployees,
    debug,
    in: dataIn,
    out: dataOut,
  });
};
